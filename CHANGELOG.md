# Changelog

All notable changes to the "Lazy Appwrite" project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] - 2025-11-26

### Added

- **New Subpath:** `lazy-appwrite/utils` for importing helper utilities without bloating the core bundle.
- **Auth Utilities:**
  - `getOrCreateUser`: Idempotent user creation for Admin scripts (handles 409 conflicts).
  - `loginOrRegister`: Frictionless client-side onboarding flow.
  - `fromRequest`: SSR Cookie parser for frameworks like Next.js/SvelteKit.
  - `deleteUser`: Helper to delete users by ID.
- **Configuration:** Added `endpoint` support to `AuthUtilities` constructor to support self-hosted Appwrite instances.

### Changed

- **Architecture:** Decoupled Utilities from Core logic to enable better tree-shaking.

## [0.3.0] - 2025-11-23

### Added

- **Self-Healing Infrastructure:** Detects and fixes "Ghost Indexes" (indexes stuck in a failed state).
- **Schema Drift Detection:** Automatically expands String column sizes and adds new Enum options if changed in the code schema.
- **Race Condition Protection:** Implemented a Mutex/Promise Cache to handle "Cold Starts" in serverless environments, preventing duplicate creation errors.
- **Rate Limiting:** Added `withRetry` utility (Exponential Backoff) to handle API Rate Limits (429) during bulk table creation.
- **Data Hygiene:**
  - **Smart Casting:** Automatically converts strings (e.g., "25", "true") to correct Integer/Boolean types.
  - **Validation:** Local Regex checks for Emails and URLs before sending requests.
  - **Strip Unknowns:** Removes fields not present in the schema to prevent API 400 errors.
- **Permission Sync:** Updates Collection permissions and Security settings if they differ from the Schema definition.

### Fixed

- Fixed critical bug where creating Spatial Indexes failed due to explicit ordering parameters.
- Fixed `createColumn` logic to properly handle Relationship creation syntax for newer SDK versions.

## [0.2.2]

### Added

- **Typed Errors:** Introduced `LazyError` class with specific types (`VALIDATION`, `APPWRITE`, `TIMEOUT`, `CONFIG`) for better error handling.
- **Health Check:** Added `verifyConnection` to fail fast during initialization if API Keys or Project IDs are invalid.

### Changed

- **Exports:** Centralized exports in `index.ts` to reduce import surface area.
- **Renamed:** Main entry point class renamed to `LazyAppwrite` (formerly `AppwriteService`).

## [0.2.0]

### Added

- **Relationships:** Support for `OneToMany`, `ManyToOne`, and `OneToOne` relationships in schema definitions.
- **Geo-Spatial:** Support for `Point` and `Polygon` attributes and `Spatial` Indexes.
- **Lazy Database:** Logic to create the Database container itself if the ID is missing.
- **Verbose Logging:** Added `verbose` flag to configuration to suppress operational logs in production environments.

## [0.1.0]

### Added

- Initial Release.
- Lazy Collection creation logic.
- Basic Attribute syncing (String, Integer, Boolean, Float, Email, URL, IP, Enum).
- Mongo-style query syntax support (e.g., `{ name: "John" }`).
