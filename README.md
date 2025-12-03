# Lazy Appwrite

![npm version](https://img.shields.io/npm/v/lazy-appwrite?color=blue)
[![Changelog](https://img.shields.io/badge/Changelog-Click%20Here-blue)](./CHANGELOG.md)
![license](https://img.shields.io/badge/license-MIT-green)
![status](https://img.shields.io/badge/status-alpha-orange)

**Stop clicking around the Console. Start coding.**

A declarative, self-healing SDK for Appwrite that handles database creation, syncing, and typed queries automatically.

---

- **Core:** Database/Collection lazy creation, Primitive Attributes.
- **Advanced:** Relationships, Geo-Spatial, and Indexes.
- **Self-Healing:** Detects Schema Drift and Ghost Indexes.
- **Robust:** Handles Race Conditions (Cold Starts), Rate Limiting, and Data Hygiene.
- **Utilities:** Auth Helpers (Login, Register, SSR Cookies) and User Management (Admin).
- **In Progress:** Storage Helpers.

---

## Features

- **Lazy Infrastructure:** Define schema in code; library creates it on the fly.
- **Race Condition Proof:** Built for Serverless. Mutex locking prevents 409 conflicts.
- **Drift Detection:** Auto-updates DB when you change code (e.g. expand String size).
- **Data Hygiene:** Smart casting (String -> Int) and validation before API calls.
- **Typed Errors:** Catch specific errors like `LazyErrorType.VALIDATION`.

---

## Installation

```bash
npm install lazy-appwrite node-appwrite
```

---

## Quick Start (The Easy Way)

Run the initialization command to scaffold your configuration and example schemas.

```bash
npx lazy-appwrite init
```

**This will create:**

- `src/lib/appwrite.ts` (Client setup)
- `lazy-examples/` (Schema templates)

---

## Manual Setup

If you prefer to set it up manually:

### 1. Define a Schema

```typescript
import { TableSchema, ColumnType, IndexType } from "lazy-appwrite";

export const UserSchema: TableSchema = {
  id: "users",
  name: "Users",
  columns: [
    { key: "username", type: ColumnType.String, size: 50, required: true },
    { key: "age", type: ColumnType.Integer, required: false, _default: 18 },
  ],
  indexes: [
    { key: "idx_username", type: IndexType.Unique, columns: ["username"] },
  ],
};
```

### 2. Initialize

```typescript
import { LazyAppwrite } from "lazy-appwrite";
import { UserSchema } from "./schemas";

const app = LazyAppwrite.createAdminClient({
  projectId: "...",
  apiKey: "...",
  endpoint: "...",
});

const db = app.getDatabase("my-db", "Main DB");
export const Users = db.model(UserSchema);
```

### 3\. Use

```typescript
await Users.create({
  username: "LazyDev",
  age: "25", // Auto-casted to Int
});
```

---

## 🔐 Auth Utilities

New in `v0.5.0`: A dedicated subpath for Authentication helpers.

```typescript
import { LazyUtils } from "lazy-appwrite/utils";

// Initialize with your client
const utils = new LazyUtils(app.client);

// 1. Client-Side (Session)
// Frictionless onboarding: Tries Login -> Fails? -> Register -> Login
await utils.auth.loginOrRegister("user@test.com", "pass123");

// 2. Server-Side (Admin)
// Idempotent creation: Checks if user exists -> Returns it. If not -> Creates it.
await utils.users.getOrCreate("admin@test.com", "pass123");
```

---

## 🤝 Contributors

We are actively looking for contributors\!

1.  Fork the repo.
2.  Create a feature branch.
3.  Open a Pull Request.

---

## 📄 License

Distributed under the MIT License.

```

```
