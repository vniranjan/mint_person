# @mint/db

Shared database types and utilities package for mint_personal.

## Purpose

This workspace package (`packages/db`) is the canonical location for:

- **Shared TypeScript types** derived from the Prisma schema (e.g. `User`, `Transaction`, `Statement`)
- **Database utility helpers** shared between the Next.js web app and any future packages
- **Re-exports** of Prisma client types for consuming packages

## Usage

```ts
import type { Transaction } from "@mint/db";
```

## Architecture Notes

- The Prisma schema lives in `apps/web/prisma/schema.prisma` (single source of truth)
- Full Prisma client + generated types → Story 1.2
- This package is declared as a workspace dependency in `apps/web/package.json` and resolved via npm workspaces
- The `apps/web/next.config.js` includes `transpilePackages: ["@mint/db"]` for hot-reload support in local dev
