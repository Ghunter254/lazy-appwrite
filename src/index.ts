export { AppwriteService as LazyAppwrite } from "./lib/client";
export {
  ColumnType,
  IndexType,
  RelationshipType,
  onDelete,
  LazyErrorType,
} from "./types/enum";
export { LazyError } from "./handlers/error";
export type { LazyDatabase } from "./lib/database";
export type { LazyTable } from "./lib/table";
export type { TableSchema, ColumnSchema } from "./types/interface";
export type {
  AppwriteConfig,
  AppwriteAdminContext,
} from "./types/client-types";
