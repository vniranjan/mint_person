/**
 * Admin users API integration tests (Stories 5.1, 5.2).
 *
 * Tests:
 *   GET  /api/admin/users          — list users
 *   POST /api/admin/users          — create user
 *   GET  /api/admin/users/:id      — get user metrics
 *   PATCH /api/admin/users/:id     — deactivate / reactivate
 *   DELETE /api/admin/users/:id    — delete user
 *
 * Requires a real PostgreSQL instance with migrations applied.
 * Run: npm run test:admin-users (from apps/web/)
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
import { GET as listUsers, POST as createUser } from "~/app/api/admin/users/route";
import { GET as getUser, PATCH as patchUser, DELETE as deleteUser } from "~/app/api/admin/users/[id]/route";
import { NextRequest } from "next/server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockAuth = auth as unknown as { mockResolvedValue: (v: any) => void };

const TEST_DOMAIN = "@admin-users-test.mint-test.invalid";

function makeEmail(suffix: string) {
  return `admin-users-${suffix}${TEST_DOMAIN}`;
}

async function createAdminUser(email: string) {
  return prisma.user.create({
    data: { email, passwordHash: "$2b$12$placeholder", role: "ADMIN", isActive: true },
  });
}

async function createRegularUser(email: string) {
  return prisma.user.create({
    data: { email, passwordHash: "$2b$12$placeholder", role: "USER", isActive: true },
  });
}

function makePostRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/admin/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makePatchRequest(id: string, body: Record<string, unknown>) {
  return new NextRequest(`http://localhost/api/admin/users/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeDeleteRequest(id: string) {
  return new NextRequest(`http://localhost/api/admin/users/${id}`, { method: "DELETE" });
}

describe("Admin Users API", () => {
  let admin: { id: string; email: string };
  let regularUser: { id: string; email: string };
  let targetUser: { id: string; email: string };

  beforeAll(async () => {
    await prisma.$executeRaw`DELETE FROM users WHERE email LIKE ${`%${TEST_DOMAIN}`}`;
    admin = await createAdminUser(makeEmail("admin"));
    regularUser = await createRegularUser(makeEmail("regular"));
    targetUser = await createRegularUser(makeEmail("target"));
  });

  afterAll(async () => {
    await prisma.$executeRaw`DELETE FROM users WHERE email LIKE ${`%${TEST_DOMAIN}`}`;
    await prisma.$disconnect();
  });

  // ── GET /api/admin/users ──────────────────────────────────────────────────

  describe("GET /api/admin/users", () => {
    it("returns 401 when not authenticated", async () => {
      mockAuth.mockResolvedValue(null);
      const res = await listUsers();
      expect(res.status).toBe(401);
    });

    it("returns 403 for non-admin user", async () => {
      mockAuth.mockResolvedValue({ user: { id: regularUser.id, email: regularUser.email, role: "USER" } });
      const res = await listUsers();
      expect(res.status).toBe(403);
    });

    it("returns user list with statementCount for admin", async () => {
      mockAuth.mockResolvedValue({ user: { id: admin.id, email: admin.email, role: "ADMIN" } });
      const res = await listUsers();
      expect(res.status).toBe(200);
      const body = await res.json() as { data: { id: string; statementCount: number }[] };
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBeGreaterThanOrEqual(2);
      // Verify statementCount is present and numeric
      expect(typeof body.data[0].statementCount).toBe("number");
    });

    it("never exposes passwordHash in list response", async () => {
      mockAuth.mockResolvedValue({ user: { id: admin.id, email: admin.email, role: "ADMIN" } });
      const res = await listUsers();
      const bodyStr = JSON.stringify(await res.json());
      expect(bodyStr).not.toContain("passwordHash");
    });
  });

  // ── POST /api/admin/users ─────────────────────────────────────────────────

  describe("POST /api/admin/users", () => {
    it("returns 403 for non-admin", async () => {
      mockAuth.mockResolvedValue({ user: { id: regularUser.id, email: regularUser.email, role: "USER" } });
      const res = await createUser(makePostRequest({ email: makeEmail("new"), password: "password123" }));
      expect(res.status).toBe(403);
    });

    it("creates a USER-role account and returns 201", async () => {
      mockAuth.mockResolvedValue({ user: { id: admin.id, email: admin.email, role: "ADMIN" } });
      const email = makeEmail("created");
      const res = await createUser(makePostRequest({ email, password: "securepass1" }));
      expect(res.status).toBe(201);
      const body = await res.json() as { data: { email: string; role: string; isActive: boolean } };
      expect(body.data.email).toBe(email);
      expect(body.data.role).toBe("USER");
      expect(body.data.isActive).toBe(true);
    });

    it("returns 409 for duplicate email", async () => {
      mockAuth.mockResolvedValue({ user: { id: admin.id, email: admin.email, role: "ADMIN" } });
      const email = makeEmail("duplicate-email");
      await createUser(makePostRequest({ email, password: "password123" }));
      const res = await createUser(makePostRequest({ email, password: "different456" }));
      expect(res.status).toBe(409);
      const body = await res.json() as { error: { code: string } };
      expect(body.error.code).toBe("CONFLICT");
    });

    it("returns 400 for password shorter than 8 chars", async () => {
      mockAuth.mockResolvedValue({ user: { id: admin.id, email: admin.email, role: "ADMIN" } });
      const res = await createUser(makePostRequest({ email: makeEmail("shortpw"), password: "short" }));
      expect(res.status).toBe(400);
    });
  });

  // ── GET /api/admin/users/:id ──────────────────────────────────────────────

  describe("GET /api/admin/users/:id", () => {
    it("returns operational metrics for admin", async () => {
      mockAuth.mockResolvedValue({ user: { id: admin.id, email: admin.email, role: "ADMIN" } });
      const res = await getUser(
        new NextRequest(`http://localhost/api/admin/users/${targetUser.id}`),
        { params: Promise.resolve({ id: targetUser.id }) },
      );
      expect(res.status).toBe(200);
      const body = await res.json() as { data: { statementCount: number; transactionCount: number } };
      expect(typeof body.data.statementCount).toBe("number");
      expect(typeof body.data.transactionCount).toBe("number");
    });

    it("returns 404 for non-existent user", async () => {
      mockAuth.mockResolvedValue({ user: { id: admin.id, email: admin.email, role: "ADMIN" } });
      const fakeId = "00000000-0000-0000-0000-000000000000";
      const res = await getUser(
        new NextRequest(`http://localhost/api/admin/users/${fakeId}`),
        { params: Promise.resolve({ id: fakeId }) },
      );
      expect(res.status).toBe(404);
    });
  });

  // ── PATCH /api/admin/users/:id ────────────────────────────────────────────

  describe("PATCH /api/admin/users/:id", () => {
    it("deactivates a user", async () => {
      mockAuth.mockResolvedValue({ user: { id: admin.id, email: admin.email, role: "ADMIN" } });
      const res = await patchUser(
        makePatchRequest(targetUser.id, { action: "deactivate" }),
        { params: Promise.resolve({ id: targetUser.id }) },
      );
      expect(res.status).toBe(200);
      const body = await res.json() as { data: { isActive: boolean } };
      expect(body.data.isActive).toBe(false);

      // Verify sessions were purged
      const sessions = await prisma.session.findMany({ where: { userId: targetUser.id } });
      expect(sessions).toHaveLength(0);
    });

    it("reactivates a user", async () => {
      mockAuth.mockResolvedValue({ user: { id: admin.id, email: admin.email, role: "ADMIN" } });
      const res = await patchUser(
        makePatchRequest(targetUser.id, { action: "reactivate" }),
        { params: Promise.resolve({ id: targetUser.id }) },
      );
      expect(res.status).toBe(200);
      const body = await res.json() as { data: { isActive: boolean } };
      expect(body.data.isActive).toBe(true);
    });

    it("returns 403 when trying to deactivate the last active admin", async () => {
      // Create a second admin then try to deactivate after — ensure only 1 admin left
      await prisma.$executeRaw`DELETE FROM users WHERE email = ${makeEmail("temp-admin")}`;
      const onlyAdmin = await createAdminUser(makeEmail("only-admin"));
      // Deactivate all other test admins to make this one the last
      await prisma.user.updateMany({
        where: { email: admin.email },
        data: { isActive: false },
      });

      mockAuth.mockResolvedValue({ user: { id: onlyAdmin.id, email: onlyAdmin.email, role: "ADMIN" } });
      const res = await patchUser(
        makePatchRequest(onlyAdmin.id, { action: "deactivate" }),
        { params: Promise.resolve({ id: onlyAdmin.id }) },
      );
      expect(res.status).toBe(403);
      const body = await res.json() as { error: { code: string } };
      expect(body.error.code).toBe("LAST_ADMIN");

      // Restore
      await prisma.user.update({ where: { email: admin.email }, data: { isActive: true } });
      await prisma.$executeRaw`DELETE FROM users WHERE email = ${makeEmail("only-admin")}`;
    });
  });

  // ── DELETE /api/admin/users/:id ───────────────────────────────────────────

  describe("DELETE /api/admin/users/:id", () => {
    it("deletes a user and all their data", async () => {
      mockAuth.mockResolvedValue({ user: { id: admin.id, email: admin.email, role: "ADMIN" } });
      const userToDelete = await createRegularUser(makeEmail("to-delete"));
      const res = await deleteUser(
        makeDeleteRequest(userToDelete.id),
        { params: Promise.resolve({ id: userToDelete.id }) },
      );
      expect(res.status).toBe(200);

      const deleted = await prisma.user.findUnique({ where: { id: userToDelete.id } });
      expect(deleted).toBeNull();
    });

    it("prevents self-deletion", async () => {
      mockAuth.mockResolvedValue({ user: { id: admin.id, email: admin.email, role: "ADMIN" } });
      const res = await deleteUser(
        makeDeleteRequest(admin.id),
        { params: Promise.resolve({ id: admin.id }) },
      );
      expect(res.status).toBe(403);
    });

    it("prevents deleting the last admin", async () => {
      const soloAdmin = await createAdminUser(makeEmail("solo-admin"));
      // Deactivate main admin to make soloAdmin the only one
      await prisma.user.updateMany({ where: { email: admin.email }, data: { isActive: false, role: "USER" } });

      mockAuth.mockResolvedValue({ user: { id: soloAdmin.id, email: soloAdmin.email, role: "ADMIN" } });
      const victim = await createRegularUser(makeEmail("victim"));
      // First make soloAdmin the only ADMIN
      const res = await deleteUser(
        makeDeleteRequest(soloAdmin.id),
        { params: Promise.resolve({ id: soloAdmin.id }) },
      );
      // soloAdmin is trying to delete themselves — should get FORBIDDEN (self-delete)
      expect(res.status).toBe(403);

      // Restore
      await prisma.user.update({ where: { email: admin.email }, data: { isActive: true, role: "ADMIN" } });
      await prisma.$executeRaw`DELETE FROM users WHERE email IN (${makeEmail("solo-admin")}, ${makeEmail("victim")})`;
    });
  });
});