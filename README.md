# mint_personal

A clean, private personal finance tracker — a modern replacement for the discontinued Mint app.

Upload your bank CSV statements and get instant expense categorization, merchant normalization, and monthly trend visualization. No bank sync friction, no budgeting pressure, no overwhelming dashboards. Just *"where did my money go?"* answered clearly.

---

## What it does

- **Upload CSV statements** from Chase, Amex, Bank of America, Capital One, or Wells Fargo
- **Auto-parse transactions** via a background Python worker that detects the bank format automatically
- **Normalize merchants** — `"SQ *BLUE BOTTLE COFFEE AUSTIN TX"` becomes `"Blue Bottle Coffee"`
- **Detect duplicates** — re-uploading the same statement won't double-count transactions
- **Track processing** — live progress polling shows each pipeline stage as it runs
- **Review history** — statement list with per-file status, transaction count, and upload time
- **Multi-tenant** — each user sees only their own data, enforced at the database level via PostgreSQL RLS

---

## Architecture

```
┌──────────────────┐     multipart POST      ┌────────────────────────┐
│  Next.js Web App │ ──────────────────────► │  Azure Blob Storage    │
│  (TypeScript)    │                         │  {userId}/{stmtId}/... │
└────────┬─────────┘                         └────────────────────────┘
         │  job message (JSON)                          ▲
         ▼                                              │ download + delete
┌──────────────────┐                         ┌──────────┴─────────────┐
│  Azure Storage   │ ──────────────────────► │  Python Worker         │
│  Queue           │                         │  (FastAPI + asyncio)   │
└──────────────────┘                         └────────────────────────┘
                                                        │
                                             ┌──────────▼─────────────┐
                                             │  PostgreSQL (Prisma)   │
                                             │  RLS-enforced schemas  │
                                             └────────────────────────┘
```

**Web app** (`apps/web`) — Next.js 14 App Router, TypeScript, Prisma ORM, NextAuth.js, TanStack Query, Tailwind CSS

**Worker** (`apps/worker`) — Python 3.11, FastAPI, SQLAlchemy, LiteLLM (for AI categorization in Epic 3), pandas

**Infrastructure** — Azure Container Apps, Azure Container Registry, Azure Blob Storage, Azure Storage Queue, PostgreSQL

---

## Local development

### Prerequisites

- Node.js 20+
- Python 3.11+
- Docker (for PostgreSQL + Azurite)

### 1. Start local services

```bash
docker compose up postgres azurite -d
```

This starts:
- PostgreSQL on `localhost:5432`
- [Azurite](https://github.com/Azure/Azurite) (Azure Storage emulator) on ports `10000`/`10001`/`10002`

### 2. Configure the web app

```bash
cd apps/web
cp .env .env.local    # .env already has Azurite defaults
```

Edit `.env.local` and fill in:
- `NEXTAUTH_SECRET` — run `openssl rand -base64 32`
- `AUTH_SECRET` — same value as `NEXTAUTH_SECRET`
- `RESEND_API_KEY` — from [resend.com](https://resend.com) (used for password reset emails)
- `RESEND_FROM_EMAIL` — a verified sender address in your Resend account
- `APP_URL` — `http://localhost:3000`

### 3. Configure the worker

```bash
cd apps/worker
cp .env.example .env
```

Edit `.env` and fill in:
- `DATABASE_URL` — same as web app
- `AZURE_STORAGE_CONNECTION_STRING` — same as web app (Azurite default is pre-filled)
- `LLM_API_KEY` — your Anthropic or OpenAI API key (used for categorization — Epic 3)
- `LLM_MODEL` — e.g. `anthropic/claude-haiku-4-5-20251001`

### 4. Set up the database

```bash
cd apps/web
npm install
npx prisma migrate deploy
npx prisma generate
```

### 5. Run both apps

From the monorepo root:

```bash
npm install
npm run dev
```

- Web app: [http://localhost:3000](http://localhost:3000)
- Worker API: [http://localhost:8000](http://localhost:8000)

Or run them individually:

```bash
# Terminal 1 — web
cd apps/web && npm run dev

# Terminal 2 — worker
cd apps/worker && pip install -r requirements.txt && uvicorn main:app --reload
```

---

## Running with Docker Compose

To run the full stack (web + worker + postgres + azurite) locally:

```bash
cp apps/web/.env .env.compose   # edit secrets as above
docker compose up --build
```

The web app will be available at [http://localhost:3000](http://localhost:3000).

---

## Testing

```bash
# From apps/web/
npm run test:rls       # PostgreSQL RLS cross-tenant isolation
npm run test:auth      # User registration + login
npm run test:reset     # Password reset flow
npm run test:account   # Account deletion
npm run test:upload    # Statement upload API
npm run test:jobs      # Job status API

# From apps/worker/
pytest tests/ -v
```

---

## Supported banks

| Bank | Format | Detection |
|------|--------|-----------|
| Chase | Headers: `Transaction Date, Description, Amount` | Required headers subset |
| American Express | Headers: `Date, Description, Card Member, Amount` | `Card Member` present |
| Bank of America | Headers: `Posted Date, Payee, Amount` (may have metadata rows) | Header scan |
| Capital One | Headers: `Transaction Date, Description, Debit, Credit` | `Debit`/`Credit` columns |
| Wells Fargo | No header — positional columns | Asterisk placeholders in cols 2–3 |

---

## Project structure

```
mint_personal/
├── apps/
│   ├── web/                    # Next.js web application
│   │   ├── src/
│   │   │   ├── app/            # App Router pages and API routes
│   │   │   │   ├── (app)/      # Authenticated pages (dashboard, statements, settings)
│   │   │   │   ├── (auth)/     # Login, register, password reset
│   │   │   │   └── api/        # REST API routes
│   │   │   ├── components/     # Shared UI components
│   │   │   ├── hooks/          # React hooks (useJobStatus, etc.)
│   │   │   └── lib/            # Utilities (auth, db, azure-blob, azure-queue)
│   │   └── prisma/             # Schema, migrations
│   └── worker/                 # Python processing worker
│       ├── parsers/            # Bank-specific CSV parsers + registry
│       ├── tests/              # pytest test suite
│       ├── worker.py           # Queue polling + pipeline orchestration
│       ├── dedup.py            # Duplicate detection
│       └── categorizer.py      # LLM categorization stub (Epic 3)
├── packages/
│   └── db/                     # Shared DB package placeholder
├── docker-compose.yml          # Full local stack
└── .github/workflows/          # CI (lint + test) and CD (deploy to Azure)
```

---

## Epics & roadmap

| Epic | Status | Description |
|------|--------|-------------|
| **Epic 1** — Foundation | ✅ Done | Auth, multi-tenant DB, Azure infra, CI/CD |
| **Epic 2** — CSV Pipeline | ✅ Done | Upload, parse, normalize, deduplicate |
| **Epic 3** — AI Categorization | 🔜 Next | LiteLLM categorizer, correction learning |
| **Epic 4** — Spending Analysis | 🔜 Planned | Monthly summaries, bar charts, transaction explorer |
| **Epic 5** — Administration | 🔜 Planned | Admin user management, system health monitoring |

---

## Environment variables reference

### Web app (`apps/web/.env`)

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `NEXTAUTH_SECRET` / `AUTH_SECRET` | NextAuth.js signing secret (same value) |
| `NEXTAUTH_URL` | Public URL of the web app |
| `AZURE_STORAGE_CONNECTION_STRING` | Azure Storage or Azurite connection string |
| `AZURE_QUEUE_NAME` | Queue name for job messages (default: `statement-processing`) |
| `AZURE_BLOB_CONTAINER_NAME` | Blob container name (default: `statements`) |
| `RESEND_API_KEY` | Resend API key for password reset emails |
| `RESEND_FROM_EMAIL` | Verified sender address |
| `APP_URL` | Public URL used in email links |

### Worker (`apps/worker/.env`)

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `AZURE_STORAGE_CONNECTION_STRING` | Same as web app |
| `AZURE_QUEUE_NAME` | Same as web app |
| `AZURE_BLOB_CONTAINER_NAME` | Same as web app |
| `LLM_MODEL` | LiteLLM model string (e.g. `anthropic/claude-haiku-4-5-20251001`) |
| `LLM_API_KEY` | API key for the LLM provider |

---

## Contributing

This is a personal project built with the [BMAD](https://github.com/bmad-method/bmad) AI-assisted development workflow. The `_bmad-output/` directory contains the product requirements, architecture decisions, epics, stories, and code review reports that were used to build the project.
