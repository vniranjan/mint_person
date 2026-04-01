# Code Review Report — Story 3-2: Default Category Taxonomy & Flagged Transaction Review Queue

**Date:** 2026-03-30
**Reviewer model:** claude-opus-4-6
**Review mode:** Full (with spec)
**Spec file:** `_bmad-output/implementation-artifacts/3-2-default-category-taxonomy-and-flagged-transaction-review-queue.md`
**Scope:** 8 files (6 created, 2 modified), ~500 lines

**Review layers:**
- Blind Hunter (adversarial, no context)
- Edge Case Hunter (boundary analysis, project access)
- Acceptance Auditor (spec compliance)

---

## Summary

| Category   | Count |
|------------|-------|
| Patch      | **4** |
| Defer      | **2** |
| Rejected   | **6** |

**Acceptance Auditor verdict:** 5 of 7 ACs pass. AC1 PARTIAL (custom Tailwind tokens may be purged). AC4 PARTIAL (tooltip text is generic). AC7 PARTIAL (same custom token issue as AC1).

---

## Patch

> These are fixable code issues. Ordered by priority.

### 1. Custom Tailwind color tokens may be purged in production builds
- **Source:** auditor+edge
- **Severity:** HIGH
- **File:** `apps/web/src/components/category-badge.tsx`, `apps/web/src/app/api/categories/route.ts`
- **Detail:** The category color system uses dynamic class names like `bg-category-groceries-bg` and `text-category-groceries-text`. These are constructed at runtime via string interpolation and are not present in any source file as complete string literals. Tailwind's JIT compiler scans source files for class names — dynamically constructed classes won't be detected and will be purged from the production CSS bundle, resulting in unstyled badges.
- **Fix:** Either (a) add a `safelist` entry in `tailwind.config.ts` for all `bg-category-*` and `text-category-*` patterns, or (b) use a static mapping object where each complete class string appears as a literal (e.g., `{ Groceries: "bg-green-50 text-green-700" }`).

### 2. Flagged transaction tooltip shows generic text instead of specific reason
- **Source:** auditor
- **Severity:** MEDIUM
- **File:** `apps/web/src/components/review-queue.tsx` (`getReasonText()`)
- **Detail:** AC4 requires: "Tooltip or subtitle on each row showing reason for flagging: 'Low confidence (52 %)' or 'Matched keyword: walmart (rule-based fallback)'." The implementation returns a generic string `"Matched keyword (rule-based fallback)"` for all rule-based transactions without including the specific keyword name, and for low-confidence LLM results it shows `"Low confidence ({pct}%)"` but the percentage formatting is correct. The keyword-specific text is missing.
- **Fix:** The worker would need to store the matched keyword in a field (e.g., `flagReason`) on the transaction, or the review queue needs access to the raw merchant name to infer the keyword. Short-term: update `getReasonText()` to include merchant name context. Long-term: add a `flagReason` column.

### 3. `isFlagged` never cleared — review queue shows already-reviewed transactions
- **Source:** edge
- **Severity:** MEDIUM
- **File:** `apps/web/src/app/api/transactions/[id]/route.ts`
- **Detail:** When a user corrects a category via PATCH, `isReviewed` is set to `true` but `isFlagged` remains `true`. The transactions query with `flagged=true` filter checks `isFlagged: true` and `isReviewed: false`. This works correctly for filtering, but the `isFlagged` field accumulates stale `true` values forever. If the query logic ever changes, or if `isFlagged` is used elsewhere without the `isReviewed` guard, these stale flags become bugs.
- **Fix:** Set `isFlagged: false` in the PATCH handler when a category correction is applied, alongside setting `isReviewed: true`. This keeps the data clean.

### 4. Invalid month values accepted by transactions query
- **Source:** edge
- **Severity:** LOW
- **File:** `apps/web/src/app/api/transactions/route.ts`
- **Detail:** The month parameter is validated with regex `/^\d{4}-\d{2}$/` which accepts invalid months like `2025-13` or `2025-00`. These produce invalid Date objects (`new Date("2025-13-01")` → `Invalid Date`), which Prisma may reject or silently mishandle.
- **Fix:** After regex validation, parse the month/year integers and check `month >= 1 && month <= 12`.

---

## Defer

> Pre-existing issues surfaced by this review (not caused by current changes).

### 1. `null` vs `"Uncategorized"` category inconsistency
- **Source:** edge
- **Detail:** The Prisma schema defines `category String?` (nullable), but various code paths treat `null` and `"Uncategorized"` interchangeably. The categories API doesn't include `"Uncategorized"` as a valid category. The CategoryBadge renders `null` as `"Uncategorized"`. This inconsistency spans multiple stories and should be resolved holistically. Flagged in Story 2-2 review as well.

### 2. `/api/categories` has no auth check
- **Source:** edge
- **Detail:** The categories endpoint returns a static list and doesn't use `withRLS`. This is technically fine since the data is non-sensitive and identical for all users, but it's inconsistent with other API routes. Low priority.

---

**4** patch, **0** intent_gap, **0** bad_spec, **2** defer findings. **6** findings rejected as noise.

---

## Priority Actions

1. **Patch #1** (Tailwind purge) — Badges will be unstyled in production. Must fix before deploy.
2. **Patch #3** (isFlagged not cleared) — Data hygiene issue that compounds over time
3. **Patch #2** (generic tooltip) — UX gap vs spec; consider adding `flagReason` column in a future story
4. **Patch #4** (month validation) — Quick guard, prevents edge-case errors

These can be addressed in a follow-up implementation pass or manually.
