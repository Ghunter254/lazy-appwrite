import { Client, TablesDB, ID } from "node-appwrite";
import { ColumnType, IndexType } from "../types/enum";
import { type ColumnSchema, type TableSchema } from "../types/interface";
import { table } from "console";

export class AppwriteSync {
  private databases: TablesDB;

  constructor(client: Client) {
    this.databases = new TablesDB(client);
  }

  /**
   * The Main Entry Point.
   * Syncs a table schema (create table + create missing columns).
   * * @param databaseId - The ID of the database to put this table in
   * @param schema - The definitions from your interface
   */
  async syncTable(databaseId: string, schema: TableSchema): Promise<void> {
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
          tableId: schema.id || ID.unique(),
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
  }
  private async createColumn(
    databaseId: string,
    tableId: string,
    column: ColumnSchema
  ) {
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

        _default: throw new Error(
          `Unsupported Column Type: ${(column as any).type}`
        );
    }
  }
}
