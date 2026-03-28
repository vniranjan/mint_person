# Code Review Report — Story 2-4: Duplicate Transaction Detection

**Date:** 2026-03-27
**Reviewer model:** claude-opus-4-6
**Review mode:** Full (with spec)
**Spec file:** `_bmad-output/implementation-artifacts/2-4-duplicate-transaction-detection.md`
**Scope:** 4 files (1 created, 3 modified), ~80 lines

**Review layers:**
- Blind Hunter (adversarial, no context)
- Edge Case Hunter (boundary analysis, project access)
- Acceptance Auditor (spec compliance)

---

## Summary

| Category   | Count |
|------------|-------|
| Patch      | **5** |
| Defer      | **5** |
| Rejected   | **5** |

**Acceptance Auditor verdict:** AC1 PASS, AC2 PASS, AC3 PASS, AC4 PASS, AC5 PASS. All acceptance criteria met. Structural deviation: `dedup.py` module not created (logic inlined in `worker.py`).

---

## Patch

> These are fixable code issues. Ordered by priority.

### 1. Tests completely missing — Task 6 not implemented
- **Source:** acceptance
- **Severity:** HIGH
- **File:** `apps/worker/tests/test_dedup.py` (missing)
- **Detail:** Task 6 requires `test_dedup.py` with 5 specific test cases: (1) first insert returns `is_duplicate=False`, (2) identical transaction in same session returns `is_duplicate=True`, (3) same merchant/amount different day returns `False`, (4) same day/amount different merchant returns `False`, (5) same everything different user returns `False`. None of these tests exist. Definition of Done states "All 5 dedup test cases pass."
- **Fix:** Create `apps/worker/tests/test_dedup.py` with the 5 specified test cases. Since `_is_duplicate` is a private function in `worker.py`, either make it importable or test through the public `process_statement_job` function.

### 2. `dedup.py` module not created — logic inlined as private function
- **Source:** acceptance
- **Severity:** MEDIUM
- **File:** `apps/worker/dedup.py` (missing), `apps/worker/worker.py` (lines 112–126)
- **Detail:** Task 4 specifies creating `apps/worker/dedup.py` with a public `is_duplicate_transaction(db, user_id, date, amount, merchant_raw)` function. The implementation inlines the logic as `_is_duplicate()` (private, prefixed with underscore) inside `worker.py`. This changes the public API surface — other modules can't import and reuse the dedup logic. The spec's `worker.py` integration (Task 5) says `from dedup import is_duplicate_transaction`.
- **Fix:** Extract `_is_duplicate` to `apps/worker/dedup.py` as `is_duplicate_transaction()` (public function). Import it in `worker.py`. This also makes the function testable without importing the entire worker module.

### 3. Intra-batch duplicates never detected — `autoflush=False` confirmed
- **Source:** edge
- **Severity:** HIGH
- **File:** `apps/worker/worker.py` (lines 188–204), `apps/worker/database.py` (line 27)
- **Detail:** `_is_duplicate()` queries the database for existing matches. However, `database.py` line 27 configures `SessionLocal = sessionmaker(autocommit=False, autoflush=False, ...)`. With `autoflush=False`, `db.add(txn)` stages objects in memory but does NOT write them to the database. The subsequent `_is_duplicate()` call in the next loop iteration runs a SQL SELECT that cannot see the just-added row. If a CSV file contains two identical rows (same date, amount, merchant), both are inserted with `is_duplicate=False`. Only a *second* upload of the same file would flag them as duplicates (because the first upload's rows are committed by then).
- **Fix:** Either (a) call `db.flush()` after each `db.add(txn)` so subsequent queries see the just-added rows, or (b) maintain an in-memory set of `(date, amount, merchant_raw)` tuples for the current batch and check against it before querying the DB.

### 4. Merchant comparison is case-sensitive and whitespace-sensitive — cross-statement duplicates missed
- **Source:** edge
- **Severity:** MEDIUM
- **File:** `apps/worker/worker.py` (lines 119–126)
- **Detail:** The duplicate check compares `Transaction.merchant_raw == merchant_raw` as an exact string match. Different banks (or different statement periods from the same bank) may format the same merchant differently: `"AMAZON.COM"` vs `"Amazon.com"` vs `"AMAZON.COM "` (trailing space). A user uploading a January statement and a February statement from the same bank where a recurring charge appears on both will NOT be flagged as duplicate if there is any casing or whitespace variance in the raw merchant name.
- **Fix:** Either (a) use case-insensitive comparison via `func.lower(Transaction.merchant_raw) == func.lower(merchant_raw)`, or (b) compare on `merchant_norm` instead of `merchant_raw` since the system already computes a normalized merchant name.

### 5. `_is_duplicate` function parameter type mismatch — expects `datetime`, receives `date`
- **Source:** edge
- **Severity:** LOW
- **File:** `apps/worker/worker.py` (lines 112, 117, 189, 202)
- **Detail:** `_is_duplicate` declares `txn_date: datetime` (line 112) but the caller passes `datetime.combine(t.date, datetime.min.time())` (line 189) which produces a `datetime`. Inside `_is_duplicate`, line 117 calls `txn_date.replace(hour=0, minute=0, second=0, microsecond=0)` — this works on a `datetime` but is redundant since the input is already midnight from `datetime.combine(..., datetime.min.time())`. The spec's `dedup.py` accepts `txn_date: date_type` (a `date` object) and does `datetime.combine(txn_date, datetime.min.time())` inside. The current code works but the type annotation is misleading and the `replace()` call is unnecessary.
- **Fix:** Accept `date` type and do the `datetime.combine` inside `_is_duplicate`, matching the spec's function signature.

---

## Defer

> Pre-existing issues or design concerns not actionable in this story.

### 6. Race condition on concurrent uploads for the same user
- **Source:** blind+edge
- **Detail:** If two uploads for the same user process simultaneously (e.g., multiple workers or manual queue replay), both `_is_duplicate()` queries execute concurrently. Each sees only previously committed transactions, not the other upload's uncommitted batch. Both uploads' transactions are marked as non-duplicate, then both commit — resulting in actual duplicates marked `isDuplicate=false`. The Dev Agent Record acknowledges this: "atomic in the context of single-worker processing." Requires a serializable transaction isolation level or a pre-commit uniqueness check.

### 7. False positive risk for legitimate same-day identical transactions
- **Source:** edge
- **Detail:** The duplicate key is `(userId, date, amount, merchantRaw)`. Two genuine visits to the same merchant on the same day for the same amount (e.g., two $5.75 coffees at Starbucks) are flagged as duplicates. This is acknowledged in the spec as a known tradeoff — duplicates are inserted (not dropped) so users can review and unflag them. A more precise key would include time-of-day or reference number, but these aren't consistently available across banks.

### 8. No index on the duplicate detection query columns
- **Source:** blind
- **Detail:** `_is_duplicate` queries `Transaction` by `(user_id, date range, amount, merchant_raw)`. There is no composite index on these columns. For users with thousands of transactions, this becomes a sequential scan. A composite index on `(userId, date, amount, merchantRaw)` would make the lookup efficient.

### 9. Migration file hand-written instead of generated by Prisma CLI
- **Source:** edge
- **Detail:** The migration at `20260327000003_add_transaction_is_duplicate/migration.sql` is hand-written SQL. Prisma's migration engine may not recognize it as a valid migration if the `_prisma_migrations` table doesn't have a matching entry. Running `prisma migrate deploy` in production requires the migration to be registered. This depends on how migrations are applied — if using raw SQL, it works; if using Prisma CLI, the migration lock file may need updating.

---

## Rejected Findings (5)

These were classified as noise, false positives, intentional design decisions, or negligible deviations:

- Duplicate detection uses `.first()` instead of `.exists()` — `.first()` with `LIMIT 1` is functionally equivalent; `.exists()` would be marginally more efficient but the difference is negligible
- `is_duplicate` column has `server_default="false"` but also passed explicitly — explicit is better than relying on defaults; no conflict
- No UI indication of duplicate status — out of scope for this story; Epic 4 transaction table will display duplicate badges
- Transaction `id` generated as `uuid.uuid4()` instead of CUID — worker uses UUID consistently; Prisma uses CUID on TypeScript side; both are valid unique identifiers in the same column
- `_is_duplicate` doesn't exclude the current statement's transactions — by design; if the same CSV is uploaded twice, the second upload correctly detects duplicates from the first upload's committed transactions

---

## Priority Actions Before Merge

1. **Finding #1 (HIGH):** Create `test_dedup.py` with the 5 specified test cases.
2. **Finding #3 (HIGH):** Fix intra-batch duplicate detection — add `db.flush()` after each `db.add()` or use in-memory tracking set.
3. **Finding #2 (MEDIUM):** Extract duplicate detection to `dedup.py` module per spec.
4. **Finding #4 (MEDIUM):** Use case-insensitive or normalized merchant comparison for cross-statement dedup accuracy.