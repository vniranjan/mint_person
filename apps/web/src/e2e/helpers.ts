/**
 * Shared E2E test helpers.
 *
 * All helpers assume the app is running at baseURL (http://localhost:3000).
 * Tests use unique email addresses per run to avoid DB conflicts.
 */
import { type Page, expect } from "@playwright/test";

export const TEST_DOMAIN = "@e2e-test.mint-test.invalid";

export function makeEmail(suffix: string): string {
  return `e2e-${suffix}-${Date.now()}${TEST_DOMAIN}`;
}

export const DEFAULT_PASSWORD = "testPassword1!";
export const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@e2e-test.mint-test.invalid";
export const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "adminPassword1!";

/**
 * Register a new user via the UI and land on the dashboard.
 */
export async function registerUser(page: Page, email: string, password = DEFAULT_PASSWORD) {
  await page.goto("/register");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: /create account/i }).click();
  // Should redirect to dashboard after registration
  await expect(page).toHaveURL(/\/dashboard/);
}

/**
 * Log in via the login form and land on the dashboard.
 */
export async function loginUser(page: Page, email: string, password = DEFAULT_PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

/**
 * Log out via the sign out button.
 */
export async function logout(page: Page) {
  await page.getByRole("button", { name: /sign out/i }).click();
  await expect(page).toHaveURL(/\/login/);
}