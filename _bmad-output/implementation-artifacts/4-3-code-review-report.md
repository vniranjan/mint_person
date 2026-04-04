# Code Review Report — Story 4-3: Filterable Transaction Table

**Date:** 2026-04-03
**Reviewer model:** claude-opus-4-6
**Review mode:** Full (with spec)
**Spec file:** `_bmad-output/implementation-artifacts/4-3-filterable-transaction-table.md`
**Scope:** 3 files (2 created, 1 modified), ~200 lines

**Review layers:**
- Blind Hunter (adversarial, no context)
- Edge Case Hunter (boundary analysis, project access)
- Acceptance Auditor (spec compliance)

---

## Summary

| Category   | Count |
|------------|-------|
| Patch      | **3** |
| Defer      | **0** |
| Rejected   | **3** |

**Acceptance Auditor verdict:** 4 of 5 ACs pass. AC1 PARTIAL (tabular-nums on amount cells unverifiable in table header, though TransactionRow applies it).

---

## Patch

> These are fixable code issues. Ordered by priority.

### 1. "Clear search" button clears category filter instead of search query
- **Source:** blind+auditor
- **Severity:** HIGH
- **File:** `apps/web/src/components/transaction-table.tsx:81`
- **Detail:** When search returns no results, the "Clear search" button calls `onCategoryChange(null)` which resets the category filter — but does nothing to clear the search text. The user clicks "Clear search" and nothing visible happens. This is a UX bug that makes the empty state action non-functional.
- **Fix:** Add an `onSearchClear` callback prop to `TransactionTable` and wire it to the button. In the parent, this should call `setSearchQuery(""); setDebouncedSearch("");`.

### 2. Client-side amount search comparison never matches partial input
- **Source:** blind+edge
- **Severity:** MEDIUM
- **File:** `apps/web/src/components/transaction-table.tsx:56-57`
- **Detail:** The filter compares `parseFloat(t.amount).toFixed(2) === searchQuery.trim()`. If the user searches `"100"`, the amount is `"100.00"` — no match. If the user searches `"42.5"`, the amount is `"42.50"` — no match. Only exact string-for-string matches work (e.g., `"42.50"` matches `"42.50"`). This is inconsistent with the server-side search API which uses `parseFloat` comparison (e.g., `42.5 === 42.50` works numerically). The client-side filter is stricter than the server-side search.
- **Fix:** Use numeric comparison: `const searchNum = parseFloat(q); const amountNum = parseFloat(t.amount); return merchant.includes(q) || (!isNaN(searchNum) && amountNum === searchNum);`

### 3. Client-side filter applied on top of server search results creates double-filtering
- **Source:** edge
- **Severity:** LOW
- **File:** `apps/web/src/components/transaction-table.tsx:52-58`, `apps/web/src/app/(app)/dashboard/_components/dashboard-client.tsx:132`
- **Detail:** When `debouncedSearch` is active, `displayTransactions` is set to server search results. Then `TransactionTable` applies the client-side `searchQuery` filter again on top. This means the same search term is applied twice: once by the server (broad match on merchantNorm + merchantRaw + amount) and once by the client (narrower match on merchantNorm only + different amount comparison). The client filter can incorrectly exclude valid server matches (e.g., a match on `merchantRaw` that doesn't appear in `merchantNorm`).
- **Fix:** When server search is active, skip the client-side search filter. Only apply the category filter client-side: `if (searchQuery.trim() && !isServerSearch) { ... }`. Or remove the client-side search filter entirely since the server already handles it.

---

**3** patch, **0** intent_gap, **0** bad_spec, **0** defer findings. **3** findings rejected as noise.

---

## Priority Actions

1. **Patch #1** (Clear search button) — Broken UX; user cannot clear search from empty state
2. **Patch #2** (amount match) — Partial amount inputs won't match; inconsistent with server
3. **Patch #3** (double filtering) — Server matches can be incorrectly excluded by client filter

These can be addressed in a follow-up implementation pass or manually.
