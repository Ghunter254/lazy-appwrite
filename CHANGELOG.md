# Changelog

## [1.0.0] - 2025-12-03 (The Stable Release)

**Lazy Appwrite is now stable.** This release marks the completion of the core infrastructure engine, authentication utilities, and CLI tooling.

### Key Features

- **Lazy Infrastructure:** Automatically creates Databases, Collections, Attributes, and Indexes on first use.
- **Self-Healing:** Detects Schema Drift (e.g., String size changes) and patches the live database automatically.
- **Serverless-Ready:** Implements a **Mutex/Promise Cache** to prevent race conditions (409 Conflicts) during cold starts.
- **Smart Indexing:** Automatically polls attribute status (`processing` -> `available`) before creating indexes to prevent crashes.
- **Data Hygiene:** Client-side validation, type coercion (String -> Int), and ghost-field stripping.

### Utilities

- **Auth (Client):** `loginOrRegister` flow for frictionless onboarding.
- **Users (Admin):** `getOrCreate` and `update` (Master Update) for idempotent backend logic.
- **SSR:** `fromRequest` helper to parse sessions in Next.js/SvelteKit.

### CLI

- `npx lazy-appwrite init`: Scaffolds configuration and generates TypeScript schema examples.

---
