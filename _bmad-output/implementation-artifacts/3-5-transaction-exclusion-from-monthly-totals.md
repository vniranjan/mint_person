# Story 3.5: Transaction Exclusion from Monthly Totals

**Status:** review
**Epic:** 3 — AI Categorization, Review & Correction Learning
**Created:** 2026-03-30

---

## Story

As a user, I want to exclude specific transactions from my monthly totals and trend calculations, so that anomalous entries (zero-dollar records, refunds, one-off items) don't distort my spending picture.

---

## Acceptance Criteria

**AC1 — Hover reveal**: Hovering (or focusing) a transaction row reveals an [Exclude] ghost button alongside the category picker trigger. The hover reveal is keyboard-accessible via `focus-within` on the row.

**AC2 — Exclude action**: Clicking [Exclude] calls `PATCH /api/transactions/:id` with `{ "isExcluded": true }` (same endpoint from Story 3.3). `isExcluded` is set to `true` in the DB. The row immediately shows strikethrough styling and muted text.

**AC3 — Include action**: When `isExcluded=true`, the hover reveal shows an [Include] button instead. Clicking it calls `PATCH /api/transactions/:id` with `{ "isExcluded": false }`. The row returns to default styling.

**AC4 — Excluded rows remain visible**: Excluded transactions stay in the transaction list — they are not hidden. They display with: `line-through` on merchant and amount text, `text-stone-400` color, and a muted "Excluded" text badge.

**AC5 — Summary API filtering**: `GET /api/summary/:month` excludes transactions with `isExcluded=true` from all totals: `totalSpent`, `byCategory` amounts, and `transactionCount`.

**AC6 — Monthly API route**: Create `GET /api/summary/[month]/route.ts`. Accepts `month` in `YYYY-MM` format. Returns `{ "data": { "totalSpent": "1234.56", "byCategory": [{ "category": "Groceries", "total": "245.00", "pct": 19 }], "transactionCount": 42 } }`. Excludes `isExcluded=true` transactions. 200ms p95.

**AC7 — `PATCH /api/transactions/:id` already supports `isExcluded`**: Confirmed by Story 3.3 AC7 — no new API endpoint needed.

---

## Tasks

- [ ] **Task 1: `GET /api/summary/[month]/route.ts`** (AC: 5, 6)
  - [ ] Create `apps/web/src/app/api/summary/[month]/route.ts`
  - [ ] Auth with `withRLS`
  - [ ] Parse `month` param; validate YYYY-MM format
  - [ ] Query: `transactions` where `userId`, `date >= monthStart, date < monthEnd`, `isExcluded: false`
  - [ ] Compute: `totalSpent` (sum of positive amounts), `byCategory` (group by category, sum, pct), `transactionCount`
  - [ ] Return `{ "data": { totalSpent, byCategory, transactionCount } }`
  - [ ] Format amounts as strings: `amount.toFixed(2)`

- [ ] **Task 2: `TransactionRow` exclude/include UI** (AC: 1, 2, 3, 4)
  - [ ] In `TransactionRow` (from Story 3.3): add `isExcluded` prop
  - [ ] Hover state: if `isExcluded=false`, show [Exclude] ghost button; if `isExcluded=true`, show [Include] ghost button
  - [ ] Excluded state styling: `line-through` on merchant and amount, `text-stone-400`, "Excluded" badge (stone-100/stone-500)
  - [ ] [Exclude]/[Include] calls `patchTransaction(id, { isExcluded: !current })` via TanStack Query mutation
  - [ ] Optimistic update: toggle isExcluded immediately, revert on error

- [ ] **Task 3: Wire summary API into dashboard** (AC: 5, 6)
  - [ ] Fetch `GET /api/summary/:month` in dashboard page/component
  - [ ] Display KPI strip: Total Spent | Top Category | Transaction Count
  - [ ] TanStack Query with `staleTime: 60_000`; invalidate on transaction patch

- [ ] **Task 4: Duplicate transaction exclude/include from Story 2.4** (AC: 2)
  - [ ] Story 2.4 specified an [Exclude] action for flagged duplicates — wire that through the same `PATCH /api/transactions/:id` with `{ isExcluded: true }` endpoint
  - [ ] Confirm `isDuplicate` transactions also show in the transaction list with amber "Possible duplicate" badge
  - [ ] The exclude action for duplicates uses the same UI pattern as regular exclusion

- [ ] **Task 5: `GET /api/months` route** (AC: 6 — for future use by Epic 4)
  - [ ] Create `apps/web/src/app/api/months/route.ts`
  - [ ] Auth with `withRLS`
  - [ ] Query distinct months from `transactions` for the user: `SELECT DISTINCT TO_CHAR(date, 'YYYY-MM') ...`
  - [ ] Return `{ "data": ["2026-01", "2026-02", ...] }` sorted descending

---

## Dev Notes

### Summary computation (Prisma)

```typescript
const transactions = await tx.transaction.findMany({
  where: {
    userId,
    isExcluded: false,
    date: { gte: monthStart, lt: monthEnd },
  },
  select: { amount: true, category: true },
});

const totalSpent = transactions
  .filter(t => t.amount.gt(0))
  .reduce((sum, t) => sum.add(t.amount), new Decimal(0));

const byCategory = Object.entries(
  transactions.reduce((acc, t) => {
    const cat = t.category ?? "Uncategorized";
    acc[cat] = (acc[cat] ?? new Decimal(0)).add(t.amount.gt(0) ? t.amount : 0);
    return acc;
  }, {} as Record<string, Decimal>)
).map(([category, total]) => ({
  category,
  total: total.toFixed(2),
  pct: totalSpent.gt(0) ? Math.round(total.div(totalSpent).mul(100).toNumber()) : 0,
})).sort((a, b) => parseFloat(b.total) - parseFloat(a.total));
```

### Decimal import

Use `import { Decimal } from "@prisma/client/runtime/library"` or `import Decimal from "decimal.js"` to work with Prisma Decimal fields in TypeScript.

### Month date range

```typescript
function getMonthRange(month: string) {
  const start = new Date(`${month}-01T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return { start, end };
}
```

### Excluded row styling (Tailwind)

```typescript
const rowClass = isExcluded
  ? "opacity-70 line-through text-stone-400"
  : "";
```

Apply to merchant name `<td>` and amount `<td>`. The row itself stays fully visible.

### PATCH mutation query invalidation

After a successful `PATCH` (whether category or isExcluded), invalidate:
- `["transactions", month]` — transaction list
- `["summary", month]` — KPI strip (totals change when exclusion changes)

---

## Dev Agent Record

**Implemented:** 2026-03-30

### Files created
- `apps/web/src/app/api/summary/[month]/route.ts` — GET monthly summary (totalSpent, byCategory, transactionCount) excluding isExcluded transactions
- `apps/web/src/app/api/months/route.ts` — GET list of distinct YYYY-MM months with data (for Epic 4 month picker)
- `apps/web/src/components/summary-strip.tsx` — KPI strip: Total Spent / Top Category / Transactions with skeleton loading

### Files modified
- `apps/web/src/components/transaction-row.tsx` — Added "Excluded" and "Possible duplicate" badges; invalidates `["summary", month]` on correction
- `apps/web/src/app/(app)/dashboard/_components/dashboard-client.tsx` — Imports and renders `SummaryStrip` for users with statements

### Notes
- `TransactionRow` exclude/include UI was already wired in Story 3.3 (PATCH endpoint + optimistic mutations + `["summary", month]` invalidation on `onSettled`)
- Used `@prisma/client/runtime/library` `Decimal` for server-side arithmetic to match Prisma's `Numeric(12,2)` field type
- `GET /api/months` uses raw SQL `TO_CHAR(date, 'YYYY-MM')` because Prisma doesn't expose a `DISTINCT` + date formatting helper in its query builder
