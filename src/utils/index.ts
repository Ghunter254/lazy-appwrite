import { Account, Users, type Client } from "node-appwrite";
import { AuthUtilities } from "./auth";
import type { Logger } from "../common/Logger";
import { UsersUtilities } from "./users";

export class LazyUtils {
  public auth: AuthUtilities;
  public users: UsersUtilities;
  private projectId: string;
  private endPoint: string;

  constructor(client: Client, logger: Logger) {
    this.projectId = (client as any).config.project;
    this.endPoint = (client as any).config.endpoint;

    const account = new Account(client);
    const users = new Users(client);

    this.auth = new AuthUtilities(
      account,
      logger,
      this.endPoint,
      this.projectId
    );

    this.users = new UsersUtilities(users, logger);
  }
}
