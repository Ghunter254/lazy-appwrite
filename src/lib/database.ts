import { Client, TablesDB } from "node-appwrite";
import { LazyTable } from "./table";
import { type TableSchema } from "../types/interface";
import { Logger } from "../common/Logger";
import { LazySync } from "./sync";

export class LazyDatabase {
  private databases: TablesDB;
  private syncer: LazySync;
  private dbId: string;
  private dbName: string;
  private logger: Logger;

  constructor(
    client: Client,
    databaseId: string,
    databaseName: string,
    logger: Logger
  ) {
    this.databases = new TablesDB(client);
    this.dbId = databaseId;
    this.dbName = databaseName;
    this.logger = logger;
    this.syncer = new LazySync(client, logger);
  }

  /**
   *
   * Returns the raw Appwrite 'Table' service instance.
   * Use this if you need to perform operations not yet supported by Lazy Appwrite.
   * Note: Operations performed here DO NOT trigger lazy syncing or schema validation.
   */
  get standard(): TablesDB {
    return this.databases;
  }

  /**
   * Binds a Schema to the Database Client.
   * Returns a Model you can use to Create/List/Update.
   */
  model(schema: TableSchema): LazyTable {
    return new LazyTable(
      this.databases,
      this.syncer,
      this.dbId,
      this.dbName,
      schema,
      this.logger
    );
  }
}
