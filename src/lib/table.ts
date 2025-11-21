import { TablesDB, ID, Query, Models } from "node-appwrite";
import { AppwriteSync } from "./sync";
import { type TableSchema } from "../types/interface";

// Helper type to allow users write better queries.
type QueryInput = string[] | Record<string, string | number | boolean>;

export class LazyTable {
  private databaseId: string;
  private databaseName: string;
  private schema: TableSchema;
  private databases: TablesDB;
  private syncer: AppwriteSync;

  // A state to track which tables have been verified for current lifecycle.
  private static verifiedTables: Set<string> = new Set();

  /**
   * Initializes a lazy table model.
   * This class does not verify the table exists until you perform an operation.
   * * @param databases - The Appwrite Databases instance
   * @param syncer - The internal sync utility for lazy creation
   * @param databaseId - The ID of the database the table belongs to
   * @param schema - The JSON schema definition of the table
   */
  constructor(
    databases: TablesDB,
    syncer: AppwriteSync,
    databaseId: string,
    databaseName: string,
    schema: TableSchema
  ) {
    this.databaseId = databaseId;
    this.databaseName = databaseName;
    this.databases = databases;
    this.syncer = syncer;
    this.schema = schema;
  }

  /**
   * Internal utility to ensure the table exists in Appwrite.
   * Checks an internal cache first to prevent redundant API calls.
   * If the table is missing, it triggers the creation/sync process.
   * * @returns Promise<void>
   * @throws Error if creation fails due to permissions or validation
   */

  private async prepare() {
    const key = `${this.databaseId}:${this.schema.id}`;
    if (LazyTable.verifiedTables.has(key)) return;

    try {
      await this.syncer.syncTable(
        this.databaseId,
        this.databaseName,
        this.schema
      );
      LazyTable.verifiedTables.add(key);
    } catch (error: any) {
      console.error(`Lazy Appwrite: Failed to sync table ${this.schema.name}`);
      console.error(`Reason: ${error.message}`);
      throw error;
    }
  }

  /**
   * Creates a new row in the table.
   * If the table does not exist, it will be created automatically based on the Schema.
   * * @param data - The data object to store. keys must match your schema columns.
   * @param id - (Optional) A custom ID. Defaults to `ID.unique()`.
   * @returns Promise<Models.Row> The created row object
   */
  async create(data: any, id: string = ID.unique()) {
    await this.prepare();
    return this.databases.createRow({
      databaseId: this.databaseId,
      tableId: this.schema.id,
      rowId: id,
      data: data,
    });
  }

  /**
   * Retrieves a list of rows.
   * Supports both Appwrite Query strings and simple object filtering.
   * * @example
   * // Simple Object Syntax
   * await Users.list({ name: "Mark", active: true });
   * * @example
   * // Advanced Query Syntax
   * await Users.list([Query.greaterThan("age", 18), Query.orderDesc("created_at")]);
   * * @param queries - An array of Query strings OR a plain object for equality checks.
   * @param limit - (Optional) Limit the number of results (Default 25)
   * @param offset - (Optional) Number of records to skip
   * @returns Promise<Models.RowList<Models.DefaultRow>> - Returns empty list if table doesn't exist.
   */
  async list(queries: QueryInput = [], limit?: number, offset?: number) {
    let finalQueries: string[] = [];

    // Now we handle the simple object syntax.
    if (!Array.isArray(queries) && typeof queries === "object") {
      finalQueries = Object.entries(queries).map(([key, value]) => {
        return Query.equal(key, value);
      });
    }

    // Normal syntax
    else if (Array.isArray(queries)) {
      finalQueries = queries;
    }

    // For pagination
    if (limit) finalQueries.push(Query.limit(limit));
    if (offset) finalQueries.push(Query.offset(offset));

    try {
      return await this.databases.listRows({
        databaseId: this.databaseId,
        tableId: this.schema.id,
        queries: finalQueries,
      });
    } catch (error: any) {
      if (error.code === 404) {
        await this.prepare();
        return { rows: [], total: 0 };
      }
      throw error;
    }
  }

  /**
   * Helper to find the first row matching the query.
   * Useful when you expect a single result (e.g., find user by email).
   * * @param queries - An array of Query strings OR a plain object for equality checks.
   * @returns Promise<Models.Row | null> The row if found, or null.
   */
  async findFirst(queries: QueryInput) {
    const result = await this.list(queries, 1);
    if (result.total > 0) {
      return result.rows[0];
    }
    return null;
  }

  /**
   * Retrieves a specific row by its unique ID.
   * * @param id - The unique ID of the row
   * @returns Promise<Models.DefaultRow>
   * @throws AppwriteException (404) if ID is not found.
   */
  async get(id: string) {
    return this.databases.getRow({
      databaseId: this.databaseId,
      tableId: this.schema.id,
      rowId: id,
    });
  }

  /**
   * Updates a row's data.
   * Ensures the table exists before attempting update to handle edge cases.
   * * @param id - The unique ID of the row to update
   * @param data - The partial data to update (merges with existing data)
   * @returns Promise<Models.DefaultRow> The updated row
   */
  async update(id: string, data: any) {
    await this.prepare();
    return this.databases.updateRow({
      databaseId: this.databaseId,
      tableId: this.schema.id,
      rowId: id,
      data: data,
    });
  }

  /**
   * Deletes a row permanently.
   * * @param id - The unique ID of the row to delete
   * @returns Promise<{}> Empty object on success
   */
  async delete(id: string) {
    await this.prepare();
    return this.databases.deleteRow({
      databaseId: this.databaseId,
      tableId: this.schema.id,
      rowId: id,
    });
  }
}
