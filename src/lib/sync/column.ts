import { TablesDB } from "node-appwrite";
import { Logger } from "../../common/Logger";
import type { ColumnSchema } from "../../types/interface";
import { ColumnType, onDeleteToRelation } from "../../types/enum";
import { LazyError } from "../../handlers/error";
import { withRetry } from "../../common/withRetry";

export class ColumnManager {
  constructor(private databases: TablesDB, private logger: Logger) {}

  async syncColumns(
    databaseId: string,
    tableId: string,
    columns: ColumnSchema[]
  ) {
    const existingList = await this.databases.listColumns({
      databaseId: databaseId,
      tableId: tableId,
    });

    const remoteColumns = new Map(
      existingList.columns.map((column: any) => [column.key, column])
    );

    // Loop through the schema and create Missing ones.
    for (const column of columns) {
      const remote = remoteColumns.get(column.key);

      if (!remote) {
        this.logger.info(
          `Creating Column: [${column.key} (${column.type})] ...`
        );
        await this.createColumn(databaseId, tableId, column);
        await new Promise((r) => setTimeout(r, 100)); // With a buffer.
        continue;
      }

      // If it exists we reconcile.
      await this.reconcile(databaseId, tableId, column, remote);
    }
  }

  async createColumn(
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
      await withRetry(createOperation);
    } catch (error: any) {
      // Safely ignore "Already exists" (409)
      if (error.code === 409) {
        this.logger.info(
          `Attribute [${column.key}] already exists (Skipping).`
        );
        return;
      }
      // Re-throw actual errors
      throw error;
    }
  }
  async reconcile(
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
      throw LazyError.validation(
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
        await withRetry(() =>
          this.databases.updateStringColumn({
            databaseId: databaseId,
            tableId: tableId,
            key: local.key,
            required: local.required,
            size: local.size,
          })
        );
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
        await withRetry(() =>
          this.databases.updateEnumColumn({
            databaseId: databaseId,
            tableId: tableId,
            key: local.key,
            elements: finalElements,
            required: local.required,
          })
        );
      }
    }
  }
}
