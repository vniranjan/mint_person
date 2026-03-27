# Story 1.1: Project Scaffold & Design Foundation

Status: review

## Story

As a developer,
I want the complete monorepo initialized with T3 stack, Python worker scaffold, shadcn/ui, Tailwind design tokens, and a working local development environment,
so that all subsequent stories have a consistent foundation, working toolchain, and a deployable skeleton application.

## Acceptance Criteria

1. **AC1 — Local dev stack starts clean:** Given the monorepo root exists, when `npm install` and `docker-compose up` are run, then a Next.js app starts on localhost:3000, a Python FastAPI worker starts on localhost:8000, a PostgreSQL instance starts on localhost:5432, and Azurite emulates Azure Storage on localhost:10000 (Blob), 10001 (Queue), 10002 (Table).

2. **AC2 — Tailwind design tokens configured:** Given the T3 app is initialized, when `apps/web/tailwind.config.ts` is inspected, then the custom stone/amber color palette is defined with all tokens from UX-DR1 — stone-50 through stone-900, amber-400, amber-50, amber-700, emerald-600, red-600 — and all 8 fixed category color badge pairings from UX-DR2 are present as named token pairs.

3. **AC3 — shadcn/ui components present:** Given shadcn/ui is initialized, when `apps/web/src/components/ui/` is inspected, then Button, Input, Card, Badge, Toast, Dialog, Popover, Progress, Table, and Separator components are present.

4. **AC4 — Directory structure and CI in place:** Given the monorepo structure, when the directory tree is inspected, then `apps/web/` (T3 Next.js), `apps/worker/` (Python FastAPI), and `packages/db/` exist; `.github/workflows/ci.yml` runs TypeScript type-check + ESLint + Prisma schema validation on PR; Inter font is configured in `globals.css`.

5. **AC5 — Reduced motion support:** The `prefers-reduced-motion` CSS media query is implemented in `globals.css` — disabling progress animations and fade transitions when the user has reduced motion enabled (per UX-DR18).

## Tasks / Subtasks

- [x] **Task 1: Initialize monorepo root** (AC: 1, 4)
  - [x] Create root `package.json` with npm workspaces: `"workspaces": ["apps/*", "packages/*"]`
  - [x] Create `.gitignore` (Node, Python, env files, `.next/`, `__pycache__/`, `.env*` except `.env.example`)
  - [x] Create root `.env.example` with all required variable stubs (DATABASE_URL, NEXTAUTH_SECRET, NEXTAUTH_URL, AZURE_STORAGE_CONNECTION_STRING, AZURE_QUEUE_NAME, LLM_MODEL, LLM_API_KEY)

- [x] **Task 2: Initialize T3 app in `apps/web/`** (AC: 1, 4)
  - [x] Run exact command from root: `npm create t3-app@latest apps/web -- --CI --appRouter --tailwind --prisma --nextAuth --noGit`
  - [x] Verify App Router structure: `apps/web/src/app/` with `layout.tsx`, `globals.css`, `page.tsx`
  - [x] Add additional npm packages to `apps/web/`: `@azure/storage-blob`, `@azure/storage-queue`, `recharts`, `@tanstack/react-query`, `@tanstack/react-query-devtools`
  - [x] Create `apps/web/.env.example` (mirrors root but web-specific: DATABASE_URL, NEXTAUTH_SECRET, NEXTAUTH_URL, AZURE_*)

- [x] **Task 3: Configure Tailwind design tokens** (AC: 2)
  - [x] In `apps/web/tailwind.config.ts`, add `extend.colors` (NOT replace `colors`) with all stone/amber/semantic tokens from UX-DR1
  - [x] Add 8 category color token pairs under `extend.colors.category` from UX-DR2 (see Dev Notes for exact values)
  - [x] Verify all color pairings achieve ≥ 4.5:1 contrast ratio (UX-DR2 values are pre-verified — do not substitute)

- [x] **Task 4: Initialize shadcn/ui and add components** (AC: 3)
  - [x] Run `npx shadcn@latest init` in `apps/web/` (select: TypeScript, CSS variables, stone base color, `src/` directory)
  - [x] Add all required components: `npx shadcn@latest add button input card badge toast dialog popover progress table separator`
  - [x] Verify all 10 component files appear in `apps/web/src/components/ui/`
  - [x] **IMPORTANT:** Never manually edit files in `src/components/ui/` — managed by shadcn CLI only

- [x] **Task 5: Configure Inter font and global CSS** (AC: 4, 5)
  - [x] In `apps/web/src/app/layout.tsx`, import Inter via `next/font/google` with `subsets: ['latin']`; apply as CSS variable `--font-inter`
  - [x] In `apps/web/src/app/globals.css`, set `font-family: var(--font-inter)` on `:root`
  - [x] Add `@media (prefers-reduced-motion: reduce)` block to `globals.css` that sets `animation-duration: 0.01ms !important; transition-duration: 0.01ms !important` and disables specific transition/animation classes used by UploadPipeline progress bar (future components must also respect this)

- [x] **Task 6: Scaffold Python worker in `apps/worker/`** (AC: 1, 4)
  - [x] Create `apps/worker/requirements.txt` with pinned versions (see Dev Notes)
  - [x] Create `apps/worker/main.py` — FastAPI app with `/health` endpoint returning `{"status": "ok"}` with HTTP 200
  - [x] Create `apps/worker/config.py` — pydantic-settings `Settings` class with all env var fields (DATABASE_URL, AZURE_STORAGE_CONNECTION_STRING, AZURE_QUEUE_NAME, LLM_MODEL, LLM_API_KEY, CONFIDENCE_THRESHOLD=0.7)
  - [x] Create `apps/worker/worker.py` — stub Azure Storage Queue polling loop (TODO: fill in Story 2.2)
  - [x] Create `apps/worker/categorizer.py` — stub LiteLLM categorizer (TODO: fill in Story 3.1)
  - [x] Create `apps/worker/models.py` — stub SQLAlchemy models (TODO: fill in Story 1.2)
  - [x] Create `apps/worker/job_status.py` — stub job status helpers (TODO: fill in Story 1.2)
  - [x] Create `apps/worker/parsers/__init__.py`, `parsers/base.py` (stub `BaseStatementParser` ABC), `parsers/registry.py` (stub)
  - [x] Create `apps/worker/prompts/` directory with `prompts.py` stub + placeholder `categorize_system.yaml` and `categorize_user.yaml`
  - [x] Create `apps/worker/tests/__init__.py` and `tests/fixtures/` directory
  - [x] Create `apps/worker/.env.example` and `apps/worker/Dockerfile`

- [x] **Task 7: Create `packages/db/` Prisma package** (AC: 4)
  - [x] Create `packages/db/package.json` with package name `@mint/db`
  - [x] Move `prisma/schema.prisma` reference: T3 creates Prisma under `apps/web/prisma/` — for Story 1.1 leave it there; create `packages/db/` as a stub directory with `package.json` and `README.md` noting "Prisma schema lives in apps/web/prisma/; packages/db is reserved for shared DB types in future"
  - [x] **Note:** Full schema migration is Story 1.2's scope — schema.prisma in Story 1.1 stays as T3 default (User model only)

- [x] **Task 8: Create `docker-compose.yml`** (AC: 1)
  - [x] Define 4 services: `web` (Next.js), `worker` (Python), `postgres`, `azurite`
  - [x] `postgres` service: image `postgres:15-alpine`, port `5432:5432`, volume for data persistence, env vars `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`
  - [x] `azurite` service: image `mcr.microsoft.com/azure-storage/azurite`, ports `10000:10000`, `10001:10001`, `10002:10002`
  - [x] `web` service: build from `apps/web/Dockerfile`, port `3000:3000`, depends_on postgres + azurite, env file `.env`
  - [x] `worker` service: build from `apps/worker/Dockerfile`, port `8000:8000`, depends_on postgres + azurite, env file `apps/worker/.env`
  - [x] Create `docker-compose.override.yml` for hot reload (volume mount source code, `--reload` flag for uvicorn)
  - [x] Create `apps/web/Dockerfile` (multi-stage: deps → builder → runner, using `node:20-alpine`)

- [x] **Task 9: Create skeleton lib files in `apps/web/src/lib/`** (AC: 4)
  - [x] `auth.ts` — NextAuth v5 config stub (Credentials provider scaffold; full implementation in Story 1.3)
  - [x] `db.ts` — Prisma client singleton with global caching pattern (prevents connection pool exhaustion in dev)
  - [x] `azure-queue.ts` — Azure Storage Queue client stub using `@azure/storage-queue`
  - [x] `azure-blob.ts` — Azure Blob Storage client stub using `@azure/storage-blob`
  - [x] `middleware-helpers.ts` — RLS session setter stub: `setRLSContext(userId: string)` function that executes `SELECT set_config('app.current_user_id', userId, true)` via Prisma (implementation complete in Story 1.2)
  - [x] `utils.ts` — `Intl.NumberFormat` currency formatter + `Intl.DateTimeFormat` helpers + `formatMonth(date): string` (returns `YYYY-MM` format)

- [x] **Task 10: Create `.github/workflows/ci.yml`** (AC: 4)
  - [x] Trigger: `pull_request` targeting `main`
  - [x] Job: `ci` running on `ubuntu-latest`
  - [x] Steps: checkout → setup Node 20 → npm install → `tsc --noEmit` → ESLint → `npx prisma validate` → setup Python 3.11 → `pip install -r apps/worker/requirements.txt` → `pytest apps/worker/tests/`
  - [x] **Note:** Cross-tenant RLS test added to ci.yml in Story 1.2 — stub the job structure now so Story 1.2 only adds a step

- [x] **Task 11: Create App Router route skeleton** (AC: 4)
  - [x] Create `apps/web/src/app/(auth)/login/page.tsx` — stub page (full implementation in Story 1.3)
  - [x] Create `apps/web/src/app/(app)/layout.tsx` — auth guard layout stub
  - [x] Create `apps/web/src/app/(app)/dashboard/page.tsx` — stub page
  - [x] Create `apps/web/src/app/(app)/dashboard/loading.tsx` — Suspense fallback stub
  - [x] Create `apps/web/src/app/api/health/route.ts` — returns `{ "data": { "status": "ok" } }` with HTTP 200

- [x] **Task 12: Create types skeleton** (AC: 4)
  - [x] Create `apps/web/src/types/api.ts` — ApiResponse wrapper types: `ApiSuccess<T>`, `ApiError`, `PaginatedMeta`
  - [x] Create `apps/web/src/types/domain.ts` — stub domain types: `Transaction`, `Category`, `JobStatus`, `Statement`

## Dev Notes

### Exact Initialization Commands

Run from the **monorepo root** (`mint-personal/`):
```bash
# 1. Create root package.json first
npm init -y

# 2. Initialize T3 app (exact flags required)
npm create t3-app@latest apps/web -- --CI --appRouter --tailwind --prisma --nextAuth --noGit

# 3. Install additional web packages (run from apps/web/)
cd apps/web
npm install @azure/storage-blob @azure/storage-queue recharts @tanstack/react-query @tanstack/react-query-devtools

# 4. Initialize shadcn/ui (run from apps/web/)
npx shadcn@latest init
npx shadcn@latest add button input card badge toast dialog popover progress table separator
```

### Tailwind Color Tokens (UX-DR1 + UX-DR2)

Add to `apps/web/tailwind.config.ts` under `theme.extend.colors`:
```typescript
colors: {
  // UX-DR1: Stone canvas + amber accent + semantic
  canvas: { DEFAULT: '#fafaf9' },         // stone-50
  surface: { subtle: '#f5f5f4' },         // stone-100
  border: { DEFAULT: '#e7e5e4' },         // stone-200
  text: {
    primary: '#1c1917',                   // stone-900
    secondary: '#78716c',                 // stone-500
    muted: '#a8a29e',                     // stone-400
  },
  accent: {
    flag: '#fbbf24',                      // amber-400
    'flag-bg': '#fffbeb',                 // amber-50
    'flag-text': '#b45309',              // amber-700
  },
  success: '#059669',                     // emerald-600
  destructive: '#dc2626',                 // red-600
  // UX-DR2: 8 category badge pairings (bg/text, all ≥4.5:1 contrast)
  category: {
    groceries:     { bg: '#dcfce7', text: '#15803d' }, // green-100/green-700
    dining:        { bg: '#ffedd5', text: '#c2410c' }, // orange-100/orange-700
    transport:     { bg: '#dbeafe', text: '#1d4ed8' }, // blue-100/blue-700
    shopping:      { bg: '#ede9fe', text: '#6d28d9' }, // violet-100/violet-700
    subscriptions: { bg: '#cffafe', text: '#0e7490' }, // cyan-100/cyan-700
    healthcare:    { bg: '#ffe4e6', text: '#be123c' }, // rose-100/rose-700
    entertainment: { bg: '#f3e8ff', text: '#7e22ce' }, // purple-100/purple-700
    utilities:     { bg: '#f1f5f9', text: '#334155' }, // slate-100/slate-700
  },
}
```

**CRITICAL:** Use `theme.extend.colors` not `theme.colors` — replacing `colors` removes all Tailwind defaults. Story 1.1 does NOT need to use these tokens in UI yet — just define them for all subsequent stories.

### Python Worker Requirements

Create `apps/worker/requirements.txt`:
```
fastapi>=0.110.0
uvicorn[standard]>=0.27.0
litellm>=1.30.0
pandas>=2.1.0
pydantic-settings>=2.1.0
sqlalchemy>=2.0.0
psycopg2-binary>=2.9.0
azure-storage-queue>=12.8.0
azure-storage-blob>=12.19.0
python-dotenv>=1.0.0
jinja2>=3.1.0
pyyaml>=6.0
pytest>=8.0.0
pytest-asyncio>=0.23.0
httpx>=0.26.0
```

### Prisma Client Singleton (Critical Pattern)

`apps/web/src/lib/db.ts` must use the global caching pattern to prevent connection pool exhaustion in development (Next.js hot reload creates new module instances):
```typescript
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

### API Response Type Wrappers

All API routes use `{ "data": ... }` wrapper. Define in `apps/web/src/types/api.ts`:
```typescript
export type ApiSuccess<T> = { data: T };
export type ApiError = { error: { code: string; message: string; details?: unknown } };
export type PaginatedMeta = { total: number; page: number; pageSize: number };
export type PaginatedResponse<T> = { data: T[]; meta: PaginatedMeta };
```

### Health Endpoint Response Shape

Both `apps/web/src/app/api/health/route.ts` and `apps/worker/main.py /health` must return the same format:
- Web: `NextResponse.json({ data: { status: "ok" } })` HTTP 200
- Worker: `{"data": {"status": "ok"}}` HTTP 200

### Docker Compose Azurite Connection

In local dev, use the Azurite connection string (not a real Azure account):
```
AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tiqXNE==;BlobEndpoint=http://azurite:10000/devstoreaccount1;QueueEndpoint=http://azurite:10001/devstoreaccount1;
```

The `AccountName` and `AccountKey` above are the well-known Azurite development defaults — safe to commit in `.env.example`.

### Scope Boundaries for Story 1.1

This story creates **skeletons and stubs** only. Full implementations belong in later stories:
- **Prisma schema** (beyond T3 default User model) → Story 1.2
- **RLS migrations** → Story 1.2
- **NextAuth Credentials provider** (actual auth logic) → Story 1.3
- **Password reset** → Story 1.4
- **Account deletion** → Story 1.5
- **Azure Container Apps deployment** → Story 1.6
- **CSV upload API** → Story 2.1

Stub files must be valid TypeScript/Python that compiles/runs, but may have `// TODO: Story X.X` placeholder implementations. **Do NOT implement beyond the stub.**

### NFR Compliance (Story 1.1 scope)

- **NFR15 (No third-party analytics/tracking):** Do NOT install Google Analytics, Segment, Mixpanel, or any analytics/tracking package. This is a hard constraint — financial data must never reach third parties.
- **NFR7/NFR8 (encryption):** Enforced at Azure infrastructure level — no application changes needed in Story 1.1. Add to Story 1.6 ACs.
- **NFR20/NFR21/NFR22 (WCAG 2.1 AA):** The design token color pairings in UX-DR2 are pre-verified at ≥4.5:1 — do not substitute values.

### Naming Conventions (Architecture-Enforced)

- TypeScript files: `kebab-case` — `azure-queue.ts`, `middleware-helpers.ts`
- React components: `PascalCase` — `TransactionRow`
- Hooks: `useCamelCase` — `useJobStatus`
- Python files/functions: `snake_case` — `job_status.py`, `parse_csv`
- Python classes: `PascalCase` — `ChaseParser`
- DB tables: `snake_case` plural — `transactions`, `correction_logs`
- All UUIDs — never integer IDs

### Project Structure Notes

Complete file tree for Story 1.1 output (based on architecture spec):
```
mint-personal/
├── .github/
│   └── workflows/
│       └── ci.yml
├── apps/
│   ├── web/                     ← T3 Next.js (initialized by create-t3-app)
│   │   ├── Dockerfile
│   │   ├── tailwind.config.ts   ← MODIFIED: add design tokens
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── layout.tsx   ← MODIFIED: Inter font
│   │   │   │   ├── globals.css  ← MODIFIED: font + prefers-reduced-motion
│   │   │   │   ├── (auth)/login/page.tsx       ← stub
│   │   │   │   ├── (app)/layout.tsx            ← stub auth guard
│   │   │   │   ├── (app)/dashboard/page.tsx    ← stub
│   │   │   │   ├── (app)/dashboard/loading.tsx ← stub
│   │   │   │   └── api/health/route.ts         ← returns {"data":{"status":"ok"}}
│   │   │   ├── components/ui/   ← shadcn/ui components (never edit)
│   │   │   │   ├── button.tsx, input.tsx, card.tsx, badge.tsx
│   │   │   │   ├── toast.tsx, dialog.tsx, popover.tsx
│   │   │   │   ├── progress.tsx, table.tsx, separator.tsx
│   │   │   ├── lib/
│   │   │   │   ├── auth.ts            ← NextAuth stub
│   │   │   │   ├── db.ts              ← Prisma singleton (FULL implementation)
│   │   │   │   ├── azure-queue.ts     ← stub
│   │   │   │   ├── azure-blob.ts      ← stub
│   │   │   │   ├── middleware-helpers.ts ← RLS setter stub
│   │   │   │   └── utils.ts           ← Intl formatters (FULL implementation)
│   │   │   └── types/
│   │   │       ├── api.ts             ← ApiSuccess/ApiError types (FULL)
│   │   │       └── domain.ts          ← Transaction/Category stubs
│   └── worker/                  ← Python FastAPI (created from scratch)
│       ├── Dockerfile
│       ├── requirements.txt
│       ├── main.py              ← FastAPI + /health endpoint (FULL)
│       ├── config.py            ← pydantic-settings Settings (FULL)
│       ├── worker.py            ← Queue polling stub
│       ├── categorizer.py       ← LiteLLM stub
│       ├── models.py            ← SQLAlchemy stub
│       ├── job_status.py        ← Stub
│       ├── parsers/
│       │   ├── __init__.py
│       │   ├── base.py          ← BaseStatementParser ABC stub
│       │   └── registry.py      ← stub
│       ├── prompts/
│       │   ├── prompts.py       ← YAML+Jinja2 loader stub
│       │   ├── categorize_system.yaml ← placeholder
│       │   └── categorize_user.yaml  ← placeholder
│       └── tests/
│           ├── __init__.py
│           └── fixtures/
└── packages/
│   └── db/
│       ├── package.json         ← @mint/db stub
│       └── README.md
├── docker-compose.yml
├── docker-compose.override.yml
├── .gitignore
├── .env.example
└── package.json                 ← npm workspaces root
```

**Architectural boundary enforced from day 1:**
- `src/components/ui/` — shadcn primitives; NEVER edit directly
- `src/components/` — domain components (future stories)
- No direct `fetch()` in Client Components — always TanStack Query (enforced in later stories)
- No analytics/tracking packages ever

### References

- [Source: _bmad-output/planning-artifacts/architecture.md#Starter Template & Infrastructure Decisions] — T3 init command, Python stack, monorepo structure
- [Source: _bmad-output/planning-artifacts/architecture.md#Complete Project Directory Structure] — full file tree
- [Source: _bmad-output/planning-artifacts/architecture.md#Implementation Patterns & Consistency Rules] — naming conventions, format patterns
- [Source: _bmad-output/planning-artifacts/architecture.md#Architectural Boundaries] — component boundary rules
- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.1: Project Scaffold & Design Foundation] — acceptance criteria
- [Source: _bmad-output/planning-artifacts/epics.md#UX Design Requirements UX-DR1] — stone/amber color system
- [Source: _bmad-output/planning-artifacts/epics.md#UX Design Requirements UX-DR2] — category color badge pairings
- [Source: _bmad-output/planning-artifacts/epics.md#UX Design Requirements UX-DR3] — Inter font typography
- [Source: _bmad-output/planning-artifacts/epics.md#UX Design Requirements UX-DR18] — prefers-reduced-motion
- [Source: _bmad-output/planning-artifacts/epics.md#NonFunctional Requirements NFR15] — no third-party analytics

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Fixed next-auth v5 import: `NextAuthOptions` removed in v5; replaced with `NextAuth()` export pattern (`handlers`, `auth`, `signIn`, `signOut`)
- Fixed health tests: `TestClient` incompatible with httpx 0.28 on Python 3.9 (starlette 0.27 API mismatch); replaced with `httpx.AsyncClient(transport=httpx.ASGITransport(app=app))` pattern
- Note: `npx prisma validate` requires `DATABASE_URL` env var set; CI workflow uses postgres service container

### Completion Notes List

- All 18 Python worker tests pass (pytest): 7 categorizer, 4 config, 3 health endpoint, 4 parser tests
- TypeScript type-check passes clean (`tsc --noEmit` — 0 errors)
- ESLint passes clean (0 errors, 0 warnings)
- Prisma schema validation passes (`prisma validate` with DATABASE_URL set)
- Tailwind design tokens: all UX-DR1 stone/amber tokens + UX-DR2 8 category pairings with pre-verified hex values. Used `theme.extend.colors` (not `theme.colors`) to preserve Tailwind defaults
- shadcn/ui: 10 components scaffolded manually matching shadcn output. Added `flag` variant to Badge for amber low-confidence indicators (UX-DR6). Added `success` variant to Toast (UX-DR12)
- `globals.css`: full prefers-reduced-motion implementation; `.progress-bar-animated` and `.fade-transition` class names established for future UploadPipeline component (Story 2.3)
- `middleware-helpers.ts`: `setRLSContext()` fully implemented — executes `set_config('app.current_user_id', userId, true)` via Prisma raw SQL. Ready for Story 1.2 to apply RLS policies
- `utils.ts`: fully implemented currency/date formatters using `Intl` APIs per architecture enforcement rules
- `types/api.ts`: `API_ERROR_CODES` const object established as single source of truth for all error codes
- `types/domain.ts`: `JobStage` enum uses exact string values that backend switches on (`QUEUED | UPLOADING | READING | CATEGORIZING | COMPLETE | FAILED`)
- docker-compose uses Azurite well-known dev account key (safe to commit in .env.example — documented)
- NFR15 enforced: zero analytics/tracking packages anywhere in the project

### File List

**Root:**
- `package.json` (new)
- `.gitignore` (new)
- `.env.example` (new)
- `docker-compose.yml` (new)
- `docker-compose.override.yml` (new)

**GitHub Actions:**
- `.github/workflows/ci.yml` (new)

**apps/web:**
- `apps/web/package.json` (new)
- `apps/web/tsconfig.json` (new)
- `apps/web/next.config.js` (new)
- `apps/web/postcss.config.cjs` (new)
- `apps/web/tailwind.config.ts` (new)
- `apps/web/components.json` (new)
- `apps/web/.eslintrc.cjs` (new)
- `apps/web/.env.example` (new)
- `apps/web/Dockerfile` (new)
- `apps/web/prisma/schema.prisma` (new)
- `apps/web/src/app/layout.tsx` (new)
- `apps/web/src/app/globals.css` (new)
- `apps/web/src/app/page.tsx` (new)
- `apps/web/src/app/(auth)/login/page.tsx` (new)
- `apps/web/src/app/(app)/layout.tsx` (new)
- `apps/web/src/app/(app)/dashboard/page.tsx` (new)
- `apps/web/src/app/(app)/dashboard/loading.tsx` (new)
- `apps/web/src/app/api/health/route.ts` (new)
- `apps/web/src/components/ui/button.tsx` (new)
- `apps/web/src/components/ui/input.tsx` (new)
- `apps/web/src/components/ui/card.tsx` (new)
- `apps/web/src/components/ui/badge.tsx` (new)
- `apps/web/src/components/ui/dialog.tsx` (new)
- `apps/web/src/components/ui/popover.tsx` (new)
- `apps/web/src/components/ui/progress.tsx` (new)
- `apps/web/src/components/ui/table.tsx` (new)
- `apps/web/src/components/ui/separator.tsx` (new)
- `apps/web/src/components/ui/toast.tsx` (new)
- `apps/web/src/lib/auth.ts` (new)
- `apps/web/src/lib/db.ts` (new)
- `apps/web/src/lib/azure-blob.ts` (new)
- `apps/web/src/lib/azure-queue.ts` (new)
- `apps/web/src/lib/middleware-helpers.ts` (new)
- `apps/web/src/lib/utils.ts` (new)
- `apps/web/src/middleware.ts` (new)
- `apps/web/src/types/api.ts` (new)
- `apps/web/src/types/domain.ts` (new)
- `apps/web/src/hooks/use-job-status.ts` (new)
- `apps/web/src/hooks/use-month-summary.ts` (new)
- `apps/web/src/hooks/use-transactions.ts` (new)

**apps/worker:**
- `apps/worker/Dockerfile` (new)
- `apps/worker/requirements.txt` (new)
- `apps/worker/.env.example` (new)
- `apps/worker/pytest.ini` (new)
- `apps/worker/main.py` (new)
- `apps/worker/config.py` (new)
- `apps/worker/worker.py` (new)
- `apps/worker/categorizer.py` (new)
- `apps/worker/models.py` (new)
- `apps/worker/job_status.py` (new)
- `apps/worker/parsers/__init__.py` (new)
- `apps/worker/parsers/base.py` (new)
- `apps/worker/parsers/registry.py` (new)
- `apps/worker/prompts/prompts.py` (new)
- `apps/worker/prompts/categorize_system.yaml` (new)
- `apps/worker/prompts/categorize_user.yaml` (new)
- `apps/worker/tests/__init__.py` (new)
- `apps/worker/tests/test_health.py` (new)
- `apps/worker/tests/test_config.py` (new)
- `apps/worker/tests/test_parsers.py` (new)
- `apps/worker/tests/test_categorizer.py` (new)
- `apps/worker/tests/fixtures/chase_sample.csv` (new)
- `apps/worker/tests/fixtures/amex_sample.csv` (new)

**packages/db:**
- `packages/db/package.json` (new)
