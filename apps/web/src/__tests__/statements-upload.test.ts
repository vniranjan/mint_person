/**
 * Statement upload integration tests (Story 2.1).
 *
 * Tests POST /api/statements/upload by calling the route handler directly.
 * Azure Blob Storage and Queue are mocked — this test validates:
 * - Auth enforcement
 * - File validation (type, size, presence)
 * - DB record creation (Statement + JobStatus rows)
 * - Correct response shape
 *
 * Run: npm run test:upload (from apps/web/)
 */
import { vi, afterAll, beforeEach, describe, expect, it } from "vitest";

// Mock Azure clients before importing the route
vi.mock("~/lib/azure-blob", () => ({
  BLOB_CONTAINER_NAME: "statements",
  uploadStatementBlob: vi.fn().mockResolvedValue("https://fake-blob-url/test.csv"),
  deleteStatementBlob: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("~/lib/azure-queue", () => ({
  QUEUE_NAME: "statement-processing",
  enqueueStatementJob: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("~/lib/auth", () => ({
  auth: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  handlers: { GET: vi.fn(), POST: vi.fn() },
}));

import { auth } from "~/lib/auth";
import { prisma } from "~/lib/db";
import { POST } from "~/app/api/statements/upload/route";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockAuth = auth as unknown as { mockResolvedValue: (v: any) => void };

const TEST_DOMAIN = "@upload-test.mint-test.invalid";

function makeEmail(suffix: string) {
  return `upload-test-${suffix}${TEST_DOMAIN}`;
}

async function createTestUser(email: string) {
  return prisma.user.create({
    data: { email, passwordHash: "$2b$12$placeholder", role: "USER", isActive: true },
  });
}

function makeCsvFile(name = "test.csv", content = "Date,Description,Amount\n2026-01-01,ACME,10.00", size?: number): File {
  const blob = new Blob([content], { type: "text/csv" });
  // Simulate oversized file by overriding size
  if (size !== undefined) {
    return Object.defineProperty(new File([blob], name, { type: "text/csv" }), "size", { value: size });
  }
  return new File([blob], name, { type: "text/csv" });
}

function makeFormData(file: File): FormData {
  const fd = new FormData();
  fd.append("file", file);
  return fd;
}

describe("POST /api/statements/upload", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await prisma.$executeRaw`DELETE FROM users WHERE email LIKE ${`%${TEST_DOMAIN}`}`;
  });

  afterAll(async () => {
    await prisma.$executeRaw`DELETE FROM users WHERE email LIKE ${`%${TEST_DOMAIN}`}`;
    await prisma.$disconnect();
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const req = new Request("http://localhost/api/statements/upload", {
      method: "POST",
      body: makeFormData(makeCsvFile()),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 when no file provided", async () => {
    const user = await createTestUser(makeEmail("no-file"));
    mockAuth.mockResolvedValue({ user: { id: user.id, email: user.email } });
    const fd = new FormData();
    const req = new Request("http://localhost/api/statements/upload", {
      method: "POST",
      body: fd,
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when file is not .csv", async () => {
    const user = await createTestUser(makeEmail("wrong-type"));
    mockAuth.mockResolvedValue({ user: { id: user.id, email: user.email } });
    const file = new File(["data"], "statement.xlsx", { type: "application/vnd.ms-excel" });
    const req = new Request("http://localhost/api/statements/upload", {
      method: "POST",
      body: makeFormData(file),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when file exceeds 10MB", async () => {
    const user = await createTestUser(makeEmail("too-large"));
    mockAuth.mockResolvedValue({ user: { id: user.id, email: user.email } });
    const oversizedFile = makeCsvFile("big.csv", "a", 11 * 1024 * 1024);
    const req = new Request("http://localhost/api/statements/upload", {
      method: "POST",
      body: makeFormData(oversizedFile),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 201 with jobId and statementId on valid upload", async () => {
    const user = await createTestUser(makeEmail("valid"));
    mockAuth.mockResolvedValue({ user: { id: user.id, email: user.email } });
    const req = new Request("http://localhost/api/statements/upload", {
      method: "POST",
      body: makeFormData(makeCsvFile()),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { jobId: string; statementId: string } };
    expect(body.data.jobId).toBeTruthy();
    expect(body.data.statementId).toBeTruthy();

    // Verify DB records were created
    const statement = await prisma.statement.findUnique({ where: { id: body.data.statementId } });
    expect(statement).not.toBeNull();
    expect(statement?.filename).toBe("test.csv");

    const job = await prisma.jobStatus.findUnique({ where: { id: body.data.jobId } });
    expect(job).not.toBeNull();
    expect(job?.stage).toBe("QUEUED");
    expect(job?.userId).toBe(user.id);
  });
});
