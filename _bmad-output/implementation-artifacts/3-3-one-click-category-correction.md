# Story 3.3: One-Click Category Correction

**Status:** review
**Epic:** 3 — AI Categorization, Review & Correction Learning
**Created:** 2026-03-30

---

## Story

As a user, I want to correct a transaction's category with a single click that opens an inline picker, so that fixing miscategorizations is fast, effortless, and immediately reflected in my spending view.

---

## Acceptance Criteria

**AC1 — `PATCH /api/transactions/:id`**: Accepts `{ "category": "Dining" }` body. Validates category is one of the 8 valid values. Updates the transaction's `category`, sets `isReviewed=true`. Inserts a `correction_logs` row with `merchantPattern` (the transaction's `merchantNorm`) and `correctedCategory`. Responds within 200ms p95. Returns `{ "data": { "id", "category", "isReviewed" } }`.

**AC2 — CategoryPickerPopover**: Clicking any CategoryBadge opens a CategoryPickerPopover inline (shadcn Popover). Contains a search input (300ms debounce filtering the list) and a scrollable list of all 8 categories with color dots. No modal, no save button — selection immediately triggers the PATCH.

**AC3 — Keyboard navigation**: Arrow keys navigate the category list; Enter selects the focused item; Escape closes without change. List has `role="listbox"`, items have `role="option"` with `aria-selected`.

**AC4 — Optimistic update**: Badge updates immediately to the new category color and label before the server responds. On error, revert to previous category and show an error toast.

**AC5 — Success toast**: On successful correction: "[MerchantNorm] — remembered for next time" toast appears (emerald-600 icon, 4s auto-dismiss).

**AC6 — Review queue decrement**: When a correction is made on a flagged transaction, the row dims to 80% opacity (corrected state). The ReviewBanner count decrements. When all queue items reach corrected state, the banner fades out.

**AC7 — `isExcluded` toggle via same PATCH endpoint**: The same `PATCH /api/transactions/:id` also accepts `{ "isExcluded": true/false }` to support Story 3.5's exclusion toggle. Both fields are optional; at least one must be present.

---

## Tasks

- [ ] **Task 1: `PATCH /api/transactions/:id/route.ts`** (AC: 1, 7)
  - [ ] Create `apps/web/src/app/api/transactions/[id]/route.ts`
  - [ ] Auth with `withRLS`; verify transaction belongs to user
  - [ ] Parse body: `{ category?: string, isExcluded?: boolean }`
  - [ ] Validate `category` is in `VALID_CATEGORIES` array if present
  - [ ] If `category` present: update `category`, set `isReviewed=true`
  - [ ] Insert `correction_logs` row with `merchantPattern` (from transaction's `merchantNorm`) and `correctedCategory`
  - [ ] If `isExcluded` present: update `isExcluded` only
  - [ ] Return `{ "data": { id, category, isReviewed, isExcluded } }`

- [ ] **Task 2: `CategoryPickerPopover` component** (AC: 2, 3)
  - [ ] Create `apps/web/src/components/category-picker-popover.tsx`
  - [ ] Use shadcn `Popover` + `PopoverTrigger` + `PopoverContent`
  - [ ] Search input: controlled, 300ms debounce, filters category list
  - [ ] Category list: maps `CATEGORY_COLORS` keys; each item shows color dot + label
  - [ ] `role="listbox"` on list, `role="option"` + `aria-selected` on items
  - [ ] Arrow key navigation with `useState` for focusedIndex
  - [ ] Enter → selects focused item; Escape → calls `onClose()`
  - [ ] Width 200–280px per UX spec
  - [ ] Auto-close on selection

- [ ] **Task 3: `TransactionRow` component** (AC: 2, 4, 5, 6)
  - [ ] Create `apps/web/src/components/transaction-row.tsx`
  - [ ] States: default, hover (actions reveal), corrected (80% opacity), excluded (strikethrough + muted), flagged (amber CategoryBadge border)
  - [ ] Hover: show CategoryPickerPopover trigger on CategoryBadge; show [Exclude] ghost button
  - [ ] Use `useMutation` (TanStack Query) for PATCH call
  - [ ] Optimistic update: `setQueryData` with new category before mutation settles
  - [ ] On mutation success: show toast, mark corrected state
  - [ ] On mutation error: revert category, show error toast

- [ ] **Task 4: Toast integration** (AC: 5)
  - [ ] Ensure shadcn Toast / Toaster is in the layout
  - [ ] Success toast: "[merchantNorm] — remembered for next time" (emerald icon, 4s)
  - [ ] Error toast: "Failed to update category. Please try again." (red icon)

- [ ] **Task 5: Wire CategoryPickerPopover into ReviewQueue** (AC: 6)
  - [ ] ReviewQueue rows use `TransactionRow` with correction enabled
  - [ ] On correction: call parent `onCorrect(id, newCategory)` callback
  - [ ] ReviewBanner count decrements via `flaggedCount - 1`

---

## Dev Notes

### VALID_CATEGORIES constant

Define in `apps/web/src/lib/categories.ts` (same file as `CATEGORY_COLORS`):
```typescript
export const VALID_CATEGORIES = [
  "Groceries", "Dining", "Transport", "Shopping",
  "Subscriptions", "Healthcare", "Entertainment", "Utilities",
] as const;
export type Category = typeof VALID_CATEGORIES[number];
```

### PATCH route body validation

```typescript
const { category, isExcluded } = await req.json();
if (!category && isExcluded === undefined) {
  return NextResponse.json({ error: { code: "BAD_REQUEST", message: "No fields to update" } }, { status: 400 });
}
if (category && !VALID_CATEGORIES.includes(category)) {
  return NextResponse.json({ error: { code: "INVALID_CATEGORY" } }, { status: 422 });
}
```

### CorrectionLog insert (only when category updated)

```typescript
if (category) {
  await tx.correctionLog.create({
    data: { userId, merchantPattern: txn.merchantNorm, correctedCategory: category },
  });
}
```

### Optimistic update pattern with TanStack Query

```typescript
const mutation = useMutation({
  mutationFn: (newCategory) => patchTransaction(id, { category: newCategory }),
  onMutate: async (newCategory) => {
    await queryClient.cancelQueries({ queryKey: ["transactions", month] });
    const previous = queryClient.getQueryData(["transactions", month]);
    queryClient.setQueryData(["transactions", month], (old) => /* update category in list */);
    return { previous };
  },
  onError: (_err, _vars, context) => {
    queryClient.setQueryData(["transactions", month], context.previous);
    // show error toast
  },
});
```

---

## Dev Agent Record

**Completed by:** Dev Agent (claude-sonnet-4-6)
**Completed:** 2026-03-30

### Files Created/Modified
- `apps/web/src/app/api/transactions/[id]/route.ts` — `PATCH /api/transactions/:id` updating category+isReviewed and inserting CorrectionLog; also handles isExcluded toggle (Story 3.5 AC7)
- `apps/web/src/components/category-picker-popover.tsx` — Popover with search input, arrow key navigation, role="listbox"/role="option"
- `apps/web/src/components/transaction-row.tsx` — 5-state row: default/hover/corrected/excluded/flagged; optimistic category+exclusion mutations
- `apps/web/src/hooks/use-toast.ts` — Toast hook
- `apps/web/src/components/toaster.tsx` — Toaster component
- `apps/web/src/app/(app)/layout.tsx` — Added Toaster

### Notes
- `patternAppliedNote` referenced in TransactionRow but not yet in Prisma schema — Story 3.4 will add it; TypeScript is satisfied because it's `string | null | undefined`
- TypeScript check passes clean
