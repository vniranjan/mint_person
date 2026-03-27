/**
 * Registration API integration tests (Story 1.3).
 *
 * Tests POST /api/auth/register by calling the route handler directly.
 * Requires a real PostgreSQL instance with migrations applied.
 *
 * Run: npm run test:auth (from apps/web/)
 *
 * CI: uses the postgres service container from ci.yml (DATABASE_URL env var).
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { prisma } from "~/lib/db";
import { POST } from "~/app/api/auth/register/route";

const TEST_EMAIL_DOMAIN = "@auth-test.mint-test.invalid";

function makeEmail(suffix: string) {
  return `auth-test-${suffix}${TEST_EMAIL_DOMAIN}`;
}

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/register", () => {
  beforeEach(async () => {
    // Clean up test users before each test to ensure isolation
    await prisma.$executeRaw`
      DELETE FROM users WHERE email LIKE ${"%" + TEST_EMAIL_DOMAIN}
    `;
  });

  afterAll(async () => {
    await prisma.$executeRaw`
      DELETE FROM users WHERE email LIKE ${"%" + TEST_EMAIL_DOMAIN}
    `;
    await prisma.$disconnect();
  });

  it("returns 201 and creates user with hashed password", async () => {
    const email = makeEmail("valid");
    const res = await POST(makeRequest({ email, password: "password123" }));

    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { id: string; email: string; role: string } };
    expect(body.data.email).toBe(email);
    expect(body.data.role).toBe("USER");
    expect(body.data.id).toBeTruthy();

    // Verify user actually exists in DB
    const dbUser = await prisma.user.findUnique({ where: { email } });
    expect(dbUser).not.toBeNull();
    expect(dbUser?.isActive).toBe(true);
  });

  it("never exposes passwordHash in response", async () => {
    const email = makeEmail("no-hash");
    const res = await POST(makeRequest({ email, password: "password123" }));

    expect(res.status).toBe(201);
    const body = (await res.json()) as Record<string, unknown>;
    const bodyStr = JSON.stringify(body);
    expect(bodyStr).not.toContain("passwordHash");
    expect(bodyStr).not.toContain("password123");
  });

  it("stores a bcrypt hash, not the plaintext password", async () => {
    const email = makeEmail("hash-check");
    const plaintext = "supersecret9";
    await POST(makeRequest({ email, password: plaintext }));

    const dbUser = await prisma.user.findUnique({ where: { email } });
    expect(dbUser?.passwordHash).toBeTruthy();
    // bcrypt hashes always start with $2b$
    expect(dbUser!.passwordHash).toMatch(/^\$2[ab]\$/);
    expect(dbUser!.passwordHash).not.toBe(plaintext);
  });

  it("returns 409 EMAIL_ALREADY_EXISTS for duplicate email", async () => {
    const email = makeEmail("duplicate");
    // Create once
    await POST(makeRequest({ email, password: "password123" }));

    // Try again with same email
    const res = await POST(makeRequest({ email, password: "different456" }));
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("EMAIL_ALREADY_EXISTS");
  });

  it("returns 400 VALIDATION_ERROR for password shorter than 8 chars", async () => {
    const res = await POST(
      makeRequest({ email: makeEmail("short-pw"), password: "short" }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 VALIDATION_ERROR for invalid email format", async () => {
    const res = await POST(
      makeRequest({ email: "notanemail", password: "password123" }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("trims and lowercases email on registration", async () => {
    const email = makeEmail("casing");
    const uppercased = email.toUpperCase();
    const res = await POST(makeRequest({ email: `  ${uppercased}  `, password: "password123" }));

    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { email: string } };
    expect(body.data.email).toBe(email); // stored lowercase
  });
});
