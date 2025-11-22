import {
  Client,
  TablesDB,
  Account,
  Users,
  Storage,
  Teams,
  Functions,
  Messaging,
  Avatars,
} from "node-appwrite";
import type { LazyDatabase } from "../lib/database";

export interface AppwriteConfig {
  endpoint?: string;
  projectId: string;
  apiKey?: string;
  selfSigned?: boolean;
  verbose?: boolean;
}

// Admin context.
export interface AppwriteAdminContext {
  client: Client;
  getDatabase: (databaseId: string, databaseName: string) => LazyDatabase;
  users: Users;
  storage: Storage;
  teams: Teams;
  messaging: Messaging;
  functions: Functions;
  avatars: Avatars;
}

// Session context.
export interface AppwriteSessionContext {
  sessionClient: Client;
  account: Account;
  getDatabase: (databaseId: string, databaseName: string) => LazyDatabase;
  storage: Storage;
  teams: Teams;
  functions: Functions;
  avatars: Avatars;
}
