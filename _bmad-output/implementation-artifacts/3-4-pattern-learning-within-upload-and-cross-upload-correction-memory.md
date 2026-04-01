# Story 3.4: Pattern Learning — Within-Upload & Cross-Upload Correction Memory

**Status:** review
**Epic:** 3 — AI Categorization, Review & Correction Learning
**Created:** 2026-03-30

---

## Story

As a user, I want my corrections to automatically apply to similar merchants in the same upload and to all future uploads, so that the categorization gets demonstrably smarter over time and the review pass shortens with each statement.

---

## Acceptance Criteria

**AC1 — Cross-upload injection**: Before calling `categorize_transactions()`, the worker queries `correction_logs` for the current user and passes the list as `user_correction_log` to the categorizer. The Jinja2 system prompt already accepts `correction_examples` — pass the list directly. Matching transactions receive `confidence=0.95` and `is_flagged=False`.

**AC2 — Within-upload pattern application**: After categorization + DB write, the worker scans all transactions in the current batch. For each transaction that matches a correction pattern (normalized merchant prefix match ≥ 3 chars), apply the corrected category, set `confidence=0.95`, `is_flagged=False`. Track `(merchant_prefix, category)` pairs from all correction log entries. Update the DB rows in a single pass.

**AC3 — "Also applied" annotation**: The `Transaction` row gets a nullable `patternAppliedNote` string column: `"Also applied to N similar merchants"` written when N > 0 similar transactions in the same upload were auto-corrected. This note is displayed in the ReviewQueue and transaction list below the corrected row (text-xs).

**AC4 — Few-shot examples in system prompt**: `categorize_system.yaml` already has `{% for example in correction_examples %}` template. Passing the correction log populates these examples at categorization time. No code changes to prompt YAML needed — only the Python caller must pass the data.

**AC5 — RLS bypass for correction log**: The worker connects as `worker_role` (BYPASSRLS). The correction log query must use the user's `user_id` as a filter — only that user's corrections are injected (never another user's).

**AC6 — Cross-upload test**: `pytest tests/test_pattern_learning.py` passes. Tests: correction log entry causes matching transaction to get confidence=0.95, within-upload pattern applies to all matching merchants, non-matching transactions unaffected.

---

## Tasks

- [ ] **Task 1: Wire `correction_logs` query into `worker.py`** (AC: 1, 5)
  - [ ] Before calling `categorize_transactions()`, query `correction_logs` for `user_id`
  - [ ] Build list: `[{"merchant_raw": row.merchant_pattern, "corrected_category": row.corrected_category}]`
  - [ ] Pass as `user_correction_log` to `categorize_transactions()`

- [ ] **Task 2: Apply correction log pre-categorization** (AC: 1, 4)
  - [ ] In `categorize_transactions()`, before calling LLM: check each transaction's `merchant_raw` (normalized) against correction log entries
  - [ ] Use `normalize_merchant()` on both sides for consistent comparison
  - [ ] If match found: set category=corrected_category, confidence=0.95, is_flagged=False — skip LLM for this transaction
  - [ ] Only send unmatched transactions to LLM batch

- [ ] **Task 3: Add `patternAppliedNote` to Prisma schema + SQLAlchemy model** (AC: 3)
  - [ ] Add `patternAppliedNote String?` to `Transaction` model in `schema.prisma`
  - [ ] Create migration: `npx prisma migrate dev --name add_transaction_pattern_note`
  - [ ] Add `pattern_applied_note = Column(String, nullable=True, name="patternAppliedNote")` to `Transaction` in `models.py`

- [ ] **Task 4: Within-upload pattern application in `worker.py`** (AC: 2, 3)
  - [ ] After initial categorization pass: for each transaction in batch, check if its `merchant_norm` prefix matches any correction log entry (prefix = first word(s) of normalized merchant, min 3 chars)
  - [ ] Group matching transactions; count N (number auto-corrected by pattern)
  - [ ] Update matching transactions: `category=corrected_category`, `confidence=0.95`, `is_flagged=False`
  - [ ] Set `pattern_applied_note = f"Also applied to {N} similar merchants"` on the *original* correction source transaction (if it exists in the same upload), or on the first matched transaction
  - [ ] Use `db.flush()` after bulk updates

- [ ] **Task 5: Display `patternAppliedNote` in ReviewQueue and TransactionRow** (AC: 3)
  - [ ] In `ReviewQueue` and `TransactionRow`: if `patternAppliedNote` is non-null, render it below the row in `text-xs text-stone-500`
  - [ ] No additional API changes needed — include `patternAppliedNote` in transaction API responses

- [ ] **Task 6: Tests** (AC: 6)
  - [ ] Create `apps/worker/tests/test_pattern_learning.py`
  - [ ] Test: correction log entry → matching transaction gets confidence=0.95, is_flagged=False
  - [ ] Test: within-upload pattern applies to all merchants with matching prefix
  - [ ] Test: non-matching transactions unaffected
  - [ ] Test: empty correction log → all transactions go through LLM normally
  - [ ] Test: correction log query uses user_id filter (assert query has user_id condition)

---

## Dev Notes

### Pre-categorization matching logic

```python
def _apply_correction_log(transactions, correction_log):
    """Apply exact merchant_norm matches from correction log before LLM call."""
    log_map = {
        normalize_merchant(entry["merchant_raw"]): entry["corrected_category"]
        for entry in correction_log
    }
    matched = []
    unmatched = []
    for txn in transactions:
        key = normalize_merchant(txn["merchant_raw"])
        if key in log_map:
            txn["category"] = log_map[key]
            txn["confidence"] = 0.95
            txn["is_flagged"] = False
            matched.append(txn)
        else:
            unmatched.append(txn)
    return matched, unmatched
```

### Within-upload prefix matching

For within-upload application, use the first word(s) of the normalized merchant (min 3 chars):
```python
def _merchant_prefix(name: str) -> str:
    """Return the first meaningful word(s) as a matching prefix."""
    parts = name.strip().split()
    return parts[0].lower() if parts else ""
```

Match if `_merchant_prefix(txn.merchant_norm)` equals `_merchant_prefix(correction_entry.merchant_pattern)` and prefix length >= 3.

### `correction_logs` query in worker

```python
from models import CorrectionLog
corrections = db.query(CorrectionLog).filter(
    CorrectionLog.user_id == user_id
).all()
user_correction_log = [
    {"merchant_raw": c.merchant_pattern, "corrected_category": c.corrected_category}
    for c in corrections
]
```

### `patternAppliedNote` column

This column is for display only — it's a snapshot written at upload time. It is not updated retroactively when new corrections are made.

---

## Dev Agent Record

**Implemented:** 2026-03-30

### Files created
- `apps/web/prisma/migrations/20260330000002_add_transaction_pattern_note/migration.sql` — Adds `patternAppliedNote TEXT` column
- `apps/worker/tests/test_pattern_learning.py` — 8 tests for `_apply_correction_log` and correction log injection

### Files modified
- `apps/worker/categorizer.py` — Added `normalize_merchant()` (moved here from worker.py to avoid circular import); added `_apply_correction_log()` for cross-upload pre-matching
- `apps/worker/worker.py` — Added `_merchant_prefix()`, within-upload pattern application block, `CorrectionLog` query before categorization; imports `normalize_merchant` from `categorizer`
- `apps/worker/models.py` — Added `pattern_applied_note` column to `Transaction`
- `apps/web/prisma/schema.prisma` — Added `patternAppliedNote String?` to Transaction model
- `apps/web/src/app/api/transactions/route.ts` — Added `patternAppliedNote: true` to select
- `apps/worker/tests/test_categorizer.py` — Updated `test_categorize_correction_log_injected_into_system_prompt` to use a non-matching transaction (pre-matching now bypasses LLM for matched merchants)
- `apps/worker/tests/test_models.py` — Updated `test_no_is_flagged_column` → `test_is_flagged_column` to reflect actual schema

### Notes
- `normalize_merchant` moved from `worker.py` to `categorizer.py` to break circular import (worker imports categorizer; categorizer cannot import worker)
- Within-upload prefix matching uses first word ≥3 chars to avoid false matches on short prefixes like "BP"
- `patternAppliedNote` is only set when N > 1 transaction shares the same prefix in one upload batch
