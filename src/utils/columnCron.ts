import { TablesDB } from "node-appwrite";
import { LazyError } from "../handlers/error";

export const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Polls an attribute until its status is 'available'.
 * * @param key - The attribute ID to check
 * @throws Error if timeout (60s) or failed status
 */

export async function waitForColumn(
  databases: TablesDB,
  dbId: string,
  tableId: string,
  key: string
): Promise<void> {
  let attempts = 0;
  const maxAttempts = 30;

  // console.log(`Checking status for [${key}]...`);
  while (attempts < maxAttempts) {
    try {
      const column: any = await databases.getColumn({
        databaseId: dbId,
        tableId: tableId,
        key: key,
      });

      if (column.status === "available") {
        return;
      }

      if (column.status === "failed") {
        throw new Error(`Column ${key} failed to create (Status: failed).`);
      }
    } catch (error: any) {
      // ONLY ignore 404 (Not Found) errors
      if (error.code === 404) {
        // This is normal during creation. Data hasn't propagated yet.
      }
      // RE-THROW everything else (Auth errors, Rate limits, etc)
      else {
        throw LazyError.appwrite("Appwrite Error", error);
      }
    }
    await sleep(200); // We wait for two seconds before checking again.
    attempts++;
  }
  throw LazyError.timeout(`Timeout: Column ${key} stuck in processing.`);
}
