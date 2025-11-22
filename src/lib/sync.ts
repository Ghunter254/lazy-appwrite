import { Client, TablesDB, ID } from "node-appwrite";
import { ColumnType, IndexType, onDeleteToRelation } from "../types/enum";
import { type ColumnSchema, type TableSchema } from "../types/interface";
import { waitForColumn } from "../utils/columnCron";

export class AppwriteSync {
  private databases: TablesDB;
  private verifiedDatabases: Set<string> = new Set();

  constructor(client: Client) {
    this.databases = new TablesDB(client);
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
        console.log(`Database [${databaseId}] not found. Creating...`);
        try {
          await this.databases.create({
            databaseId: databaseId,
            name: databaseName,
          });
          console.log("Database created.");
        } catch (creationError: any) {
          console.error("Failed to create database: ", creationError.message);
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
    console.log(`\nStarting Sync for Table: [${schema.name}]`);

    // Ensure the table exists . If not we create one.
    try {
      if (schema.id) {
        await this.databases.getTable({
          databaseId: databaseId,
          tableId: schema.id,
        });
        console.log(`Table matches ID: ${schema.id}`);
      }
    } catch (error: any) {
      if (error.code === 404) {
        console.log(`Table not found. Creating "${schema.name}" ...`);

        await this.databases.createTable({
          databaseId: databaseId,
          tableId: schema.id,
          name: schema.name,
          ...(schema.permissions ? { permissions: schema.permissions } : {}),
          ...(schema.rowSecurity ? { rowSecurity: schema.rowSecurity } : {}),
          ...(schema.enabled ? { enabled: schema.enabled } : {}),
        });

        console.log("Table Created.");
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

    const existingKeys = existingList.columns.map((column) => column.key);

    // Loop through the schema and create Missing ones.
    for (const column of schema.columns) {
      if (existingKeys.includes(column.key)) {
        console.log(
          `Reproducing skipped: Column [${column.key} already exists.]`
        );
        continue;
      }
      console.log(`Creating Column: [${column.key} (${column.type})] ...`);
      await this.createColumn(databaseId, schema.id, column);
    }

    if (schema.indexes && schema.indexes.length > 0) {
      console.log(`\nSyncing Indexes...`);
      const existingList = await this.databases.listIndexes({
        databaseId: databaseId,
        tableId: schema.id,
      });
      const existingKeys = existingList.indexes.map((idx: any) => idx.key);

      for (const index of schema.indexes) {
        if (existingKeys.includes(index.key)) continue;
        console.log(
          `Waiting for attributes [${index.columns.join(", ")}] to be ready...`
        );

        try {
          await Promise.all(
            index.columns.map((colKey) => {
              waitForColumn(this.databases, databaseId, schema.id, colKey);
            })
          );
        } catch (error: any) {
          console.error(`Index skip: Attribute failed to become available.`);
          continue; // Skip creating this index
        }

        console.log(`Creating Index: [${index.key}] (${index.type})...`);
        try {
          await this.databases.createIndex({
            databaseId: databaseId,
            tableId: schema.id,
            key: index.key,
            columns: index.columns,
            type: index.type as any,
            ...(index.type === IndexType.Spatial
              ? {}
              : { orders: index.columns.map(() => "ASC") }),
          });
          console.log(`Index [${index.key}] created.`);
        } catch (error: any) {
          // Ignore 409 (Already exists)
          if (error.code !== 409) {
            console.error(
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
        console.log(
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
        console.log(
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
    try {
      switch (column.type) {
        case ColumnType.String:
          await this.databases.createStringColumn({
            databaseId: databaseId,
            tableId: tableId,
            key: column.key,
            size: column.size,
            required: column.required,
            ...(column._default ? { _default: column._default } : {}),
            ...(column.array ? { array: column.array } : {}),
          });
          break;

        case ColumnType.Integer:
          await this.databases.createIntegerColumn({
            databaseId: databaseId,
            tableId: tableId,
            key: column.key,
            required: column.required,
            ...(column.min ? { min: column.min } : {}),
            ...(column.max ? { max: column.max } : {}),
            ...(column._default ? { _default: column._default } : {}),
            ...(column.array ? { array: column.array } : {}),
          });
          break;
        case ColumnType.Float:
          await this.databases.createFloatColumn({
            databaseId: databaseId,
            tableId: tableId,
            key: column.key,
            required: column.required,
            ...(column.min ? { min: column.min } : {}),
            ...(column.max ? { max: column.max } : {}),
            ...(column._default ? { _default: column._default } : {}),
            ...(column.array ? { array: column.array } : {}),
          });
          break;
        case ColumnType.Boolean:
          await this.databases.createBooleanColumn({
            databaseId: databaseId,
            tableId: tableId,
            key: column.key,
            required: column.required,
            ...(column._default ? { _default: column._default } : {}),
            ...(column.array ? { array: column.array } : {}),
          });
          break;
        case ColumnType.Email:
          await this.databases.createEmailColumn({
            databaseId: databaseId,
            tableId: tableId,
            key: column.key,
            required: column.required,
            ...(column._default ? { _default: column._default } : {}),
            ...(column.array ? { array: column.array } : {}),
          });
          break;
        case ColumnType.Url:
          await this.databases.createUrlColumn({
            databaseId: databaseId,
            tableId: tableId,
            key: column.key,
            required: column.required,
            ...(column._default ? { _default: column._default } : {}),
            ...(column.array ? { array: column.array } : {}),
          });
          break;
        case ColumnType.Ip:
          await this.databases.createIpColumn({
            databaseId: databaseId,
            tableId: tableId,
            key: column.key,
            required: column.required,
            ...(column._default ? { _default: column._default } : {}),
            ...(column.array ? { array: column.array } : {}),
          });
          break;
        case ColumnType.Datetime:
          await this.databases.createDatetimeColumn({
            databaseId: databaseId,
            tableId: tableId,
            key: column.key,
            required: column.required,
            ...(column._default ? { _default: column._default } : {}),
            ...(column.array ? { array: column.array } : {}),
          });
          break;
        case ColumnType.Enum:
          await this.databases.createEnumColumn({
            databaseId: databaseId,
            tableId: tableId,
            key: column.key,
            elements: column.elements,
            required: column.required,
            ...(column._default ? { _default: column._default } : {}),
            ...(column.array ? { array: column.array } : {}),
          });
          break;

        case ColumnType.Line:
          await this.databases.createLineColumn({
            databaseId: databaseId,
            tableId: tableId,
            key: column.key,
            required: column.required,
            ...(column._default ? { _default: column._default } : {}),
          });
          break;

        case ColumnType.Point:
          await this.databases.createPointColumn({
            databaseId: databaseId,
            tableId: tableId,
            key: column.key,
            required: column.required,
            ...(column._default ? { _default: column._default } : {}),
          });
          break;

        case ColumnType.Polygon:
          await this.databases.createPolygonColumn({
            databaseId: databaseId,
            tableId: tableId,
            key: column.key,
            required: column.required,
            ...(column._default ? { _default: column._default } : {}),
          });
          break;

        case ColumnType.Relationship:
          await this.databases.createRelationshipColumn({
            databaseId: databaseId,
            tableId: tableId,
            relatedTableId: column.relatedTableId,
            type: column.relationType,
            onDelete: onDeleteToRelation(column.onDelete),
            ...(column.twoWay ? { twoWay: column.twoWay } : {}),
            ...(column.key ? { key: column.key } : {}),
            ...(column.twoWayKey ? { twoWayKey: column.twoWayKey } : {}),
          });
          break;

        default:
          throw new Error(`Unsupported Column Type: ${(column as any).type}`);
      }
    } catch (error: any) {
      //  Safely ignore column already exists (Skipping).
      if (error.code === 409) {
        console.log(
          `      ⚠️ Attribute [${column.key}] already exists (Skipping).`
        );
        return;
      }
      // Re-throw actual errors (like Invalid Config)
      throw error;
    }
  }
}
