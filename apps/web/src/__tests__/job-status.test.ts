/**
 * Job status API integration tests (Story 2.3).
 *
 * Tests GET /api/jobs/[id]/status by calling the route handler directly.
 * Validates:
 * - 200 with stage data for a valid owned job
 * - 404 for a job that doesn't belong to the requesting user
 * - 401 for unauthenticated requests
 *
 * Run: npm run test:jobs (from apps/web/)
 */
import { vi, afterAll, beforeEach, describe, expect, it } from "vitest";

vi.mock("~/lib/auth", () => ({
  auth: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  handlers: { GET: vi.fn(), POST: vi.fn() },
}));

import { auth } from "~/lib/auth";
import { prisma } from "~/lib/db";
import { GET } from "~/app/api/jobs/[id]/status/route";
import { NextRequest } from "next/server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockAuth = auth as unknown as { mockResolvedValue: (v: any) => void };

const TEST_DOMAIN = "@job-status-test.mint-test.invalid";

function makeEmail(suffix: string) {
  return `job-status-test-${suffix}${TEST_DOMAIN}`;
}

async function createTestUser(email: string) {
  return prisma.user.create({
    data: { email, passwordHash: "$2b$12$placeholder", role: "USER", isActive: true },
  });
}

function makeRequest(jobId: string): [NextRequest, { params: Promise<{ id: string }> }] {
  const req = new NextRequest(`http://localhost/api/jobs/${jobId}/status`);
  const params = Promise.resolve({ id: jobId });
  return [req, { params }];
}

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { endsWith: TEST_DOMAIN } } });
  await prisma.$disconnect();
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/jobs/[id]/status", () => {
  it("returns 401 for unauthenticated requests", async () => {
    mockAuth.mockResolvedValue(null);
    const [req, ctx] = makeRequest("00000000-0000-0000-0000-000000000000");
    const res = await GET(req, ctx);
    expect(res.status).toBe(401);
  });

  it("returns 200 with job data for authenticated owner", async () => {
    const user = await createTestUser(makeEmail("owner"));
    mockAuth.mockResolvedValue({ user: { id: user.id, email: user.email } });

    // Create a statement and job
    const statement = await prisma.statement.create({
      data: { userId: user.id, filename: "test.csv" },
    });
    const job = await prisma.jobStatus.create({
      data: {
        userId: user.id,
        statementId: statement.id,
        stage: "COMPLETE",
        transactionCount: 42,
        errorMessage: null,
      },
    });

    const [req, ctx] = makeRequest(job.id);
    const res = await GET(req, ctx);
    expect(res.status).toBe(200);

    const body = (await res.json()) as { data: { stage: string; transactionCount: number; errorMessage: null } };
    expect(body.data.stage).toBe("COMPLETE");
    expect(body.data.transactionCount).toBe(42);
    expect(body.data.errorMessage).toBeNull();
  });

  it("returns 404 for a job belonging to a different user", async () => {
    const owner = await createTestUser(makeEmail("job-owner"));
    const requester = await createTestUser(makeEmail("requester"));

    // Create job owned by `owner`
    const statement = await prisma.statement.create({
      data: { userId: owner.id, filename: "other.csv" },
    });
    const job = await prisma.jobStatus.create({
      data: { userId: owner.id, statementId: statement.id, stage: "QUEUED" },
    });

    // Request as `requester` — should not see owner's job
    mockAuth.mockResolvedValue({ user: { id: requester.id, email: requester.email } });
    const [req, ctx] = makeRequest(job.id);
    const res = await GET(req, ctx);
    expect(res.status).toBe(404);
  });

  it("returns 404 for a non-existent job ID", async () => {
    const user = await createTestUser(makeEmail("notfound"));
    mockAuth.mockResolvedValue({ user: { id: user.id, email: user.email } });

    const [req, ctx] = makeRequest("00000000-0000-0000-0000-000000000099");
    const res = await GET(req, ctx);
    expect(res.status).toBe(404);
  });
});
