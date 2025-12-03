export { AppwriteService as LazyAppwrite } from "./lib/client";
export {
  ColumnType,
  IndexType,
  RelationshipType,
  onDelete,
  LazyErrorType,
} from "./types/enum";

export { Logger } from "./common/Logger";
export { LazyError } from "./handlers/error";

// Types.
export type { LazyDatabase } from "./lib/database";
export type { LazyTable } from "./lib/table";
export type { TableSchema, ColumnSchema, QueryInput } from "./types/interface";
export type {
  AppwriteConfig,
  AppwriteAdminContext,
} from "./types/client-types";

// Appwrite SDK Exports
export { ID, Query, Permission, Role, AppwriteException } from "node-appwrite";
