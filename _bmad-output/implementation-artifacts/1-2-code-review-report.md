# Code Review Report — Story 1-2: Database Schema & Multi-Tenant Isolation

**Date:** 2026-03-27
**Reviewer model:** claude-opus-4-6
**Review mode:** Full (with spec)
**Spec file:** `_bmad-output/implementation-artifacts/1-2-database-schema-and-multi-tenant-isolation.md`
**Scope:** 14 files (5 modified, 9 new), ~1,300 lines

**Review layers:**
- Blind Hunter (adversarial, no context)
- Edge Case Hunter (boundary analysis, project access)
- Acceptance Auditor (spec compliance)

---

## Summary

| Category   | Count |
|------------|-------|
| Bad Spec   | **2** |
| Patch      | **13** |
| Defer      | **4** |
| Rejected   | **7** |

---

## Bad Spec

> These findings suggest the spec should be amended.

### 1. Spec's RLS SQL uses `user_id` (snake_case) but Prisma generates `"userId"` (camelCase) columns
- **Source:** auditor
- **Detail:** The Dev Notes prescribe exact RLS SQL with `user_id = current_setting(...)::uuid`, but the Prisma migration creates columns as `"userId"` (camelCase, double-quoted). The implementation correctly uses `"userId"` in the RLS policies to match the actual DB schema. The spec's prescribed SQL would fail at runtime.
- **Suggested amendment:** Update Dev Notes RLS SQL to use `"userId"` (camelCase, quoted) to match Prisma-generated column names. Add a note that Prisma preserves camelCase field names as DB column names.

### 2. Spec's SQLAlchemy models lack `name=` column mappings for camelCase DB columns
- **Source:** auditor
- **Detail:** The Dev Notes prescribe `user_id = Column(...)` with no `name=` parameter, but the actual DB columns are `"userId"` (camelCase). The implementation correctly adds `name="userId"` etc. on every column. The spec's prescribed models would query non-existent snake_case columns.
- **Suggested amendment:** Update Dev Notes SQLAlchemy models to include `name="camelCase"` mappings on all columns, matching the Prisma-generated schema.

---

## Patch

> These are fixable code issues. Ordered by priority.

### 3. `FORCE ROW LEVEL SECURITY` missing — table owner bypasses all RLS policies
- **Source:** blind+edge
- **Severity:** CRITICAL
- **File:** `apps/web/prisma/migrations/20260326000002_add_rls_policies/migration.sql`
- **Detail:** RLS is `ENABLE`d but not `FORCE`d. In PostgreSQL, table owners are exempt from RLS by default. Since `mintuser` both creates the tables (via migrations) and is the app's `DATABASE_URL` user, all RLS policies are silently bypassed. The RLS test may pass coincidentally but proves nothing about production isolation.
- **Fix:** Add `ALTER TABLE ... FORCE ROW LEVEL SECURITY` for all 4 tables after the `ENABLE` statements.

### 4. SQLAlchemy enum type names are lowercase but Prisma creates PascalCase types
- **Source:** blind+edge+auditor
- **Severity:** HIGH
- **File:** `apps/worker/models.py` (lines 37, 40)
- **Detail:** `SAEnum(..., name="jobstage")` and `name="role"`, but Prisma created `CREATE TYPE "JobStage"` and `CREATE TYPE "Role"`. PostgreSQL enum names are case-sensitive when quoted. The worker will fail on any DDL introspection or type resolution.
- **Fix:** Change to `name="JobStage"` and `name="Role"`.

### 5. RLS policies lack `WITH CHECK` clause — no explicit tenant enforcement on INSERT
- **Source:** blind+edge+auditor
- **Severity:** HIGH
- **File:** `apps/web/prisma/migrations/20260326000002_add_rls_policies/migration.sql` (lines 14-24)
- **Detail:** Only `USING` is specified. While PostgreSQL defaults `WITH CHECK` to the `USING` expression for `ALL` policies, an explicit `WITH CHECK` makes intent clear and prevents edge cases around INSERT with a different `userId`.
- **Fix:** Add explicit `WITH CHECK ("userId" = current_setting('app.current_user_id', true)::uuid)` to each policy.

### 6. `worker_role` password hardcoded in migration SQL
- **Source:** blind+edge
- **Severity:** HIGH
- **File:** `apps/web/prisma/migrations/20260326000002_add_rls_policies/migration.sql` (line 33)
- **Detail:** `PASSWORD 'workerpassword'` is committed to VCS. This role has `BYPASSRLS` — full access to all tenant data. Anyone with repo access knows the password.
- **Fix:** Use a placeholder with a clear `-- MUST CHANGE IN PRODUCTION` comment, or use `ALTER ROLE` in a separate non-committed script. Consider using an environment variable in the deployment process.

### 7. `GRANT ALL TABLES` only covers tables existing at migration time
- **Source:** blind+edge
- **Severity:** HIGH
- **File:** `apps/web/prisma/migrations/20260326000002_add_rls_policies/migration.sql` (lines 38-39)
- **Detail:** Future migrations adding tables won't grant access to `worker_role`, silently breaking the worker with `permission denied` errors.
- **Fix:** Add `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO worker_role;` and equivalent for sequences.

### 8. No `prisma generate` step in CI before RLS test
- **Source:** blind+auditor
- **Severity:** MEDIUM
- **File:** `.github/workflows/ci.yml`
- **Detail:** CI runs `prisma migrate deploy` then `npm run test:rls`, but never `prisma generate`. The test imports `@prisma/client` which requires generated types. Works only if auto-generation happens during `npm ci`, which is fragile.
- **Fix:** Add explicit `npx prisma generate` step before tests.

### 9. No index on `job_status."userId"` or `statements."userId"`
- **Source:** blind
- **Severity:** MEDIUM
- **File:** `apps/web/prisma/schema.prisma` (JobStatus and Statement models)
- **Detail:** `transactions` and `correction_logs` have userId indexes, but `statements` and `job_status` do not. RLS filters every query on `"userId"`, causing sequential scans on these tables at scale.
- **Fix:** Add `@@index([userId])` to Statement and JobStatus models.

### 10. `DateTime(timezone=True)` in SQLAlchemy vs `TIMESTAMP(3)` without timezone in Prisma
- **Source:** blind+edge
- **Severity:** MEDIUM
- **Files:** `apps/worker/models.py`, `apps/web/prisma/migrations/20260326000001_add_full_schema/migration.sql`
- **Detail:** SQLAlchemy declares `TIMESTAMPTZ` but Prisma creates `TIMESTAMP(3)`. Implicit conversion depends on server timezone, potentially shifting financial transaction dates.
- **Fix:** Either add `@db.Timestamptz(3)` in Prisma schema or change SQLAlchemy to `DateTime(timezone=False)`.

### 11. `withRLS` accepts arbitrary strings as userId — no UUID validation
- **Source:** blind+edge
- **Severity:** MEDIUM
- **File:** `apps/web/src/lib/middleware-helpers.ts`
- **Detail:** Non-UUID strings cause opaque Postgres `::uuid` cast errors (500s) instead of clean validation errors.
- **Fix:** Add UUID format regex check before the raw SQL call, return a 401/403.

### 12. `update_job_stage` silently swallows "job not found"
- **Source:** blind+edge
- **Severity:** MEDIUM
- **File:** `apps/worker/job_status.py` (lines 53-56)
- **Detail:** Logs error and returns `None` on both success and failure. Caller can't distinguish. A deleted statement cascading to job_status mid-processing would silently lose status updates.
- **Fix:** Raise an exception or return a boolean.

### 13. `update_job_stage` doesn't clear `error_message` on non-FAILED transitions
- **Source:** edge
- **Severity:** MEDIUM
- **File:** `apps/worker/job_status.py` (lines 58-62)
- **Detail:** A retried job entering `READING` still shows the previous `error_message` from `FAILED`. Frontend displays stale error text alongside an active stage.
- **Fix:** Set `job.error_message = None` when transitioning to non-FAILED stages.

### 14. `get_job_status` may return enum object instead of plain string
- **Source:** edge
- **Severity:** MEDIUM
- **File:** `apps/worker/job_status.py` (line 92)
- **Detail:** `job.stage` could be a Python enum value depending on SQLAlchemy's enum resolution (related to finding #4), not a JSON-serializable string.
- **Fix:** Cast to `str(job.stage)` or use `.value` if enum.

### 15. RLS test only covers `transactions` and `statements` — not `correction_logs` or `job_status`
- **Source:** auditor
- **Severity:** LOW
- **File:** `apps/web/src/__tests__/rls-isolation.test.ts`
- **Detail:** AC2 specifies RLS on all 4 tables, but the test only validates 2. Partial coverage means a broken policy on `correction_logs` or `job_status` would not be caught.
- **Fix:** Add test assertions for `correction_logs` and `job_status` isolation.

---

## Defer

> Pre-existing issues or design concerns not actionable in this story.

### 16. `current_setting` returns empty string when GUC unset — uuid cast produces noisy error
- **Source:** blind+edge
- **Detail:** Fail-closed (safe — errors out instead of leaking data). Could use `COALESCE(..., '00000000-0000-0000-0000-000000000000')` for cleaner zero-row behavior, but current behavior is acceptable for a security boundary.

### 17. No stage transition ordering enforcement in `update_job_stage`
- **Source:** edge
- **Detail:** Nothing prevents transitions like `COMPLETE → QUEUED`. Worker is the only caller and will be properly implemented in Story 2.2.

### 18. `get_session` auto-commits on context exit — partial batch rollback risk
- **Source:** edge
- **Detail:** Design concern for multi-step operations. Current single-operation usage is fine. Revisit when worker job pipeline is implemented (Story 2.2).

### 19. `prisma.$transaction` default 5-second timeout may be short for large queries
- **Source:** edge
- **Detail:** Default is sufficient for current operations. Can be tuned when heavy queries are introduced in later stories.

---

## Rejected Findings (7)

These were classified as noise, false positives, or acceptable deviations:

- RLS test cleanup uses LIKE pattern — uses `@mint-test.invalid` domain, collision unlikely
- `database.py` imports from `config` module — file exists from Story 1-1, not in reviewed set
- `get_session` return type annotation is `Session` instead of `Generator` — cosmetic, `# type: ignore` used
- SQLAlchemy User model has more columns than spec prescribes — improvement over spec, not regression
- `Optional[int]` used instead of `int | None` — Python 3.9 compatibility, semantically equivalent
- `database.py` uses `@contextmanager` decorator not in spec — necessary for correct `with` usage, improvement
- `users` table has no RLS policy — by design; auth requires reading user records without RLS context

---

## Priority Actions Before Merge

1. **Finding #3 (CRITICAL):** Add `FORCE ROW LEVEL SECURITY` — without this, the entire RLS system is non-functional for the table owner.
2. **Finding #4 (HIGH):** Fix enum name casing — worker will crash at runtime.
3. **Finding #6 (HIGH):** Address hardcoded BYPASSRLS password in VCS.
4. **Finding #7 (HIGH):** Add `ALTER DEFAULT PRIVILEGES` for future table grants.
5. **Finding #5 (HIGH):** Add explicit `WITH CHECK` clauses for defense-in-depth.