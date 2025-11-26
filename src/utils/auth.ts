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
    private users: Users,
    private account: Account,
    private endPoint: string,
    private logger: Logger,
    private projectId: string
  ) {}

  /**
   *
   * @param email Finds one user with the email param.
   * @returns The user object or null.
   * Doesnt throw a 404
   */
  async findByEmail(
    email: string
  ): Promise<Models.User<Models.Preferences> | null> {
    try {
      const result = await withRetry(() =>
        this.users.list({
          queries: [Query.equal("email", email), Query.limit(1)],
        })
      );
      const user = result.users[0];
      return user ? (user as Models.User<Models.Preferences>) : null;
    } catch (error) {
      throw LazyError.appwrite("Failed to fetch user", error);
    }
  }
  /**
   * Uses Users SDK for admin tasks.
   * @param email
   * @param password optional (Needed only for user creation)
   * @param name optional (Needed only for user creation)
   * @returns user object and true if user exists.
   * Creates a user object if doesnt exist.
   * @throws type validation if no password. type appwrite if process fails.
   */

  async getOrCreateUser(
    email: string,
    password?: string,
    name?: string
  ): Promise<{ user: Models.User<Models.Preferences>; created: boolean }> {
    this.logger.info(`[Auth] Checking if user exists: ${email}`);
    const user = await this.findByEmail(email);

    if (user) {
      return { user: user, created: false };
    }

    if (!password) {
      throw LazyError.validation("Password is needed to create user account.");
    }
    try {
      const newUser = await withRetry(() =>
        this.users.create({
          userId: ID.unique(),
          email: email,
          ...(password ? { password: password } : {}),
          ...(name ? { name: name } : {}),
        })
      );
      this.logger.info(`[Auth] User created: ${newUser.$id}`);
      return {
        user: newUser as Models.User<Models.Preferences>,
        created: true,
      };
    } catch (error: any) {
      if (error.code === 409) {
        // Handle race between creation and check
        const retrySearch = await this.findByEmail(email);
        if (retrySearch) return { user: retrySearch, created: false };
        throw LazyError.appwrite(
          "User exists (409) but could not be found.",
          error
        );
      }
      throw LazyError.appwrite("Could not find or create user.", error);
    }
  }

  /**
   * Uses Users SDK.
   * @param userId Id of the user to delete.
   * @returns a boolean.
   * @throws type appwrite if process fails.
   */

  async deleteUser(userId: string): Promise<boolean> {
    try {
      await withRetry(() => this.users.delete({ userId: userId }));
      this.logger.info(`[Auth] User deleted: ${userId}`);
      return true;
    } catch (error: any) {
      if (error.code === 404) return false;
      throw LazyError.appwrite("Failed to delete user", error);
    }
  }

  /**
   * Uses Account SDK
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
   * Uses Account SDK
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
   * Uses Account SDK
   * @returns current authenticated user.
   */
  async getMe(): Promise<Models.User<Models.Preferences> | null> {
    try {
      return await this.account.get();
    } catch (error: any) {
      // 401 means Not Logged In. Return null (safe).
      if (error.code === 401) return null;
      throw LazyError.appwrite("Failed to fetch user session", error);
    }
  }

  async isLoggedIn(): Promise<boolean> {
    const user = await this.getMe();
    return !!user;
  }

  async logout(session?: string) {
    return await this.account.deleteSession(
      session ? { sessionId: session } : { sessionId: "current" }
    );
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
