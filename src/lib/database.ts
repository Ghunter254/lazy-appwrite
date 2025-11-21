import { Client, TablesDB } from "node-appwrite";
import { AppwriteSync } from "./sync";
import { LazyTable } from "./table";
import { type TableSchema } from "../types/interface";

export class LazyDatabase {
  private databases: TablesDB;
  private syncer: AppwriteSync;
  private dbId: string;
  private dbName: string;

  constructor(client: Client, databaseId: string, databaseName: string) {
    this.databases = new TablesDB(client);
    this.syncer = new AppwriteSync(client);
    this.dbId = databaseId;
    this.dbName = databaseName;
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
      schema
    );
  }
}
