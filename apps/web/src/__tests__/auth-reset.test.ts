/**
 * Password reset integration tests (Story 1.4).
 *
 * Tests POST /api/auth/forgot-password and POST /api/auth/reset-password
 * by calling the route handlers directly against a real PostgreSQL instance.
 *
 * Run: npm run test:reset (from apps/web/)
 *
 * CI: uses the postgres service container from ci.yml (DATABASE_URL env var).
 */
import crypto from "crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { prisma } from "~/lib/db";
import { POST as forgotPassword } from "~/app/api/auth/forgot-password/route";
import { POST as resetPassword } from "~/app/api/auth/reset-password/route";

const TEST_DOMAIN = "@reset-test.mint-test.invalid";

function makeEmail(suffix: string) {
  return `reset-test-${suffix}${TEST_DOMAIN}`;
}

function makeRequest(url: string, body: Record<string, unknown>) {
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function forgotReq(body: Record<string, unknown>) {
  return makeRequest("http://localhost/api/auth/forgot-password", body);
}

function resetReq(body: Record<string, unknown>) {
  return makeRequest("http://localhost/api/auth/reset-password", body);
}

/** Insert a test user directly (bypass RLS — no session var set). */
async function createTestUser(email: string) {
  return prisma.user.create({
    data: { email, passwordHash: "$2b$12$placeholder", role: "USER", isActive: true },
  });
}

/** Create a reset token with known raw value for testing reset flow. */
async function createResetToken(
  userId: string,
  options: { expiredAt?: Date; usedAt?: Date } = {},
) {
  const rawToken = `test-token-${crypto.randomBytes(8).toString("hex")}`;
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = options.expiredAt ?? new Date(Date.now() + 3600000);
  await prisma.passwordResetToken.create({
    data: { userId, tokenHash, expiresAt, usedAt: options.usedAt },
  });
  return rawToken;
}

describe("POST /api/auth/forgot-password", () => {
  beforeEach(async () => {
    await prisma.$executeRaw`
      DELETE FROM users WHERE email LIKE ${`%${TEST_DOMAIN}`}
    `;
  });

  afterAll(async () => {
    await prisma.$executeRaw`
      DELETE FROM users WHERE email LIKE ${`%${TEST_DOMAIN}`}
    `;
    await prisma.$disconnect();
  });

  it("returns 200 with generic message for existing email", async () => {
    await createTestUser(makeEmail("exists"));
    const res = await forgotPassword(forgotReq({ email: makeEmail("exists") }));

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { message: string } };
    expect(body.data.message).toContain("If that email is registered");
  });

  it("returns 200 with same generic message for non-existing email (no enumeration)", async () => {
    const res = await forgotPassword(
      forgotReq({ email: makeEmail("does-not-exist") }),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { message: string } };
    expect(body.data.message).toContain("If that email is registered");
  });

  it("creates a password_reset_tokens row for existing user", async () => {
    const user = await createTestUser(makeEmail("token-created"));

    await forgotPassword(forgotReq({ email: user.email }));

    const record = await prisma.passwordResetToken.findFirst({
      where: { userId: user.id },
    });
    expect(record).not.toBeNull();
    expect(record!.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("stores a SHA-256 hash, not the plaintext token", async () => {
    const user = await createTestUser(makeEmail("hash-check"));

    await forgotPassword(forgotReq({ email: user.email }));

    const record = await prisma.passwordResetToken.findFirst({
      where: { userId: user.id },
    });
    expect(record).not.toBeNull();
    // tokenHash should be a 64-char hex string (SHA-256 output)
    expect(record!.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    // It should not be a raw random string < 64 chars
    expect(record!.tokenHash.length).toBe(64);
  });

  it("deletes old unused tokens before creating a new one", async () => {
    const user = await createTestUser(makeEmail("old-token"));

    // Create two tokens
    await forgotPassword(forgotReq({ email: user.email }));
    await forgotPassword(forgotReq({ email: user.email }));

    const records = await prisma.passwordResetToken.findMany({
      where: { userId: user.id, usedAt: null },
    });
    // Only one unused token should exist
    expect(records).toHaveLength(1);
  });

  it("returns 200 for invalid email format (generic response)", async () => {
    const res = await forgotPassword(forgotReq({ email: "notanemail" }));
    expect(res.status).toBe(200);
  });
});

describe("POST /api/auth/reset-password", () => {
  let userId: string;

  beforeEach(async () => {
    await prisma.$executeRaw`
      DELETE FROM users WHERE email LIKE ${`%${TEST_DOMAIN}`}
    `;
    const user = await createTestUser(makeEmail("reset-user"));
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.$executeRaw`
      DELETE FROM users WHERE email LIKE ${`%${TEST_DOMAIN}`}
    `;
  });

  it("returns 200 and updates password for valid token", async () => {
    const rawToken = await createResetToken(userId);

    const res = await resetPassword(
      resetReq({ token: rawToken, password: "newpassword123" }),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { message: string } };
    expect(body.data.message).toBe("Password updated");

    // Verify password was updated
    const user = await prisma.user.findUnique({ where: { id: userId } });
    expect(user!.passwordHash).not.toBe("$2b$12$placeholder");
    expect(user!.passwordHash).toMatch(/^\$2[ab]\$/);
  });

  it("marks token as used after reset", async () => {
    const rawToken = await createResetToken(userId);

    await resetPassword(resetReq({ token: rawToken, password: "newpassword123" }));

    const record = await prisma.passwordResetToken.findFirst({
      where: { userId },
    });
    expect(record!.usedAt).not.toBeNull();
  });

  it("invalidates all sessions after password reset", async () => {
    const rawToken = await createResetToken(userId);

    // Create a fake session
    await prisma.session.create({
      data: {
        sessionToken: "fake-session-token",
        userId,
        expires: new Date(Date.now() + 86400000),
      },
    });

    await resetPassword(resetReq({ token: rawToken, password: "newpassword123" }));

    const sessions = await prisma.session.findMany({ where: { userId } });
    expect(sessions).toHaveLength(0);
  });

  it("returns 400 INVALID_OR_EXPIRED_TOKEN for expired token", async () => {
    const rawToken = await createResetToken(userId, {
      expiredAt: new Date(Date.now() - 1000), // already expired
    });

    const res = await resetPassword(
      resetReq({ token: rawToken, password: "newpassword123" }),
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("INVALID_OR_EXPIRED_TOKEN");
  });

  it("returns 400 INVALID_OR_EXPIRED_TOKEN for already-used token", async () => {
    const rawToken = await createResetToken(userId, {
      usedAt: new Date(Date.now() - 5000),
    });

    const res = await resetPassword(
      resetReq({ token: rawToken, password: "newpassword123" }),
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("INVALID_OR_EXPIRED_TOKEN");
  });

  it("returns 400 INVALID_OR_EXPIRED_TOKEN for non-existent token", async () => {
    const res = await resetPassword(
      resetReq({ token: "totally-fake-token-xyz", password: "newpassword123" }),
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("INVALID_OR_EXPIRED_TOKEN");
  });

  it("returns 400 VALIDATION_ERROR for password shorter than 8 characters", async () => {
    const rawToken = await createResetToken(userId);

    const res = await resetPassword(
      resetReq({ token: rawToken, password: "short" }),
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 VALIDATION_ERROR for password longer than 128 characters", async () => {
    const rawToken = await createResetToken(userId);

    const res = await resetPassword(
      resetReq({ token: rawToken, password: "a".repeat(129) }),
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a second use of the same token", async () => {
    const rawToken = await createResetToken(userId);

    // Use it once
    await resetPassword(resetReq({ token: rawToken, password: "firstpassword1" }));

    // Try to use it again
    const res = await resetPassword(
      resetReq({ token: rawToken, password: "secondpassword2" }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("INVALID_OR_EXPIRED_TOKEN");
  });
});
