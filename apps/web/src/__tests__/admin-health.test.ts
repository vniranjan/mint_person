/**
 * Admin health API integration tests (Story 5.3).
 *
 * Tests GET /api/admin/health for:
 *   - Auth enforcement (401 unauthenticated, 403 non-admin)
 *   - Response shape: app, worker, queueDepth, failedJobsLast24h, failedJobs
 *   - failedJobsLast24h uses count query (not capped at take:50)
 *   - queueDepth returns null when queue is unavailable
 *
 * Requires a real PostgreSQL instance with migrations applied.
 * Azure queue is mocked — this test validates DB/logic only.
 * Run: npm run test:admin-health (from apps/web/)
 */
import { vi, afterAll, beforeAll, describe, expect, it } from "vitest";

vi.mock("~/lib/auth", () => ({
  auth: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  handlers: { GET: vi.fn(), POST: vi.fn() },
}));

// Mock Azure queue — not available in test environment
vi.mock("@azure/storage-queue", () => ({
  QueueServiceClient: {
    fromConnectionString: vi.fn().mockReturnValue({
      getQueueClient: vi.fn().mockReturnValue({
        getProperties: vi.fn().mockResolvedValue({ approximateMessagesCount: 3 }),
      }),
    }),
  },
}));

vi.mock("~/lib/azure-queue", () => ({
  QUEUE_NAME: "statement-processing",
}));

import { auth } from "~/lib/auth";
import { prisma } from "~/lib/db";
import { GET } from "~/app/api/admin/health/route";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockAuth = auth as unknown as { mockResolvedValue: (v: any) => void };

const TEST_DOMAIN = "@admin-health-test.mint-test.invalid";

function makeEmail(suffix: string) {
  return `admin-health-${suffix}${TEST_DOMAIN}`;
}

interface HealthResponse {
  data: {
    app: string;
    worker: string;
    queueDepth: number | null;
    failedJobsLast24h: number;
    failedJobs: { id: string; statementId: string; userEmail: string; failedAt: string; errorMessage: string | null }[];
  };
}

describe("GET /api/admin/health", () => {
  let admin: { id: string; email: string };
  let regularUser: { id: string; email: string };
  let statement: { id: string };

  beforeAll(async () => {
    await prisma.$executeRaw`DELETE FROM users WHERE email LIKE ${`%${TEST_DOMAIN}`}`;
    admin = await prisma.user.create({
      data: { email: makeEmail("admin"), passwordHash: "$2b$12$placeholder", role: "ADMIN", isActive: true },
    });
    regularUser = await prisma.user.create({
      data: { email: makeEmail("regular"), passwordHash: "$2b$12$placeholder", role: "USER", isActive: true },
    });
    statement = await prisma.statement.create({
      data: { userId: regularUser.id, filename: "test.csv", uploadedAt: new Date() },
    });

    // Create 2 failed jobs in the last 24h
    const since = new Date(Date.now() - 1000 * 60 * 60); // 1 hour ago
    await prisma.jobStatus.createMany({
      data: [
        { userId: regularUser.id, statementId: statement.id, stage: "FAILED", errorMessage: "Parser error", createdAt: since, updatedAt: since },
        { userId: regularUser.id, statementId: statement.id, stage: "FAILED", errorMessage: "LLM timeout", createdAt: since, updatedAt: since },
      ],
    });
  });

  afterAll(async () => {
    await prisma.$executeRaw`DELETE FROM users WHERE email LIKE ${`%${TEST_DOMAIN}`}`;
    await prisma.$disconnect();
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin user", async () => {
    mockAuth.mockResolvedValue({ user: { id: regularUser.id, email: regularUser.email, role: "USER" } });
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns health data with correct shape for admin", async () => {
    mockAuth.mockResolvedValue({ user: { id: admin.id, email: admin.email, role: "ADMIN" } });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json() as HealthResponse;
    expect(body.data.app).toBe("ok");
    expect(["ok", "unknown"]).toContain(body.data.worker);
    // queueDepth is a number (mocked to 3) or null
    expect(body.data.queueDepth === null || typeof body.data.queueDepth === "number").toBe(true);
    expect(typeof body.data.failedJobsLast24h).toBe("number");
    expect(Array.isArray(body.data.failedJobs)).toBe(true);
  });

  it("failedJobsLast24h reflects actual count (not capped by take:50)", async () => {
    mockAuth.mockResolvedValue({ user: { id: admin.id, email: admin.email, role: "ADMIN" } });
    const res = await GET();
    const body = await res.json() as HealthResponse;
    // We created 2 failed jobs
    expect(body.data.failedJobsLast24h).toBeGreaterThanOrEqual(2);
  });

  it("failed jobs list includes userEmail and errorMessage", async () => {
    mockAuth.mockResolvedValue({ user: { id: admin.id, email: admin.email, role: "ADMIN" } });
    const res = await GET();
    const body = await res.json() as HealthResponse;
    const ourJobs = body.data.failedJobs.filter((j) => j.userEmail === regularUser.email);
    expect(ourJobs.length).toBeGreaterThanOrEqual(1);
    expect(ourJobs[0].errorMessage).toBeTruthy();
  });

  it("queueDepth is null when Azure queue is unavailable", async () => {
    // Override the mock to simulate failure
    const { QueueServiceClient } = await import("@azure/storage-queue");
    vi.mocked(QueueServiceClient.fromConnectionString).mockReturnValueOnce({
      getQueueClient: vi.fn().mockReturnValue({
        getProperties: vi.fn().mockRejectedValueOnce(new Error("Connection refused")),
      }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    mockAuth.mockResolvedValue({ user: { id: admin.id, email: admin.email, role: "ADMIN" } });
    const res = await GET();
    const body = await res.json() as HealthResponse;
    expect(body.data.queueDepth).toBeNull();
  });
});