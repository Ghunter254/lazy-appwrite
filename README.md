### Lazy Appwrite (Alpha)

Stop clicking around the Console. Start coding. A declarative, schema-first SDK for Appwrite that handles database creation, syncing, and typed queries automatically.
Lazy Appwrite allows you to define your Database Schemas in code. When you try to read or write data, the library checks if the Database, Tables, Columns, and Indexes exist. If they don't, it creates them for you instantly.

Alpha Status Warning
This library is currently in Alpha.

Works: Database/Collection creation, Attribute syncing (String, Int, Bool), Basic CRUD, Object-syntax queries.

Advanced: Relationship attributes, Geo-Spatial, and Indexes.

Self-Healing: Detects Schema Drift (String size expansion, Enum additions) and Ghost Indexes.

Hygiene: Automatic data validation and improved error handling (Always room for more improvement.)

Robust: Handles Race Conditions (Cold Starts), Rate Limiting (Exponential Backoff), and Data Hygiene.

In Progress: Schema Permissions, Storage Helpers, Auth Helpers.

Breaking Changes: API might change greatly before v1.0.

### Features

Lazy Infrastructure: Never manually create a table again. Just define it and insert data.

Declarative Schema: Keep your database structure in version control (Git), not in your head.

Mongo-like Syntax: Users.list({ active: true }) instead of verbose Query builders.

Type Safety: Full TypeScript support for your models and schemas.

Smart Syncing: Skips checks if the table was already verified in the current session (High Performance).

Race Condition Proof: Safe to use in Serverless environments. Parallel requests wait for the leader to finish syncing the schema.

Drift Detection: If you change size: 50 to size: 100 in your code, the library automatically updates the live database.

Smart Casting: Safely converts strings ("25", "true") to Integers/Booleans before sending to Appwrite.

Typed Errors: Catch specific errors like LazyErrorType.VALIDATION or LazyErrorType.APPWRITE.

### Installation

`npm install lazy-appwrite node-appwrite`
or
`yarn add lazy-appwrite node-appwrite`

#

### Quick Start

Create a file (e.g., `schemas.ts`) and define your tables using our strict types.

```ts
import { TableSchema, ColumnType } from "lazy-appwrite";
export const UserSchema: TableSchema = {
  id: "users",
  name: "Users",
  columns: [
    { key: "username", type: ColumnType.String, size: 50, required: true },
    { key: "age", type: ColumnType.Integer, required: false, _default: null },
    {
      key: "is_active",
      type: ColumnType.Boolean,
      required: true,
      _default: true,
    },
    {
      key: "location",
      type: ColumnType.Point,
      required: true,
    },
  ],
  indexes: [
    {
      key: "idx_username",
      type: IndexType.Unique,
      columns: ["username"],
    },
    {
      key: "idx_location",
      type: IndexType.Spatial, // Spatial index usually requires specific handling, standard Key for now
      columns: ["location"],
    },
  ],
};
```

Initialize the Client
Connect to Appwrite using the Service Factory. This gives you access to specific Databases.

```ts
import { LazyDatabase, AppwriteService } from "lazy-appwrite";
import { UserSchema } from "./schemas";

// 1. Connect (Admin Client)
const app = AppwriteService.createAdminClient({
  projectId: "YOUR_PROJECT_ID",
  endpoint: "https://cloud.appwrite.io/v1",
  apiKey: "YOUR_SECRET_KEY",
});

// 2. Initialize a Database Wrapper
const DATABASE_ID = "your-db-id";
const db = app.getDatabase(DATABASE_ID, "your-db-name");

// 3. Create your Model
export const Users = db.model(UserSchema);
```

Now you can write code as if the database already exists.

```ts
import { Users } from "./config";

async function register() {
  // IF 'users' table doesn't exist, it is created automatically here!
  // IF 'username' column is missing, it is added automatically!
  const newUser = await Users.create({
    username: "LazyDev",
    age: 25,
    is_active: true,
  });

  console.log("Created:", newUser.$id);
}

async function find() {
  // Clean Object Syntax for queries
  const activeUsers = await Users.list({
    is_active: true,
  });

  console.log(activeUsers);
}
```

Advanced Schemas: We now support complex types like relationships and Geo-location.

```ts
import {
  TableSchema,
  ColumnType,
  RelationType,
  onDelete,
  IndexType,
} from "lazy-appwrite";

export const PostSchema: TableSchema = {
  id: "posts",
  name: "Posts",
  columns: [
    { key: "title", type: ColumnType.String, size: 255, required: true },

    // Geo Point (Longitude, Latitude)
    { key: "location", type: ColumnType.Point, required: false },

    // Relationship (Many Posts -> One User)
    {
      key: "author",
      type: ColumnType.Relationship,
      relatedTableId: "users", // Must match UserSchema.id
      relationType: RelationType.ManyToOne,
      twoWay: true,
      twoWayKey: "posts",
      onDelete: onDelete.SetNull,
    },
  ],
  indexes: [{ key: "idx_title", type: IndexType.Unique, columns: ["title"] }],
};
```

### Roadmap to v1.0

- [ ] Storage Helper
- [ ] Auth Helper
- [ ] CLI

#

### Contributers

We are actively looking for contributors!

- Fork the repo.
- Create a feature branch (`git checkout -b feature/amazing-feature`).
- Commit your changes.
- Open a Pull Request.

#

### License

Distributed under the MIT License. See `LICENSE` for more information.

![npm version](https://img.shields.io/npm/v/lazy-appwrite)
[![Changelog](https://img.shields.io/badge/Changelog-Click%20Here-blue)](./CHANGELOG.md)
![license](https://img.shields.io/badge/license-MIT-green)
![status](https://img.shields.io/badge/status-alpha-orange)
