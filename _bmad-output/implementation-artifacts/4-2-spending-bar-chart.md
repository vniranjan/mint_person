# Story 4.2: Spending Bar Chart

**Status:** done
**Epic:** 4 — Spending Analysis & Transaction Explorer
**Created:** 2026-04-03

---

## Story

As a user, I want to see a bar chart of my spending broken down by category for the current month, so that I can visually understand the proportion of my spending across categories at a glance.

---

## Acceptance Criteria

**AC1 — Recharts BarChart**: Displays one bar per category with total spend on Y-axis; bars use 8 fixed category color tokens; sorted by total spend descending.

**AC2 — Tooltip**: Shows Category name | Total (e.g. "$420.00") | Percentage of month total (e.g. "34%").

**AC3 — Accessibility**: Chart container has `role="img"` and `aria-label="Spending by category for [Month Year]"`; a visually-hidden `<table>` with the same data exists as screen reader fallback.

**AC4 — Responsive**: `ResponsiveContainer` scales to available width without horizontal scroll at tablet width (<900px).

---

## Tasks

- [x] Create `SpendingBarChart` component with Recharts BarChart + ResponsiveContainer
- [x] Add category hex colors for Recharts fill from `CATEGORY_DOT_COLORS`
- [x] Add accessible hidden table fallback
- [x] Add to DashboardClient below SummaryStrip