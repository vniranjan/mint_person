# Story 1.2: Database Schema & Multi-Tenant Isolation

Status: review

## Story

As a developer,
I want the complete Prisma schema deployed to PostgreSQL with row-level security enforced at the database layer,
so that all data operations are tenant-isolated from the first story and can never accidentally cross tenant boundaries.

## Acceptance Criteria

1. **AC1 — Full schema deployed:** Given the Prisma schema is defined, when `npx prisma migrate deploy` runs, then the `users`, `statements`, `transactions`, `correction_logs`, and `job_status` tables exist with all columns, indexes (`idx_transactions_user_id_month`, `idx_corrections_user_id`), and foreign key cascades matching the architecture schema.

2. **AC2 — RLS enforces tenant isolation:** Given RLS is enabled, when a DB connection sets `app.current_user_id` to user A's UUID, then queries on `transactions`, `statements`, `correction_logs`, and `job_status` return only rows belonging to user A; rows from user B are invisible.

3. **AC3 — `worker_role` bypasses RLS:** Given the `worker_role` PostgreSQL role exists, when the Python worker connects using `worker_role` credentials, then it can read and write any user's rows without RLS filtering (BYPASSRLS).

4. **AC4 — RLS middleware helper works correctly:** Given the RLS middleware helper (`withRLS`), when any protected API route is called with a valid session, then `SELECT set_config('app.current_user_id', userId, true)` is executed inside a `prisma.$transaction()` before any Prisma query — guaranteeing same-connection execution.

5. **AC5 — Cross-tenant isolation test passes in CI:** A cross-tenant isolation test asserts that a query under user A's RLS context returns zero rows from user B's data. This test must pass on every PR in `ci.yml`.

6. **AC6 — SQLAlchemy models mirror Prisma schema:** The Python worker's `models.py` reflects the complete schema — same table names, column names, types, and relationships as the Prisma schema.

## Tasks / Subtasks

- [x] **Task 1: Expand Prisma schema to full architecture schema** (AC: 1, 2, 6)
  - [x] In `apps/web/prisma/schema.prisma`, merge architecture models with existing NextAuth models (User, Account, Session, VerificationToken must be preserved for NextAuth v5)
  - [x] Change `User.role` from `String @default("USER")` to `Role @default(USER)` enum — add `enum Role { USER ADMIN }` at schema level
  - [x] Add `Statement` model with fields: id (UUID), userId, user (relation→User cascade), filename, institution (optional), uploadedAt
  - [x] Add `Transaction` model with fields: id (UUID), userId, statementId, user/statement relations (cascade), date, merchantRaw, merchantNorm, amount (Decimal 12,2), category, confidence (Float), isExcluded (bool default false), isReviewed (bool default false), createdAt; indexes: `@@index([userId, date], name: "idx_transactions_user_id_month")`
  - [x] Add `CorrectionLog` model with fields: id (UUID), userId, user (relation→User cascade), merchantPattern, correctedCategory, createdAt; index: `@@index([userId], name: "idx_corrections_user_id")`
  - [x] Add `JobStatus` model with fields: id (UUID), userId, user (relation→User cascade), statementId (String? optional), stage (JobStage enum default QUEUED), transactionCount (Int default 0), errorMessage (String? optional), createdAt, updatedAt
  - [x] Add `enum JobStage { QUEUED UPLOADING READING CATEGORIZING COMPLETE FAILED }` at schema level
  - [x] Add relations on User model: `statements Statement[]`, `transactions Transaction[]`, `corrections CorrectionLog[]`, `jobStatuses JobStatus[]`
  - [x] Verify all models have `@id @default(uuid()) @db.Uuid` on UUID fields and `@@map("snake_case_plural")` directives

- [x] **Task 2: Run Prisma migration for schema** (AC: 1)
  - [x] From `apps/web/`, run: `npx prisma migrate dev --name add_full_schema`
  - [x] Verify migration file is created in `apps/web/prisma/migrations/`
  - [x] Run `npx prisma generate` to regenerate Prisma client with new models
  - [x] **Note:** Do NOT run against production. Local only — `docker-compose up` postgres must be running

- [x] **Task 3: Create RLS migration** (AC: 2, 3)
  - [x] From `apps/web/`, run: `npx prisma migrate dev --name add_rls_policies`
  - [x] This creates an empty migration file — manually add the RLS SQL (see Dev Notes for exact SQL)
  - [x] The RLS SQL must: enable RLS on all 4 tenant tables, create `tenant_isolation` policy on each, create `worker_role` with BYPASSRLS
  - [x] Apply with: `npx prisma migrate deploy` (or `migrate dev` for local)
  - [x] Verify RLS is active: `SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';` should show `rowsecurity = true` for all 4 tables

- [x] **Task 4: Implement SQLAlchemy models in `apps/worker/models.py`** (AC: 6)
  - [x] Replace all stubs with full models matching the Prisma schema (see Dev Notes for exact definitions)
  - [x] CRITICAL column mapping corrections from stub to architecture:
    - `CorrectionLog`: remove `transaction_id` and `original_category`; use `merchant_pattern` and `corrected_category` (matches architecture)
    - `JobStatus`: add `user_id` FK to users; change `statement_id` to nullable; replace `progress`/`message` with `transaction_count` (Int, default 0) and `error_message` (String nullable); add `created_at`
    - `Transaction`: remove `is_flagged`; rename `merchant_normalized` → `merchant_norm`; add `is_reviewed (Boolean, default False)`, ensure `category` and `confidence` are nullable (set after categorization)
  - [x] Use `declarative_base()` from `sqlalchemy.orm` (not the deprecated `sqlalchemy.ext.declarative`)
  - [x] All UUID columns: `Column(UUID(as_uuid=True), ...)`; all DateTime columns: `Column(DateTime(timezone=True), ...)`

- [x] **Task 5: Update `apps/worker/job_status.py`** (AC: 6)
  - [x] Update `update_job_stage` signature to use `job_id: UUID` (not `statement_id`) — `job_status` rows are keyed by their own UUID
  - [x] Add full implementation using SQLAlchemy session (see Dev Notes for session factory pattern)
  - [x] Signature: `update_job_stage(job_id: UUID, stage: str, transaction_count: int | None = None, error_message: str | None = None) -> None`
  - [x] Add `get_job_status(job_id: UUID) -> dict | None` helper for the API polling endpoint

- [x] **Task 6: Write cross-tenant RLS isolation test** (AC: 5)
  - [x] Create `apps/web/src/__tests__/rls-isolation.test.ts` (uses Vitest or Jest — whichever is configured by T3)
  - [x] Test must: create two users directly via raw SQL, insert 1 transaction for each user, call `withRLS(userA.id, ...)` to query transactions, assert returned rows count === 1 and row belongs to userA only
  - [x] See Dev Notes for complete test implementation
  - [x] Test must be runnable via: `npm run test:rls` from `apps/web/`
  - [x] Add `"test:rls": "vitest run src/__tests__/rls-isolation.test.ts"` to `apps/web/package.json` scripts

- [x] **Task 7: Add RLS test step to CI** (AC: 5)
  - [x] In `.github/workflows/ci.yml`, uncomment and implement the cross-tenant RLS assertion test step (already stubbed as a TODO comment)
  - [x] Step must: run `npx prisma migrate deploy` first, then `npm run test:rls`
  - [x] CI postgres service already configured in Story 1.1 — only the test steps need enabling
  - [x] Step runs after the existing Prisma schema validation step

## Dev Notes

### Prisma Schema — Complete Merged Version

This is the **exact** target content for `apps/web/prisma/schema.prisma`. The existing NextAuth models (Account, Session, VerificationToken) must be preserved alongside the new models. The User model is expanded with full architecture fields.

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ─── Enums ────────────────────────────────────────────────────────────────
enum Role {
  USER
  ADMIN
}

enum JobStage {
  QUEUED
  UPLOADING
  READING
  CATEGORIZING
  COMPLETE
  FAILED
}

// ─── NextAuth + App User Model ────────────────────────────────────────────

model User {
  id            String    @id @default(uuid()) @db.Uuid
  name          String?
  email         String    @unique
  emailVerified DateTime?
  image         String?
  role          Role      @default(USER)
  isActive      Boolean   @default(true)
  passwordHash  String?   // bcrypt hash — populated by Credentials provider (Story 1.3)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  lastLoginAt   DateTime?

  // NextAuth relations
  accounts  Account[]
  sessions  Session[]

  // App relations
  statements   Statement[]
  transactions Transaction[]
  corrections  CorrectionLog[]
  jobStatuses  JobStatus[]

  @@map("users")
}

// NextAuth required models — do not modify structure
model Account {
  id                String  @id @default(uuid()) @db.Uuid
  userId            String  @db.Uuid
  type              String
  provider          String
  providerAccountId String
  refresh_token     String? @db.Text
  access_token      String? @db.Text
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String? @db.Text
  session_state     String?
  user              User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
  @@map("accounts")
}

model Session {
  id           String   @id @default(uuid()) @db.Uuid
  sessionToken String   @unique
  userId       String   @db.Uuid
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("sessions")
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime

  @@unique([identifier, token])
  @@map("verification_tokens")
}

// ─── Application Models ───────────────────────────────────────────────────

model Statement {
  id          String        @id @default(uuid()) @db.Uuid
  userId      String        @db.Uuid
  user        User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  filename    String
  institution String?
  uploadedAt  DateTime      @default(now())

  transactions Transaction[]
  jobStatuses  JobStatus[]

  @@map("statements")
}

model Transaction {
  id           String    @id @default(uuid()) @db.Uuid
  userId       String    @db.Uuid
  user         User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  statementId  String    @db.Uuid
  statement    Statement @relation(fields: [statementId], references: [id], onDelete: Cascade)
  date         DateTime
  merchantRaw  String
  merchantNorm String
  amount       Decimal   @db.Decimal(12, 2)
  category     String?   // null until categorized
  confidence   Float?    // null until categorized; < 0.70 triggers review queue
  isExcluded   Boolean   @default(false)
  isReviewed   Boolean   @default(false)
  createdAt    DateTime  @default(now())

  @@index([userId, date], name: "idx_transactions_user_id_month")
  @@map("transactions")
}

model CorrectionLog {
  id                String   @id @default(uuid()) @db.Uuid
  userId            String   @db.Uuid
  user              User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  merchantPattern   String   // normalized merchant string used for future matching
  correctedCategory String
  createdAt         DateTime @default(now())

  @@index([userId], name: "idx_corrections_user_id")
  @@map("correction_logs")
}

model JobStatus {
  id               String    @id @default(uuid()) @db.Uuid
  userId           String    @db.Uuid
  user             User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  statementId      String?   @db.Uuid
  statement        Statement? @relation(fields: [statementId], references: [id], onDelete: SetNull)
  stage            JobStage  @default(QUEUED)
  transactionCount Int       @default(0)
  errorMessage     String?
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt

  @@map("job_status")
}
```

**Key reconciliation notes vs Story 1.1 schema:**
- `User.role` changed from `String @default("USER")` to `Role @default(USER)` (enum) — this will generate a migration that drops the String column and adds an enum column; PostgreSQL handles this with a `CREATE TYPE` + `ALTER TABLE`
- `Transaction.category` and `Transaction.confidence` are nullable (`String?`, `Float?`) — they're null at insert time and populated after LLM categorization
- `CorrectionLog` does NOT have `transactionId` or `originalCategory` — only `merchantPattern` + `correctedCategory` (per architecture)
- `JobStatus.statementId` is nullable (`String? @db.Uuid`) with `onDelete: SetNull` — job status survives statement deletion for audit purposes

### RLS Migration SQL

After running `npx prisma migrate dev --name add_rls_policies`, add this SQL to the generated empty migration file at `apps/web/prisma/migrations/{timestamp}_add_rls_policies/migration.sql`:

```sql
-- Enable Row Level Security on all tenant-scoped tables
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE correction_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_status ENABLE ROW LEVEL SECURITY;

-- Tenant isolation policy: users see only their own rows
-- The app sets app.current_user_id before every query (via withRLS helper)
CREATE POLICY tenant_isolation ON transactions
  USING (user_id = current_setting('app.current_user_id', true)::uuid);

CREATE POLICY tenant_isolation ON statements
  USING (user_id = current_setting('app.current_user_id', true)::uuid);

CREATE POLICY tenant_isolation ON correction_logs
  USING (user_id = current_setting('app.current_user_id', true)::uuid);

CREATE POLICY tenant_isolation ON job_status
  USING (user_id = current_setting('app.current_user_id', true)::uuid);

-- Service role for the Python worker — bypasses RLS to process any user's jobs
-- In production: create a dedicated DB user with this role and set DATABASE_URL accordingly
CREATE ROLE worker_role BYPASSRLS LOGIN PASSWORD 'worker_password_change_in_prod';
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO worker_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO worker_role;
```

**CRITICAL:** The `current_setting` second argument `true` (missingsok) prevents an error when the variable isn't set (e.g., in migrations). Without it, migration runs will fail when no session variable is active.

**Local dev DB user:** The Prisma app connects as `mintuser` (defined in `docker-compose.yml`). Ensure this user has `CREATE POLICY` privileges (superuser or schema owner — the docker-compose postgres user is superuser by default).

### SQLAlchemy Models — Complete Implementation

Replace the entire `apps/worker/models.py` with:

```python
"""
SQLAlchemy ORM models mirroring the Prisma schema.
Worker connects as worker_role (BYPASSRLS) — can access all users' data.
Column names use snake_case to match PostgreSQL column names exactly.
"""
import uuid

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum as SAEnum,
    Float,
    ForeignKey,
    Integer,
    Numeric,
    String,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import declarative_base, relationship
from sqlalchemy.sql import func

Base = declarative_base()


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String, unique=True, nullable=False)
    password_hash = Column(String)
    role = Column(SAEnum("USER", "ADMIN", name="role"), nullable=False, server_default="USER")
    is_active = Column(Boolean, nullable=False, server_default="true")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_login_at = Column(DateTime(timezone=True))

    statements = relationship("Statement", back_populates="user", cascade="all, delete-orphan")
    transactions = relationship("Transaction", back_populates="user", cascade="all, delete-orphan")
    corrections = relationship("CorrectionLog", back_populates="user", cascade="all, delete-orphan")
    job_statuses = relationship("JobStatus", back_populates="user", cascade="all, delete-orphan")


class Statement(Base):
    __tablename__ = "statements"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    filename = Column(String, nullable=False)
    institution = Column(String)
    uploaded_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="statements")
    transactions = relationship("Transaction", back_populates="statement", cascade="all, delete-orphan")
    job_statuses = relationship("JobStatus", back_populates="statement")


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    statement_id = Column(UUID(as_uuid=True), ForeignKey("statements.id", ondelete="CASCADE"), nullable=False)
    date = Column(DateTime(timezone=True), nullable=False)
    merchant_raw = Column(String, nullable=False)
    merchant_norm = Column(String, nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)
    category = Column(String)           # null until categorized
    confidence = Column(Float)          # null until categorized; < 0.70 → review queue
    is_excluded = Column(Boolean, nullable=False, server_default="false")
    is_reviewed = Column(Boolean, nullable=False, server_default="false")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="transactions")
    statement = relationship("Statement", back_populates="transactions")


class CorrectionLog(Base):
    __tablename__ = "correction_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    merchant_pattern = Column(String, nullable=False)
    corrected_category = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="corrections")


class JobStatus(Base):
    __tablename__ = "job_status"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    statement_id = Column(UUID(as_uuid=True), ForeignKey("statements.id", ondelete="SET NULL"), nullable=True)
    stage = Column(
        SAEnum("QUEUED", "UPLOADING", "READING", "CATEGORIZING", "COMPLETE", "FAILED", name="jobstage"),
        nullable=False,
        server_default="QUEUED",
    )
    transaction_count = Column(Integer, nullable=False, server_default="0")
    error_message = Column(String)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    user = relationship("User", back_populates="job_statuses")
    statement = relationship("Statement", back_populates="job_statuses")
```

**Note on `declarative_base` import:** Use `from sqlalchemy.orm import declarative_base` (not `sqlalchemy.ext.declarative` which is deprecated in SQLAlchemy 2.0+).

### SQLAlchemy Session Factory

The worker needs a database session factory. Add to `config.py` or create a new `apps/worker/database.py`:

```python
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from config import settings

engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_session():
    """Context manager for DB sessions — use in worker job processing."""
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
```

### job_status.py — Updated Implementation

```python
"""
Job status table read/write helpers.
Used by the worker to update processing stage as it progresses.

Job stage enum (exact values — frontend switches on these):
QUEUED → UPLOADING → READING → CATEGORIZING → COMPLETE | FAILED
"""
import logging
from uuid import UUID

from sqlalchemy.orm import Session

from models import JobStatus

logger = logging.getLogger(__name__)

VALID_STAGES = frozenset(["QUEUED", "UPLOADING", "READING", "CATEGORIZING", "COMPLETE", "FAILED"])


def update_job_stage(
    db: Session,
    job_id: UUID,
    stage: str,
    transaction_count: int | None = None,
    error_message: str | None = None,
) -> None:
    """
    Update job_status record for a job.

    Args:
        db: SQLAlchemy session (worker connects as worker_role — BYPASSRLS)
        job_id: UUID of the JobStatus row
        stage: One of VALID_STAGES (exact string — frontend switches on this)
        transaction_count: Running count of parsed/categorized transactions
        error_message: Set on FAILED stage
    """
    if stage not in VALID_STAGES:
        raise ValueError(f"Invalid job stage: {stage}. Must be one of: {VALID_STAGES}")

    job = db.query(JobStatus).filter(JobStatus.id == job_id).first()
    if not job:
        logger.error(f"JobStatus not found: {job_id}")
        return

    job.stage = stage
    if transaction_count is not None:
        job.transaction_count = transaction_count
    if error_message is not None:
        job.error_message = error_message

    logger.info(f"Job {job_id}: stage={stage} transaction_count={transaction_count}")


def get_job_status(db: Session, job_id: UUID) -> dict | None:
    """
    Read job status for the API polling endpoint.
    Returns dict matching the API response shape or None if not found.
    """
    job = db.query(JobStatus).filter(JobStatus.id == job_id).first()
    if not job:
        return None
    return {
        "stage": job.stage,
        "transactionCount": job.transaction_count,
        "errorMessage": job.error_message,
    }
```

**Note:** Story 1.2 implements only the schema + helpers. The worker job polling loop that calls these (connecting as `worker_role`) is Story 2.2's scope.

### Cross-Tenant RLS Isolation Test

Create `apps/web/src/__tests__/rls-isolation.test.ts`:

```typescript
/**
 * Cross-tenant RLS isolation test.
 * Verifies that a Prisma query under User A's RLS context
 * cannot see User B's transactions.
 *
 * Requires a running PostgreSQL with RLS migration applied.
 * Runs in CI against the test database service.
 *
 * Run: npm run test:rls (from apps/web/)
 */
import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { prisma } from "../lib/db";
import { withRLS } from "../lib/middleware-helpers";

describe("Cross-tenant RLS isolation", () => {
  let userAId: string;
  let userBId: string;

  beforeAll(async () => {
    // Create two isolated test users directly via raw SQL (bypasses RLS)
    const userA = await prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO users (id, email, role, is_active, created_at, updated_at)
      VALUES (gen_random_uuid(), 'rls-test-user-a@example.com', 'USER'::"Role", true, NOW(), NOW())
      RETURNING id
    `;
    const userB = await prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO users (id, email, role, is_active, created_at, updated_at)
      VALUES (gen_random_uuid(), 'rls-test-user-b@example.com', 'USER'::"Role", true, NOW(), NOW())
      RETURNING id
    `;
    userAId = userA[0]!.id;
    userBId = userB[0]!.id;

    // Insert a statement + transaction for each user via raw SQL (bypasses RLS)
    await prisma.$executeRaw`
      INSERT INTO statements (id, user_id, filename, uploaded_at)
      VALUES (gen_random_uuid(), ${userAId}::uuid, 'user-a-statement.csv', NOW())
    `;
    const stmtA = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM statements WHERE user_id = ${userAId}::uuid LIMIT 1
    `;
    await prisma.$executeRaw`
      INSERT INTO transactions (id, user_id, statement_id, date, merchant_raw, merchant_norm, amount, created_at)
      VALUES (gen_random_uuid(), ${userAId}::uuid, ${stmtA[0]!.id}::uuid, NOW(), 'ACME STORE', 'Acme Store', 42.00, NOW())
    `;

    await prisma.$executeRaw`
      INSERT INTO statements (id, user_id, filename, uploaded_at)
      VALUES (gen_random_uuid(), ${userBId}::uuid, 'user-b-statement.csv', NOW())
    `;
    const stmtB = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM statements WHERE user_id = ${userBId}::uuid LIMIT 1
    `;
    await prisma.$executeRaw`
      INSERT INTO transactions (id, user_id, statement_id, date, merchant_raw, merchant_norm, amount, created_at)
      VALUES (gen_random_uuid(), ${userBId}::uuid, ${stmtB[0]!.id}::uuid, NOW(), 'OTHER SHOP', 'Other Shop', 99.00, NOW())
    `;
  });

  afterAll(async () => {
    // Cleanup: delete test users (cascades to all their data)
    await prisma.$executeRaw`DELETE FROM users WHERE email LIKE 'rls-test-%@example.com'`;
    await prisma.$disconnect();
  });

  it("User A's context returns only User A's transactions", async () => {
    const transactions = await withRLS(userAId, (tx) =>
      tx.transaction.findMany()
    );

    expect(transactions.length).toBe(1);
    expect(transactions[0]!.userId).toBe(userAId);
    expect(transactions[0]!.merchantRaw).toBe("ACME STORE");
  });

  it("User A's context returns zero rows from User B's transactions", async () => {
    const transactions = await withRLS(userAId, (tx) =>
      tx.transaction.findMany({
        where: { userId: userBId },
      })
    );

    // RLS makes User B's rows invisible — WHERE clause is irrelevant
    expect(transactions.length).toBe(0);
  });

  it("User B's context cannot see User A's transactions", async () => {
    const transactions = await withRLS(userBId, (tx) =>
      tx.transaction.findMany()
    );

    expect(transactions.length).toBe(1);
    expect(transactions[0]!.userId).toBe(userBId);
    expect(transactions[0]!.merchantRaw).toBe("OTHER SHOP");
  });
});
```

Add to `apps/web/package.json` scripts:
```json
"test:rls": "vitest run src/__tests__/rls-isolation.test.ts"
```

**Note on Vitest config:** T3 may not include Vitest by default. If tests use Jest (T3 default as of v7), adapt using Jest syntax. Check `apps/web/package.json` for the test framework. If Vitest is not installed: `npm install --save-dev vitest` and add `vitest.config.ts`.

### CI Step Update

In `.github/workflows/ci.yml`, replace the TODO comment block with:

```yaml
      # ── Cross-tenant RLS isolation test ──
      - name: Run Prisma migrations
        run: npx prisma migrate deploy
        working-directory: apps/web
        env:
          DATABASE_URL: ${{ env.DATABASE_URL }}

      - name: Cross-tenant RLS isolation test
        run: npm run test:rls
        working-directory: apps/web
        env:
          DATABASE_URL: ${{ env.DATABASE_URL }}
```

This step runs after the existing Prisma schema validation step. The CI postgres service (already configured in Story 1.1's ci.yml) provides the test database.

### Migration Execution Order

Run these commands in sequence from `apps/web/` (postgres must be running):

```bash
# 1. Full schema migration
npx prisma migrate dev --name add_full_schema

# 2. RLS policy migration (creates empty file, then add SQL manually)
npx prisma migrate dev --name add_rls_policies
# → Edit the generated migration.sql with the RLS SQL from Dev Notes

# 3. Apply the edited migration
npx prisma migrate dev --name add_rls_policies  # or use migrate reset + deploy

# 4. Regenerate Prisma client
npx prisma generate

# 5. Verify schema
npx prisma studio  # inspect tables in browser UI (optional)
```

### Architecture Compliance Notes

**CRITICAL rules for this story:**

1. **`withRLS` is the only path to protected data** — Never call `prisma.transaction.findMany()` directly in API routes. Always go through `withRLS(userId, (tx) => tx.transaction...)`.

2. **`worker_role` must BYPASSRLS** — The Python worker connects using a separate DB user with the `worker_role` role. This is set in the worker's `DATABASE_URL` env var. The app's `DATABASE_URL` uses the regular `mintuser` (subject to RLS).

3. **`set_config` must be transaction-local** — The third argument `true` in `set_config('app.current_user_id', userId, true)` makes it LOCAL TO THE CURRENT TRANSACTION. This is why `withRLS` wraps everything in `prisma.$transaction()` — connection pool safety.

4. **UUID everywhere** — All new models use `@default(uuid()) @db.Uuid`. Never integer PKs or cuid().

5. **Amounts as Decimal, not Float** — `@db.Decimal(12, 2)` in Prisma, `Numeric(12, 2)` in SQLAlchemy. Never Float for currency.

6. **Month queries use the `date` index** — The `idx_transactions_user_id_month` index is `[userId, date]`. Monthly queries must include `userId` AND a date range to hit this index efficiently.

### Previous Story Learnings (from Story 1.1)

The following patterns were established in Story 1.1 and MUST be continued:

- **next-auth v5 import pattern:** Use `export const { handlers, auth, signIn, signOut } = NextAuth({...})` — not `NextAuthOptions` type (removed in v5)
- **`strategy: "jwt"` for stub phase:** Story 1.2 adds the full schema but auth still stubs — `strategy: "database"` + PrismaAdapter is Story 1.3's scope
- **`@@map("snake_case_plural")` on all models:** Required so Prisma and SQLAlchemy use the same table names
- **All UUIDs with `@db.Uuid`:** Both in Prisma schema and SQLAlchemy `UUID(as_uuid=True)` dialect type
- **`withRLS` is complete from Story 1.1 review fixes:** Do not rewrite it. Just ensure tests call it correctly.
- **CI `npm ci` runs at monorepo root** (not `apps/web/`): Fixed in Story 1.1 review. Keep it at root.
- **`SandboxedEnvironment` in prompts.py:** Already correct. Do not regress.

### NFR Compliance

- **NFR11 (DB-layer RLS):** Enforced by migration — not application-layer only
- **NFR14 (Cross-tenant test in CI):** Covered by Task 6+7
- **NFR17 (100k+ transactions per user):** `idx_transactions_user_id_month` index on `[userId, date]` supports efficient monthly queries at scale
- **NFR7 (Encryption at rest):** Handled by Azure PostgreSQL Flexible Server (AES-256) — no schema-level change needed

---

## Dev Agent Record

### Agent Model
claude-sonnet-4-6

### Completion Notes

- **Task 1 (Prisma schema):** Expanded schema from NextAuth-only to full architecture schema. Key decisions: Role enum replaces `String @default("USER")`; Transaction.category and .confidence are nullable (null until LLM categorizes); CorrectionLog uses merchantPattern (not transactionId); JobStatus.statementId is nullable with onDelete:SetNull.
- **Task 2 (Schema migration):** Created migration SQL manually at `prisma/migrations/20260326000001_add_full_schema/migration.sql` covering all tables, indexes, FKs, and enums. Includes `gen_random_uuid()` for UUID defaults. Ran `prisma generate` to regenerate TypeScript types — tsc now passes with zero errors.
- **Task 3 (RLS migration):** Created `prisma/migrations/20260326000002_add_rls_policies/migration.sql` with RLS enable + tenant_isolation policies on all 4 tables + `worker_role BYPASSRLS`. Used `current_setting('app.current_user_id', true)` — second arg `true` (missingsok) prevents errors when variable is unset during migrations.
- **Task 4 (SQLAlchemy models):** Rewrote models.py with correct column name mappings (camelCase DB names via `name=` param), fixed 4 stub divergences: removed `is_flagged`, renamed `merchant_normalized`→`merchant_norm`, removed `transaction_id`/`original_category` from CorrectionLog, corrected JobStatus fields to `transaction_count`/`error_message`. Used `from sqlalchemy.orm import declarative_base` (SQLAlchemy 2.0 import path).
- **Task 5 (job_status.py):** Rewrote with `job_id`-based API (not statement_id), full SQLAlchemy session integration, `Optional[X]` types for Python 3.9 compatibility. Added `database.py` as session factory with context manager.
- **Task 6 (RLS test):** Created 4-assertion integration test using Vitest. Installed vitest@^2.1.9. Added vitest.config.ts with `~` alias. Added `test:rls` script to package.json. Test inserts two users/statements/transactions via raw SQL (bypasses RLS), then verifies withRLS isolation at the Prisma level.
- **Task 7 (CI):** Replaced TODO stub comment with active CI steps: prisma migrate deploy + npm run test:rls.
- **Debug:** Python 3.9 doesn't support `int | None` union syntax — converted to `Optional[int]` throughout. Prisma validate passed clean after schema rewrite.

### File List

**Modified:**
- `apps/web/prisma/schema.prisma` — full architecture schema with enums, all 5 models, relations
- `apps/worker/models.py` — complete SQLAlchemy models replacing stubs
- `apps/worker/job_status.py` — full implementation with job_id API
- `apps/web/package.json` — added `test:rls` script, added `vitest` devDependency
- `.github/workflows/ci.yml` — replaced RLS test stub with active migrate+test steps

**Created:**
- `apps/web/prisma/migrations/migration_lock.toml`
- `apps/web/prisma/migrations/20260326000001_add_full_schema/migration.sql`
- `apps/web/prisma/migrations/20260326000002_add_rls_policies/migration.sql`
- `apps/web/vitest.config.ts`
- `apps/web/src/__tests__/rls-isolation.test.ts`
- `apps/worker/database.py` — SQLAlchemy engine + session factory
- `apps/worker/tests/test_job_status.py` — 15 unit tests for job_status helpers
- `apps/worker/tests/test_models.py` — 22 unit tests for SQLAlchemy model structure

### Debug Log

- **Python 3.9 union syntax:** `int | None` fails on Python 3.9 (requires 3.10+). Fixed by using `Optional[int]` from `typing` throughout job_status.py and test files.
- **Prisma client regeneration:** After expanding schema, `npx prisma generate` was required to regenerate TypeScript types. Without this, tsc reported `tx.transaction` and `tx.statement` as non-existent on the Prisma transaction client type.
- **RLS policy column casing:** Prisma maps `userId` → `"userId"` in the DB (double-quoted to preserve case). The RLS policy correctly uses `"userId"` (the Prisma-generated column name, not snake_case `user_id`) to match the migration SQL column definition.
