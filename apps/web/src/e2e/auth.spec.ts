/**
 * Authentication E2E tests.
 *
 * Covers:
 *   - User registration (happy path + duplicate email)
 *   - Login (happy path + wrong password)
 *   - Sign out
 *   - Redirect to /login when unauthenticated
 *   - Password reset flow (request email)
 *
 * Prerequisites: App running at http://localhost:3000 with a seeded DB.
 * Run: npm run test:e2e (from apps/web/)
 */
import { test, expect } from "@playwright/test";
import { makeEmail, DEFAULT_PASSWORD, registerUser, loginUser, logout } from "./helpers";

test.describe("Registration", () => {
  test("new user can register and lands on dashboard", async ({ page }) => {
    const email = makeEmail("register");
    await page.goto("/register");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(DEFAULT_PASSWORD);
    await page.getByRole("button", { name: /create account/i }).click();

    await expect(page).toHaveURL(/\/dashboard/);
    // Nav should be visible
    await expect(page.getByRole("navigation")).toBeVisible();
  });

  test("shows error for duplicate email", async ({ page }) => {
    const email = makeEmail("duplicate");
    // Register once
    await registerUser(page, email);
    // Logout and try again
    await logout(page);

    await page.goto("/register");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(DEFAULT_PASSWORD);
    await page.getByRole("button", { name: /create account/i }).click();

    await expect(page.getByText(/already exists|already registered/i)).toBeVisible();
  });

  test("shows validation error for short password", async ({ page }) => {
    await page.goto("/register");
    await page.getByLabel("Email").fill(makeEmail("shortpw"));
    await page.getByLabel("Password", { exact: true }).fill("short");
    await page.getByRole("button", { name: /create account/i }).click();

    await expect(page.getByText(/at least 8/i)).toBeVisible();
  });
});

test.describe("Login", () => {
  test("registered user can log in", async ({ page }) => {
    const email = makeEmail("login");
    await registerUser(page, email);
    await logout(page);

    await loginUser(page, email);
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("shows error for wrong password", async ({ page }) => {
    const email = makeEmail("wrongpw");
    await registerUser(page, email);
    await logout(page);

    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("wrongPassword1!");
    await page.getByRole("button", { name: /sign in/i }).click();

    await expect(page.getByText(/invalid|incorrect|wrong/i)).toBeVisible();
  });

  test("shows error for non-existent email", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("nobody@nowhere.invalid");
    await page.getByLabel("Password").fill(DEFAULT_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();

    await expect(page.getByText(/invalid|incorrect|not found/i)).toBeVisible();
  });
});

test.describe("Sign out", () => {
  test("user can sign out and is redirected to login", async ({ page }) => {
    const email = makeEmail("signout");
    await registerUser(page, email);
    await logout(page);

    await expect(page).toHaveURL(/\/login/);
  });

  test("signed-out user is redirected from dashboard to login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("Password reset", () => {
  test("forgot password page accepts email and shows confirmation", async ({ page }) => {
    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill("anyone@example.com");
    await page.getByRole("button", { name: /send|reset/i }).click();

    // Should show a generic confirmation (not reveal if email exists)
    await expect(page.getByText(/check your email|if an account exists/i)).toBeVisible();
  });
});