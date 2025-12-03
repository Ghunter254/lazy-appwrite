import { TablesDB, Query } from "node-appwrite";
import { Logger } from "../../common/Logger";
import { LazyError } from "../../handlers/error";

export class DatabaseManager {
  private verifiedDatabases: Set<string> = new Set();

  // Static: We only need to check the API Key ONCE per application runtime
  private static isConnectionVerified: boolean = false;

  constructor(private databases: TablesDB, private logger: Logger) {}

  /**
   * Main Entry: Ensures Database exists and Connection is valid.
   */
  async syncDatabase(databaseId: string, databaseName: string): Promise<void> {
    // 1. Health Check (Fail fast if API Key is wrong)
    await this.verifyConnection();

    // 2. Optimization: If we checked this DB locally, skip network request
    if (this.verifiedDatabases.has(databaseId)) return;

    try {
      // 3. Check existence
      await this.databases.get({ databaseId });
      this.verifiedDatabases.add(databaseId);
    } catch (error: any) {
      if (error.code === 404) {
        // 4. Not Found -> Create
        // this.logger.info(`Database [${databaseId}] not found. Creating...`); - Might leak database ID when unintended
        try {
          await this.databases.create({
            databaseId: databaseId,
            name: databaseName,
          });
          this.logger.info("Database created.");
          this.verifiedDatabases.add(databaseId);
        } catch (creationError: any) {
          // If creation fails, it's usually permissions or limits
          this.logger.error(
            "Failed to create database: ",
            creationError.message
          );
          throw LazyError.appwrite("Failed to create database", creationError);
        }
      } else {
        // Other errors (e.g. 500, Network)
        throw error;
      }
    }
  }

  /**
   * HEALTH CHECK: Verifies API Key and Project ID are valid.
   * Runs a lightweight query before attempting any heavy lifting.
   */
  private async verifyConnection() {
    if (DatabaseManager.isConnectionVerified) return;

    this.logger.info("📡 Verifying Appwrite Connection...");

    try {
      // Run a lightweight operation (List max 1 database)
      // This confirms Read permissions and Authentication
      await this.databases.list({
        queries: [Query.limit(1)],
      });

      DatabaseManager.isConnectionVerified = true;
      this.logger.info("Connection Verified.");
    } catch (error: any) {
      // Fail Loudly with clear instructions
      this.logger.error("[LazyAppwrite] Connection Failed!");
      this.logger.error(
        "   Please check your Project ID, API Key, and Endpoint."
      );
      this.logger.error(`Raw Error: ${error.message}`);

      throw LazyError.config(
        "Critical: Invalid Config Credentials or Endpoint.",
        error
      );
    }
  }
}
