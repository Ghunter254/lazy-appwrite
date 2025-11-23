import { Client, TablesDB } from "node-appwrite";
import { Logger } from "../../utils/Logger";
import { type TableSchema } from "../../types/interface";
import { DatabaseManager } from "./database";
import { TableManager } from "./table";
import { ColumnManager } from "./column";
import { IndexManager } from "./index-manager";
import { LazyError } from "../../handlers/error";

export class LazySync {
  private dbManager: DatabaseManager;
  private tableManager: TableManager;
  private colManager: ColumnManager;
  private idxManager: IndexManager;
  private logger: Logger;

  constructor(client: Client, logger: Logger) {
    // Initialize the raw SDK service
    const databases = new TablesDB(client);
    this.logger = logger;

    // Initialize Sub-Managers
    this.dbManager = new DatabaseManager(databases, logger);
    this.tableManager = new TableManager(databases, logger);
    this.colManager = new ColumnManager(databases, logger);
    this.idxManager = new IndexManager(databases, logger);
  }

  /**
   * The Main Workflow: Coordinates the entire creation process.
   * Order matters: Database -> Table -> Columns -> Indexes.
   */
  async syncTable(
    databaseId: string,
    databaseName: string,
    schema: TableSchema
  ): Promise<void> {
    // 1. Ensure the Database Container exists (and check Health)
    try {
      await this.dbManager.syncDatabase(databaseId, databaseName);
    } catch (error) {
      throw LazyError.config("Failed to sync database", error);
    }

    try {
      this.logger.info(`\nStarting Sync for Table: [${schema.name}]`);

      //Ensure Table Structure (Collection + Permissions + Security)
      await this.tableManager.syncTableStructure(databaseId, schema);
    } catch (error) {
      throw LazyError.config("Failed to sync table", error);
    }

    try {
      //Sync Columns (Creation + Reconciliation + Drift Check)
      if (schema.columns && schema.columns.length > 0) {
        await this.colManager.syncColumns(
          databaseId,
          schema.id,
          schema.columns
        );
      }
    } catch (error) {
      throw LazyError.config(" Failed to sync columns", error);
    }

    try {
      // 4. Sync Indexes (Creation + Ghost Check + Wait Logic)
      if (schema.indexes && schema.indexes.length > 0) {
        await this.idxManager.syncIndexes(
          databaseId,
          schema.id,
          schema.indexes
        );
      }
    } catch (error) {
      throw LazyError.config(" Failed to sync indexes", error);
    }

    this.logger.info(`✨ Table [${schema.name}] sync complete.`);
  }
}
