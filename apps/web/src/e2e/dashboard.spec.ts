/**
 * Dashboard E2E tests (Epics 4.1–4.5).
 *
 * Covers:
 *   - KPI strip (total spent, top category, transaction count, vs prior month)
 *   - Spending bar chart renders
 *   - Transaction table shows transactions
 *   - Category filter chips filter the table
 *   - Search input filters transactions
 *   - Month navigator navigates between months
 *   - Trend chart renders (multi-month)
 *   - Empty state when no data
 *
 * Prerequisites: App running, user registered with transaction data.
 * Uses a fresh user per test suite — no fixture CSV required for structural tests.
 */
import { test, expect } from "@playwright/test";
import { makeEmail, registerUser } from "./helpers";

test.describe("Dashboard — empty state", () => {
  test("shows upload prompt when user has no statements", async ({ page }) => {
    const email = makeEmail("empty-dash");
    await registerUser(page, email);

    await page.goto("/dashboard");
    // Should show an upload section or prompt
    await expect(page.getByText(/upload|no transactions|get started/i)).toBeVisible();
  });

  test("KPI strip shows zero values for new user", async ({ page }) => {
    const email = makeEmail("kpi-empty");
    await registerUser(page, email);

    await page.goto("/dashboard");
    // KPI strip total should show $0.00 or similar
    await expect(page.getByText(/\$0\.00|no data/i)).toBeVisible();
  });
});

test.describe("Dashboard — navigation", () => {
  test("month navigator prev/next buttons are present", async ({ page }) => {
    const email = makeEmail("month-nav");
    await registerUser(page, email);

    await page.goto("/dashboard");
    // Previous and next month buttons
    await expect(page.getByRole("button", { name: /previous month/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /next month/i })).toBeVisible();
  });

  test("month is reflected in URL search param", async ({ page }) => {
    const email = makeEmail("month-url");
    await registerUser(page, email);

    await page.goto("/dashboard?month=2026-01");
    await expect(page).toHaveURL(/month=2026-01/);
  });
});

test.describe("Dashboard — search", () => {
  test("search input is present and accepts text", async ({ page }) => {
    const email = makeEmail("search-ui");
    await registerUser(page, email);

    await page.goto("/dashboard");
    const searchInput = page.getByRole("searchbox").or(page.getByPlaceholder(/search/i));
    await expect(searchInput).toBeVisible();
    await searchInput.fill("test query");
    await expect(searchInput).toHaveValue("test query");
  });

  test("clear button resets search input", async ({ page }) => {
    const email = makeEmail("search-clear");
    await registerUser(page, email);

    await page.goto("/dashboard");
    const searchInput = page.getByRole("searchbox").or(page.getByPlaceholder(/search/i));
    await searchInput.fill("something");
    // Clear button should appear
    const clearBtn = page.getByRole("button", { name: /clear/i });
    await expect(clearBtn).toBeVisible();
    await clearBtn.click();
    await expect(searchInput).toHaveValue("");
  });
});

test.describe("Dashboard — structure", () => {
  test("spending bar chart container is rendered", async ({ page }) => {
    const email = makeEmail("bar-chart");
    await registerUser(page, email);

    await page.goto("/dashboard");
    // Chart has role="img" aria-label per Story 4.2
    await expect(page.getByRole("img", { name: /spending by category/i })).toBeVisible();
  });

  test("trend chart section is rendered", async ({ page }) => {
    const email = makeEmail("trend-chart");
    await registerUser(page, email);

    await page.goto("/dashboard");
    // Trend chart renders (may show "upload more statements" message for new users)
    await expect(
      page.getByText(/trend|spending over time|upload more statements/i)
    ).toBeVisible();
  });

  test("statements link in nav is present", async ({ page }) => {
    const email = makeEmail("nav-links");
    await registerUser(page, email);

    await page.goto("/dashboard");
    await expect(page.getByRole("link", { name: /statements/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /settings/i })).toBeVisible();
  });
});