import { TablesDB } from "node-appwrite";
import { Logger } from "../../utils/Logger";
import type { TableSchema } from "../../types/interface";
import { withRetry } from "../../utils/withRetry";
import { LazyError } from "../../handlers/error";

export class TableManager {
  constructor(private databases: TablesDB, private logger: Logger) {}

  /**
   * Ensures the Table exists and matches configuration (Permissions).
   */
  async syncTableStructure(databaseId: string, schema: TableSchema) {
    try {
      // 1. Check if Table Exists
      const remoteTable = await this.databases.getTable({
        databaseId: databaseId,
        tableId: schema.id,
      });

      this.logger.info(`Table matches ID: ${schema.id}`);

      // 2. Check for Permission/Security Drift
      // If table exists, we verify if settings have changed in code
      await this.reconcileSettings(databaseId, schema, remoteTable);
    } catch (error: any) {
      if (error.code === 404) {
        // 3. Not Found -> Create
        this.logger.info(`Table not found. Creating "${schema.name}" ...`);
        await this.createTable(databaseId, schema);
      } else {
        throw LazyError.appwrite("Failed to check/create table", error);
      }
    }
  }

  private async createTable(databaseId: string, schema: TableSchema) {
    const operation = async () => {
      await this.databases.createTable({
        databaseId: databaseId,
        tableId: schema.id,
        name: schema.name,
        ...(schema.permissions ? { permissions: schema.permissions } : {}),
        ...(schema.rowSecurity ? { rowSecurity: schema.rowSecurity } : {}),
        ...(schema.enabled ? { enabled: schema.enabled } : {}),
      });
    };

    try {
      await withRetry(operation);
      this.logger.info("Table Created.");
    } catch (error: any) {
      // Race condition safety: If created by another process, ignore
      if (error.code === 409) {
        this.logger.info("Table already exists (Skipping creation).");
        return;
      }
      throw error;
    }
  }

  /**
   * Checks if Permissions or Security settings have changed.
   * If yes, updates the collection.
   */
  private async reconcileSettings(
    databaseId: string,
    local: TableSchema,
    remote: any
  ) {
    let needsUpdate = false;

    // A. Check Permissions Drift
    // We sort both arrays to ensure order doesn't matter
    const localPerms = (local.permissions || []).sort().join(",");
    const remotePerms = (remote.$permissions || []).sort().join(",");

    if (localPerms !== remotePerms) {
      this.logger.info(
        `🔐 Permissions changed for [${local.name}]. Updating...`
      );
      needsUpdate = true;
    }

    // B. Check row Security (Row Level Security)
    // Remote defaults to false if undefined
    const localSec = local.rowSecurity || false;
    const remoteSec = remote.rowSecurity || false;

    if (localSec !== remoteSec) {
      this.logger.info(
        `🛡️ row Security changed for [${local.name}]: ${localSec}. Updating...`
      );
      needsUpdate = true;
    }

    // C. Check Enabled Status
    // Only check if explicitly defined in schema (undefined means "leave as is")
    if (local.enabled !== undefined && local.enabled !== remote.enabled) {
      this.logger.info(
        `⚡ Enabled status changed for [${local.name}]: ${local.enabled}. Updating...`
      );
      needsUpdate = true;
    }

    // Perform Update if needed
    if (needsUpdate) {
      const updatePayload = {
        databaseId: databaseId,
        tableId: local.id,
        name: local.name,
        ...(local.permissions !== undefined
          ? { permissions: local.permissions }
          : {}),
        ...(local.rowSecurity !== undefined
          ? { rowSecurity: local.rowSecurity }
          : {}),
        ...(local.enabled !== undefined ? { enabled: local.enabled } : {}),
      };

      await withRetry(() => this.databases.updateTable(updatePayload));
      this.logger.info(`✅ Table settings updated.`);
    }
  }
}
