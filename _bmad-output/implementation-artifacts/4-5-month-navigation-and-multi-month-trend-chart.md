# Story 4.5: Month Navigation & Multi-Month Trend Chart

**Status:** done
**Epic:** 4 — Spending Analysis & Transaction Explorer
**Created:** 2026-04-03

---

## Story

As a user, I want to navigate between months and see a trend chart of my spending across multiple months per category, so that I can understand how my spending patterns change over time.

---

## Acceptance Criteria

**AC1 — MonthNavigator**: Displays `← [Month Year] →`; → disabled at current month (`aria-disabled`); ← disabled at earliest month with data; `aria-label="Previous month"` / `aria-label="Next month"`.

**AC2 — Navigation updates dashboard**: All data (KPI strip, chart, table) updates to the selected month; TanStack Query caches per month; URL reflects month in YYYY-MM format.

**AC3 — Keyboard navigation**: Left/right arrow keys navigate months matching click behavior.

**AC4 — Trend chart**: `GET /api/trends` returns per-category spending across all available months; multi-month chart displays all months.

**AC5 — Single month fallback**: "Upload more statements to see trends across months" when < 2 months of data.

---

## Tasks

- [x] Create `MonthNavigator` component with keyboard support + aria attributes
- [x] Create `/api/trends/route.ts` (returns per-category per-month spending)
- [x] Create `TrendChart` component (Recharts LineChart, multi-category over months)
- [x] Update DashboardClient to manage month state + URL param (`?month=YYYY-MM`)