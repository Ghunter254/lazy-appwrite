import { Account, Users, type Client } from "node-appwrite";
import { AuthUtilities } from "./auth";
import { Logger } from "../common/Logger";
import { UsersUtilities } from "./users";

export class LazyUtils {
  public auth: AuthUtilities;
  public users: UsersUtilities;
  private projectId: string;
  private endPoint: string;

  private _client: Client;

  constructor(client: Client, logger?: Logger) {
    const safeLogger = logger || new Logger(false);

    this._client = client;

    this.projectId = (client as any).config.project;
    this.endPoint = (client as any).config.endpoint;

    const account = new Account(client);
    const users = new Users(client);

    this.auth = new AuthUtilities(
      account,
      safeLogger,
      this.endPoint,
      this.projectId
    );

    this.users = new UsersUtilities(users, safeLogger);
  }

  /**
   * Returns the raw Appwrite Client instance.
   */
  get client(): Client {
    return this._client;
  }
}
