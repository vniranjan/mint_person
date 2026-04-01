# Code Review Report — Story 3-5: Transaction Exclusion from Monthly Totals

**Date:** 2026-03-30
**Reviewer model:** claude-opus-4-6
**Review mode:** Full (with spec)
**Spec file:** `_bmad-output/implementation-artifacts/3-5-transaction-exclusion-from-monthly-totals.md`
**Scope:** 5 files (3 created, 2 modified), ~300 lines

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
| Rejected   | **5** |

**Acceptance Auditor verdict:** All 7 ACs pass.

---

## Patch

> These are fixable code issues. Ordered by priority.

### 1. CRITICAL — `params` not awaited in summary route (Next.js 15 breaking change)
- **Source:** blind
- **Severity:** CRITICAL
- **File:** `apps/web/src/app/api/summary/[month]/route.ts`
- **Detail:** The route handler types `params` as `{ params: { month: string } }` and accesses `params.month` synchronously. In Next.js 15, dynamic route `params` is a `Promise` that must be awaited: `const { month } = await params`. Without awaiting, `params.month` is `undefined`, causing the month validation to fail and the route to return 400 for every request. This means the SummaryStrip component shows no data.
- **Fix:** Change the handler signature to `{ params }: { params: Promise<{ month: string }> }` and add `const { month } = await params;` at the top of the handler. Check all other dynamic routes for the same pattern.

### 2. Negative amounts excluded from summary totals
- **Source:** edge
- **Severity:** MEDIUM
- **File:** `apps/web/src/app/api/summary/[month]/route.ts`
- **Detail:** The summary computation filters to `t.amount.gt(0)` (positive amounts only) for `totalSpent` and `byCategory`. This means refunds and credits (negative amounts) are excluded from the spending picture entirely. While this may be intentionally "total spent" (not "net spent"), a user who received a $500 refund in a $600 grocery month would see $600 spent on groceries instead of the net $100. The spec says "sum of positive amounts" so this matches intent, but users may find it confusing.
- **Fix:** This is by design per spec. Consider adding a `totalRefunds` field in a future iteration for transparency. No code change needed unless the product decision changes.

### 3. Raw SQL in months route may bypass RLS
- **Source:** blind
- **Severity:** MEDIUM
- **File:** `apps/web/src/app/api/months/route.ts`
- **Detail:** The route uses `prisma.$queryRaw` with `TO_CHAR(date, 'YYYY-MM')` inside a `withRLS` wrapper. Whether `$queryRaw` respects the RLS policies set by `withRLS` depends on the implementation of `withRLS`. If `withRLS` sets `SET LOCAL` variables that RLS policies reference, raw queries will respect them. If `withRLS` only uses Prisma's `where` clause injection, raw queries bypass the filter entirely, potentially returning months from other users' transactions.
- **Fix:** Verify that `withRLS` sets PostgreSQL session variables (e.g., `SET LOCAL app.current_user_id = ?`) that the RLS policy references. If it does, raw queries are safe. If it uses application-level filtering, add an explicit `WHERE "userId" = $1` clause to the raw query.

### 4. Dollar sign hardcoded in TransactionRow
- **Source:** edge
- **Severity:** LOW
- **File:** `apps/web/src/components/transaction-row.tsx` (line 164)
- **Detail:** The amount display uses `$${parseFloat(txn.amount).toFixed(2)}` — hardcoded USD dollar sign. If the app ever supports other currencies, this would need to change. Minor since the entire app currently assumes USD.
- **Fix:** No action needed now. Note for future internationalization pass.

---

## Defer

> Pre-existing issues surfaced by this review (not caused by current changes).

### 1. Missing UUID validation on transaction ID in PATCH route
- **Source:** edge
- **Detail:** The `PATCH /api/transactions/:id` route passes the `id` param directly to Prisma's `findUnique`. If a non-UUID string is passed, Prisma throws a `PrismaClientValidationError` which results in a 500 instead of a 400. This is pre-existing from Story 3-3 and affects all routes using `[id]` params. A simple UUID regex check at the top of the handler would improve error responses.

---

**4** patch, **0** intent_gap, **0** bad_spec, **1** defer findings. **5** findings rejected as noise.

---

## Priority Actions

1. **Patch #1** (params not awaited) — **CRITICAL**: Summary route is broken in Next.js 15. Zero data displayed. Must fix immediately.
2. **Patch #3** (raw SQL RLS) — Verify `withRLS` implementation; potential data leak across users
3. **Patch #2** (negative amounts) — By design, but consider product decision

These can be addressed in a follow-up implementation pass or manually. Patch #1 is a blocking bug that should be fixed before any deployment.
