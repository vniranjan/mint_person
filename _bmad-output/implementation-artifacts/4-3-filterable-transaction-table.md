# Story 4.3: Filterable Transaction Table

**Status:** done
**Epic:** 4 — Spending Analysis & Transaction Explorer
**Created:** 2026-04-03

---

## Story

As a user, I want to browse all transactions for a month in a table and filter them by category, so that I can drill into specific spending areas and verify individual entries.

---

## Acceptance Criteria

**AC1 — Table structure**: Shows columns: Date | Merchant | CategoryBadge | Amount (tabular-nums, right-aligned); semantic `<table>` with `<thead>`, `<tbody>`, `<th scope="col">`.

**AC2 — Category chips**: One chip per category present in current month (not all 8); "All" chip active by default; `role="radiogroup"` / `role="radio"` / `aria-checked`.

**AC3 — Filter behavior**: Clicking a category chip immediately filters table; active chip uses category color pairing; clicking active chip returns to All.

**AC4 — Empty filter state**: "No [Category] transactions this month" + [Clear filter] button when no matching transactions.

**AC5 — No pagination**: 50+ transactions render with continuous scrolling, no hard cut-off or page navigation.

---

## Tasks

- [x] Create `CategoryFilterChips` component (radiogroup chips)
- [x] Create `TransactionTable` component (semantic table wrapping TransactionRow)
- [x] Implement `use-transactions.ts` hook
- [x] Modify TransactionRow to accept optional `queryKey` prop
- [x] Add to DashboardClient with activeCategory state