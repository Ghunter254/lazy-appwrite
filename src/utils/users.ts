import { ID, Query, type Models, type Users } from "node-appwrite";
import type { Logger } from "../common/Logger";
import { withRetry } from "../common/withRetry";
import { LazyError } from "../handlers/error";
import type { UpdateUserOptions } from "../types/client-types";

export class UsersUtilities {
  constructor(private users: Users, private logger: Logger) {}

  /**
   * Returns the raw Appwrite 'Users' service (Admin).
   */
  get standard(): Users {
    return this.users;
  }

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
   *
   * @param userId
   * @returns get a user by their unique ID
   */
  async getById(userId: string): Promise<Models.User | null> {
    try {
      const result = await withRetry(() =>
        this.users.get({
          userId,
        })
      );
      return result;
    } catch (error) {
      throw LazyError.appwrite("Failed to fetch user", error);
    }
  }

  /**
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
    this.logger.info(`[Users] Checking if user exists: ${email}`);
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
   *
   * @param userId
   * @returns User preferences.
   */
  async getUserPreferences(userId: string): Promise<Models.Preferences> {
    try {
      const result = await withRetry(() =>
        this.users.getPrefs({
          userId: userId,
        })
      );

      return result;
    } catch (error) {
      throw LazyError.appwrite("Could not list user preferences.", error);
    }
  }

  /**
   *
   * @param queries Array of query strings
   * @param search Search term to filter your list results
   * @param total
   * @returns A list of users.
   */
  async listUsers(
    queries?: Array<string>,
    search?: string,
    total?: boolean
  ): Promise<Models.UserList> {
    try {
      const result = await withRetry(() =>
        this.users.list({
          ...(queries ? { queries: queries } : {}),
          ...(search ? { search: search } : {}),
          ...(total ? { total: total } : {}),
        })
      );
      return result;
    } catch (error) {
      throw LazyError.appwrite("Failed to list users", error);
    }
  }

  async update(userId: string, options: UpdateUserOptions): Promise<void> {
    this.logger.info(`[Users] Updating user: ${userId}`);
    const updates: Promise<any>[] = [];

    if (options.name !== undefined) {
      updates.push(
        withRetry(() =>
          this.users.updateName({
            userId: userId,
            name: options.name!,
          })
        )
      );
    }
    if (options.email !== undefined) {
      updates.push(
        withRetry(() =>
          this.users.updateEmail({
            userId: userId,
            email: options.email!,
          })
        )
      );
    }
    if (options.phone !== undefined) {
      updates.push(
        withRetry(() =>
          this.users.updatePhone({
            userId: userId,
            number: options.phone!,
          })
        )
      );
    }
    if (options.password !== undefined) {
      updates.push(
        withRetry(() =>
          this.users.updatePassword({
            userId: userId,
            password: options.password!,
          })
        )
      );
    }

    // Status
    if (options.blocked !== undefined) {
      const active = !options.blocked;
      updates.push(
        withRetry(() =>
          this.users.updateStatus({
            userId: userId,
            status: active,
          })
        )
      );
    }
    if (options.emailVerified !== undefined) {
      updates.push(
        withRetry(() =>
          this.users.updateEmailVerification({
            userId: userId,
            emailVerification: options.emailVerified!,
          })
        )
      );
    }
    if (options.phoneVerified !== undefined) {
      updates.push(
        withRetry(() =>
          this.users.updatePhoneVerification({
            userId: userId,
            phoneVerification: options.phoneVerified!,
          })
        )
      );
    }

    // Prefs
    if (options.prefs !== undefined) {
      updates.push(
        withRetry(() =>
          this.users.updatePrefs({
            userId: userId,
            prefs: options.prefs!,
          })
        )
      );
    }

    // Labels
    if (options.labels !== undefined) {
      const labelUpdate = async () => {
        let finalLabels = options.labels!;

        // If merging, we need to fetch the user first
        if (options.mergeLabels) {
          const user = await withRetry(() => this.users.get({ userId }));
          // Create Set to remove duplicates
          finalLabels = [...new Set([...user.labels, ...options.labels!])];
        }

        return this.users.updateLabels({
          userId: userId,
          labels: finalLabels,
        });
      };

      updates.push(withRetry(labelUpdate));
    }

    try {
      if (updates.length === 0) return;
      await Promise.all(updates);
      this.logger.info(`[Users] Update complete for ${userId}`);
    } catch (error) {
      throw LazyError.appwrite("Failed to update user", error);
    }
  }
  /**
   * All user-related resources like documents or storage files should be deleted before user deletion.
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
}
