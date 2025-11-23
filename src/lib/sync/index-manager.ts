import type { TablesDB } from "node-appwrite";
import type { Logger } from "../../utils/Logger";
import type { IndexSchema } from "../../types/interface";
import { IndexType } from "../../types/enum";
import { waitForColumn } from "../../utils/columnCron";
import { withRetry } from "../../utils/withRetry";

export class IndexManager {
  constructor(private databases: TablesDB, private logger: Logger) {}

  async syncIndexes(
    dbId: string,
    tableId: string,
    localIndexes: IndexSchema[]
  ) {
    if (!localIndexes || localIndexes.length === 0) return;

    this.logger.info(`\nSyncing Indexes...`);

    const existingList = await this.databases.listIndexes({
      databaseId: dbId,
      tableId,
    });

    // Create Map for fast lookup
    const existingMap = new Map(
      existingList.indexes.map((idx: any) => [idx.key, idx])
    );

    for (const index of localIndexes) {
      const remoteIndex = existingMap.get(index.key);

      // 1. Check Drift/Health
      if (remoteIndex) {
        // If this returns true, it means we deleted the bad index and should recreate it
        const needsRecreation = await this.checkHealthAndDrift(
          dbId,
          tableId,
          index,
          remoteIndex
        );

        if (!needsRecreation) {
          continue; // Healthy and matches, skip to next index
        }
      }

      // 2. Create (Runs if index is missing OR if we just deleted a bad one)
      await this.createIndex(dbId, tableId, index);
    }
  }

  /**
   * Checks if an existing index is broken (Ghost) or different from schema (Drift).
   * If yes, it deletes the index.
   * @returns true if the index was deleted and needs recreation.
   */
  private async checkHealthAndDrift(
    dbId: string,
    tableId: string,
    local: IndexSchema,
    remote: any
  ): Promise<boolean> {
    // A. Ghost Check (Status is failed/stuck)
    if (remote.status === "failed" || remote.status === "stuck") {
      this.logger.warn(
        `Ghost Index found: [${local.key}] is '${remote.status}'. Cleaning up...`
      );
      await this.deleteIndexSafe(dbId, tableId, local.key);
      return true;
    }

    // B. Drift Check (Definition Mismatch)
    const remoteCols = remote.columns.sort().join(",");
    const localCols = local.columns.sort().join(",");

    const isTypeMismatch = remote.type !== local.type;
    const isColMismatch = remoteCols !== localCols;

    if (isTypeMismatch || isColMismatch) {
      this.logger.warn(
        `Index Drift detected for [${local.key}]. Recreating...`
      );
      await this.deleteIndexSafe(dbId, tableId, local.key);
      return true;
    }

    return false; // Index is healthy and matches schema
  }

  private async createIndex(dbId: string, tableId: string, index: IndexSchema) {
    this.logger.info(
      `Waiting for attributes [${index.columns.join(", ")}] to be ready...`
    );

    // 1. Wait for Attributes
    try {
      await Promise.all(
        index.columns.map((colKey) =>
          waitForColumn(this.databases, dbId, tableId, colKey)
        )
      );
    } catch (error) {
      this.logger.error(`Index skip: Attribute failed to become available.`);
      return; // Skip creating this index if columns aren't ready
    }

    // 2. Create Index
    this.logger.info(`Creating Index: [${index.key}] (${index.type})...`);

    const operation = async () => {
      await this.databases.createIndex({
        databaseId: dbId,
        tableId: tableId,
        key: index.key,
        columns: index.columns,
        type: index.type as any,
        // Logic: Spatial Indexes cannot have orders. Key/Unique/Fulltext default to ASC.
        ...(index.type === IndexType.Spatial
          ? {}
          : { orders: index.columns.map(() => "ASC") }),
      });
      this.logger.info(`Index [${index.key}] created.`);
    };

    try {
      await withRetry(operation);
    } catch (error: any) {
      // Ignore 409 (Already exists) - race condition safety
      if (error.code !== 409) {
        this.logger.error(
          `Failed to create index ${index.key}: ${error.message}`
        );
      }
    }
  }

  private async deleteIndexSafe(dbId: string, tableId: string, key: string) {
    try {
      await this.databases.deleteIndex({
        databaseId: dbId,
        tableId: tableId,
        key: key,
      });
      this.logger.info(`Ghost/Drift Index [${key}] deleted.`);
    } catch (e: any) {
      // If it's already gone (404), that's fine. Log other errors.
      if (e.code !== 404) {
        this.logger.error(`Failed to remove index: ${e.message}`);
      }
    }
  }
}
