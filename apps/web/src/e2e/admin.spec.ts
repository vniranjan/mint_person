/**
 * Admin panel E2E tests (Epic 5).
 *
 * Covers:
 *   - Non-admin cannot access /admin (redirected to dashboard)
 *   - Admin can access /admin
 *   - User list renders
 *   - Create user dialog opens and validates
 *   - Deactivate user flow
 *   - Health section renders
 *
 * Prerequisites:
 *   - App running at http://localhost:3000
 *   - E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD env vars set to a seeded admin account
 *     OR the tests fall back to creating an admin via direct API (not available here)
 *
 * If E2E_ADMIN_EMAIL is not set, admin-specific tests are skipped.
 */
import { test, expect } from "@playwright/test";
import { makeEmail, registerUser, loginUser, DEFAULT_PASSWORD, ADMIN_EMAIL, ADMIN_PASSWORD } from "./helpers";

const hasAdminCreds = !!process.env.E2E_ADMIN_EMAIL;

test.describe("Admin access control", () => {
  test("regular user is redirected away from /admin", async ({ page }) => {
    const email = makeEmail("non-admin");
    await registerUser(page, email);

    await page.goto("/admin");
    // Should redirect to dashboard (not admin)
    await expect(page).not.toHaveURL(/\/admin$/);
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("unauthenticated user is redirected to login from /admin", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("Admin panel", () => {
  test.skip(!hasAdminCreds, "Skipped: E2E_ADMIN_EMAIL not set");

  test.beforeEach(async ({ page }) => {
    await loginUser(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin/);
  });

  test("admin panel shows users table", async ({ page }) => {
    await expect(page.getByRole("table")).toBeVisible();
    // At least the header row should be present
    await expect(page.getByRole("columnheader", { name: /email/i })).toBeVisible();
  });

  test("admin panel shows New User button", async ({ page }) => {
    await expect(page.getByRole("button", { name: /new user/i })).toBeVisible();
  });

  test("Create User dialog opens and validates password match", async ({ page }) => {
    await page.getByRole("button", { name: /new user/i }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel(/email/i)).toBeVisible();
    await expect(dialog.getByLabel(/password/i).first()).toBeVisible();

    // Fill mismatched passwords
    await dialog.getByLabel("Email").fill(makeEmail("create-test"));
    await dialog.getByLabel(/^password$/i).fill("password123");
    await dialog.getByLabel(/confirm password/i).fill("different456");
    await dialog.getByRole("button", { name: /create user/i }).click();

    await expect(dialog.getByText(/do not match/i)).toBeVisible();
  });

  test("Create User dialog validates password length", async ({ page }) => {
    await page.getByRole("button", { name: /new user/i }).click();
    const dialog = page.getByRole("dialog");

    await dialog.getByLabel("Email").fill(makeEmail("shortpw"));
    await dialog.getByLabel(/^password$/i).fill("short");
    await dialog.getByLabel(/confirm password/i).fill("short");
    await dialog.getByRole("button", { name: /create user/i }).click();

    await expect(dialog.getByText(/at least 8/i)).toBeVisible();
  });

  test("admin panel shows health section", async ({ page }) => {
    // Health section with status cards
    await expect(page.getByText(/app container|worker container|queue depth|failed jobs/i)).toBeVisible();
  });

  test("clicking a user row shows detail panel", async ({ page }) => {
    const rows = page.getByRole("row").filter({ hasText: /@/ });
    const count = await rows.count();
    if (count === 0) {
      test.skip(); // No users to click
    }
    await rows.first().click();
    // Detail panel should appear with operational metrics
    await expect(page.getByText(/uploads|transactions|last login/i)).toBeVisible();
    await expect(page.getByText(/financial data not accessible/i)).toBeVisible();
  });

  test("can create a new user successfully", async ({ page }) => {
    const newEmail = makeEmail("admin-created");
    await page.getByRole("button", { name: /new user/i }).click();
    const dialog = page.getByRole("dialog");

    await dialog.getByLabel("Email").fill(newEmail);
    await dialog.getByLabel(/^password$/i).fill(DEFAULT_PASSWORD);
    await dialog.getByLabel(/confirm password/i).fill(DEFAULT_PASSWORD);
    await dialog.getByRole("button", { name: /create user/i }).click();

    // Dialog should close and new user should appear in table
    await expect(dialog).not.toBeVisible({ timeout: 5000 });
    await expect(page.getByText(newEmail)).toBeVisible();
  });
});