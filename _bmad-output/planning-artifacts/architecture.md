---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
workflowComplete: true
completedAt: '2026-03-21'
status: complete
inputDocuments: ['_bmad-output/planning-artifacts/prd.md', '_bmad-output/planning-artifacts/ux-design-specification.md']
workflowType: 'architecture'
project_name: 'mint_personal'
user_name: 'Neo'
date: '2026-03-20'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements — 35 FRs across 7 domains:**

| Domain | FRs | Architectural Weight |
|---|---|---|
| Auth & Account Management | FR1–5 | Standard; multi-tenant isolation is the complexity |
| Statement Upload & Parsing | FR6–11 | File handling, async pipeline, progress feedback, duplicate detection |
| AI Categorization & Learning | FR12–18 | Per-user correction log, rule matching, confidence scoring |
| Category Management | FR19–21 | Simple CRUD + transaction exclusion |
| Spending Analysis & Visualization | FR22–26 | Aggregation queries, chart data, transaction search |
| Data Management | FR27–30 | Persistence, file deletion, correction audit log |
| Admin Panel | FR31–35 | Operational metrics only; financial data blocked at API layer |

**Non-Functional Requirements driving architectural decisions:**

| NFR | Architectural Implication |
|---|---|
| Upload ack ≤ 3s | Async queue — API accepts immediately, worker processes separately |
| Parse ≤ 30s / 500 transactions | Worker streams progress back to UI (SSE or polling) |
| API p95 ≤ 200ms | Indexed DB queries; read paths optimized from day 1 |
| DB-level RLS | Row-level security at DB, not ORM-only |
| Raw files deleted within 1hr | Object storage with lifecycle policy + worker deletes post-parse |
| 100k+ transactions/user | Indexed relational schema; pagination on transaction list |
| 100 concurrent jobs | Job queue horizontally scalable; worker pool |
| GDPR/CCPA | Account deletion + full cascade purge endpoint from day 1 |

**Scale & Complexity:**

- Primary domain: Full-stack web app — SPA + REST API + background worker + relational DB + object storage + job queue
- Complexity level: Medium (per PRD classification)
- Estimated architectural components: 6 (frontend, API server, job worker, relational DB, object storage, job queue)
- User scale: 1–10 MVP → 100 without redesign

### Technical Constraints & Dependencies

- **Solo developer, hobby project** — managed services over self-hosted; minimize operational overhead
- **Greenfield** — no legacy constraints; best-fit stack available
- **Phase 1 CSV only; Phase 2 Plaid** — modular parser plugin architecture; Plaid must bolt on without data model changes
- **Frontend decided:** React SPA, Tailwind + shadcn/ui, Recharts
- **No PCI-DSS, no KYC/AML** — significantly reduces compliance surface area
- **GDPR/CCPA** — data purge built into schema from day 1

### Cross-Cutting Concerns Identified

1. **Multi-tenancy** — every DB table has `user_id`; every query filtered by tenant; RLS at DB layer; admin blocked at API layer
2. **Async processing pipeline** — upload → object storage → job queue → worker → progress notification → cleanup; spans all layers
3. **Per-user AI model state** — correction log + rule overlay per user; queried at categorization time; grows with use
4. **Security** — encryption at rest, TLS, httpOnly session cookies, bcrypt, auto-delete raw files within 1hr
5. **Data deletion / purge** — cascade delete across all tables; must be schema-designed from day 1

## Starter Template & Infrastructure Decisions

### Primary Technology Domain

Full-stack web application — React SPA + REST API + Python AI worker + PostgreSQL + Azure cloud infrastructure.

### Infrastructure: Azure Container Apps (Option A)

Two containers deployed to Azure Container Apps, each scaled and deployed independently:

| Container | Runtime | Responsibility |
|---|---|---|
| **App** | Next.js / TypeScript | Web UI, REST API routes, auth, DB queries, file upload to Blob, job enqueue, progress SSE |
| **AI Worker** | Python / FastAPI | Queue polling, CSV parsing, LLM categorization, DB writes, Blob cleanup |

**Supporting Azure services:**

| Service | Purpose |
|---|---|
| Azure Database for PostgreSQL Flexible Server | Primary database; row-level security enforced |
| Azure Blob Storage | Temporary CSV files; lifecycle policy auto-deletes after 1hr |
| Azure Storage Queue | Job queue between App and AI Worker |
| Azure Container Registry | Docker image storage |
| Azure Key Vault | Secrets (DB connection strings, API keys, JWT secret) |

**Local development:** `docker-compose` with `azurite` (Azure Storage emulator) + PostgreSQL container — no Azure account needed for day-to-day development.

### Starter Template: T3 Stack (Next.js App)

```bash
npm create t3-app@latest apps/web
# Select: TypeScript, Tailwind, Prisma, NextAuth.js, App Router
npx shadcn@latest init
```

**T3 provides:** Next.js App Router, TypeScript, Tailwind CSS, Prisma ORM, NextAuth.js, ESLint + Prettier, `src/` structure.

**Add separately:** `shadcn/ui`, `recharts`, `pg-boss` (PostgreSQL-native job queue — eliminates Redis).

### Python AI Worker Stack

```bash
pip install fastapi uvicorn litellm pandas pydantic-settings \
    sqlalchemy psycopg2-binary azure-storage-queue \
    azure-storage-blob python-dotenv jinja2 pyyaml
```

### LLM Strategy: LiteLLM + Config-Driven Prompts

**Provider abstraction:** LiteLLM provides a unified interface — switch provider/model by changing one environment variable, zero code changes.

```bash
LLM_MODEL=anthropic/claude-haiku-4-5-20251001   # default
LLM_MODEL=gpt-4o-mini                            # swap to OpenAI
LLM_MODEL=ollama/llama3                          # self-hosted, fully private
```

**Config externalization:**
- Model parameters (`model`, `temperature`, `max_tokens`, `batch_size`, `confidence_threshold`) → environment variables loaded via `pydantic-settings`
- Prompts (system + user templates) → YAML files with Jinja2 templating in `apps/worker/prompts/`
- Change model or tune prompts → edit config/YAML, restart worker — zero code review required

**Correction log as few-shot examples:** User's correction history is injected into the system prompt at categorization time — per-user learning with no ML training infrastructure.

**Fallback strategy:** Rule-based merchant→category keyword matching as fallback when LLM API is unavailable; failed transactions route to review queue rather than failing silently.

### Monorepo Structure

```
mint-personal/
├── apps/
│   ├── web/          ← T3 Next.js app
│   └── worker/       ← Python AI Worker (FastAPI + LiteLLM)
│       └── prompts/  ← YAML prompt templates
├── packages/
│   └── db/           ← Prisma schema (shared source of truth)
├── docker-compose.yml
└── .github/workflows/
```

### Initialization Command (First Implementation Story)

```bash
npm create t3-app@latest apps/web -- --CI \
  --appRouter --tailwind --prisma --nextAuth --noGit
```

## Core Architectural Decisions

### Data Architecture

**ORM & Migrations:** Prisma for schema management and migrations. Row-Level Security (RLS) policies defined as raw SQL in Prisma migration files. API middleware sets `app.current_user_id` PostgreSQL session variable before every query; RLS policies filter on this variable.

```sql
-- Applied via Prisma migration
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON transactions
  USING (user_id = current_setting('app.current_user_id')::uuid);
```

**Job queue:** Azure Storage Queue only (cross-container message passing). `pg-boss` removed from stack — unnecessary at this scale. Progress tracking via `job_status` table in PostgreSQL polled by the frontend.

**Caching:** None in MVP. All reads hit PostgreSQL with proper indexing. Revisit at 100+ users.

### Authentication & Security

**Auth provider:** NextAuth.js (Auth.js v5) with Credentials provider (email + password). Database sessions stored in PostgreSQL — enables immediate session revocation.

**Session config:** httpOnly cookies, SameSite=Strict, bcrypt cost factor 12.

**Admin isolation:** `role` field on `User` model (`USER` | `ADMIN`). API middleware enforces role before any handler. Admin query paths never join financial data tables — enforced by query design, not RLS alone.

**Secrets:** All secrets in Azure Key Vault, injected as environment variables via Azure Container Apps secret references. Never in source code or Docker images.

### API & Communication Patterns

**API style:** REST via Next.js App Router API routes (`/api/*`). No tRPC — keeps API accessible to Python worker and future clients.

**Route inventory:**
```
POST   /api/auth/*
GET    /api/transactions
GET    /api/transactions/search
PATCH  /api/transactions/:id
GET    /api/categories
GET    /api/months
GET    /api/summary/:month
POST   /api/statements/upload
GET    /api/jobs/:id/status
GET    /api/admin/users
POST   /api/admin/users
PATCH  /api/admin/users/:id
```

**Progress notification:** Polling — frontend calls `GET /api/jobs/:id/status` every 2 seconds. SSE deferred to Phase 2.

**Inter-container:** App→Worker via Azure Storage Queue message `{ job_id, user_id, blob_url }`. Worker writes results directly to PostgreSQL. No direct HTTP between containers.

**Error response shape:**
```json
{ "error": { "code": "PARSE_FAILED", "message": "...", "details": {} } }
```

### Frontend Architecture

**State management:** TanStack Query (React Query) for server state, caching, polling. `useState`/`useReducer` for local UI state. No Redux or Zustand.

**Routing (App Router):**
```
app/
├── (auth)/login/
├── (app)/
│   ├── dashboard/
│   ├── statements/
│   └── admin/
└── api/
```

**Data fetching:** Server Components for initial page data; Client Components for interactive elements. TanStack Query for client-side polling and mutations.

### Infrastructure & Deployment

**CI/CD:** GitHub Actions — independent workflows per container:
- `deploy-web.yml` — triggers on `apps/web/**` changes
- `deploy-worker.yml` — triggers on `apps/worker/**` changes

**Environments:** Local (`docker-compose` + `azurite`) and Production (Azure Container Apps). No staging for MVP.

**Observability:** Structured JSON logs to stdout → Azure Monitor. `/health` endpoints on both containers for liveness probes. Azure Monitor alert on worker error rate → email to Neo.

### Decision Impact Analysis

**Implementation sequence driven by dependencies:**
1. Prisma schema + RLS migrations (all other work depends on this)
2. NextAuth.js + session middleware + role enforcement
3. Azure Blob Storage + Storage Queue integration
4. Statement upload API + job enqueue
5. Python worker: CSV parser plugins + LiteLLM categorizer
6. Progress polling API + frontend pipeline UI
7. Transaction list + category filter + monthly summary API
8. Charts + dashboard view
9. Admin panel

**Cross-component dependencies:**
- RLS middleware must be in place before any data API routes are written
- `job_status` table schema must be agreed between App and Worker before either is implemented
- LLM prompt YAML format must be stable before worker integration tests are written
- Prisma schema is the shared contract between TypeScript app and Python worker (Python uses SQLAlchemy models that mirror Prisma schema)

## Implementation Patterns & Consistency Rules

### Naming Patterns

**Database (PostgreSQL / Prisma):**
- Tables: `snake_case` plural — `users`, `transactions`, `correction_logs`, `job_status`, `statements`
- Columns: `snake_case` — `user_id`, `merchant_raw`, `created_at`, `is_excluded`
- Foreign keys: `{table_singular}_id` — `user_id`, `statement_id`
- Indexes: `idx_{table}_{columns}` — `idx_transactions_user_id_month`
- Prisma model names: `PascalCase` singular — `User`, `Transaction`, `CorrectionLog`

**API endpoints:** `kebab-case` plural — `/api/transactions`, `/api/correction-logs`. Path params: `:id`. Query params: `camelCase`. Month format everywhere: `YYYY-MM` string.

**TypeScript:**
- Files: `kebab-case` — `transaction-row.tsx`, `use-job-status.ts`
- Components: `PascalCase` — `TransactionRow`, `ReviewBanner`
- Hooks: `useCamelCase` — `useJobStatus`, `useMonthSummary`
- Types/interfaces: `PascalCase`, no `I` prefix — `Transaction`, `JobStatus`
- Zod schemas: `PascalCase` + `Schema` suffix — `TransactionSchema`

**Python:**
- Files/functions/variables: `snake_case` — `categorizer.py`, `parse_csv`, `user_id`
- Classes: `PascalCase` — `ChaseParser`, `LLMCategorizer`
- Constants: `UPPER_SNAKE_CASE` — `CATEGORY_TAXONOMY`, `MAX_BATCH_SIZE`

### Structure Patterns

**Tests:** Co-located with source — `transaction-row.test.tsx` next to `transaction-row.tsx`.

**App Router file conventions:**
```
app/(app)/dashboard/
├── page.tsx          ← Server Component
├── _components/      ← route-private components
└── loading.tsx       ← Suspense fallback
```

**Shared components:** `src/components/ui/` for shadcn/ui; `src/components/` for domain components.

**API routes:** `app/api/{resource}/route.ts` (collection) + `app/api/{resource}/[id]/route.ts` (single).

### Format Patterns

**API success:** Always `{ "data": ... }` wrapper. Paginated: adds `"meta": { "total": N, "page": N }`.

**API error:** Always `{ "error": { "code": "UPPER_SNAKE_CASE", "message": "..." } }`. Client switches on `code`, never `message`.

**Dates:** UTC in DB. ISO 8601 strings in API — `"2026-03-15T14:32:00Z"`. Month IDs: `"2026-03"`.

**Currency:** `NUMERIC(12,2)` in DB. String in JSON — `"42.50"`. Formatted with `Intl.NumberFormat` on frontend.

**JSON fields:** `camelCase` in all API bodies. Prisma handles snake_case↔camelCase mapping.

### Communication Patterns

**Azure Storage Queue message (App → Worker):**
```json
{ "jobId": "uuid", "userId": "uuid", "blobUrl": "https://...", "statementId": "uuid", "uploadedAt": "ISO8601" }
```

**Job status stages (fixed enum):** `QUEUED → UPLOADING → READING → CATEGORIZING → COMPLETE | FAILED`

**TanStack Query key conventions:** Arrays starting with resource name — `["transactions", userId, { month, categoryId }]`

### Process Patterns

**Every protected API route:**
```typescript
const session = await getServerSession(authOptions);
if (!session) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
await prisma.$executeRaw`SELECT set_config('app.current_user_id', ${session.user.id}, true)`;
```

**Admin route guard:** Check `role === "ADMIN"` after auth. Admin routes never query `transactions`, `corrections`, or `statements` tables.

**API error catch:**
```typescript
catch (error) {
  console.error("[route-name]", error);
  return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } }, { status: 500 });
}
```

**Python LLM error:** Catch `LiteLLMError` → fall back to rule-based categorizer. Catch all others → mark job `FAILED`, do not re-raise (avoids poison-pill message loop).

### Enforcement Guidelines

**All agents MUST:**
- Use `{ "data": ... }` wrapper on all API success responses
- Set RLS session variable before every DB query in App container
- Never query financial tables from admin routes
- Use `YYYY-MM` for month identifiers — never full timestamps
- Store amounts as `NUMERIC(12,2)` — never float
- Use exact job stage enum values
- Load LLM model from config, prompts from YAML — never inline

**Anti-patterns — never:**
- Integer `userId` — always UUID
- Manual currency/date string formatting — always `Intl` APIs
- Raw `fetch()` from Client Components — always TanStack Query
- `prisma.transaction.findMany()` without RLS session variable set
- Hardcoded LLM model strings or inline prompt text in Python code

## Project Structure & Boundaries

### Complete Project Directory Structure

```
mint-personal/
├── .github/
│   └── workflows/
│       ├── deploy-web.yml          ← triggers on apps/web/** changes
│       ├── deploy-worker.yml       ← triggers on apps/worker/** changes
│       └── ci.yml                  ← lint + test on PR
├── apps/
│   ├── web/                        ← T3 Next.js app
│   │   ├── Dockerfile
│   │   ├── next.config.js
│   │   ├── tailwind.config.ts
│   │   ├── tsconfig.json
│   │   ├── .env.example
│   │   ├── prisma/
│   │   │   ├── schema.prisma       ← source of truth for DB schema
│   │   │   └── migrations/         ← includes RLS policy SQL
│   │   └── src/
│   │       ├── app/
│   │       │   ├── layout.tsx
│   │       │   ├── globals.css
│   │       │   ├── (auth)/
│   │       │   │   └── login/
│   │       │   │       └── page.tsx
│   │       │   ├── (app)/
│   │       │   │   ├── layout.tsx              ← auth guard, session provider
│   │       │   │   ├── dashboard/
│   │       │   │   │   ├── page.tsx            ← Server Component, fetches month summary
│   │       │   │   │   ├── loading.tsx
│   │       │   │   │   └── _components/
│   │       │   │   │       ├── summary-strip.tsx
│   │       │   │   │       ├── spending-chart.tsx
│   │       │   │   │       ├── category-filter-chips.tsx
│   │       │   │   │       ├── transaction-table.tsx
│   │       │   │   │       ├── review-banner.tsx
│   │       │   │   │       └── upload-pipeline.tsx
│   │       │   │   ├── statements/
│   │       │   │   │   ├── page.tsx            ← upload history
│   │       │   │   │   └── _components/
│   │       │   │   │       └── upload-drop-zone.tsx
│   │       │   │   └── admin/
│   │       │   │       ├── page.tsx            ← admin user list
│   │       │   │       └── _components/
│   │       │   │           └── user-table.tsx
│   │       │   └── api/
│   │       │       ├── auth/[...nextauth]/route.ts
│   │       │       ├── transactions/
│   │       │       │   ├── route.ts            ← GET list
│   │       │       │   ├── search/route.ts     ← GET search
│   │       │       │   └── [id]/route.ts       ← PATCH (correct, exclude)
│   │       │       ├── categories/route.ts     ← GET taxonomy
│   │       │       ├── months/route.ts         ← GET available months
│   │       │       ├── summary/[month]/route.ts ← GET aggregated breakdown
│   │       │       ├── statements/upload/route.ts ← POST upload → enqueue
│   │       │       ├── jobs/[id]/status/route.ts  ← GET progress polling
│   │       │       ├── admin/users/
│   │       │       │   ├── route.ts            ← GET list, POST create
│   │       │       │   └── [id]/route.ts       ← PATCH deactivate/delete
│   │       │       └── health/route.ts
│   │       ├── components/
│   │       │   ├── ui/                         ← shadcn/ui primitives (never edit directly)
│   │       │   │   ├── button.tsx
│   │       │   │   ├── badge.tsx
│   │       │   │   ├── card.tsx
│   │       │   │   ├── dialog.tsx
│   │       │   │   ├── input.tsx
│   │       │   │   ├── popover.tsx
│   │       │   │   ├── progress.tsx
│   │       │   │   ├── table.tsx
│   │       │   │   └── toast.tsx
│   │       │   ├── transaction-row.tsx         ← custom domain components
│   │       │   ├── category-picker-popover.tsx
│   │       │   ├── month-navigator.tsx
│   │       │   └── spending-bar-chart.tsx
│   │       ├── lib/
│   │       │   ├── auth.ts                     ← NextAuth config
│   │       │   ├── db.ts                       ← Prisma client singleton
│   │       │   ├── azure-queue.ts              ← Storage Queue client
│   │       │   ├── azure-blob.ts               ← Blob Storage client
│   │       │   ├── middleware-helpers.ts        ← RLS session setter
│   │       │   └── utils.ts                    ← Intl formatters, date helpers
│   │       ├── types/
│   │       │   ├── api.ts                      ← API request/response types
│   │       │   └── domain.ts                   ← Transaction, Category, JobStatus
│   │       ├── hooks/
│   │       │   ├── use-job-status.ts           ← polling hook (2s interval)
│   │       │   ├── use-month-summary.ts
│   │       │   └── use-transactions.ts
│   │       └── middleware.ts                   ← Next.js auth middleware
│   │
│   └── worker/                     ← Python AI Worker
│       ├── Dockerfile
│       ├── requirements.txt
│       ├── .env.example
│       ├── config.py               ← pydantic-settings, all env loading
│       ├── main.py                 ← FastAPI app, /health endpoint
│       ├── worker.py               ← Azure Storage Queue polling loop
│       ├── categorizer.py          ← LiteLLM batching, fallback logic
│       ├── models.py               ← SQLAlchemy models (mirror Prisma schema)
│       ├── job_status.py           ← job_status table read/write helpers
│       ├── parsers/
│       │   ├── base.py             ← BaseStatementParser ABC
│       │   ├── registry.py         ← format detection, parser dispatch
│       │   ├── chase.py
│       │   ├── amex.py
│       │   ├── bank_of_america.py
│       │   ├── capital_one.py
│       │   └── wells_fargo.py
│       ├── prompts/
│       │   ├── prompts.py          ← YAML loader with Jinja2
│       │   ├── categorize_system.yaml
│       │   └── categorize_user.yaml
│       └── tests/
│           ├── test_categorizer.py
│           ├── test_parsers.py
│           └── fixtures/
│               ├── chase_sample.csv
│               └── amex_sample.csv
│
├── docker-compose.yml              ← local dev: web + worker + postgres + azurite
├── docker-compose.override.yml     ← local overrides (hot reload, debug ports)
└── .env.example
```

### Architectural Boundaries

**App → Worker:** Azure Storage Queue only. No direct HTTP. Message schema is the contract.

**App → Database:** All access via Prisma client in `lib/db.ts`. RLS session variable set via `middleware-helpers.ts` before every query. No raw SQL in application code.

**Worker → Database:** Direct PostgreSQL via SQLAlchemy. Worker uses a service role that bypasses RLS (processes jobs for any user). Writes `transactions`, `job_status`, `correction_logs`. Reads `users` and `correction_logs` for few-shot prompt assembly.

**Frontend → API:** All server state via TanStack Query hooks. No direct `fetch()` from components.

### Requirements to Structure Mapping

| FR Domain | App Container | Worker |
|---|---|---|
| Auth & Account (FR1–5) | `api/auth/`, `lib/auth.ts`, `middleware.ts` | — |
| Statement Upload (FR6–11) | `api/statements/upload/`, `lib/azure-blob.ts`, `lib/azure-queue.ts` | `parsers/`, `worker.py` |
| AI Categorization (FR12–18) | `api/jobs/[id]/status/`, `hooks/use-job-status.ts` | `categorizer.py`, `prompts/` |
| Category Management (FR19–21) | `api/transactions/[id]/`, `api/categories/` | — |
| Spending Analysis (FR22–26) | `api/summary/[month]/`, `api/months/`, `api/transactions/search/` | — |
| Data Management (FR27–30) | `api/statements/`, `lib/azure-blob.ts` | `job_status.py` |
| Admin Panel (FR31–35) | `api/admin/users/`, `(app)/admin/` | — |

### End-to-End Data Flow

```
User drops CSV
  → POST /api/statements/upload
  → Stream to Azure Blob Storage → get blobUrl
  → INSERT job_status (QUEUED)
  → Enqueue to Azure Storage Queue: { jobId, userId, blobUrl, statementId }
  → Return { data: { jobId } }

Frontend: useJobStatus polls GET /api/jobs/:id/status every 2s
  ← { data: { stage: "READING", transactionCount: 89 } }

Worker dequeues message
  → Download CSV from Blob Storage
  → Detect bank format (registry.py)
  → Parse CSV with bank parser → List[Transaction]
  → UPDATE job_status: READING, transactionCount=N
  → Batch into groups of 50 → LiteLLM categorization
  → UPDATE job_status: CATEGORIZING
  → Write transactions + categories to PostgreSQL
  → Write correction_log seed entries
  → DELETE blob from Azure Blob Storage
  → UPDATE job_status: COMPLETE

Frontend detects COMPLETE → invalidates TanStack Query cache → dashboard renders
```

## Architecture Validation Results

### Coherence Validation ✅

**Decision compatibility:** All technology choices are compatible. Next.js App Router + Prisma + NextAuth.js is the canonical T3 stack. LiteLLM integrates with Anthropic/Claude via `pip install litellm`. Azure Storage Queue + Blob Storage have first-class TypeScript and Python SDKs. No version conflicts.

**Pattern consistency:** Naming conventions are consistent — `snake_case` in DB/Python, `camelCase` in TypeScript/JSON, `kebab-case` in filenames and URLs. `YYYY-MM` month format used uniformly. `{ data: ... }` response wrapper applies to all API routes.

**Structure alignment:** Project tree maps 1:1 to technology decisions. App Router route groups match auth middleware pattern. Python worker structure isolates parsers, prompts, and config cleanly.

### Requirements Coverage Validation ✅

All 35 FRs covered:

| FR Domain | Coverage | Key Location |
|---|---|---|
| FR1–5 Auth | ✅ | NextAuth.js, `User` model with `role` field |
| FR6–11 Upload & Parsing | ✅ | `api/statements/upload/`, Azure Blob, worker parsers |
| FR12–18 AI Categorization | ✅ | Python worker, LiteLLM, `correction_logs`, confidence threshold |
| FR19–21 Category Management | ✅ | `api/transactions/[id]/` PATCH, `api/categories/` |
| FR22–26 Spending Analysis | ✅ | `api/summary/[month]/`, `api/transactions/search/` |
| FR27–30 Data Management | ✅ | Prisma schema with cascade deletes, blob lifecycle policy |
| FR31–35 Admin | ✅ | `api/admin/users/`, admin role guard, no financial data joins |

All NFRs addressed: async queue (upload ack ≤3s), batched LLM calls (parse ≤30s), indexed queries (API p95 ≤200ms), Prisma migration RLS policies (tenant isolation), blob deletion in worker (files ≤1hr), cascade deletes from User (GDPR/CCPA purge).

### Implementation Readiness Validation ✅

**Decision completeness:** All critical decisions documented with rationale. No ambiguous decisions that could cause agent divergence.

**Structure completeness:** Every file an agent needs to create is named. No "etc." or placeholder directories.

**Pattern completeness:** Naming, formatting, error handling, auth middleware, RLS setup, job stage enum, TanStack Query key format — all specified with examples and anti-patterns.

### Architecture Completeness Checklist

- [x] Project context analyzed — 35 FRs, 7 NFR domains, solo dev constraint
- [x] Complexity assessed — Medium; 6 architectural components
- [x] Starter template and infrastructure decided — T3 + Azure Container Apps
- [x] LLM strategy decided — LiteLLM + config-driven prompts, Claude Haiku default
- [x] Auth and security decided — NextAuth.js Credentials, DB sessions, RLS
- [x] API design decided — REST, polling for progress, Azure Queue for inter-container
- [x] Frontend architecture decided — TanStack Query, App Router, Server + Client Components
- [x] Implementation patterns defined — naming, formatting, auth middleware, error handling
- [x] Project structure complete — every file named, no placeholders
- [x] Prisma schema defined — shared contract between app and worker
- [x] Data flow documented — end-to-end upload → parse → display

### Architecture Readiness Assessment

**Overall Status:** READY FOR IMPLEMENTATION

**Confidence Level:** High

**Key strengths:**
- Clean two-container split with explicit queue message contract
- RLS enforced at DB layer from day 1 — cannot be accidentally bypassed
- LiteLLM + YAML prompts — change model or tune prompts with zero code changes
- Per-user correction log as few-shot examples — elegant implementation of the core UX mechanic
- Monorepo with independent container deployments

**Deferred to Phase 2 (by design, not gaps):**
- PDF statement parsing
- Plaid integration (data model already supports it — no schema changes needed)
- SSE replacing polling for job progress
- Dark mode
- Full mobile optimisation

## Core Database Schema (Prisma)

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id           String          @id @default(uuid())
  email        String          @unique
  passwordHash String
  role         Role            @default(USER)
  createdAt    DateTime        @default(now())
  lastLoginAt  DateTime?
  transactions Transaction[]
  corrections  CorrectionLog[]
  statements   Statement[]
  jobStatuses  JobStatus[]

  @@map("users")
}

enum Role {
  USER
  ADMIN
}

model Statement {
  id           String        @id @default(uuid())
  userId       String
  user         User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  filename     String
  institution  String?
  uploadedAt   DateTime      @default(now())
  transactions Transaction[]

  @@map("statements")
}

model Transaction {
  id           String    @id @default(uuid())
  userId       String
  user         User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  statementId  String
  statement    Statement @relation(fields: [statementId], references: [id], onDelete: Cascade)
  date         DateTime
  merchantRaw  String
  merchantNorm String
  amount       Decimal   @db.Decimal(12, 2)
  category     String
  confidence   Float
  isExcluded   Boolean   @default(false)
  isReviewed   Boolean   @default(false)
  createdAt    DateTime  @default(now())

  @@index([userId, date], name: "idx_transactions_user_id_month")
  @@map("transactions")
}

model CorrectionLog {
  id                String   @id @default(uuid())
  userId            String
  user              User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  merchantPattern   String
  correctedCategory String
  createdAt         DateTime @default(now())

  @@index([userId], name: "idx_corrections_user_id")
  @@map("correction_logs")
}

model JobStatus {
  id               String   @id @default(uuid())
  userId           String
  user             User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  statementId      String?
  stage            JobStage @default(QUEUED)
  transactionCount Int      @default(0)
  errorMessage     String?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  @@map("job_status")
}

enum JobStage {
  QUEUED
  UPLOADING
  READING
  CATEGORIZING
  COMPLETE
  FAILED
}
```

**RLS migration (added as raw SQL in a Prisma migration after schema creation):**

```sql
-- Enable RLS on all tenant-scoped tables
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE correction_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_status ENABLE ROW LEVEL SECURITY;

-- Policy: users can only access their own rows
CREATE POLICY tenant_isolation ON transactions
  USING (user_id = current_setting('app.current_user_id')::uuid);

CREATE POLICY tenant_isolation ON statements
  USING (user_id = current_setting('app.current_user_id')::uuid);

CREATE POLICY tenant_isolation ON correction_logs
  USING (user_id = current_setting('app.current_user_id')::uuid);

CREATE POLICY tenant_isolation ON job_status
  USING (user_id = current_setting('app.current_user_id')::uuid);

-- Create a service role for the Python worker (bypasses RLS)
CREATE ROLE worker_role BYPASSRLS;
```

**Python SQLAlchemy models mirror this schema exactly** — same table names, column names, and types. `models.py` in the worker is the Python equivalent of this Prisma schema.
