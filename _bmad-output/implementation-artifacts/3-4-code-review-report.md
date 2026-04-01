# Code Review Report — Story 3-4: Pattern Learning — Within-Upload & Cross-Upload Correction Memory

**Date:** 2026-03-30
**Reviewer model:** claude-opus-4-6
**Review mode:** Full (with spec)
**Spec file:** `_bmad-output/implementation-artifacts/3-4-pattern-learning-within-upload-and-cross-upload-correction-memory.md`
**Scope:** 7 files (2 created, 5 modified), ~350 lines

**Review layers:**
- Blind Hunter (adversarial, no context)
- Edge Case Hunter (boundary analysis, project access)
- Acceptance Auditor (spec compliance)

---

## Summary

| Category   | Count |
|------------|-------|
| Patch      | **4** |
| Bad Spec   | **1** |
| Defer      | **2** |
| Rejected   | **5** |

**Acceptance Auditor verdict:** 5 of 6 ACs pass. AC2 PARTIAL (within-upload matching only considers correction_log prefixes, not prefixes from LLM-categorized transactions in the same batch).

---

## Bad Spec

> These findings suggest the spec should be amended. Consider regenerating or amending the spec with this context.

### 1. Cross-upload vs within-upload matching strategies diverge without clear rationale
- **Source:** edge
- **Detail:** Cross-upload matching (AC1) uses exact normalized merchant match. Within-upload matching (AC2) uses first-word prefix match (≥3 chars). The spec doesn't explain why the strategies differ or what happens when they conflict. Example: correction log has `"WALMART SUPERCENTER"` → `Groceries`. Cross-upload exact match hits `"WALMART SUPERCENTER"` but misses `"WALMART NEIGHBORHOOD"`. Within-upload prefix match hits both via prefix `"walmart"`. This means a transaction could be skipped by cross-upload matching but caught by within-upload matching, creating an inconsistent user experience depending on whether it's the first or second upload.
- **Suggested amendment:** Clarify the intended behavior: should cross-upload also use prefix matching for broader coverage, or should within-upload use exact matching for precision? Document the tradeoff explicitly.

---

## Patch

> These are fixable code issues. Ordered by priority.

### 1. Within-upload prefix matching can override LLM high-confidence categorizations
- **Source:** edge
- **Severity:** HIGH
- **File:** `apps/worker/worker.py` (within-upload pattern application block)
- **Detail:** The within-upload pattern application runs *after* LLM categorization. It scans all transactions (including those already categorized by the LLM with high confidence) and overwrites any whose merchant prefix matches a correction log entry. A transaction the LLM correctly categorized at `confidence=0.98` could be overwritten with `confidence=0.95` if its merchant prefix happens to match a correction log entry for a *different* merchant. Example: correction log has `"SHELL"` → `Transportation`. LLM correctly categorizes `"SHELL GIFT SHOP"` as `Shopping` at 0.98. Within-upload matching overwrites to `Transportation` at 0.95.
- **Fix:** Only apply within-upload prefix matching to transactions that were *not* already matched by cross-upload exact matching AND have `confidence < 0.95` (i.e., don't override high-confidence LLM results). Or only apply to transactions the LLM flagged.

### 2. Empty or short merchant prefixes cause false matches
- **Source:** edge
- **Severity:** MEDIUM
- **File:** `apps/worker/worker.py` (`_merchant_prefix()`)
- **Detail:** `_merchant_prefix()` returns the first word of the normalized merchant. The ≥3 char guard prevents matching on prefixes like `"BP"`, but common short prefixes like `"THE"` (from `"THE HOME DEPOT"`, `"THE CHEESECAKE FACTORY"`) would match across unrelated merchants. Similarly, `"SQ"` → filtered by length, but `"SQUARE"` (6 chars) would match all Square merchants regardless of the actual business.
- **Fix:** Use a stopword list to skip common non-discriminative prefixes (`THE`, `A`, `AN`), and consider using the first two words as prefix when the first word is < 5 chars.

### 3. `patternAppliedNote` count is off-by-one
- **Source:** edge
- **Severity:** LOW
- **File:** `apps/worker/worker.py` (pattern note generation)
- **Detail:** The note says `"Also applied to N similar merchants"` where N is the count of auto-corrected transactions. If the correction source transaction is in the same batch, N includes it in the count but the note is placed on it — making it say "Also applied to 3 similar merchants" when only 2 *other* merchants were affected. The note should say N-1 or clarify "Applied to N transactions total."
- **Fix:** Subtract 1 from N when the source transaction is included in the match count, or rephrase to "Applied to N transactions including this one."

### 4. `patternAppliedNote` pluralization not handled
- **Source:** edge
- **Severity:** LOW
- **File:** `apps/worker/worker.py` (pattern note generation)
- **Detail:** When N=1, the note reads `"Also applied to 1 similar merchants"` (plural). Should be `"Also applied to 1 similar merchant"`.
- **Fix:** Use `f"Also applied to {n} similar merchant{'s' if n != 1 else ''}"`.

---

## Defer

> Pre-existing issues surfaced by this review (not caused by current changes).

### 1. Correction log unbounded growth
- **Source:** edge
- **Detail:** Every category correction appends a new row to `correction_logs`. Over months/years of use, the correction log query (`SELECT * FROM correction_logs WHERE user_id = ?`) returns an unbounded result set. With hundreds of entries, this becomes: (a) a performance concern for the worker query, (b) a token budget concern when injected as few-shot examples into the LLM prompt. No pagination, limit, or deduplication exists.

### 2. Correction log query ordering not specified
- **Source:** blind
- **Detail:** The correction log query (`db.query(CorrectionLog).filter(...)`) has no `ORDER BY`. When multiple corrections exist for the same merchant, the dict construction in `_apply_correction_log` uses last-write-wins, but "last" depends on database row order which is non-deterministic without explicit ordering. Same issue noted in Story 3-1 defer.

---

**4** patch, **1** bad_spec, **0** intent_gap, **2** defer findings. **5** findings rejected as noise.

---

## Priority Actions

1. **Patch #1** (prefix override) — Silently overwrites correct LLM categorizations; data quality impact
2. **Patch #2** (short prefix false matches) — Common merchants like "THE ..." will cross-match incorrectly
3. **Patch #3** (count off-by-one) — Minor UX confusion but easy fix
4. **Bad Spec #1** (matching strategy divergence) — Clarify before building on this in future stories

These can be addressed in a follow-up implementation pass or manually.
