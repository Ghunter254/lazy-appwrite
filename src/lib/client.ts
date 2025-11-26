import {
  Client,
  Account,
  Users,
  Storage,
  Teams,
  Functions,
  Messaging,
  Avatars,
} from "node-appwrite";

import {
  type AppwriteConfig,
  type AppwriteAdminContext,
  type AppwriteSessionContext,
} from "../types/client-types";
import { Logger } from "../common/Logger";
import { LazyDatabase } from "./database";
import { LazyError } from "../handlers/error";

export class AppwriteService {
  /**
   * Initializes a server-side Admin client with full permissions.
   * Mind: Never expose the API key to the client-side.
   * @param config - Contains ProjectId, Endpoint, and REQUIRED api key.
   * Could also contain verbose tag (true recommended in dev mode.)
   */

  public static createAdminClient(
    config: AppwriteConfig
  ): AppwriteAdminContext {
    if (!config.apiKey) {
      throw LazyError.config("Admin Client requires a secret 'apiKey'.");
    }

    try {
      const verbose = config.verbose === true;
      const logger = new Logger(verbose);
      const client = new Client()
        .setEndpoint(config.endpoint || "https://cloud.appwrite.io/v1")
        .setProject(config.projectId)
        .setKey(config.apiKey);

      if (config.selfSigned) {
        client.setSelfSigned(true);
      }

      return {
        client,
        getDatabase: (databaseId: string, databaseName: string) =>
          new LazyDatabase(client, databaseId, databaseName, logger),
        users: new Users(client),
        storage: new Storage(client),
        teams: new Teams(client),
        messaging: new Messaging(client),
        functions: new Functions(client),
        avatars: new Avatars(client),
      };
    } catch (error: any) {
      throw LazyError.config(
        `An error occured when setting up admin client. Check if all credentials are included`,
        error
      );
    }
  }

  /**
   * Initializes a standard client for client-side or SSR use.
   * Does NOT use an API Key.
   * * @param config - Contains projectId and endpoint
   */

  public static createClient(config: AppwriteConfig): AppwriteSessionContext {
    try {
      const client = new Client()
        .setEndpoint(config.endpoint || "https://cloud.appwrite.io/v1")
        .setProject(config.projectId);

      if (config.selfSigned) {
        client.setSelfSigned(true);
      }
      const verbose = config.verbose === true;
      const logger = new Logger(verbose);

      return {
        sessionClient: client,
        account: new Account(client), // The core of Session clients
        storage: new Storage(client),
        teams: new Teams(client),
        functions: new Functions(client),
        avatars: new Avatars(client),
        getDatabase: (databaseId: string, databaseName: string) =>
          new LazyDatabase(client, databaseId, databaseName, logger),
      };
    } catch (error: any) {
      throw LazyError.config(
        `An error occured when setting up session client. Check if all credentials are included`,
        error
      );
    }
  }
}
