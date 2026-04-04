# Story 4.1: Monthly Summary API & KPI Dashboard Strip

**Status:** done
**Epic:** 4 — Spending Analysis & Transaction Explorer
**Created:** 2026-04-03

---

## Story

As a user, I want to see a dashboard summary of my spending for the current month — total spent, top category, transaction count, and comparison to last month — so that I can immediately understand my financial position without scrolling or drilling down.

---

## Acceptance Criteria

**AC1 — KPI cards render**: `GET /dashboard` loads with 4 KPI cards: Total Spent | Top Category | Transaction Count | vs Prior Month (delta amount and direction).

**AC2 — Summary API response**: `GET /api/summary/:month` returns `{ "data": { "totalSpent": "1234.56", "byCategory": [...], "transactionCount": 147, "vsLastMonth": "+12.3%" } }` within 200ms p95; amounts are strings in "12.34" format; excluded transactions are not counted.

**AC3 — Empty state**: No transactions → KPI cards show zeros/dashes and UploadDropZone empty state is displayed.

**AC4 — Cache**: TanStack Query caches summary data; no loading flash for cached data on re-navigate.

**AC5 — Currency format**: Currency values formatted with `Intl.NumberFormat` on the frontend; `YYYY-MM` month format consistent across API calls.

---

## Tasks

- [x] Update `/api/summary/[month]/route.ts` to compute `vsLastMonth` (prior month total comparison)
- [x] Update `SummaryStrip` to show 4 KPI cards (add vs Prior Month card)
- [x] Implement `use-month-summary.ts` hook (was a stub)