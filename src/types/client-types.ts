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

export interface AppwriteConfig {
  endpoint?: string;
  projectId: string;
  apiKey?: string;
  selfSigned?: boolean;
}

// Admin context.
export interface AppwriteAdminContext {
  client: Client;
  databases: TablesDB;
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
  databases: TablesDB;
  storage: Storage;
  teams: Teams;
  functions: Functions;
  avatars: Avatars;
}
