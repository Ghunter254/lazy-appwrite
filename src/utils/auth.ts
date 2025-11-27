import {
  Account,
  Client,
  ID,
  Query,
  type Models,
  type Users,
} from "node-appwrite";
import type { Logger } from "../common/Logger";
import { LazyError } from "../handlers/error";
import { withRetry } from "../common/withRetry";
import type { AuthContext } from "../types/client-types";

export class AuthUtilities {
  constructor(
    private account: Account,
    private logger: Logger,
    private endPoint: string,
    private projectId: string
  ) {}

  /**
   * @param email
   * @param password
   * @param name optional.
   * @returns a user object.
   * @throws type appwrite if error code 409 or if registration fails.
   */

  async register(
    email: string,
    password: string,
    name?: string
  ): Promise<Models.User<Models.Preferences>> {
    try {
      return await withRetry(() =>
        this.account.create({
          userId: ID.unique(),
          email: email,
          password: password,
          ...(name ? { name: name } : {}),
        })
      );
    } catch (error: any) {
      if (error.code === 409) {
        throw LazyError.appwrite(
          "A user with this email already exists.",
          error
        );
      }
      throw LazyError.appwrite("Registration failed", error);
    }
  }

  /**
   *
   * @param email
   * @param password
   * @returns an appwrite session.
   * @throws type appwrite for invalid credentials and on login fail.
   */

  async login(email: string, password: string): Promise<Models.Session> {
    try {
      const session = await withRetry(() =>
        this.account.createEmailPasswordSession({
          email: email,
          password: password,
        })
      );

      return session;
    } catch (error: any) {
      if (error.code === 401) {
        throw LazyError.appwrite("Invalid credentials.", error);
      }
      throw LazyError.appwrite("Login failed", error);
    }
  }

  /**
   * Uses the Account SDK
   * @param email
   * @param password
   * @param name
   * @returns an appwrite session
   */

  async loginOrRegister(email: string, password: string, name?: string) {
    try {
      return await this.account.createEmailPasswordSession({
        email: email,
        password: password,
      });
    } catch (loginError: any) {
      this.logger.info("[Auth] Login failed, attempting registration...");
      try {
        await this.register(email, password, name);
        return await withRetry(() =>
          this.account.createEmailPasswordSession({
            email: email,
            password: password,
          })
        );
      } catch (regError: any) {
        if (regError.originalError?.code === 409) {
          throw LazyError.appwrite("Invalid Password", loginError);
        }
        throw LazyError.abort("Failed to create or login user", regError);
      }
    }
  }

  /**
   *
   * @returns current authenticated user.
   */
  async getMe(
    session: string
  ): Promise<Models.User<Models.Preferences> | null> {
    try {
      const scopedClient = new Client()
        .setEndpoint(this.endPoint)
        .setProject(this.projectId)
        .setSession(session);

      const sessionAccount = new Account(scopedClient);
      const user = await sessionAccount.get();

      return user;
    } catch (error: any) {
      // 401 means Not Logged In. Return null (safe).
      if (error.code === 401) return null;
      throw LazyError.appwrite("Failed to fetch user session", error);
    }
  }

  async isLoggedIn(session: string): Promise<boolean> {
    const user = await this.getMe(session);
    return !!user;
  }

  async logout(session: string) {
    const scopedClient = new Client()
      .setEndpoint(this.endPoint)
      .setProject(this.projectId)
      .setSession(session);

    const sessionAccount = new Account(scopedClient);

    return await sessionAccount.deleteSession({
      sessionId: "current",
    });
  }

  /**
   *
   * @param req a Request object. Session Cookie extracted from req.cookies
   * @returns An AuthContext.
   */
  async fromRequest(req: any): Promise<AuthContext> {
    const session = req.cookies[`a_session_${this.projectId}`];

    if (!session)
      return { user: null, sessionToken: null, isAuthenticated: false };

    try {
      const scopedClient = new Client()
        .setEndpoint(this.endPoint)
        .setProject(this.projectId)
        .setSession(session);

      const sessionAccount = new Account(scopedClient);
      const user = await sessionAccount.get();
      return { user, sessionToken: session, isAuthenticated: true };
    } catch {
      return { user: null, sessionToken: null, isAuthenticated: false };
    }
  }
}
