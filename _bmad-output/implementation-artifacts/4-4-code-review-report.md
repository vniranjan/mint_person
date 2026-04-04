# Code Review Report — Story 4-4: Transaction Search

**Date:** 2026-04-03
**Reviewer model:** claude-opus-4-6
**Review mode:** Full (with spec)
**Spec file:** `_bmad-output/implementation-artifacts/4-4-transaction-search.md`
**Scope:** 3 files (2 created, 1 modified), ~170 lines

**Review layers:**
- Blind Hunter (adversarial, no context)
- Edge Case Hunter (boundary analysis, project access)
- Acceptance Auditor (spec compliance)

---

## Summary

| Category   | Count |
|------------|-------|
| Patch      | **3** |
| Defer      | **1** |
| Rejected   | **4** |

**Acceptance Auditor verdict:** 4 of 5 ACs pass. AC4 PARTIAL (Clear search button wired to wrong handler — see Story 4-3 Patch #1).

---

## Patch

> These are fixable code issues. Ordered by priority.

### 1. Search API has no result limit — single-char queries return unbounded rows
- **Source:** blind
- **Severity:** MEDIUM
- **File:** `apps/web/src/app/api/transactions/search/route.ts:36-66`
- **Detail:** A query like `q=a` with no month filter returns every transaction with "a" in the merchant name — potentially thousands of rows. No `take` limit is applied. This can cause large JSON payloads, slow responses, and client-side rendering issues.
- **Fix:** Add `take: 100` (or similar) to the Prisma `findMany` call. Optionally require `q.length >= 2` to prevent single-char searches.

### 2. SearchInput fires `onChange` on mount with initial value
- **Source:** blind
- **Severity:** LOW
- **File:** `apps/web/src/components/search-input.tsx:25-29`
- **Detail:** The debounce `useEffect` runs on mount with `localValue` = `value` (the prop). After 300ms, it calls `onChange(value)` — a redundant callback that the parent already knows about (it set the value). If `onChange` triggers state updates or API fetches, this causes an unnecessary render cycle and wasted API call on initial render.
- **Fix:** Track whether the user has typed with a ref: `const hasTyped = useRef(false)`. Only call `onChange` when `hasTyped.current` is true. Set it in the input's `onChange` handler.

### 3. Search results race condition on month change
- **Source:** edge
- **Severity:** LOW
- **File:** `apps/web/src/app/(app)/dashboard/_components/dashboard-client.tsx:116-129`
- **Detail:** If the user has an active search, then switches months, the search query fires for the new month. But TanStack Query's key includes `[month, debouncedSearch]`, so stale results from the old month are immediately discarded and a new fetch is triggered. This is actually handled correctly by TanStack Query's keying — but there's a brief window where `searchResults` is `undefined` (old key invalidated, new key loading) and `displayTransactions` falls through to `[]` instead of the full transaction list. This causes a brief flash of empty state.
- **Fix:** Clear `debouncedSearch` when month changes (already done in `setMonth` at line 79). The flash only occurs if `setMonth` and the search query aren't cleared atomically. Verify React batching handles this.

---

## Defer

> Pre-existing issues surfaced by this review (not caused by current changes).

### 1. Search API does not exclude `isExcluded` transactions
- **Source:** edge
- **Detail:** The search route does not add `isExcluded: false` to its where clause. Excluded transactions appear in search results even though they are filtered from the summary. This may be intentional (excluded rows are visible in the transaction list per Story 3-5 AC4) but is inconsistent with the summary API behavior.

---

**3** patch, **0** intent_gap, **0** bad_spec, **1** defer findings. **4** findings rejected as noise.

---

## Priority Actions

1. **Patch #1** (unbounded search) — Add `take` limit to prevent large payloads
2. **Patch #2** (mount fire) — Prevents wasted API call on initial render
3. **Patch #3** (race condition) — Minor; verify React batching covers the gap

These can be addressed in a follow-up implementation pass or manually.
