/**
 * Category correction & exclusion integration tests (Stories 3.3, 3.5).
 *
 * Tests PATCH /api/transactions/:id for:
 *   - Category correction (sets isReviewed=true, writes correction_log)
 *   - Transaction exclusion toggle
 *   - Auth enforcement
 *   - Cross-tenant isolation (user cannot update another user's transaction)
 *
 * Requires a real PostgreSQL instance with migrations applied.
 * Run: npm run test:correction (from apps/web/)
 */
import { vi, afterAll, beforeAll, describe, expect, it } from "vitest";

vi.mock("~/lib/auth", () => ({
  auth: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  handlers: { GET: vi.fn(), POST: vi.fn() },
}));

import { auth } from "~/lib/auth";
import { prisma } from "~/lib/db";
import { PATCH } from "~/app/api/transactions/[id]/route";
import { NextRequest } from "next/server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockAuth = auth as unknown as { mockResolvedValue: (v: any) => void };

const TEST_DOMAIN = "@correction-test.mint-test.invalid";

function makeEmail(suffix: string) {
  return `correction-${suffix}${TEST_DOMAIN}`;
}

async function createTestUser(email: string) {
  return prisma.user.create({
    data: { email, passwordHash: "$2b$12$placeholder", role: "USER", isActive: true },
  });
}

async function createTestTransaction(userId: string, overrides: Record<string, unknown> = {}) {
  return prisma.transaction.create({
    data: {
      userId,
      date: new Date("2026-03-15"),
      merchantRaw: "WHOLE FOODS MARKET",
      merchantNorm: "whole foods market",
      amount: 45.50,
      category: "Groceries",
      confidence: 0.95,
      isFlagged: false,
      isReviewed: false,
      isExcluded: false,
      isDuplicate: false,
      ...overrides,
    },
  });
}

function makePatchRequest(id: string, body: Record<string, unknown>) {
  return new NextRequest(`http://localhost/api/transactions/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/transactions/:id", () => {
  let userA: { id: string; email: string };
  let userB: { id: string; email: string };
  let txA: { id: string };

  beforeAll(async () => {
    await prisma.$executeRaw`DELETE FROM users WHERE email LIKE ${`%${TEST_DOMAIN}`}`;
    userA = await createTestUser(makeEmail("user-a"));
    userB = await createTestUser(makeEmail("user-b"));
    txA = await createTestTransaction(userA.id);
  });

  afterAll(async () => {
    await prisma.$executeRaw`DELETE FROM users WHERE email LIKE ${`%${TEST_DOMAIN}`}`;
    await prisma.$disconnect();
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await PATCH(
      makePatchRequest(txA.id, { category: "Dining" }),
      { params: Promise.resolve({ id: txA.id }) },
    );
    expect(res.status).toBe(401);
  });

  it("corrects category and sets isReviewed=true", async () => {
    mockAuth.mockResolvedValue({ user: { id: userA.id, email: userA.email } });
    const res = await PATCH(
      makePatchRequest(txA.id, { category: "Dining" }),
      { params: Promise.resolve({ id: txA.id }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { data: { category: string; isReviewed: boolean } };
    expect(body.data.category).toBe("Dining");
    expect(body.data.isReviewed).toBe(true);

    // Verify correction_log entry was created
    const log = await prisma.correctionLog.findFirst({
      where: { userId: userA.id, correctedCategory: "Dining" },
    });
    expect(log).not.toBeNull();
    expect(log?.merchantPattern).toBe("whole foods market");
  });

  it("toggles isExcluded=true", async () => {
    mockAuth.mockResolvedValue({ user: { id: userA.id, email: userA.email } });
    const res = await PATCH(
      makePatchRequest(txA.id, { isExcluded: true }),
      { params: Promise.resolve({ id: txA.id }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { data: { isExcluded: boolean } };
    expect(body.data.isExcluded).toBe(true);
  });

  it("toggles isExcluded back to false", async () => {
    mockAuth.mockResolvedValue({ user: { id: userA.id, email: userA.email } });
    const res = await PATCH(
      makePatchRequest(txA.id, { isExcluded: false }),
      { params: Promise.resolve({ id: txA.id }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { data: { isExcluded: boolean } };
    expect(body.data.isExcluded).toBe(false);
  });

  it("returns 422 for invalid category", async () => {
    mockAuth.mockResolvedValue({ user: { id: userA.id, email: userA.email } });
    const res = await PATCH(
      makePatchRequest(txA.id, { category: "NotACategory" }),
      { params: Promise.resolve({ id: txA.id }) },
    );
    expect(res.status).toBe(422);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe("INVALID_CATEGORY");
  });

  it("returns 400 when no fields provided", async () => {
    mockAuth.mockResolvedValue({ user: { id: userA.id, email: userA.email } });
    const res = await PATCH(
      makePatchRequest(txA.id, {}),
      { params: Promise.resolve({ id: txA.id }) },
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when userB tries to update userA's transaction (RLS isolation)", async () => {
    mockAuth.mockResolvedValue({ user: { id: userB.id, email: userB.email } });
    const res = await PATCH(
      makePatchRequest(txA.id, { category: "Shopping" }),
      { params: Promise.resolve({ id: txA.id }) },
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 for non-existent transaction id", async () => {
    mockAuth.mockResolvedValue({ user: { id: userA.id, email: userA.email } });
    const fakeId = "00000000-0000-0000-0000-000000000000";
    const res = await PATCH(
      makePatchRequest(fakeId, { category: "Dining" }),
      { params: Promise.resolve({ id: fakeId }) },
    );
    expect(res.status).toBe(404);
  });
});