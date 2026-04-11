/**
 * Transactions API integration tests (Stories 4.3, 4.4).
 *
 * Tests:
 *   GET /api/transactions?month=YYYY-MM  — list + category filter
 *   GET /api/transactions/search?q=...   — merchant + amount search
 *
 * Requires a real PostgreSQL instance with migrations applied.
 * Run: npm run test:transactions (from apps/web/)
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
import { GET as listTransactions } from "~/app/api/transactions/route";
import { GET as searchTransactions } from "~/app/api/transactions/search/route";
import { NextRequest } from "next/server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockAuth = auth as unknown as { mockResolvedValue: (v: any) => void };

const TEST_DOMAIN = "@transactions-test.mint-test.invalid";

function makeEmail(suffix: string) {
  return `txn-${suffix}${TEST_DOMAIN}`;
}

async function createTestUser(email: string) {
  return prisma.user.create({
    data: { email, passwordHash: "$2b$12$placeholder", role: "USER", isActive: true },
  });
}

describe("GET /api/transactions", () => {
  let user: { id: string; email: string };

  beforeAll(async () => {
    await prisma.$executeRaw`DELETE FROM users WHERE email LIKE ${`%${TEST_DOMAIN}`}`;
    user = await createTestUser(makeEmail("main"));

    await prisma.transaction.createMany({
      data: [
        { userId: user.id, date: new Date("2026-03-01"), merchantRaw: "WHOLE FOODS", merchantNorm: "whole foods", amount: 80, category: "Groceries", isFlagged: false, isReviewed: true, isExcluded: false, isDuplicate: false },
        { userId: user.id, date: new Date("2026-03-10"), merchantRaw: "CHIPOTLE", merchantNorm: "chipotle", amount: 15.50, category: "Dining", isFlagged: true, isReviewed: false, isExcluded: false, isDuplicate: false },
        { userId: user.id, date: new Date("2026-03-20"), merchantRaw: "NETFLIX", merchantNorm: "netflix", amount: 17.99, category: "Subscriptions", isFlagged: false, isReviewed: true, isExcluded: false, isDuplicate: false },
        // Different month — should NOT appear in March query
        { userId: user.id, date: new Date("2026-02-15"), merchantRaw: "FEB TXN", merchantNorm: "feb txn", amount: 50, category: "Shopping", isFlagged: false, isReviewed: true, isExcluded: false, isDuplicate: false },
      ],
    });
  });

  afterAll(async () => {
    await prisma.$executeRaw`DELETE FROM users WHERE email LIKE ${`%${TEST_DOMAIN}`}`;
    await prisma.$disconnect();
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await listTransactions(new NextRequest("http://localhost/api/transactions?month=2026-03"));
    expect(res.status).toBe(401);
  });

  it("returns 400 when month param is missing", async () => {
    mockAuth.mockResolvedValue({ user: { id: user.id, email: user.email } });
    const res = await listTransactions(new NextRequest("http://localhost/api/transactions"));
    expect(res.status).toBe(400);
  });

  it("returns only transactions for the requested month", async () => {
    mockAuth.mockResolvedValue({ user: { id: user.id, email: user.email } });
    const res = await listTransactions(new NextRequest("http://localhost/api/transactions?month=2026-03"));
    expect(res.status).toBe(200);
    const body = await res.json() as { data: { merchantNorm: string }[] };
    expect(body.data).toHaveLength(3);
    const merchants = body.data.map((t) => t.merchantNorm);
    expect(merchants).toContain("whole foods");
    expect(merchants).toContain("chipotle");
    expect(merchants).toContain("netflix");
    expect(merchants).not.toContain("feb txn");
  });

  it("filters by category when category param is provided", async () => {
    mockAuth.mockResolvedValue({ user: { id: user.id, email: user.email } });
    const res = await listTransactions(new NextRequest("http://localhost/api/transactions?month=2026-03&category=Groceries"));
    expect(res.status).toBe(200);
    const body = await res.json() as { data: { category: string }[] };
    expect(body.data).toHaveLength(1);
    expect(body.data[0].category).toBe("Groceries");
  });

  it("filters flagged transactions when flagged=true", async () => {
    mockAuth.mockResolvedValue({ user: { id: user.id, email: user.email } });
    const res = await listTransactions(new NextRequest("http://localhost/api/transactions?month=2026-03&flagged=true"));
    expect(res.status).toBe(200);
    const body = await res.json() as { data: { isFlagged: boolean; isReviewed: boolean }[] };
    expect(body.data.every((t) => t.isFlagged && !t.isReviewed)).toBe(true);
  });
});

describe("GET /api/transactions/search", () => {
  let user: { id: string; email: string };

  beforeAll(async () => {
    await prisma.$executeRaw`DELETE FROM users WHERE email LIKE ${`%${TEST_DOMAIN}`}`;
    user = await createTestUser(makeEmail("search"));

    await prisma.transaction.createMany({
      data: [
        { userId: user.id, date: new Date("2026-03-01"), merchantRaw: "AMAZON.COM", merchantNorm: "amazon", amount: 29.99, category: "Shopping", isFlagged: false, isReviewed: true, isExcluded: false, isDuplicate: false },
        { userId: user.id, date: new Date("2026-03-05"), merchantRaw: "AMAZON PRIME", merchantNorm: "amazon prime", amount: 14.99, category: "Subscriptions", isFlagged: false, isReviewed: true, isExcluded: false, isDuplicate: false },
        { userId: user.id, date: new Date("2026-03-10"), merchantRaw: "STARBUCKS", merchantNorm: "starbucks", amount: 6.50, category: "Dining", isFlagged: false, isReviewed: true, isExcluded: false, isDuplicate: false },
      ],
    });
  });

  afterAll(async () => {
    await prisma.$executeRaw`DELETE FROM users WHERE email LIKE ${`%${TEST_DOMAIN}`}`;
    await prisma.$disconnect();
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await searchTransactions(new NextRequest("http://localhost/api/transactions/search?q=amazon"));
    expect(res.status).toBe(401);
  });

  it("returns empty array when q is empty", async () => {
    mockAuth.mockResolvedValue({ user: { id: user.id, email: user.email } });
    const res = await searchTransactions(new NextRequest("http://localhost/api/transactions/search?q="));
    const body = await res.json() as { data: unknown[] };
    expect(body.data).toHaveLength(0);
  });

  it("returns matching transactions by merchant name (case-insensitive)", async () => {
    mockAuth.mockResolvedValue({ user: { id: user.id, email: user.email } });
    const res = await searchTransactions(new NextRequest("http://localhost/api/transactions/search?q=amazon"));
    const body = await res.json() as { data: { merchantNorm: string }[] };
    expect(body.data.length).toBe(2);
    expect(body.data.every((t) => t.merchantNorm.includes("amazon"))).toBe(true);
  });

  it("returns matching transactions by exact amount", async () => {
    mockAuth.mockResolvedValue({ user: { id: user.id, email: user.email } });
    const res = await searchTransactions(new NextRequest("http://localhost/api/transactions/search?q=6.50"));
    const body = await res.json() as { data: { merchantNorm: string }[] };
    expect(body.data.length).toBe(1);
    expect(body.data[0].merchantNorm).toBe("starbucks");
  });

  it("scopes search to month when month param provided", async () => {
    mockAuth.mockResolvedValue({ user: { id: user.id, email: user.email } });
    // Add a Feb transaction with same merchant
    await prisma.transaction.create({
      data: { userId: user.id, date: new Date("2026-02-01"), merchantRaw: "AMAZON", merchantNorm: "amazon", amount: 99, category: "Shopping", isFlagged: false, isReviewed: true, isExcluded: false, isDuplicate: false },
    });
    const res = await searchTransactions(new NextRequest("http://localhost/api/transactions/search?q=amazon&month=2026-03"));
    const body = await res.json() as { data: { merchantNorm: string }[] };
    // Feb transaction should be excluded
    expect(body.data.every((t) => !t.merchantNorm.includes("feb"))).toBe(true);
    expect(body.data.length).toBe(2);
  });
});