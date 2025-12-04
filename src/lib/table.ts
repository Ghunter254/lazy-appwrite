import { TablesDB, ID } from "node-appwrite";
import { LazySync } from "./sync";
import { type QueryInput, type TableSchema } from "../types/interface";
import { withRetry } from "../common/withRetry";
import { Logger } from "../common/Logger";
import { LazyError } from "../handlers/error";
import { QueryMapper } from "../handlers/query";

export class LazyTable {
  private databaseId: string;
  private databaseName: string;
  private schema: TableSchema;
  private databases: TablesDB;
  private syncer: LazySync;
  private logger: Logger;
  private disableSync: boolean;
  private hasLoggedDisable: boolean = false;

  // A state to track which tables have been verified for current lifecycle.
  private static verifiedTables: Set<string> = new Set();

  // A Map to track in-flight syncs (Pending)
  // Maps a task to its Promise.
  private static pendingSyncs: Map<string, Promise<void>> = new Map();

  /**
   * Initializes a lazy table model.
   * This class does not verify the table exists until you perform an operation.
   * @param databases - The Appwrite Databases instance
   * @param syncer - The internal sync utility for lazy creation
   * @param databaseId - The ID of the database the table belongs to
   * @param schema - The JSON schema definition of the table
   */
  constructor(
    databases: TablesDB,
    syncer: LazySync,
    databaseId: string,
    databaseName: string,
    schema: TableSchema,
    logger: Logger,
    disableSync: boolean = false
  ) {
    this.databaseId = databaseId;
    this.databaseName = databaseName;
    this.databases = databases;
    this.syncer = syncer;
    this.schema = schema;
    this.logger = logger;
    this.disableSync = disableSync;
  }

  /**
   *
   * Returns the raw Appwrite 'Databases' service.
   * You can use this to perform raw operations on this specific table.
   */
  get standard(): TablesDB {
    return this.databases;
  }

  /**
   * Helper to get IDs easily if using the escape hatch.
   */
  get config() {
    return {
      databaseId: this.databaseId,
      collectionId: this.schema.id,
    };
  }

  /**
   * Internal utility to ensure the table exists in Appwrite.
   * Checks an internal cache first to prevent redundant API calls.
   * If the table is missing, it triggers the creation/sync process.
   * @returns Promise<void>
   * @throws Error if creation fails due to permissions or validation
   */

  private async prepare(): Promise<void> {
    if (this.disableSync) {
      // Log only once per table instance to avoid spam
      if (!this.hasLoggedDisable) {
        this.logger.info(
          `Sync disabled for [${this.schema.name}]. Skipping checks.`
        );
        this.hasLoggedDisable = true;
      }
      return;
    }

    const key = `${this.databaseId}:${this.schema.id}`;

    // Table already verified to be present.
    // Return immediately.
    if (LazyTable.verifiedTables.has(key)) return;

    // Wait Path.
    if (LazyTable.pendingSyncs.has(key)) {
      this.logger.info(
        `[LazyAppwrite] Queued behind active sync for: ${this.schema.name}`
      );
      try {
        await LazyTable.pendingSyncs.get(key);
        return;
        // Return with nothing if leader still working.
      } catch (error) {
        this.logger.warn(
          `[LazyAppwrite] Leader sync failed for ${this.schema.name}. Retrying as new leader...`
        );
        return this.prepare();
      }
    }

    // Leader path
    const syncPromise = (async () => {
      try {
        await this.syncer.syncTable(
          this.databaseId,
          this.databaseName,
          this.schema
        );
        LazyTable.verifiedTables.add(key);
      } catch (error: any) {
        this.logger.error(
          `[LazyAppwrite] Sync Failed for [${this.schema.name}]`
        );
        this.logger.error(`Reason: ${error.message}`);
        throw error;
      } finally {
        LazyTable.pendingSyncs.delete(key);
      }
    })();

    // Add the promise to set and await it.
    LazyTable.pendingSyncs.set(key, syncPromise);
    try {
      await syncPromise;
    } catch (error) {
      throw error;
    }
  }

  private validateAndClean(data: any, isUpdate = false) {
    const cleanData: any = {};
    const schemaKeys = this.schema.columns.map((column) => {
      return column.key;
    });
    const missingRequired: string[] = [];
    const extraKeys = Object.keys(data).filter(
      (key) => !schemaKeys.includes(key)
    );

    // Now we loop through the Schema Columns to build the clean project.
    for (const column of this.schema.columns) {
      let value = data[column.key];

      // Array coercion.
      if (value !== undefined && column.array && !Array.isArray(value)) {
        this.logger.warn(
          `[LazyAppwrite] Auto-casting '${column.key}' from Scalar to Array.`
        );
        value = [value];
      }
      // Number -> String Coercion.
      if (
        value !== undefined &&
        column.type === "string" &&
        typeof value !== "string"
      ) {
        if (typeof value === "number" || typeof value === "boolean") {
          value = String(value);
        }
      }
      // String -> Number Coercion.
      if (value !== undefined && typeof value === "string") {
        if (column.type === "integer") {
          const number = Number(value);
          if (!isNaN(number)) {
            value = number;
          }
        }
      }

      // Boolean String Coercion
      if (
        value !== undefined &&
        column.type === "boolean" &&
        typeof value === "string"
      ) {
        const lower = value.toLowerCase();
        if (lower === "true") value = true;
        if (lower === "false") value = false;
      }
      // If value is provided.
      if (value !== undefined) {
        cleanData[column.key] = value;
        continue;
      }

      // If this is an UPDATE missing keys are fine.
      // If its CREATE we need to check if its required.

      if (!isUpdate) {
        if (column.required) {
          missingRequired.push(column.key);
        } else if (column._default !== undefined && column._default !== null) {
          cleanData[column.key] = column._default;
        }
      }
    }

    // Warn user on ghost fields.
    if (extraKeys.length > 0) {
      this.logger.warn(
        `[LazyAppwrite] Warning: Ignoring unknown fields in
        '${this.schema.name}' : `,
        extraKeys.join(", ")
      );
    }

    if (missingRequired.length > 0) {
      throw LazyError.validation(
        `Validation Failed in '${
          this.schema.name
        }'. Missing required fields: ${missingRequired.join(", ")}`
      );
    }

    return cleanData;
  }

  /**
   * Creates a new row in the table.
   * If the table does not exist, it will be created automatically based on the Schema.
   * * @param data - The data object to store. keys must match your schema columns.
   * @param id - (Optional) A custom ID. Defaults to `ID.unique()`.
   * @returns Promise<Models.Row> The created row object
   */
  async create(data: any, id: string = ID.unique()) {
    const validData = this.validateAndClean(data, false);
    await this.prepare();
    try {
      return await withRetry(() =>
        this.databases.createRow({
          databaseId: this.databaseId,
          tableId: this.schema.id,
          rowId: id,
          data: validData,
        })
      );
    } catch (error: any) {
      if (error instanceof LazyError) throw error;
      if (error.code === 409) {
        throw LazyError.appwrite(
          `Duplicate Error in '${this.schema.name}': ` +
            `A row with ID '${id}' or a Unique Attribute already exists.`,
          error
        );
      }
      throw LazyError.appwrite(error.message, error);
    }
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
    const finalQueries = QueryMapper.parse(queries, limit, offset);

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
      throw LazyError.appwrite(error.message, error);
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
  async get(id: string, queries: QueryInput = []) {
    return this.databases.getRow({
      databaseId: this.databaseId,
      tableId: this.schema.id,
      rowId: id,
      queries: QueryMapper.parse(queries),
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
    const validData = this.validateAndClean(data, true);
    await this.prepare();

    try {
      return await withRetry(() =>
        this.databases.updateRow({
          databaseId: this.databaseId,
          tableId: this.schema.id,
          rowId: id,
          data: validData,
        })
      );
    } catch (error: any) {
      if (error instanceof LazyError) throw error;
      if (error.code === 404) {
        throw LazyError.appwrite(
          `Not Found: Could not update row '${id}' in '${this.schema.name}' because it does not exist.`
        );
      }
      throw LazyError.appwrite(error.message, error);
    }
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
