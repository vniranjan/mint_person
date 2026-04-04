# Code Review Report — Story 4-1: Monthly Summary API & KPI Dashboard Strip

**Date:** 2026-04-03
**Reviewer model:** claude-opus-4-6
**Review mode:** Full (with spec)
**Spec file:** `_bmad-output/implementation-artifacts/4-1-monthly-summary-api-and-kpi-dashboard-strip.md`
**Scope:** 3 files (0 created, 3 modified), ~250 lines

**Review layers:**
- Blind Hunter (adversarial, no context)
- Edge Case Hunter (boundary analysis, project access)
- Acceptance Auditor (spec compliance)

---

## Summary

| Category   | Count |
|------------|-------|
| Patch      | **5** |
| Defer      | **1** |
| Rejected   | **4** |

**Acceptance Auditor verdict:** 4 of 5 ACs pass. AC3 PARTIAL (loading state shows skeletons instead of zeros/dashes).

---

## Patch

> These are fixable code issues. Ordered by priority.

### 1. Duplicated `fetchSummary` function will silently diverge
- **Source:** blind+auditor
- **Severity:** MEDIUM
- **Files:** `apps/web/src/components/summary-strip.tsx:12-17`, `apps/web/src/hooks/use-month-summary.ts:4-9`
- **Detail:** The identical `fetchSummary` function is defined in both files. `SummaryStrip` uses its own inline copy while `DashboardClient` uses the `useMonthSummary` hook. Both produce the same TanStack Query key `["summary", month]`, so they share a cache — but if one is updated (e.g., error handling, response shape change) and the other is not, they diverge silently. This is a maintenance trap.
- **Fix:** Remove the inline `fetchSummary` and `useQuery` from `SummaryStrip`. Have it accept `data` and `isLoading` as props (already available from `useMonthSummary` in the parent), or import and use the hook directly.

### 2. `vsLastMonth` shows red for +0.0% (flat spending)
- **Source:** blind
- **Severity:** LOW
- **File:** `apps/web/src/components/summary-strip.tsx:79-82`
- **Detail:** `+0.0%` starts with `+` so it renders in `text-red-600`, implying spending increased when it stayed flat. Semantically misleading.
- **Fix:** Add a zero check: `pct.abs().lt(0.05) ? "text-stone-500" : data.vsLastMonth.startsWith("+") ? "text-red-600" : "text-emerald-600"`. Or treat the `+0.0%` case as neutral.

### 3. Percentage rounding can sum to >100% or <100%
- **Source:** edge
- **Severity:** LOW
- **File:** `apps/web/src/app/api/summary/[month]/route.ts:109-110`
- **Detail:** Each category's percentage is `Math.round(total / totalSpent * 100)`. With 3 categories at 33.33% each, the sum would be 99%. With certain distributions, it can exceed 100%. The bar chart tooltip and KPI strip display these percentages directly.
- **Fix:** After computing `byCategory`, normalize by adjusting the largest category's `pct` to make the sum exactly 100. Common pattern for displayed percentages.

### 4. `Intl.NumberFormat` instantiated on every render
- **Source:** blind
- **Severity:** LOW
- **File:** `apps/web/src/components/summary-strip.tsx:45`, `apps/web/src/components/spending-bar-chart.tsx:24,49`
- **Detail:** `new Intl.NumberFormat(...)` is constructed inside the render body on every render. `NumberFormat` construction involves locale resolution and is non-trivial.
- **Fix:** Hoist to module-level constant: `const currencyFmt = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });`

### 5. Large prior-month delta percentages not capped
- **Source:** edge
- **Severity:** LOW
- **File:** `apps/web/src/app/api/summary/[month]/route.ts:93-95`
- **Detail:** If prior total is $0.01 and current is $500, `vsLastMonth` = `"+4999900.0%"`. Extreme percentages render poorly in the KPI card and overflow the layout.
- **Fix:** Cap at a reasonable bound: `const capped = pct.gt(999) ? new Decimal(999) : pct.lt(-99) ? new Decimal(-99) : pct;` and append `"+"` as appropriate.

---

## Defer

> Pre-existing issues surfaced by this review (not caused by current changes).

### 1. `formatMonthLabel` uses local timezone, not UTC
- **Source:** blind+edge
- **Detail:** `new Date(parseInt(year!), parseInt(mon!) - 1, 1)` creates a local-timezone Date. All server-side date handling uses UTC. In negative-offset timezones (e.g., UTC-8), this can shift to the prior month's label. Affects `spending-bar-chart.tsx` and `month-navigator.tsx`. Pre-existing pattern across components.

---

**5** patch, **0** intent_gap, **0** bad_spec, **1** defer findings. **4** findings rejected as noise.

---

## Priority Actions

1. **Patch #1** (fetchSummary duplication) — Maintenance trap; trivial to deduplicate
2. **Patch #5** (delta cap) — Prevents layout overflow on edge-case data
3. **Patch #2** (zero coloring) — Quick conditional fix

These can be addressed in a follow-up implementation pass or manually.
