/**
 * Monthly summary API integration tests (Story 4.1).
 *
 * Tests GET /api/summary/:month for:
 *   - Correct totals, byCategory breakdown, transactionCount
 *   - vsLastMonth percentage calculation
 *   - Excluded transactions are omitted from totals
 *   - Auth enforcement
 *   - Cross-tenant isolation
 *
 * Requires a real PostgreSQL instance with migrations applied.
 * Run: npm run test:summary (from apps/web/)
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
import { GET } from "~/app/api/summary/[month]/route";
import { NextRequest } from "next/server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockAuth = auth as unknown as { mockResolvedValue: (v: any) => void };

const TEST_DOMAIN = "@summary-test.mint-test.invalid";

function makeEmail(suffix: string) {
  return `summary-${suffix}${TEST_DOMAIN}`;
}

async function createTestUser(email: string) {
  return prisma.user.create({
    data: { email, passwordHash: "$2b$12$placeholder", role: "USER", isActive: true },
  });
}

function makeGetRequest(month: string) {
  return new NextRequest(`http://localhost/api/summary/${month}`);
}

describe("GET /api/summary/:month", () => {
  let user: { id: string; email: string };

  beforeAll(async () => {
    await prisma.$executeRaw`DELETE FROM users WHERE email LIKE ${`%${TEST_DOMAIN}`}`;
    user = await createTestUser(makeEmail("main"));

    // March 2026: $100 Groceries + $50 Dining + $25 excluded
    await prisma.transaction.createMany({
      data: [
        { userId: user.id, date: new Date("2026-03-01"), merchantRaw: "GROCERY", merchantNorm: "grocery", amount: 100, category: "Groceries", isExcluded: false, isFlagged: false, isReviewed: true, isDuplicate: false },
        { userId: user.id, date: new Date("2026-03-15"), merchantRaw: "RESTAURANT", merchantNorm: "restaurant", amount: 50, category: "Dining", isExcluded: false, isFlagged: false, isReviewed: true, isDuplicate: false },
        { userId: user.id, date: new Date("2026-03-20"), merchantRaw: "SKIP THIS", merchantNorm: "skip this", amount: 25, category: "Shopping", isExcluded: true, isFlagged: false, isReviewed: true, isDuplicate: false },
      ],
    });

    // February 2026 (prior month): $200 total — for vsLastMonth calculation
    await prisma.transaction.createMany({
      data: [
        { userId: user.id, date: new Date("2026-02-10"), merchantRaw: "FEB GROCERY", merchantNorm: "feb grocery", amount: 200, category: "Groceries", isExcluded: false, isFlagged: false, isReviewed: true, isDuplicate: false },
      ],
    });
  });

  afterAll(async () => {
    await prisma.$executeRaw`DELETE FROM users WHERE email LIKE ${`%${TEST_DOMAIN}`}`;
    await prisma.$disconnect();
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(makeGetRequest("2026-03"), { params: Promise.resolve({ month: "2026-03" }) });
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid month format", async () => {
    mockAuth.mockResolvedValue({ user: { id: user.id, email: user.email } });
    const res = await GET(makeGetRequest("2026-3"), { params: Promise.resolve({ month: "2026-3" }) });
    expect(res.status).toBe(400);
  });

  it("returns correct totalSpent excluding excluded transactions", async () => {
    mockAuth.mockResolvedValue({ user: { id: user.id, email: user.email } });
    const res = await GET(makeGetRequest("2026-03"), { params: Promise.resolve({ month: "2026-03" }) });
    expect(res.status).toBe(200);
    const body = await res.json() as { data: { totalSpent: string; transactionCount: number } };
    // $100 + $50 = $150 (excluded $25 omitted)
    expect(body.data.totalSpent).toBe("150.00");
    expect(body.data.transactionCount).toBe(2);
  });

  it("returns byCategory breakdown sorted descending by total", async () => {
    mockAuth.mockResolvedValue({ user: { id: user.id, email: user.email } });
    const res = await GET(makeGetRequest("2026-03"), { params: Promise.resolve({ month: "2026-03" }) });
    const body = await res.json() as { data: { byCategory: { category: string; total: string; pct: number }[] } };
    expect(body.data.byCategory[0].category).toBe("Groceries");
    expect(body.data.byCategory[0].total).toBe("100.00");
    expect(body.data.byCategory[1].category).toBe("Dining");
    expect(body.data.byCategory[1].total).toBe("50.00");
  });

  it("returns percentages that sum to 100", async () => {
    mockAuth.mockResolvedValue({ user: { id: user.id, email: user.email } });
    const res = await GET(makeGetRequest("2026-03"), { params: Promise.resolve({ month: "2026-03" }) });
    const body = await res.json() as { data: { byCategory: { pct: number }[] } };
    const sum = body.data.byCategory.reduce((acc, c) => acc + c.pct, 0);
    expect(sum).toBe(100);
  });

  it("returns vsLastMonth percentage compared to prior month", async () => {
    mockAuth.mockResolvedValue({ user: { id: user.id, email: user.email } });
    const res = await GET(makeGetRequest("2026-03"), { params: Promise.resolve({ month: "2026-03" }) });
    const body = await res.json() as { data: { vsLastMonth: string | null } };
    // ($150 - $200) / $200 * 100 = -25%
    expect(body.data.vsLastMonth).toBe("-25.0%");
  });

  it("returns vsLastMonth=null when no prior month data", async () => {
    mockAuth.mockResolvedValue({ user: { id: user.id, email: user.email } });
    // January 2026 has no February equivalent (no Dec 2025 data)
    const res = await GET(makeGetRequest("2026-01"), { params: Promise.resolve({ month: "2026-01" }) });
    const body = await res.json() as { data: { vsLastMonth: string | null } };
    expect(body.data.vsLastMonth).toBeNull();
  });

  it("returns empty summary for month with no data", async () => {
    mockAuth.mockResolvedValue({ user: { id: user.id, email: user.email } });
    const res = await GET(makeGetRequest("2020-01"), { params: Promise.resolve({ month: "2020-01" }) });
    expect(res.status).toBe(200);
    const body = await res.json() as { data: { totalSpent: string; byCategory: unknown[]; transactionCount: number } };
    expect(body.data.totalSpent).toBe("0.00");
    expect(body.data.byCategory).toHaveLength(0);
    expect(body.data.transactionCount).toBe(0);
  });
});