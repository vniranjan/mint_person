# Story 4.4: Transaction Search

**Status:** done
**Epic:** 4 — Spending Analysis & Transaction Explorer
**Created:** 2026-04-03

---

## Story

As a user, I want to search my transactions by merchant name or amount, so that I can quickly locate a specific transaction without scrolling through the full list.

---

## Acceptance Criteria

**AC1 — Debounce**: 300ms after last keystroke → `GET /api/transactions/search?q=...&month=...` is called; results within 500ms.

**AC2 — Merchant search**: Case-insensitive contains match on merchant name.

**AC3 — Amount search**: Exact amount match (e.g. "42.50").

**AC4 — No results**: "No transactions matching '[query]'" + [Clear search] button.

**AC5 — Composed filters**: Category filter + search term compose correctly; only transactions matching both are shown.

---

## Tasks

- [x] Create `/api/transactions/search/route.ts` (GET with `?q=` and `?month=`)
- [x] Create `SearchInput` component with 300ms debounce
- [x] Wire search into DashboardClient (searchQuery state → pass to TransactionTable)
- [x] TransactionTable applies both category filter and search results