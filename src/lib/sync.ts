import { Client, TablesDB, ID } from "node-appwrite";
import { ColumnType, IndexType, onDeleteToRelation } from "../types/enum";
import { type ColumnSchema, type TableSchema } from "../types/interface";
import { waitForColumn } from "../utils/columnCron";
import { withRetry } from "../utils/withRetry";
import { Logger } from "../utils/Logger";

export class AppwriteSync {
  private databases: TablesDB;
  private logger: Logger;
  private verifiedDatabases: Set<string> = new Set();

  constructor(client: Client, logger: Logger) {
    this.databases = new TablesDB(client);
    this.logger = logger;
  }
  /**
   * Checks if database exists. if 404, creates it.
   */

  async syncDatabase(databaseId: string, databaseName: string): Promise<void> {
    if (this.verifiedDatabases.has(databaseId)) return;

    try {
      await this.databases.get({
        databaseId: databaseId,
      });
      this.verifiedDatabases.add(databaseId);
    } catch (error: any) {
      if (error.code === 404) {
        this.logger.info(`Database [${databaseId}] not found. Creating...`);
        try {
          await this.databases.create({
            databaseId: databaseId,
            name: databaseName,
          });
          this.logger.info("Database created.");
        } catch (creationError: any) {
          this.logger.error(
            "Failed to create database: ",
            creationError.message
          );
          throw creationError;
        }
      } else throw error;
    }
  }

  /**
   * The Main Entry Point.
   * Syncs a table schema (create table + create missing columns).
   * * @param databaseId - The ID of the database to put this table in
   * @param databaseName - The Name of the database in the console
   * @param schema - The definitions from your interface
   */
  async syncTable(
    databaseId: string,
    databaseName: string,
    schema: TableSchema
  ): Promise<void> {
    await this.syncDatabase(databaseId, databaseName);
    this.logger.info(`\nStarting Sync for Table: [${schema.name}]`);

    // Ensure the table exists . If not we create one.
    try {
      if (schema.id) {
        await this.databases.getTable({
          databaseId: databaseId,
          tableId: schema.id,
        });
        this.logger.info(`Table matches ID: ${schema.id}`);
      }
    } catch (error: any) {
      if (error.code === 404) {
        this.logger.info(`Table not found. Creating "${schema.name}" ...`);

        await this.databases.createTable({
          databaseId: databaseId,
          tableId: schema.id,
          name: schema.name,
          ...(schema.permissions ? { permissions: schema.permissions } : {}),
          ...(schema.rowSecurity ? { rowSecurity: schema.rowSecurity } : {}),
          ...(schema.enabled ? { enabled: schema.enabled } : {}),
        });

        this.logger.info("Table Created.");
      } else throw error;
    }
    // If Table already existed,
    // We fetch existing columns to prevent duplicates.
    // Throws a 409  if created again.
    if (!schema.id) return;
    const existingList = await this.databases.listColumns({
      databaseId: databaseId,
      tableId: schema.id,
    });

    const remoteColumns = new Map(
      existingList.columns.map((column: any) => [column.key, column])
    );

    // Loop through the schema and create Missing ones.
    for (const column of schema.columns) {
      const remote = remoteColumns.get(column.key);

      if (!remote) {
        this.logger.info(
          `Creating Column: [${column.key} (${column.type})] ...`
        );
        await this.createColumn(databaseId, schema.id, column);
        await new Promise((r) => setTimeout(r, 100)); // With a buffer.
        continue;
      }

      // If it exists we reconcile.
      await this.reconcileAttribute(databaseId, schema.id, column, remote);
    }

    if (schema.indexes && schema.indexes.length > 0) {
      this.logger.info(`\nSyncing Indexes...`);
      const existingList = await this.databases.listIndexes({
        databaseId: databaseId,
        tableId: schema.id,
      });
      const existingKeys = existingList.indexes.map((idx: any) => idx.key);

      for (const index of schema.indexes) {
        if (existingKeys.includes(index.key)) continue;
        this.logger.info(
          `Waiting for attributes [${index.columns.join(", ")}] to be ready...`
        );

        try {
          await Promise.all(
            index.columns.map((colKey) => {
              waitForColumn(this.databases, databaseId, schema.id, colKey);
            })
          );
        } catch (error: any) {
          this.logger.error(
            `Index skip: Attribute failed to become available.`
          );
          continue; // Skip creating this index
        }

        this.logger.info(`Creating Index: [${index.key}] (${index.type})...`);
        const createIndex = async () => {
          await this.databases.createIndex({
            databaseId: databaseId,
            tableId: schema.id,
            key: index.key,
            columns: index.columns,
            type: index.type as any,
            // ...(index.type === IndexType.Spatial
            //   ? {}
            //   : { orders: index.columns.map(() => "ASC") }),
          });
          this.logger.info(`Index [${index.key}] created.`);
        };
        try {
          await withRetry(createIndex);
        } catch (error: any) {
          // Ignore 409 (Already exists)
          if (error.code !== 409) {
            this.logger.error(
              `Failed to create index ${index.key}:`,
              error.message
            );
          }
        }
      }
    }
  }

  private async reconcileAttribute(
    databaseId: string,
    tableId: string,
    local: ColumnSchema,
    remote: any
  ) {
    // Checking for type mismatch.
    if (local.type !== remote.type) {
      // Relationships are hard to handle.
      // TODO: Handle relationship mismatch later.

      if (local.type === ColumnType.Relationship) return;

      // Otherwise let's throw an error.
      throw new Error(
        `[LazyAppwrite] Schema Conflict in '${tableId}': \n` +
          `Column '${local.key}' is defined as '${local.type}' but DB has '${remote.type}'. \n` +
          `Action Required: Manually delete the column in Appwrite or update your Schema.`
      );
    }

    // Next we check for array mismatch.
    const localArray = local.array || false;
    const remoteArray = remote.array || false;

    if (localArray !== remoteArray) {
      throw new Error(
        `[LazyAppwrite] Schema Conflict in '${tableId}': \n` +
          `Column '${local.key}' Array status mismatch. Local: ${localArray}, Remote: ${remoteArray}.`
      );
    }

    // Lastly we fix that which can be fixed.
    if (local.type === ColumnType.String && remote.type === "string") {
      // If local size is bigger than remote, we need to expand it.
      if (local.size > remote.size) {
        this.logger.info(
          `Expanding Column [${local.key}] size from ${remote.size} to ${local.size}...`
        );
        await this.databases.updateStringColumn({
          databaseId: databaseId,
          tableId: tableId,
          key: local.key,
          required: local.required,
          size: local.size,
        });
      }
    }
    if (local.type === ColumnType.Enum && remote.type === "enum") {
      // Check if local has elements that remote does not
      const remoteElements: string[] = remote.elements;
      const newElements = local.elements.filter(
        (e) => !remoteElements.includes(e)
      );

      if (newElements.length > 0) {
        this.logger.info(
          `Adding Enum Options to [${local.key}]: ${newElements.join(", ")}`
        );
        // Appwrite requires sending the FULL list (Old + New)
        const finalElements = [...remoteElements, ...newElements];
        await this.databases.updateEnumColumn({
          databaseId: databaseId,
          tableId: tableId,
          key: local.key,
          elements: finalElements,
          required: local.required,
        });
      }
    }
  }

  /**
   *
   * @param databaseId
   * @param tableId
   * @param column
   * @returns Promise<Void>
   */
  private async createColumn(
    databaseId: string,
    tableId: string,
    column: ColumnSchema
  ) {
    const createOperation = async () => {
      switch (column.type) {
        case ColumnType.String:
          return await this.databases.createStringColumn({
            databaseId: databaseId,
            tableId: tableId,
            key: column.key,
            size: column.size,
            required: column.required,
            ...(column._default ? { _default: column._default } : {}),
            ...(column.array ? { array: column.array } : {}),
          });

        case ColumnType.Integer:
          return await this.databases.createIntegerColumn({
            databaseId: databaseId,
            tableId: tableId,
            key: column.key,
            required: column.required,
            ...(column.min ? { min: column.min } : {}),
            ...(column.max ? { max: column.max } : {}),
            ...(column._default ? { _default: column._default } : {}),
            ...(column.array ? { array: column.array } : {}),
          });
        case ColumnType.Float:
          return await this.databases.createFloatColumn({
            databaseId: databaseId,
            tableId: tableId,
            key: column.key,
            required: column.required,
            ...(column.min ? { min: column.min } : {}),
            ...(column.max ? { max: column.max } : {}),
            ...(column._default ? { _default: column._default } : {}),
            ...(column.array ? { array: column.array } : {}),
          });
        case ColumnType.Boolean:
          return await this.databases.createBooleanColumn({
            databaseId: databaseId,
            tableId: tableId,
            key: column.key,
            required: column.required,
            ...(column._default ? { _default: column._default } : {}),
            ...(column.array ? { array: column.array } : {}),
          });
        case ColumnType.Email:
          return await this.databases.createEmailColumn({
            databaseId: databaseId,
            tableId: tableId,
            key: column.key,
            required: column.required,
            ...(column._default ? { _default: column._default } : {}),
            ...(column.array ? { array: column.array } : {}),
          });
        case ColumnType.Url:
          return await this.databases.createUrlColumn({
            databaseId: databaseId,
            tableId: tableId,
            key: column.key,
            required: column.required,
            ...(column._default ? { _default: column._default } : {}),
            ...(column.array ? { array: column.array } : {}),
          });

        case ColumnType.Ip:
          return await this.databases.createIpColumn({
            databaseId: databaseId,
            tableId: tableId,
            key: column.key,
            required: column.required,
            ...(column._default ? { _default: column._default } : {}),
            ...(column.array ? { array: column.array } : {}),
          });

        case ColumnType.Datetime:
          return await this.databases.createDatetimeColumn({
            databaseId: databaseId,
            tableId: tableId,
            key: column.key,
            required: column.required,
            ...(column._default ? { _default: column._default } : {}),
            ...(column.array ? { array: column.array } : {}),
          });

        case ColumnType.Enum:
          return await this.databases.createEnumColumn({
            databaseId: databaseId,
            tableId: tableId,
            key: column.key,
            elements: column.elements,
            required: column.required,
            ...(column._default ? { _default: column._default } : {}),
            ...(column.array ? { array: column.array } : {}),
          });

        case ColumnType.Line:
          return await this.databases.createLineColumn({
            databaseId: databaseId,
            tableId: tableId,
            key: column.key,
            required: column.required,
            ...(column._default ? { _default: column._default } : {}),
          });

        case ColumnType.Point:
          return await this.databases.createPointColumn({
            databaseId: databaseId,
            tableId: tableId,
            key: column.key,
            required: column.required,
            ...(column._default ? { _default: column._default } : {}),
          });

        case ColumnType.Polygon:
          return await this.databases.createPolygonColumn({
            databaseId: databaseId,
            tableId: tableId,
            key: column.key,
            required: column.required,
            ...(column._default ? { _default: column._default } : {}),
          });

        case ColumnType.Relationship:
          return await this.databases.createRelationshipColumn({
            databaseId: databaseId,
            tableId: tableId,
            relatedTableId: column.relatedTableId,
            type: column.relationType,
            onDelete: onDeleteToRelation(column.onDelete),
            ...(column.twoWay ? { twoWay: column.twoWay } : {}),
            ...(column.key ? { key: column.key } : {}),
            ...(column.twoWayKey ? { twoWayKey: column.twoWayKey } : {}),
          });

        default:
          throw new Error(`Unsupported Column Type: ${(column as any).type}`);
      }
    };
    try {
      await withRetry(createOperation); // Handles crashes due to rate limiting.
    } catch (error: any) {
      //  Safely ignore column already exists (Skipping).
      if (error.code === 409) {
        this.logger.info(
          `Attribute [${column.key}] already exists (Skipping).`
        );
        return;
      }
      // Re-throw actual errors (like Invalid Config)
      throw error;
    }
  }
}
