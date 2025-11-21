import { TablesDB } from "node-appwrite";

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
    } catch {
      // Ignore the other errors.
    }
    await sleep(200); // We wait for two seconds before checking again.
    attempts++;
  }
  throw new Error(`Timeout: Column ${key} stuck in processing.`);
}
