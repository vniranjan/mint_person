---
stepsCompleted: ['step-01', 'step-02', 'step-03', 'step-04']
workflowComplete: true
completedAt: '2026-03-21'
inputDocuments: ['_bmad-output/planning-artifacts/prd.md', '_bmad-output/planning-artifacts/architecture.md', '_bmad-output/planning-artifacts/ux-design-specification.md']
---

# mint_personal - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for mint_personal, decomposing the requirements from the PRD, UX Design Specification, and Architecture into implementable stories.

## Requirements Inventory

### Functional Requirements

FR1: Users can register for an account with email and password
FR2: Users can log in and log out securely
FR3: Users can reset their password via email
FR4: Each user's data is isolated and inaccessible to other users
FR5: Users can delete their account and all associated data
FR6: Users can upload a bank or credit card statement in CSV format
FR7: Users can upload statements from 2 or more institutions in a single session
FR8: The system parses uploaded statements and extracts transactions (date, merchant, amount)
FR9: The system provides progress feedback during upload and parsing, updating status within 3 seconds of each stage transition
FR10: The system flags transactions it cannot parse or categorize with ≥ 70% confidence and surfaces them for review
FR11: The system detects and flags duplicate transactions from overlapping statement periods
FR12: The system automatically assigns a category to each parsed transaction
FR13: The system surfaces a confidence indicator for each categorization
FR14: Users can view a queue of uncategorized or low-confidence transactions requiring review
FR15: Users can correct a transaction's category with a single interaction
FR16: The system applies learned corrections to similar merchants within the same upload
FR17: The system applies learned corrections to future uploads from the same user
FR18: Users can view the reason a transaction was assigned a given category
FR19: The system provides a default category taxonomy (Groceries, Dining, Transport, Shopping, Subscriptions, Healthcare, Entertainment, Utilities)
FR20: Users can manually assign any transaction to any available category
FR21: Users can exclude specific transactions from monthly totals and trend calculations
FR22: Users can view a monthly spending breakdown by category (total and percentage)
FR23: Users can view spending trends across 2 or more months per category
FR24: Users can view a full transaction list for any month, filterable by category
FR25: Users can search transactions by merchant name or amount
FR26: Users can navigate between months to compare spending
FR27: Parsed transaction data is stored persistently per user
FR28: Raw uploaded statement files are discarded after successful parsing
FR29: Users can view all uploaded statements and their processing status
FR30: User correction history is logged for audit and model retraining
FR31: Administrators can create new user accounts
FR32: Administrators can view all users, their last login, and storage usage
FR33: Administrators can deactivate or delete user accounts
FR34: Administrators cannot access any user's personal financial transaction data
FR35: Administrators can monitor system health and processing queue status

### NonFunctional Requirements

NFR1: Authenticated dashboard page load ≤ 2 seconds on broadband
NFR2: Statement upload acknowledgment (parsing started) ≤ 3 seconds from file drop
NFR3: Statement parsing and categorization end-to-end ≤ 30 seconds for statements up to 500 transactions
NFR4: Monthly breakdown and trend chart render ≤ 1 second from page navigation (client-side from cached data)
NFR5: Transaction list search ≤ 500ms response time
NFR6: Non-processing API endpoints ≤ 200ms p95 response time
NFR7: All data encrypted at rest (AES-256 or equivalent)
NFR8: All traffic encrypted in transit (TLS 1.2+)
NFR9: Authentication uses secure httpOnly session cookies; SameSite=Strict
NFR10: Passwords hashed with bcrypt cost factor ≥ 12
NFR11: Row-level security enforced at the database layer (not application-layer only)
NFR12: Raw statement files permanently deleted within 1 hour of successful parsing
NFR13: Admin accounts blocked from user financial data at the API layer
NFR14: Automated cross-tenant data access tests pass in CI on every deployment
NFR15: No third-party analytics or tracking scripts receive financial data
NFR16: Architecture supports reaching 100 users without redesign (MVP targets 1–10)
NFR17: Database schema supports 100k+ transactions per user without index redesign
NFR18: Statement processing is asynchronous — UI never blocks on processing jobs
NFR19: Background job queue horizontally scalable to 100 concurrent statement processing jobs
NFR20: WCAG 2.1 AA compliance for all core flows: upload, review, categorization, visualization
NFR21: All interactive elements keyboard-navigable
NFR22: Color contrast ratios ≥ 4.5:1 for normal text
NFR23: Core flows screen reader compatible: transaction list, category breakdown, correction workflow
NFR24: No time-limited interactions that cannot be extended

### Additional Requirements

Architecture requirements that impact epic and story creation:

- AR1: **Starter template** — Initialize monorepo with T3 stack: `npm create t3-app@latest apps/web -- --CI --appRouter --tailwind --prisma --nextAuth --noGit`. Epic 1 Story 1 is this initialization.
- AR2: Add shadcn/ui, recharts, azure-storage-blob, azure-storage-queue SDKs to web app; initialize Python AI Worker (FastAPI, LiteLLM, pandas, pydantic-settings, SQLAlchemy, azure-storage-queue, azure-storage-blob, jinja2, pyyaml) in apps/worker
- AR3: Configure monorepo structure: `apps/web` (T3 Next.js), `apps/worker` (Python FastAPI), `packages/db` (Prisma schema as shared source of truth)
- AR4: Configure Azure Container Apps with two independent containers (App + Worker); independent GitHub Actions deployment workflows (deploy-web.yml, deploy-worker.yml, ci.yml)
- AR5: Configure Azure supporting services: Blob Storage (1hr lifecycle policy), Storage Queue (App→Worker job messaging), PostgreSQL Flexible Server, Container Registry, Key Vault for secrets
- AR6: Set up local development with docker-compose + Azurite (Azure Storage emulator) + PostgreSQL container; no Azure account needed for local dev
- AR7: Implement complete Prisma schema (User, Statement, Transaction, CorrectionLog, JobStatus models); apply RLS migration SQL to enable row-level security on transactions, statements, correction_logs, job_status tables
- AR8: Create `worker_role` PostgreSQL service role with BYPASSRLS for the Python worker; app role sets `app.current_user_id` session variable before every query
- AR9: Implement LiteLLM categorizer with config-driven model via `LLM_MODEL` environment variable; prompts stored as YAML files with Jinja2 templates in `apps/worker/prompts/`
- AR10: Inject per-user correction log as few-shot examples into LLM system prompt at categorization time; implement rule-based keyword fallback when LLM API unavailable
- AR11: Implement job progress polling architecture: `job_status` table updated by Python worker through stages (QUEUED → UPLOADING → READING → CATEGORIZING → COMPLETE | FAILED); frontend polls `GET /api/jobs/:id/status` every 2 seconds
- AR12: Implement modular CSV parser plugin architecture with `BaseStatementParser` ABC and bank-specific plugins: Chase, Amex, Bank of America, Capital One, Wells Fargo
- AR13: All API success responses wrapped in `{ "data": ... }`. Paginated responses add `"meta": { "total": N, "page": N }`. Error responses: `{ "error": { "code": "UPPER_SNAKE_CASE", "message": "..." } }`
- AR14: Azure Storage Queue inter-container message protocol: `{ jobId, userId, blobUrl, statementId, uploadedAt }` from App → Worker; worker writes results directly to PostgreSQL
- AR15: Implement structured JSON logging to stdout for Azure Monitor ingestion; `/health` endpoints on both containers for liveness probes; Azure Monitor alert on worker error rate

### UX Design Requirements

UX-DR1: Implement custom Tailwind color system — warm neutral canvas (stone family: stone-50 bg, stone-100 surface-subtle, stone-200 border, stone-900 text-primary, stone-500 text-secondary, stone-400 text-muted), single amber accent (amber-400 flag, amber-50 flag-bg, amber-700 flag-text), success (emerald-600), destructive (red-600 destructive-only)
UX-DR2: Implement 8 fixed category color badge pairings: Groceries (green-100/green-700), Dining (orange-100/orange-700), Transport (blue-100/blue-700), Shopping (violet-100/violet-700), Subscriptions (cyan-100/cyan-700), Healthcare (rose-100/rose-700), Entertainment (purple-100/purple-700), Utilities (slate-100/slate-700); all pairings verified ≥ 4.5:1 contrast
UX-DR3: Implement Inter font with 5-level typography hierarchy: page title (text-xl font-semibold), section label (text-sm font-medium text-stone-500), body/data (text-sm text-stone-900), caption (text-xs text-stone-400), amount (text-sm font-medium tabular-nums)
UX-DR4: Build UploadDropZone custom component — 4 states: idle (stone-200 border), hover (stone-400 border), drag-over (amber-400 border, amber-50 bg), uploading (replaced by Pipeline); role="button", aria-label="Upload CSV statement"; keyboard Enter/Space triggers file picker; 2 variants (full-page centered empty state; compact inline returning user)
UX-DR5: Build UploadPipeline custom component — narrative stage labels (Uploading… → Reading transactions… [live count] → Categorizing… [progress bar fills] → Done — N transactions categorized); role="status" live region; aria-live="polite" for stage label updates; no generic spinners
UX-DR6: Build ReviewBanner + ReviewQueue custom components — amber-50 bg banner with flag icon + count + [Review Now] + [Skip]; inline expansion (no modal, no page navigation); row anatomy: date | merchant | amount | CategoryBadge (amber border) | FlagIcon; pattern application inline note (text-xs below row: "Also applied to N similar merchants"); banner role="alert" on inject; queue role="list"
UX-DR7: Build TransactionRow custom component — 5 states: default, hover (row actions reveal), corrected (80% opacity), excluded (strikethrough + muted), flagged (amber badge border); anatomy: Date | Merchant | CategoryBadge | Amount (tabular-nums right-aligned) | HoverActions; hover actions keyboard-accessible via focus-within
UX-DR8: Build CategoryPickerPopover custom component wrapping shadcn Popover — search input with 300ms debounce; category list with color dots; keyboard navigation: arrow keys navigate list, Enter selects, Escape closes; role="listbox", role="option"; auto-close on selection (no save button); width 200–280px
UX-DR9: Build MonthNavigator custom component — `← [Month Year] →` pattern; → disabled at current month, ← disabled at earliest available month; aria-label="Previous month"/"Next month"; aria-disabled on boundaries; left/right arrow keys when focused
UX-DR10: Build CategoryFilterChips custom component — role="radiogroup"; chips are role="radio" with aria-checked; single-select with deselect (clicking active returns to All); only shows categories present in current month; horizontal scroll with fade mask on edges
UX-DR11: Build SpendingBarChart custom component wrapping Recharts BarChart — category-to-color mapping from 8 fixed category colors; tooltip showing category name | total | % of month; role="img" + aria-label; visually-hidden `<table>` with same data as screen reader fallback; Recharts ResponsiveContainer for responsive scaling
UX-DR12: Implement feedback patterns — Toast (bottom-right, 4s auto-dismiss): success emerald-600 icon for corrections/uploads/admin actions, error red-600 icon with actionable text; inline feedback: form errors red-600 below field with aria-describedby, pattern application text-xs below corrected row, duplicate flag amber badge inline
UX-DR13: Implement empty state patterns — no data: centered UploadDropZone + single CTA (never "No data found"); no filter results: "No [category] transactions this month" + [Clear filter] button; admin no users: "No users yet. Create the first account."
UX-DR14: Implement loading/skeleton patterns — API calls < 500ms: no indicator; API calls ≥ 500ms: skeleton placeholder matching content shape; upload pipeline replaces content with narrative labels (never a spinner)
UX-DR15: Implement responsive breakpoints — desktop ≥1280px primary (4 KPI cards strip, all table columns visible); tablet 768–1279px (summary cards 2×2, date column hidden in table); mobile <768px functional floor (table collapses to merchant + amount only, category badge below merchant, tap-to-browse file upload)
UX-DR16: Implement form validation patterns — validate on blur; re-validate on change once error shown; labels always visible above field (no placeholder-as-label); password show/hide toggle; submit button disabled only during in-flight request with spinner
UX-DR17: Implement full keyboard navigation and screen reader support — skip-to-content link (visually hidden, appears on focus); semantic HTML (nav, main, header, table with thead/tbody/th scope); Dialog: focus trapped while open, returns to trigger on close; min 44×44px touch targets at mobile breakpoint
UX-DR18: Implement prefers-reduced-motion support — disable progress bar animation and fade transitions; preserve instant state changes when motion is reduced
UX-DR19: Implement transaction search — single input searching merchant + amount; 300ms debounce; no-results state "No transactions matching '[query]'" + [Clear search]; search and category filter compose simultaneously

### FR Coverage Map

| FR | Epic | Description |
|---|---|---|
| FR1 | Epic 1 | User registration |
| FR2 | Epic 1 | Login / logout |
| FR3 | Epic 1 | Password reset |
| FR4 | Epic 1 | Tenant data isolation |
| FR5 | Epic 1 | Account + data deletion |
| FR6 | Epic 2 | CSV upload |
| FR7 | Epic 2 | Multi-institution upload |
| FR8 | Epic 2 | Transaction parsing |
| FR9 | Epic 2 | Progress feedback |
| FR10 | Epic 3 | Low-confidence flagging |
| FR11 | Epic 2 | Duplicate detection |
| FR12 | Epic 3 | Auto-categorization |
| FR13 | Epic 3 | Confidence indicator |
| FR14 | Epic 3 | Review queue |
| FR15 | Epic 3 | One-click correction |
| FR16 | Epic 3 | Within-upload pattern learning |
| FR17 | Epic 3 | Cross-upload learned corrections |
| FR18 | Epic 3 | Categorization reason display |
| FR19 | Epic 3 | Default category taxonomy |
| FR20 | Epic 3 | Manual category assignment |
| FR21 | Epic 3 | Transaction exclusion |
| FR22 | Epic 4 | Monthly category breakdown |
| FR23 | Epic 4 | Multi-month trend charts |
| FR24 | Epic 4 | Filterable transaction list |
| FR25 | Epic 4 | Transaction search |
| FR26 | Epic 4 | Month navigation |
| FR27 | Epic 4 | Persistent transaction storage |
| FR28 | Epic 2 | Raw file deletion post-parse |
| FR29 | Epic 2 | Statement history + status |
| FR30 | Epic 3 | Correction history audit log |
| FR31 | Epic 5 | Admin creates user accounts |
| FR32 | Epic 5 | Admin views users + metrics |
| FR33 | Epic 5 | Admin deactivates/deletes users |
| FR34 | Epic 5 | Admin blocked from financial data |
| FR35 | Epic 5 | System health monitoring |

## Epic List

### Epic 1: Foundation, Infrastructure & Authentication
Users can register, log in, and access a securely isolated multi-tenant platform — with the full infrastructure in place for all subsequent epics. Covers project initialization (T3 starter, monorepo, shadcn/ui, design tokens), Azure infrastructure (Container Apps, Blob Storage, Storage Queue, PostgreSQL with RLS, Key Vault), local dev (docker-compose + Azurite), CI/CD (GitHub Actions), and complete auth flows.
**FRs covered:** FR1, FR2, FR3, FR4, FR5

### Epic 2: CSV Statement Upload & Parsing Pipeline
Users can upload CSV statements from major banks and receive fully parsed transactions within 30 seconds, with real-time progress feedback. Covers UploadDropZone + UploadPipeline components, Azure Blob → Storage Queue → Python worker pipeline, modular bank parsers (Chase, Amex, BoA, Capital One, Wells Fargo), job status polling, duplicate detection, statement history view, and raw file deletion.
**FRs covered:** FR6, FR7, FR8, FR9, FR11, FR28, FR29

### Epic 3: AI Categorization, Review & Correction Learning
Transactions are automatically categorized by an AI that learns from user corrections — each correction improves the model for all future uploads. Covers LiteLLM categorizer with YAML prompts, confidence scoring, rule-based fallback, default 8-category taxonomy, ReviewBanner + ReviewQueue, one-click CategoryPickerPopover correction, within-upload pattern application, correction log persistence, future-upload learning, transaction exclusion, and categorization reasoning display.
**FRs covered:** FR10, FR12, FR13, FR14, FR15, FR16, FR17, FR18, FR19, FR20, FR21, FR30

### Epic 4: Spending Analysis & Transaction Explorer
Users can understand where their money went — through monthly category breakdowns, multi-month trend charts, and a searchable filterable transaction list. Covers summary KPI strip, SpendingBarChart (Recharts), CategoryFilterChips, MonthNavigator, full transaction table, category filter, transaction search (merchant + amount), and month-to-month navigation.
**FRs covered:** FR22, FR23, FR24, FR25, FR26, FR27

### Epic 5: Platform Administration
Administrators can manage users and monitor system health — with financial data fully inaccessible to admin roles. Covers admin user management (create, view, deactivate, delete), operational metrics (last login, storage), system health and job queue monitoring, and enforced financial data isolation at API + UI layer.
**FRs covered:** FR31, FR32, FR33, FR34, FR35

---

## Epic 1: Foundation, Infrastructure & Authentication

Users can register, log in, and access a securely isolated multi-tenant platform — with the full infrastructure in place for all subsequent epics.

### Story 1.1: Project Scaffold & Design Foundation

As a developer,
I want the complete monorepo initialized with T3 stack, Python worker scaffold, shadcn/ui, Tailwind design tokens, and a working local development environment,
So that all subsequent stories have a consistent foundation, working toolchain, and a deployable skeleton application.

**Acceptance Criteria:**

**Given** the monorepo root exists
**When** `npm install` and `docker-compose up` are run
**Then** a Next.js app starts on localhost:3000, a Python FastAPI worker starts on localhost:8000, a PostgreSQL instance starts on localhost:5432, and Azurite emulates Azure Storage on localhost:10000

**Given** the T3 app is initialized
**When** the `apps/web/tailwind.config.ts` is inspected
**Then** the custom stone/amber color palette is defined with all tokens from UX-DR1 (stone-50 through stone-900, amber-400, amber-50, amber-700, emerald-600, red-600) and 8 fixed category color pairings from UX-DR2

**Given** shadcn/ui is initialized
**When** the `apps/web/src/components/ui/` directory is inspected
**Then** Button, Input, Card, Badge, Toast, Dialog, Popover, Progress, Table, and Separator components are present

**Given** the monorepo structure
**When** the directory tree is inspected
**Then** `apps/web/` (T3), `apps/worker/` (Python FastAPI), `packages/db/` exist; `.github/workflows/ci.yml` runs lint + type-check on PR; Inter font is configured in `globals.css`

**And** `prefers-reduced-motion` CSS media query is implemented — disabling progress animations and fade transitions when user has reduced motion enabled

### Story 1.2: Database Schema & Multi-Tenant Isolation

As a developer,
I want the complete Prisma schema deployed to PostgreSQL with row-level security enforced at the database layer,
So that all data operations are tenant-isolated from the first story and can never accidentally cross tenant boundaries.

**Acceptance Criteria:**

**Given** the Prisma schema is defined
**When** `npx prisma migrate deploy` runs
**Then** the `users`, `statements`, `transactions`, `correction_logs`, and `job_status` tables exist with all columns, indexes (`idx_transactions_user_id_month`, `idx_corrections_user_id`), and foreign key cascades matching the architecture schema

**Given** RLS is enabled
**When** a DB connection sets `app.current_user_id` to user A's UUID
**Then** queries on `transactions`, `statements`, `correction_logs`, and `job_status` return only rows belonging to user A; rows from user B are invisible

**Given** the `worker_role` PostgreSQL role exists
**When** the Python worker connects using `worker_role` credentials
**Then** it can read and write any user's rows without RLS filtering (BYPASSRLS)

**Given** the RLS middleware helper
**When** any protected API route is called with a valid session
**Then** `SELECT set_config('app.current_user_id', userId, true)` is executed before any Prisma query on that request

**And** a cross-tenant isolation test in `ci.yml` asserts that a query under user A's context returns zero rows from user B's data — this test must pass on every PR

### Story 1.3: User Registration & Login

As a new user,
I want to register an account with my email and password and log in securely,
So that I can access my personal finance dashboard.

**Acceptance Criteria:**

**Given** I am on the `/login` page
**When** I submit a valid email and password
**Then** I am authenticated and redirected to `/dashboard`; a secure httpOnly SameSite=Strict session cookie is set; no JWT is exposed to JavaScript

**Given** I am on the login page
**When** I submit an email that does not exist or an incorrect password
**Then** I see an inline error "Invalid email or password" (no field-specific error that reveals which is wrong); no redirect occurs

**Given** I want to register
**When** I submit a valid email and password ≥ 8 characters via the registration form
**Then** my password is hashed with bcrypt cost factor 12; a `users` row is created with `role: USER`; I am redirected to dashboard

**Given** I am logged in
**When** I click "Sign out"
**Then** my session is invalidated server-side; I am redirected to `/login`; the session cookie is cleared

**Given** I am not authenticated
**When** I navigate to any `/dashboard` or `/statements` route
**Then** I am redirected to `/login`

**And** the login form validates on blur, labels are always visible above fields, and the submit button shows a loading spinner during the in-flight request

### Story 1.4: Password Reset via Email

As a user who has forgotten their password,
I want to request a password reset and set a new password via an email link,
So that I can regain access to my account without contacting an administrator.

**Acceptance Criteria:**

**Given** I submit my email on the forgot-password form
**When** the email exists in the system
**Then** a time-limited reset token is generated and a reset email is sent with a secure link; the response always shows "If that email is registered, a reset link has been sent" (no email enumeration)

**Given** I click a valid, unexpired reset link
**When** I submit a new password ≥ 8 characters
**Then** my password is updated (bcrypt cost 12); all existing sessions are invalidated; I am redirected to `/login` with a "Password updated" success toast

**Given** I click an expired or already-used reset link
**When** the page loads
**Then** I see "This reset link has expired or already been used" with a link to request a new one

### Story 1.5: Account Deletion & Full Data Purge

As a user,
I want to permanently delete my account and all associated data,
So that I have full control over my personal information and can exercise my right to be forgotten.

**Acceptance Criteria:**

**Given** I am on my account settings page
**When** I initiate account deletion
**Then** a confirmation Dialog appears: "Delete your account? This will permanently remove all your transactions, statements, and history. This cannot be undone." with [Cancel] and [Delete account] destructive button

**Given** I confirm deletion
**When** the deletion is processed
**Then** my `users` row is deleted; cascade deletes remove all `statements`, `transactions`, `correction_logs`, and `job_status` rows; my session is invalidated; I am redirected to `/login`

**Given** the deletion is confirmed
**When** the database is inspected
**Then** zero rows exist for that `userId` across all tables

### Story 1.6: Azure Production Deployment & CI/CD

As a developer,
I want the application deployed to Azure Container Apps with automated CI/CD pipelines,
So that every merge to main automatically deploys the latest version with zero manual steps.

**Acceptance Criteria:**

**Given** a push to `main` touches `apps/web/**`
**When** GitHub Actions runs
**Then** `deploy-web.yml` builds the Next.js Docker image, pushes to Azure Container Registry, and deploys to the App container on Azure Container Apps

**Given** a push to `main` touches `apps/worker/**`
**When** GitHub Actions runs
**Then** `deploy-worker.yml` builds the Python Docker image, pushes to Azure Container Registry, and deploys to the Worker container independently

**Given** both containers are deployed
**When** `GET /health` is called on each
**Then** both return `{ "status": "ok" }` with HTTP 200; Azure Container Apps liveness probes use these endpoints

**Given** secrets (DATABASE_URL, JWT_SECRET, LLM API key, Azure connection strings)
**When** the containers start
**Then** all secrets are loaded from Azure Key Vault via Container Apps secret references — no secrets in Docker images or source code

**And** `ci.yml` runs on every PR: TypeScript type-check, ESLint, Prisma schema validation, Python `pytest` unit tests, and the cross-tenant RLS assertion test

---

## Epic 2: CSV Statement Upload & Parsing Pipeline

Users can upload CSV statements from major banks and receive fully parsed transactions within 30 seconds, with real-time progress feedback.

### Story 2.1: CSV Upload API & Azure Blob/Queue Integration

As a developer,
I want the statement upload API endpoint to accept a CSV file, stream it to Azure Blob Storage, and enqueue a processing job,
So that the upload pipeline backend is in place for the UI and Python worker to connect to.

**Acceptance Criteria:**

**Given** an authenticated user POSTs a CSV file to `POST /api/statements/upload`
**When** the file is received
**Then** the file is streamed to Azure Blob Storage; a `statements` row is created; a `job_status` row is inserted with stage `QUEUED`; an Azure Storage Queue message `{ jobId, userId, blobUrl, statementId, uploadedAt }` is enqueued; the API responds within 3 seconds with `{ "data": { "jobId": "uuid", "statementId": "uuid" } }`

**Given** a file larger than the allowed limit (>10MB) is submitted
**When** the upload is attempted
**Then** the API returns `{ "error": { "code": "FILE_TOO_LARGE", "message": "..." } }` with HTTP 413; no blob or DB row is created

**Given** a non-CSV file type is submitted
**When** the upload is attempted
**Then** the API returns `{ "error": { "code": "INVALID_FILE_TYPE" } }` with HTTP 422

**Given** a job is enqueued
**When** `GET /api/jobs/:id/status` is called
**Then** it returns `{ "data": { "stage": "QUEUED", "transactionCount": 0 } }` within 200ms p95

### Story 2.2: Python Worker — Bank CSV Parsers

As a developer,
I want the Python worker to dequeue jobs and parse CSV statements from Chase, Amex, Bank of America, Capital One, and Wells Fargo,
So that raw CSV files are transformed into structured transaction records ready for categorization.

**Acceptance Criteria:**

**Given** a job is dequeued from Azure Storage Queue
**When** the worker downloads the blob and detects the bank format
**Then** `registry.py` selects the correct parser; `job_status.stage` is updated to `READING`; the raw merchant name, date (UTC), and amount (Decimal 12,2) are extracted for each transaction row

**Given** the parser runs on a Chase sample CSV fixture (`tests/fixtures/chase_sample.csv`)
**When** parsing completes
**Then** all transactions are extracted with correct date, `merchantRaw`, and `amount` matching the fixture; `transactionCount` in `job_status` reflects the parsed count

**Given** the same fixture tests run for Amex, BoA, Capital One, and Wells Fargo
**When** `pytest tests/test_parsers.py` runs
**Then** all parser tests pass; each parser correctly handles its institution's date format and column schema

**Given** a CSV with malformed rows (missing columns, unparseable dates)
**When** the parser encounters them
**Then** malformed rows are skipped and counted; `job_status.errorMessage` records the skip count; the job does not fail

**And** the `BaseStatementParser` ABC enforces a `parse(file_path) -> List[Transaction]` interface; adding a new bank requires only a new plugin file with no changes to `registry.py` dispatch logic

### Story 2.3: Job Progress Polling & Upload Pipeline UI

As a user,
I want to see real-time progress while my statement is being processed — with narrative stage labels and a live transaction count,
So that I know the upload is working and roughly how far along it is.

**Acceptance Criteria:**

**Given** I have dropped a CSV file onto the dashboard
**When** the upload begins
**Then** the UploadDropZone transitions to UploadPipeline; the pipeline shows the filename, file size, and stage label "Uploading…" within 3 seconds of file drop

**Given** the worker is in the READING stage
**When** `useJobStatus` polls `GET /api/jobs/:id/status` every 2 seconds
**Then** the stage label updates to "Reading transactions…" and the transaction count increments live

**Given** the worker is in the CATEGORIZING stage
**When** the frontend receives the updated job status
**Then** the stage label updates to "Categorizing…" and the progress bar fills proportionally

**Given** the worker reaches COMPLETE
**When** the frontend detects the stage change
**Then** TanStack Query cache is invalidated; the pipeline shows "Done — [N] transactions categorized"; the UI transitions to the monthly view (or review queue if flagged transactions exist)

**Given** the worker reaches FAILED
**When** the frontend detects the failure
**Then** an error toast appears: "Processing failed — [errorMessage]. Try again."; the UploadDropZone is restored

**And** UploadPipeline uses `role="status"` + `aria-live="polite"` so stage label changes are announced to screen readers; stage labels are narrative (never bare percentages)

### Story 2.4: Duplicate Transaction Detection

As a user,
I want the system to detect and flag duplicate transactions when I upload overlapping statement periods,
So that my monthly totals are not inflated by accidental re-uploads.

**Acceptance Criteria:**

**Given** I upload a statement containing transactions already in the database for the same user
**When** the worker compares incoming transactions to existing ones
**Then** transactions matching on `(userId, date, merchantRaw, amount)` are flagged with an amber "Possible duplicate" badge in the transaction list

**Given** a flagged duplicate is displayed
**When** I view the transaction
**Then** the inline note shows "Possible duplicate — [date] [amount] [merchant]" with [Keep] and [Exclude] actions; neither action is taken automatically

**Given** I choose [Exclude] on a duplicate
**When** the action is confirmed
**Then** `isExcluded` is set to `true`; the transaction is removed from monthly totals; the amber badge is replaced with a muted "Excluded" indicator

### Story 2.5: Statement History & Upload Drop Zone (Returning User)

As a returning user,
I want to see a history of my uploaded statements with their processing status, and easily upload another statement,
So that I can track what I've uploaded and add new statements at any time.

**Acceptance Criteria:**

**Given** I navigate to `/statements`
**When** the page loads
**Then** a list of all my uploaded statements is displayed: filename, institution (if detected), upload date, transaction count, and processing status (Processing / Complete / Failed badge)

**Given** I have no uploaded statements yet
**When** the statements page loads
**Then** the empty state shows a centered UploadDropZone with CTA "Upload a statement to get started" — no "No data found" text

**Given** I am on the dashboard with existing data
**When** I want to upload another statement
**Then** the top nav shows an "Upload Statement" primary button; clicking it activates the compact inline UploadDropZone variant

**Given** the UploadDropZone is in drag-over state
**When** I drag a file over it
**Then** the border changes to amber-400 and the background to amber-50; releasing the file initiates the upload

**And** UploadDropZone has `role="button"`, `aria-label="Upload CSV statement"`, and keyboard Enter/Space triggers the file picker; minimum 44×44px touch target is enforced at mobile breakpoint

---

## Epic 3: AI Categorization, Review & Correction Learning

Transactions are automatically categorized by an AI that learns from user corrections — each correction improves the model for all future uploads.

### Story 3.1: LiteLLM Categorizer, Confidence Scoring & Low-Confidence Flagging

As a developer,
I want the Python worker to categorize parsed transactions using LiteLLM with config-driven model and YAML prompts, assigning confidence scores and flagging uncertain results,
So that every transaction receives an automatic category assignment, with uncertain ones surfaced for review rather than silently miscategorized.

**Acceptance Criteria:**

**Given** transactions are parsed and ready for categorization
**When** the worker calls the LiteLLM categorizer
**Then** transactions are batched into groups of 50; the system prompt is loaded from `categorize_system.yaml` and user prompt from `categorize_user.yaml` via Jinja2 rendering; the LLM model is read from `LLM_MODEL` env var; no model name or prompt text is hardcoded in Python source

**Given** the LLM returns a category assignment with confidence ≥ 0.70
**When** the transaction is saved
**Then** `category`, `confidence`, and `isReviewed: false` are written to the `transactions` table; `job_status.stage` updates to CATEGORIZING

**Given** the LLM returns confidence < 0.70
**When** the transaction is saved
**Then** the transaction is saved with its assigned category and confidence value; it is surfaced in the review queue for user confirmation

**Given** the LLM API is unavailable (network error or rate limit)
**When** a `LiteLLMError` is caught
**Then** the rule-based keyword fallback categorizer runs; keyword matches are saved with confidence=0.60; unmatched transactions are saved with confidence=0.0 and flagged for review; the job does not fail or poison-pill the queue

**Given** `LLM_MODEL` is changed to a different provider (e.g., `gpt-4o-mini` or `ollama/llama3`)
**When** the worker is restarted
**Then** categorization runs with the new model with zero code changes; `pytest tests/test_categorizer.py` passes with both primary and fallback code paths tested

**And** after categorization completes, the raw CSV blob is deleted from Azure Blob Storage; `job_status.stage` updates to COMPLETE

### Story 3.2: Default Category Taxonomy & Flagged Transaction Review Queue

As a user,
I want to see a queue of low-confidence or uncategorized transactions that need my attention, with the system's categorization reason visible,
So that I can quickly review uncertain categorizations without any transaction being silently wrong.

**Acceptance Criteria:**

**Given** I have uploaded a statement with processed transactions
**When** some transactions have confidence < 0.70
**Then** a ReviewBanner appears below the top nav: amber-50 background, flag icon, "[N] transactions need review" with [Review Now] and [Skip] buttons; the banner has `role="alert"` on inject

**Given** I click [Review Now]
**When** the review queue expands
**Then** it expands inline below the banner (no modal, no page navigation); each flagged row shows: date | merchant | amount | CategoryBadge (amber border) | flag icon; the queue container has `role="list"`

**Given** I hover over the categorization reason icon on a flagged row
**When** the tooltip appears
**Then** it shows the reason: e.g. "Matched keyword: 'AMZN'" or "LLM assigned — 45% confidence"

**Given** I click [Skip]
**When** the banner is dismissed
**Then** I can view monthly data without completing the review queue; flagged transactions remain in the transaction list with amber CategoryBadge borders; a review count indicator remains visible

**Given** `GET /api/categories` is called
**When** the response is returned
**Then** all 8 default categories are returned: Groceries, Dining, Transport, Shopping, Subscriptions, Healthcare, Entertainment, Utilities — each with their color token pairing

### Story 3.3: One-Click Category Correction

As a user,
I want to correct a transaction's category with a single click that opens an inline picker,
So that fixing miscategorizations is fast, effortless, and immediately reflected in my spending view.

**Acceptance Criteria:**

**Given** I am viewing any transaction's category badge
**When** I click the badge
**Then** a CategoryPickerPopover opens inline; it contains a search input and a scrollable list of all 8 categories with color dots and labels; no modal, no save button

**Given** the CategoryPickerPopover is open
**When** I select a new category
**Then** the badge updates immediately to the new category color and label; the popover closes; a success toast appears: "[Merchant] — remembered for next time" (emerald-600 icon, 4s auto-dismiss)

**Given** I use keyboard navigation in the picker
**When** the popover is open
**Then** arrow keys navigate the category list; Enter selects the focused item; Escape closes the popover without change; the list has `role="listbox"` and items have `role="option"`

**Given** the correction is submitted
**When** `PATCH /api/transactions/:id` is called
**Then** the transaction's `category` is updated; a `correction_logs` row is inserted with `merchantPattern` (normalized merchant name) and `correctedCategory`; the API responds within 200ms p95

**Given** the corrected row is in the review queue
**When** the correction is made
**Then** the row dims to 80% opacity (corrected state); the queue count decrements; when all queue items are resolved, the banner dismisses with a subtle fade

### Story 3.4: Pattern Learning — Within-Upload & Cross-Upload Correction Memory

As a user,
I want my corrections to automatically apply to similar merchants in the same upload and to all future uploads,
So that the categorization gets demonstrably smarter over time and the review pass shortens with each statement.

**Acceptance Criteria:**

**Given** I correct "SQ *BLUE BOTTLE COFFEE #4821" to Dining
**When** the pattern matcher checks the current upload
**Then** all transactions in the same upload with merchant names matching the "SQ *BLUE BOTTLE" prefix pattern are auto-corrected to Dining; an inline note appears below affected rows: "Also applied to N similar merchants"; those rows dim automatically without user action

**Given** a `correction_logs` entry exists for a user (merchantPattern: "UBER EATS", correctedCategory: "Dining")
**When** that user uploads a new statement containing "UBER EATS" transactions
**Then** the Python worker reads the user's `correction_logs` before categorization; matching transactions are categorized as Dining with confidence=0.95; they do not appear in the review queue

**Given** the correction log is injected as few-shot examples
**When** `categorize_system.yaml` is rendered with Jinja2 at categorization time
**Then** the user's correction log entries are injected as examples in the system prompt; the prompt content is per-user; no code changes are needed to add new corrections

**Given** the correction log is queried per user
**When** the worker reads `correction_logs` for the current user
**Then** the RLS `worker_role` BYPASSRLS access is used; only that user's corrections are injected (not another user's history)

**And** `correction_logs` rows accumulate across uploads; `FR30` audit requirement is satisfied by the existence and persistence of this table

### Story 3.5: Transaction Exclusion from Monthly Totals

As a user,
I want to exclude specific transactions from my monthly totals and trend calculations,
So that anomalous entries (zero-dollar records, refunds, one-off items) don't distort my spending picture.

**Acceptance Criteria:**

**Given** I hover over a transaction row
**When** the hover actions reveal
**Then** an [Exclude] ghost button appears; it is keyboard-accessible via focus-within on the row

**Given** I click [Exclude] on a transaction
**When** the action completes
**Then** `isExcluded` is set to `true`; the row displays strikethrough styling and muted text (excluded state); `PATCH /api/transactions/:id` responds within 200ms p95

**Given** a transaction is excluded
**When** `GET /api/summary/:month` is calculated
**Then** excluded transactions are omitted from all category totals, the total spend KPI, and trend calculations

**Given** I have excluded a transaction
**When** I view the transaction list
**Then** excluded transactions remain visible in the list (not hidden) with strikethrough styling; an [Include] action is accessible from the same hover reveal to reverse the exclusion

---

## Epic 4: Spending Analysis & Transaction Explorer

Users can understand where their money went — through monthly category breakdowns, multi-month trend charts, and a searchable filterable transaction list.

### Story 4.1: Monthly Summary API & KPI Dashboard Strip

As a user,
I want to see a dashboard summary of my spending for the current month — total spent, top category, transaction count, and comparison to last month —
So that I can immediately understand my financial position without scrolling or drilling down.

**Acceptance Criteria:**

**Given** I navigate to `/dashboard`
**When** the page loads via Server Component fetch
**Then** the page renders within 2 seconds on broadband; 4 KPI cards are displayed: Total Spent | Top Category | Transaction Count | vs Prior Month (delta amount and direction)

**Given** `GET /api/summary/:month` is called with a valid YYYY-MM parameter
**When** the response is returned
**Then** it returns `{ "data": { "totalSpent": "1234.56", "byCategory": [...], "transactionCount": 147, "vsLastMonth": "+12.3%" } }` within 200ms p95; amounts are strings in "12.34" format; excluded transactions are not counted

**Given** no transactions exist for the selected month
**When** the dashboard loads
**Then** KPI cards show zeros/dashes and the UploadDropZone empty state is displayed; no "No data found" text

**Given** summary data is already cached by TanStack Query
**When** I navigate away and return to the dashboard
**Then** the KPI cards and chart render within 1 second from cache; no loading skeleton flashes for cached data

**And** currency values are formatted with `Intl.NumberFormat` on the frontend; the `YYYY-MM` month format is used consistently across all API calls and URL params

### Story 4.2: Spending Bar Chart

As a user,
I want to see a bar chart of my spending broken down by category for the current month,
So that I can visually understand the proportion of my spending across categories at a glance.

**Acceptance Criteria:**

**Given** monthly summary data is available
**When** SpendingBarChart renders
**Then** a Recharts BarChart displays one bar per category with total spend on the Y-axis; bars use the 8 fixed category color tokens; bars are sorted by total spend descending

**Given** I hover over a bar
**When** the Recharts tooltip appears
**Then** it shows: Category name | Total (e.g. "$420.00") | Percentage of month total (e.g. "34%")

**Given** the chart renders
**When** accessibility is checked
**Then** the chart container has `role="img"` and `aria-label="Spending by category for [Month Year]"`; a visually-hidden `<table>` with the same data exists as a screen reader fallback

**Given** the viewport is tablet width (<900px)
**When** the chart renders
**Then** Recharts `ResponsiveContainer` scales the chart to available width without horizontal scroll

### Story 4.3: Filterable Transaction Table

As a user,
I want to browse all transactions for a month in a table and filter them by category,
So that I can drill into specific spending areas and verify individual entries.

**Acceptance Criteria:**

**Given** I am on the dashboard with transactions loaded
**When** the transaction table renders
**Then** it shows columns: Date | Merchant | CategoryBadge | Amount (tabular-nums, right-aligned); the table uses semantic `<table>` with `<thead>`, `<tbody>`, `<th scope="col">`

**Given** multiple categories exist in the current month
**When** CategoryFilterChips render above the table
**Then** one chip is shown per category present in the current month (not all 8 — only present ones); an "All" chip is active by default; chips have `role="radiogroup"` / `role="radio"` / `aria-checked`

**Given** I click a category chip (e.g., Dining)
**When** the filter is applied
**Then** the transaction table immediately updates to show only Dining transactions; the active chip uses the Dining color pairing (orange-100/orange-700); clicking the active chip again returns to All

**Given** no transactions match the active filter
**When** the table renders
**Then** "No Dining transactions this month" and a [Clear filter] button are displayed inline

**Given** more than 50 transactions exist for the month
**When** I scroll the table
**Then** the table supports continuous browsing without a hard cut-off that requires clicking a "Load more" or navigating pages that lose scroll position

### Story 4.4: Transaction Search

As a user,
I want to search my transactions by merchant name or amount,
So that I can quickly locate a specific transaction without scrolling through the full list.

**Acceptance Criteria:**

**Given** I type in the search input
**When** 300ms have elapsed since my last keystroke
**Then** `GET /api/transactions/search?q=...` is called; results are displayed within 500ms

**Given** I search for a merchant name (e.g., "Whole Foods")
**When** results render
**Then** all transactions with merchant names containing "Whole Foods" (case-insensitive) are displayed

**Given** I search for an amount (e.g., "42.50")
**When** results render
**Then** all transactions with that exact amount are displayed

**Given** my search returns no results
**When** the table renders
**Then** "No transactions matching '[query]'" and a [Clear search] button are displayed

**Given** I have both a category filter and a search term active simultaneously
**When** both filters are applied
**Then** only transactions matching both the active category AND the search term are displayed; the two filters compose correctly

### Story 4.5: Month Navigation & Multi-Month Trend Chart

As a user,
I want to navigate between months and see a trend chart of my spending across multiple months per category,
So that I can understand how my spending patterns change over time.

**Acceptance Criteria:**

**Given** I am viewing the dashboard
**When** MonthNavigator renders in the content area
**Then** it displays `← [Month Year] →`; the → arrow is disabled at the current month (`aria-disabled`); the ← arrow is disabled at the earliest month with data; `aria-label="Previous month"` and `aria-label="Next month"` are set on each arrow

**Given** I click the ← arrow
**When** I navigate to the prior month
**Then** all dashboard data (KPI strip, chart, transaction table) updates to the prior month; TanStack Query serves from cache if available; the URL reflects the new month in YYYY-MM format

**Given** MonthNavigator arrows are focused
**When** I press the left or right arrow key
**Then** navigation moves to the prior or next month respectively, matching the click behavior

**Given** I have data across 3 or more months
**When** I view the Trends section
**Then** a multi-month chart displays spending per category over all available months; `GET /api/months` returns the list of months with data in YYYY-MM format; each month is a data point on the chart

**Given** only 1 month of data exists
**When** the Trends section renders
**Then** "Upload more statements to see trends across months" is displayed rather than an empty or broken chart

---

## Epic 5: Platform Administration

Administrators can manage users and monitor system health — with financial data fully inaccessible to admin roles.

### Story 5.1: Admin — Create & List Users

As an administrator,
I want to create new user accounts and view a list of all users with their operational metrics,
So that I can onboard new users and monitor platform usage without accessing anyone's financial data.

**Acceptance Criteria:**

**Given** I am logged in as an ADMIN user
**When** I navigate to `/admin`
**Then** I see a users table with columns: Email | Last Login (date or "Never") | Status (Active/Inactive) | Storage Used; a [New User] primary button is present; `GET /api/admin/users` never joins `transactions`, `statements`, or `correction_logs` tables

**Given** I click [New User]
**When** the Create User form renders
**Then** it shows: Email field | Temporary Password field (with show/hide toggle) | Confirm Password field | [Create User] primary button | [Cancel] secondary button; labels are always visible above fields

**Given** I submit a valid email and matching passwords ≥ 8 characters
**When** the form is submitted
**Then** `POST /api/admin/users` creates a new `users` row with `role: USER` and `passwordHash` (bcrypt cost 12); the new user appears in the table with Status: Active and Last Login: Never; a success toast "User created — tenant provisioned" appears

**Given** I submit an email that already exists
**When** the form is submitted
**Then** an inline error appears below the email field: "A user with this email already exists"; no new row is created

**Given** no users exist yet
**When** the admin page loads
**Then** the empty state shows "No users yet. Create the first account." with the [New User] button visible

### Story 5.2: Admin — Deactivate & Delete Users

As an administrator,
I want to deactivate or permanently delete user accounts,
So that I can revoke access for users who should no longer use the platform or purge all data on request.

**Acceptance Criteria:**

**Given** I click on a user row in the admin table
**When** the user detail view opens
**Then** it shows only operational metrics: Upload count | Transaction count | Last activity date; a clearly visible label reads "Financial data not accessible to admins" — no financial table data is returned by the API

**Given** I click [Deactivate] on an active user
**When** the confirmation Dialog appears
**Then** it shows: "Deactivate [email]? They will not be able to log in." with [Cancel] secondary and [Deactivate] destructive button; Escape key and backdrop click = Cancel; focus is trapped within the Dialog

**Given** I confirm deactivation
**When** the action completes
**Then** `PATCH /api/admin/users/:id` sets the user's status to Inactive; the user row grays out with an Inactive status badge; any active sessions for that user are immediately invalidated; the user cannot log in until reactivated

**Given** I click [Delete] on a user
**When** the confirmation Dialog appears
**Then** it shows: "Permanently delete [email]? All their transactions, statements, and history will be removed. This cannot be undone." with [Cancel] and [Delete] destructive button

**Given** I confirm deletion
**When** the deletion completes
**Then** `DELETE /api/admin/users/:id` triggers cascade deletion of all the user's data across all tables; the user row is removed from the admin table; a success toast "User and all data permanently deleted" appears

### Story 5.3: System Health & Processing Queue Monitoring

As an administrator,
I want to monitor the health of the application and the statement processing queue,
So that I can detect and respond to issues before they affect users.

**Acceptance Criteria:**

**Given** I am on the admin dashboard
**When** the system health section renders
**Then** it shows: App container status (healthy/unhealthy) | Worker container status | Current queue depth (pending jobs in Azure Storage Queue) | Failed jobs in last 24 hours (from `job_status` table)

**Given** `GET /api/admin/health` is called
**When** the response is returned
**Then** it returns `{ "data": { "app": "ok", "worker": "ok", "queueDepth": N, "failedJobsLast24h": N } }` within 200ms; this endpoint returns HTTP 403 for non-admin users

**Given** a processing job has failed in the last 24 hours
**When** I view the health dashboard
**Then** failed jobs are listed with: statementId | user email | failure timestamp | errorMessage; no financial transaction data is included in the admin view

**Given** both containers are running
**When** `GET /health` is polled on each container
**Then** both return HTTP 200 `{ "status": "ok" }`; structured JSON logs are written to stdout for Azure Monitor ingestion; no secrets or financial data appear in logs
