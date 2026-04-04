# Code Review Report — Story 4-5: Month Navigation & Multi-Month Trend Chart

**Date:** 2026-04-03
**Reviewer model:** claude-opus-4-6
**Review mode:** Full (with spec)
**Spec file:** `_bmad-output/implementation-artifacts/4-5-month-navigation-and-multi-month-trend-chart.md`
**Scope:** 4 files (3 created, 1 modified), ~280 lines

**Review layers:**
- Blind Hunter (adversarial, no context)
- Edge Case Hunter (boundary analysis, project access)
- Acceptance Auditor (spec compliance)

---

## Summary

| Category   | Count |
|------------|-------|
| Patch      | **4** |
| Defer      | **1** |
| Rejected   | **4** |

**Acceptance Auditor verdict:** All 5 ACs pass.

---

## Patch

> These are fixable code issues. Ordered by priority.

### 1. Trends API loads ALL user transactions into memory — no pagination or aggregation
- **Source:** blind+edge
- **Severity:** HIGH
- **File:** `apps/web/src/app/api/trends/route.ts:28-38`
- **Detail:** The trends query fetches every non-excluded positive transaction for the user with no limit or date range. For a user with 3 years of daily transactions (~5,000+ rows), this pulls all of them into Node.js memory, iterates in JavaScript to group by month/category, and serializes the full response. This will degrade as data grows and could timeout or OOM for power users.
- **Fix:** Use a database-level aggregation: `SELECT TO_CHAR(date, 'YYYY-MM') as month, category, SUM(amount) as total FROM transactions WHERE ... GROUP BY month, category ORDER BY month ASC`. This is a single query returning ~50-100 rows instead of thousands.

### 2. MonthNavigator crashes when `month` is not in `availableMonths`
- **Source:** blind+edge
- **Severity:** MEDIUM
- **File:** `apps/web/src/components/month-navigator.tsx:26`
- **Detail:** `availableMonths.indexOf(month)` returns `-1` when the month isn't found. Then `canGoPrev` = `(-1 < length-1)` = `true`. Pressing the Prev button accesses `availableMonths[0]` — which is the most recent month, not the previous one. The parent (`DashboardClient`) mitigates this by prepending `month` to `navigatorMonths` if not present (line 156-161), but if that guard is ever removed or the component is reused elsewhere, it breaks.
- **Fix:** Add a guard: `if (currentIdx === -1) return;` or disable both buttons when month isn't found.

### 3. `useEffect` for URL sync has missing dependency
- **Source:** blind+edge
- **Severity:** LOW
- **File:** `apps/web/src/app/(app)/dashboard/_components/dashboard-client.tsx:88-93`
- **Detail:** The `useEffect` that syncs `urlMonth → month` state references `month` in its condition (`urlMonth !== month`) but `month` is not in the dependency array. The eslint-disable comment confirms this was intentional, but the stale closure means: if `month` changes via `setMonth` and then the user navigates back in browser history, the effect may not fire because it still sees the old `month` value.
- **Fix:** Add `month` to the dependency array. The condition `urlMonth !== month` already guards against unnecessary updates.

### 4. Arrow key navigation fires during popover/modal focus
- **Source:** edge
- **Severity:** LOW
- **File:** `apps/web/src/components/month-navigator.tsx:40-48`
- **Detail:** The global keydown listener skips `HTMLInputElement` and `HTMLTextAreaElement`, but doesn't skip other focusable elements like the CategoryPickerPopover (which uses arrow keys for navigation), `<select>` elements, or `contentEditable` elements. Pressing ArrowLeft/Right while the category picker is open would both navigate the picker options AND change the month.
- **Fix:** Add checks for additional interactive elements: `if (e.target instanceof HTMLSelectElement) return;` and `if ((e.target as HTMLElement)?.closest('[role="listbox"]')) return;`. Or only listen when the navigator itself has focus.

---

## Defer

> Pre-existing issues surfaced by this review (not caused by current changes).

### 1. `availableMonths` sort order is implicitly relied upon
- **Source:** blind
- **Detail:** `MonthNavigator` assumes `availableMonths` is sorted descending (newest first) — index 0 = most recent. This contract is implicit. The `/api/months` route returns months sorted descending, but if any other caller provides months in a different order, navigation breaks silently. Pre-existing API contract issue.

---

**4** patch, **0** intent_gap, **0** bad_spec, **1** defer findings. **4** findings rejected as noise.

---

## Priority Actions

1. **Patch #1** (trends API unbounded query) — Performance time bomb; fix with database aggregation
2. **Patch #2** (navigator index -1) — Defensive guard prevents unexpected navigation
3. **Patch #4** (arrow key conflicts) — Keyboard conflict with category picker

These can be addressed in a follow-up implementation pass or manually.
