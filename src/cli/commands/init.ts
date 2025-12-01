import fs from "fs-extra";
import path from "path";
import inquirer from "inquirer";
import chalk from "chalk";

// The Template Content
const APPWRITE_CONFIG_TEMPLATE = `
import { LazyAppwrite } from "lazy-appwrite";
import { LazyUtils } from "lazy-appwrite/utils";

// 1. Initialize Client
const app = LazyAppwrite.createAdminClient({
  endpoint: "https://cloud.appwrite.io/v1",
  projectId: "your-project-id",
  apiKey: "your-api-key",
  verbose: true,
});

// 2. Export Database
export const db = app.getDatabase("main-db", "Main Database");

// 3. Export Utilities
export const utils = new LazyUtils(app.client);
// export const auth = utils.auth;
// export const users = utils.users;

`;

const EXAMPLE_SCHEMA_TEMPLATE = `
import { TableSchema, ColumnType, IndexType } from "lazy-appwrite";

export const UserSchema: TableSchema = {
  id: "users",
  name: "Users",
  columns: [
    { key: "username", type: ColumnType.String, size: 50, required: true },
    { key: "email", type: ColumnType.Email, required: true }
  ],
  indexes: [
    { key: "idx_email", type: IndexType.Unique, columns: ["email"] }
  ]
};
`;

// Usage Examples Template
const USAGE_TEMPLATE = `
import { db } from "../src/lib/appwrite"; // Check this path matches your project!
import { UserSchema } from "./users";
import { ID } from "lazy-appwrite";

/**
 * OPTION 1: The Lazy Way (Recommended)
 * - Auto-creates table/columns if missing
 * - Validates data types
 * - Handles type coercion (String -> Int)
 */
export async function lazyFlow() {
  // 1. Initialize Model
  const Users = db.model(UserSchema);

  // 2. Create (Triggers Sync)
  await Users.create({
    username: "LazyDev",
    email: "test@example.com",
  });

  // 3. List
  const list = await Users.list({ email: "test@example.com" });
}

/**
 * OPTION 2: The Standard Way (Escape Hatch)
 * - Uses raw Appwrite SDK methods
 * - No auto-creation, no validation
 * - Useful for edge cases not supported by Lazy (e.g. Aggregations)
 */
export async function standardFlow() {
  // 1. Get raw SDK instance
  const rawDb = db.standard; // Returns 'Databases' from node-appwrite

  // 2. Use raw methods (You must know IDs manually)
  await rawDb.createRow({
    databaseId: "main-db", // databaseId
    tableId: "users", // collectionId (Matches schema ID)
    rowId: ID.unique(),
    data: {
      username: "RawDev",
      email: "raw@example.com",
    },
  });
}
`;

export async function init() {
  console.log(chalk.blue("Initializing Lazy Appwrite..."));

  // Ask where to put the config
  const answers = await inquirer.prompt([
    {
      type: "input",
      name: "libPath",
      message: "Where should we create the config file?",
      default: "src/lib/appwrite.ts",
    },
    {
      type: "confirm",
      name: "examples",
      message: "Do you want to generate example schemas?",
      default: true,
    },
  ]);

  const configPath = path.resolve(process.cwd(), answers.libPath);
  const dir = path.dirname(configPath);

  // Ensure directory exists
  await fs.ensureDir(dir);

  // Check if config exists
  if (fs.existsSync(configPath)) {
    console.log(
      chalk.yellow(
        `⚠️  File ${answers.libPath} already exists. Skipping config generation.`
      )
    );
  } else {
    await fs.writeFile(configPath, APPWRITE_CONFIG_TEMPLATE.trim());
    console.log(chalk.green(`Created config: ${answers.libPath}`));
  }

  // Generate Examples (Safe Mode)
  if (answers.examples) {
    const exampleDir = path.resolve(process.cwd(), "lazy-examples");
    await fs.ensureDir(exampleDir);

    await fs.writeFile(
      path.join(exampleDir, "users.ts"),
      EXAMPLE_SCHEMA_TEMPLATE.trim()
    );
    await fs.writeFile(
      path.join(exampleDir, "usage-guide.ts"),
      USAGE_TEMPLATE.trim()
    );

    console.log(chalk.green(`Created examples in: lazy-examples/`));
    console.log(
      chalk.gray(`   (You can copy these into your project structure later)`)
    );
  }

  console.log(chalk.bold("\nNext Steps:"));
  console.log(`1. Add variables to your ${chalk.cyan(".env")} file.`);
  console.log(
    `2. Import ${chalk.cyan("db")} from ${answers.libPath} and start coding!`
  );
}
