/**
 * Account deletion integration tests (Story 1.5).
 *
 * Tests DELETE /api/account by calling the route handler directly.
 * Mocks `auth()` from ~/lib/auth so tests don't need a real session cookie.
 * Cascade delete behavior is verified against a real PostgreSQL instance.
 *
 * Run: npm run test:account (from apps/web/)
 *
 * CI: uses the postgres service container from ci.yml (DATABASE_URL env var).
 */
import { vi, afterAll, beforeEach, describe, expect, it } from "vitest";

// Mock auth before importing the route handler
vi.mock("~/lib/auth", () => ({
  auth: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  handlers: { GET: vi.fn(), POST: vi.fn() },
}));

import { auth } from "~/lib/auth";
import { prisma } from "~/lib/db";
import { DELETE } from "~/app/api/account/route";

// auth() is overloaded in NextAuth v5; cast to a simple mock function.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockAuth = auth as unknown as { mockResolvedValue: (v: any) => void };

const TEST_DOMAIN = "@account-test.mint-test.invalid";

function makeEmail(suffix: string) {
  return `account-test-${suffix}${TEST_DOMAIN}`;
}

async function createTestUser(email: string) {
  return prisma.user.create({
    data: {
      email,
      passwordHash: "$2b$12$placeholder",
      role: "USER",
      isActive: true,
    },
  });
}

describe("DELETE /api/account", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
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

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);

    const res = await DELETE();

    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 200 and deletes the user row", async () => {
    const user = await createTestUser(makeEmail("deleted"));
    mockAuth.mockResolvedValue({ user: { id: user.id, email: user.email } });

    const res = await DELETE();

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { message: string } };
    expect(body.data.message).toBe("Account deleted");

    // User row must be gone
    const found = await prisma.user.findUnique({ where: { id: user.id } });
    expect(found).toBeNull();
  });

  it("cascades deletion to statements and transactions", async () => {
    const user = await createTestUser(makeEmail("cascade"));

    // Insert statement + transaction
    const [stmt] = await prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO statements (id, "userId", filename, "uploadedAt")
      VALUES (gen_random_uuid(), ${user.id}::uuid, 'test.csv', NOW())
      RETURNING id
    `;
    await prisma.$executeRaw`
      INSERT INTO transactions (
        id, "userId", "statementId", date,
        "merchantRaw", "merchantNorm", amount, "createdAt"
      ) VALUES (
        gen_random_uuid(), ${user.id}::uuid, ${stmt?.id}::uuid,
        NOW(), 'ACME', 'Acme', 10.00, NOW()
      )
    `;

    mockAuth.mockResolvedValue({ user: { id: user.id, email: user.email } });

    await DELETE();

    const stmts = await prisma.$queryRaw<unknown[]>`
      SELECT id FROM statements WHERE "userId" = ${user.id}::uuid
    `;
    const txns = await prisma.$queryRaw<unknown[]>`
      SELECT id FROM transactions WHERE "userId" = ${user.id}::uuid
    `;

    expect(stmts).toHaveLength(0);
    expect(txns).toHaveLength(0);
  });

  it("cascades deletion to correction_logs and job_status", async () => {
    const user = await createTestUser(makeEmail("cascade-extra"));

    await prisma.$executeRaw`
      INSERT INTO correction_logs (id, "userId", "merchantPattern", "correctedCategory", "createdAt")
      VALUES (gen_random_uuid(), ${user.id}::uuid, 'test', 'Shopping', NOW())
    `;
    await prisma.$executeRaw`
      INSERT INTO job_status (id, "userId", stage, "transactionCount", "createdAt", "updatedAt")
      VALUES (gen_random_uuid(), ${user.id}::uuid, 'QUEUED'::"JobStage", 0, NOW(), NOW())
    `;

    mockAuth.mockResolvedValue({ user: { id: user.id, email: user.email } });

    await DELETE();

    const corrections = await prisma.$queryRaw<unknown[]>`
      SELECT id FROM correction_logs WHERE "userId" = ${user.id}::uuid
    `;
    const jobs = await prisma.$queryRaw<unknown[]>`
      SELECT id FROM job_status WHERE "userId" = ${user.id}::uuid
    `;

    expect(corrections).toHaveLength(0);
    expect(jobs).toHaveLength(0);
  });

  it("cascades deletion to password_reset_tokens", async () => {
    const user = await createTestUser(makeEmail("cascade-tokens"));

    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: "abc123def456abc123def456abc123def456abc123def456abc123def456ab12",
        expiresAt: new Date(Date.now() + 3600000),
      },
    });

    mockAuth.mockResolvedValue({ user: { id: user.id, email: user.email } });

    await DELETE();

    const tokens = await prisma.passwordResetToken.findMany({
      where: { userId: user.id },
    });
    expect(tokens).toHaveLength(0);
  });
});
