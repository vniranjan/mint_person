# Code Review Report — Story 3-3: One-Click Category Correction

**Date:** 2026-03-30
**Reviewer model:** claude-opus-4-6
**Review mode:** Full (with spec)
**Spec file:** `_bmad-output/implementation-artifacts/3-3-one-click-category-correction.md`
**Scope:** 5 files (4 created, 1 modified), ~450 lines

**Review layers:**
- Blind Hunter (adversarial, no context)
- Edge Case Hunter (boundary analysis, project access)
- Acceptance Auditor (spec compliance)

---

## Summary

| Category   | Count |
|------------|-------|
| Patch      | **6** |
| Bad Spec   | **1** |
| Defer      | **2** |
| Rejected   | **7** |

**Acceptance Auditor verdict:** 5 of 7 ACs pass. AC2 PARTIAL (search input missing 300ms debounce). AC6 PARTIAL (corrected row uses `opacity-50` instead of spec's 80%, no fade animation).

---

## Bad Spec

> These findings suggest the spec should be amended. Consider regenerating or amending the spec with this context.

### 1. Spec says `null` category should block PATCH — but exclusion-only updates need no category
- **Source:** edge
- **Detail:** AC7 says the PATCH endpoint validates `category` against `VALID_CATEGORIES` and returns 400 for unknown categories. The implementation also validates when `category` is in the body. However, the same endpoint handles `isExcluded` updates (Story 3-5). If a request sends `{ "isExcluded": true }` without `category`, the current code skips category validation correctly. But if a request sends `{ "category": null, "isExcluded": true }`, the `null` category triggers the validation path and blocks the update. The spec doesn't address this interaction.
- **Suggested amendment:** Clarify that category validation only applies when `category` is a non-null string in the request body. `null` or absent `category` should skip validation.

---

## Patch

> These are fixable code issues. Ordered by priority.

### 1. Toast hook memory leak — listeners array grows without cleanup
- **Source:** blind
- **Severity:** HIGH
- **File:** `apps/web/src/hooks/use-toast.ts`
- **Detail:** Every `useToast()` mount pushes a new dispatch function into the module-level `listeners` array. The `useEffect` cleanup function calls `listeners = listeners.filter(l => l !== listener)` but `listener` is a new closure on every render, so the filter never matches the original reference. The array grows by one entry per mount per render cycle. On a page with 50 transaction rows each mounting `useToast`, listeners grows by 50 per render. Over time this causes: (a) memory leak, (b) stale dispatch calls to unmounted components, (c) performance degradation as every toast fans out to N dead listeners.
- **Fix:** Store the listener reference in a `useRef` so the cleanup filter matches the original function, or use a `Set` and `delete` the ref. Alternatively, use a React context pattern instead of module-level listeners.

### 2. Missing 300ms debounce on category picker search input
- **Source:** auditor
- **Severity:** MEDIUM
- **File:** `apps/web/src/components/category-picker-popover.tsx`
- **Detail:** AC2 requires: "Category list is searchable — filter-as-you-type with 300 ms debounce." The implementation filters on every keystroke with no debounce. With only 8 categories the performance impact is negligible, but the spec explicitly requires it.
- **Fix:** Add a `useDebounce` hook (or `setTimeout`/`clearTimeout` in a `useEffect`) with 300ms delay on the search input value before applying the filter.

### 3. `req.json()` not wrapped in try/catch
- **Source:** blind
- **Severity:** MEDIUM
- **File:** `apps/web/src/app/api/transactions/[id]/route.ts`
- **Detail:** If the request body is not valid JSON (e.g., empty body, malformed JSON), `req.json()` throws an unhandled error, resulting in a 500 response instead of a descriptive 400.
- **Fix:** Wrap `req.json()` in a try/catch and return `NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })`.

### 4. No runtime boolean validation on `isExcluded`
- **Source:** blind+edge
- **Severity:** LOW
- **File:** `apps/web/src/app/api/transactions/[id]/route.ts`
- **Detail:** The PATCH handler accepts `isExcluded` from the request body and passes it directly to Prisma without validating it's actually a boolean. A string like `"true"` or a number `1` would be passed through, potentially causing type errors or unexpected behavior in Prisma.
- **Fix:** Add `typeof body.isExcluded === "boolean"` check before using the value.

### 5. Corrected row uses `opacity-50` instead of spec's 80%
- **Source:** auditor
- **Severity:** LOW
- **File:** `apps/web/src/components/transaction-row.tsx` (line 115)
- **Detail:** AC6 says corrected rows should "dim to 80 % opacity." The implementation uses `opacity-50` (50%). This makes corrected rows harder to read than intended.
- **Fix:** Change `opacity-50` to `opacity-80`.

### 6. Dual dispatch systems in toast hook cause inconsistent state
- **Source:** blind
- **Severity:** LOW
- **File:** `apps/web/src/hooks/use-toast.ts`
- **Detail:** The hook uses both a module-level `moduleDispatch` singleton and per-instance React `useReducer` dispatch. When `toast()` is called, it dispatches to `moduleDispatch` (which points to whichever component last mounted) AND broadcasts to all `listeners`. Components that mounted before the current `moduleDispatch` owner receive the toast via listeners but not via their local reducer, leading to potential state desync.
- **Fix:** Choose one dispatch mechanism. Either use module-level state with listeners (remove useReducer) or use React context (remove module-level state). The current hybrid is the root cause of both the memory leak and the desync.

---

## Defer

> Pre-existing issues surfaced by this review (not caused by current changes).

### 1. Double-normalization in correction log flow
- **Source:** edge
- **Detail:** When a correction is saved via the PATCH endpoint, `merchantNorm` (already normalized by the worker) is stored as `merchant_pattern` in CorrectionLog. Later, `_apply_correction_log()` in the categorizer calls `normalize_merchant()` again on the correction log entries. If `normalize_merchant` is not idempotent (e.g., title-casing an already title-cased value), this could cause mismatches. Currently appears idempotent, but fragile.

### 2. Race condition on simultaneous category and exclusion mutations
- **Source:** edge
- **Detail:** `TransactionRow` has two independent mutations (correction and exclusion). If both fire simultaneously, the optimistic updates could conflict — each mutation's `onMutate` captures a snapshot that doesn't include the other's optimistic change. The `onError` rollback could restore stale data. Low probability in practice since both are user-initiated clicks.

---

**6** patch, **1** bad_spec, **0** intent_gap, **2** defer findings. **7** findings rejected as noise.

---

## Priority Actions

1. **Patch #1** (toast memory leak) — Active bug causing unbounded memory growth
2. **Patch #6** (dual dispatch) — Root cause of #1; fixing both together is recommended
3. **Patch #3** (req.json unhandled) — Prevents 500 errors on malformed requests
4. **Patch #2** (debounce) — Spec compliance; trivial to add

These can be addressed in a follow-up implementation pass or manually.
