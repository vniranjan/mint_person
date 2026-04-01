# Story 3.2: Default Category Taxonomy & Flagged Transaction Review Queue

**Status:** review
**Epic:** 3 — AI Categorization, Review & Correction Learning
**Created:** 2026-03-30

---

## Story

As a user, I want to see a queue of low-confidence or uncategorized transactions that need my attention — with the system's categorization reason visible — so that I can quickly review uncertain categorizations without any transaction being silently wrong.

---

## Acceptance Criteria

**AC1 — `GET /api/categories`**: Returns all 8 default categories with their color token pairings. Response: `{ "data": [{ "name": "Groceries", "bgClass": "bg-green-100", "textClass": "text-green-700" }, ...] }`.

**AC2 — ReviewBanner**: When the current month has `isFlagged=true` transactions, a ReviewBanner appears below the top nav: amber-50 background, flag icon, "[N] transactions need review" + [Review Now] + [Skip] buttons. Banner has `role="alert"` injected on mount. Persists across the page until dismissed or all resolved.

**AC3 — Review queue inline expansion**: Clicking [Review Now] expands an inline ReviewQueue below the banner (no modal, no page navigation). Each flagged row shows: date | merchant | amount | CategoryBadge (amber border) | flag icon. Queue container has `role="list"`.

**AC4 — Categorization reason tooltip**: Hovering the flag icon on a flagged row shows a tooltip with the reason: `"Matched keyword: 'starbucks'"` or `"LLM assigned — 45% confidence"` based on the `confidence` value and whether a keyword rule was used.

**AC5 — Skip behavior**: Clicking [Skip] dismisses the banner. Flagged transactions remain in the transaction list with amber CategoryBadge borders. A review count badge remains visible in the nav or as a floating indicator.

**AC6 — `GET /api/transactions?flagged=true&month=YYYY-MM`**: Returns only flagged (not yet reviewed) transactions for the given month. Supports the ReviewQueue data fetch.

**AC7 — Color tokens**: The 8 category colors from `UX-DR2` are applied via Tailwind: Groceries (green-100/green-700), Dining (orange-100/orange-700), Transport (blue-100/blue-700), Shopping (violet-100/violet-700), Subscriptions (cyan-100/cyan-700), Healthcare (rose-100/rose-700), Entertainment (purple-100/purple-700), Utilities (slate-100/slate-700).

---

## Tasks

- [ ] **Task 1: `GET /api/categories` route** (AC: 1, 7)
  - [ ] Create `apps/web/src/app/api/categories/route.ts`
  - [ ] Return hardcoded 8 categories array with name + bgClass + textClass (Tailwind safe-list strings)
  - [ ] No auth required (public taxonomy)

- [ ] **Task 2: `GET /api/transactions` route with `flagged` filter** (AC: 6)
  - [ ] Create `apps/web/src/app/api/transactions/route.ts`
  - [ ] Auth required; use `withRLS`
  - [ ] Query params: `month` (YYYY-MM, required), `flagged` (boolean, optional), `category` (string, optional)
  - [ ] Filter: `isFlagged: true, isReviewed: false` when `flagged=true`
  - [ ] Filter by month: `date >= start of month, date < start of next month`
  - [ ] Return `{ "data": [{ id, date, merchantNorm, amount, category, confidence, isFlagged, isDuplicate, isExcluded }] }`

- [ ] **Task 3: `CategoryBadge` component** (AC: 3, 7)
  - [ ] Create `apps/web/src/components/category-badge.tsx`
  - [ ] Props: `category: string | null`, `flagged?: boolean`
  - [ ] Apply correct bg/text color pair from category map
  - [ ] When `flagged=true`: add amber border ring (`ring-1 ring-amber-400`)
  - [ ] Null/undefined category → "Uncategorized" badge (stone colors)

- [ ] **Task 4: `ReviewBanner` component** (AC: 2, 5)
  - [ ] Create `apps/web/src/components/review-banner.tsx`
  - [ ] Props: `flaggedCount: number`, `onReviewNow: () => void`, `onSkip: () => void`
  - [ ] amber-50 bg, flag icon (lucide-react `Flag`), "[N] transactions need review"
  - [ ] `role="alert"` on the container div
  - [ ] [Review Now] and [Skip] buttons with correct click handlers

- [ ] **Task 5: `ReviewQueue` component** (AC: 3, 4)
  - [ ] Create `apps/web/src/components/review-queue.tsx`
  - [ ] Props: `transactions: FlaggedTransaction[]`, `onCorrect: (id, category) => void`
  - [ ] Renders `role="list"` container; each row is a `role="listitem"`
  - [ ] Row anatomy: date | merchantNorm | amount | CategoryBadge (flagged) | FlagIcon with tooltip
  - [ ] Tooltip text: confidence < 0.60 → "LLM assigned — N% confidence"; confidence 0.60 → "Matched keyword"; build reason string from confidence value
  - [ ] Corrected rows dim to 80% opacity

- [ ] **Task 6: Wire ReviewBanner + ReviewQueue into dashboard** (AC: 2, 3, 5)
  - [ ] Fetch flagged count on dashboard load: `GET /api/transactions?flagged=true&month=YYYY-MM`
  - [ ] Show ReviewBanner when `flaggedCount > 0` and not skipped
  - [ ] On [Review Now]: expand ReviewQueue below banner
  - [ ] On [Skip]: set local `skipped=true` state, hide banner body (keep count badge)
  - [ ] When all queue items resolved: fade banner out

- [ ] **Task 7: Add `isFlagged` to Prisma `Transaction` queries in web app** (AC: 6)
  - [ ] Ensure `isFlagged` is selected in transaction list queries
  - [ ] The field was added in Story 3.1 migration — just include it in selects

---

## Dev Notes

### Category color map (constant)

Define in `apps/web/src/lib/categories.ts`:
```typescript
export const CATEGORY_COLORS: Record<string, { bgClass: string; textClass: string }> = {
  Groceries:     { bgClass: "bg-green-100",  textClass: "text-green-700"  },
  Dining:        { bgClass: "bg-orange-100", textClass: "text-orange-700" },
  Transport:     { bgClass: "bg-blue-100",   textClass: "text-blue-700"   },
  Shopping:      { bgClass: "bg-violet-100", textClass: "text-violet-700" },
  Subscriptions: { bgClass: "bg-cyan-100",   textClass: "text-cyan-700"   },
  Healthcare:    { bgClass: "bg-rose-100",   textClass: "text-rose-700"   },
  Entertainment: { bgClass: "bg-purple-100", textClass: "text-purple-700" },
  Utilities:     { bgClass: "bg-slate-100",  textClass: "text-slate-700"  },
};
```

### Categorization reason string

```typescript
function getReasonText(confidence: number): string {
  if (confidence === 0.60) return "Matched keyword (rule-based fallback)";
  return `LLM assigned — ${Math.round(confidence * 100)}% confidence`;
}
```

### Month date range filter (Prisma)

```typescript
const start = new Date(`${month}-01`);
const end = new Date(start);
end.setMonth(end.getMonth() + 1);
// where: { date: { gte: start, lt: end } }
```

### Tailwind dynamic class safety

Since category color classes are constructed dynamically, ensure they are all listed in `tailwind.config.ts` safelist or as full strings in the constants file so PurgeCSS does not strip them.

---

## Dev Agent Record

**Completed by:** Dev Agent (claude-sonnet-4-6)
**Completed:** 2026-03-30

### Files Created/Modified
- `apps/web/src/lib/categories.ts` — `VALID_CATEGORIES`, `CATEGORY_COLORS`, `CATEGORY_DOT_COLORS` constants using custom Tailwind tokens from `tailwind.config.ts`
- `apps/web/src/app/api/categories/route.ts` — `GET /api/categories` returning 8 categories with color tokens
- `apps/web/src/app/api/transactions/route.ts` — `GET /api/transactions?month=YYYY-MM[&flagged=true][&category=X]`
- `apps/web/src/components/category-badge.tsx` — CategoryBadge with flagged amber ring
- `apps/web/src/components/review-banner.tsx` — ReviewBanner with role="alert", flag icon, Review Now/Skip
- `apps/web/src/components/review-queue.tsx` — ReviewQueue with role="list", reason tooltip, corrected state
- `apps/web/src/components/query-provider.tsx` — QueryClientProvider wrapper for (app) layout
- `apps/web/src/app/(app)/layout.tsx` — Added QueryProvider wrapper
- `apps/web/src/app/(app)/dashboard/_components/dashboard-client.tsx` — Integrated ReviewBanner + ReviewQueue

### Notes
- Category colors use custom Tailwind tokens (`bg-category-groceries-bg` etc.) — no standard Tailwind color classes needed
- QueryClientProvider added to (app) layout to support all TanStack Query usage
- TypeScript check passes clean after `prisma generate`
