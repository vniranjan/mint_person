import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "~/lib/db";
import { requireAdmin, FORBIDDEN_RESPONSE } from "~/lib/middleware-helpers";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/users/:id
 *
 * Returns operational metrics only — no financial data values.
 * Counts (not content) of statements and transactions are operational.
 *
 * Response shape:
 * { "data": { id, email, role, isActive, lastLoginAt, createdAt, statementCount, transactionCount } }
 */
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { response } = await requireAdmin();
  if (response) return response;

  const { id } = await params;
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      lastLoginAt: true,
      createdAt: true,
      _count: { select: { statements: true, transactions: true } },
    },
  });

  if (!user) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "User not found" } },
      { status: 404 },
    );
  }

  return NextResponse.json({
    data: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
      statementCount: user._count.statements,
      transactionCount: user._count.transactions,
    },
  });
}

/**
 * PATCH /api/admin/users/:id
 *
 * Deactivates or reactivates a user account.
 * Body: { action: "deactivate" | "reactivate" }
 *
 * On deactivate: sets isActive=false AND deletes all active sessions
 * (immediate login revocation).
 */
export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { response } = await requireAdmin();
  if (response) return response;

  const { id } = await params;
  let body: { action?: unknown };
  try {
    body = await req.json() as { action?: unknown };
  } catch {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "Invalid JSON body" } },
      { status: 400 },
    );
  }

  const action = body.action;
  if (action !== "deactivate" && action !== "reactivate") {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "action must be 'deactivate' or 'reactivate'" } },
      { status: 400 },
    );
  }

  const user = await prisma.user.findUnique({ where: { id }, select: { role: true, isActive: true } });
  if (!user) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "User not found" } },
      { status: 404 },
    );
  }

  // Guard: prevent deactivating the last active admin
  if (action === "deactivate" && user.role === "ADMIN") {
    const activeAdminCount = await prisma.user.count({ where: { role: "ADMIN", isActive: true } });
    if (activeAdminCount <= 1) {
      return NextResponse.json(
        { error: { code: "LAST_ADMIN", message: "Cannot deactivate the last active admin account" } },
        { status: 403 },
      );
    }
  }

  const newIsActive = action === "reactivate";

  // Deactivate: purge sessions + update isActive atomically
  if (action === "deactivate") {
    const updated = await prisma.$transaction(async (tx) => {
      await tx.session.deleteMany({ where: { userId: id } });
      return tx.user.update({
        where: { id },
        data: { isActive: false },
        select: { id: true, email: true, isActive: true },
      });
    });
    return NextResponse.json({ data: updated });
  }

  const updated = await prisma.user.update({
    where: { id },
    data: { isActive: newIsActive },
    select: { id: true, email: true, isActive: true },
  });

  return NextResponse.json({ data: updated });
}

/**
 * DELETE /api/admin/users/:id
 *
 * Permanently deletes a user and all their data via CASCADE.
 * Guard: prevents deleting the last ADMIN account.
 */
export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { userId: adminId, response } = await requireAdmin();
  if (response) return response;

  const { id } = await params;

  const user = await prisma.user.findUnique({ where: { id }, select: { role: true } });
  if (!user) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "User not found" } },
      { status: 404 },
    );
  }

  // Prevent admin from deleting themselves via this route
  if (id === adminId) {
    return NextResponse.json(
      { ...FORBIDDEN_RESPONSE, error: { code: "FORBIDDEN", message: "Use account settings to delete your own account" } },
      { status: 403 },
    );
  }

  // Atomically check last-admin guard and delete
  if (user.role === "ADMIN") {
    const deleted = await prisma.$transaction(async (tx) => {
      const adminCount = await tx.user.count({ where: { role: "ADMIN" } });
      if (adminCount <= 1) return null;
      await tx.user.delete({ where: { id } });
      return true;
    });
    if (deleted === null) {
      return NextResponse.json(
        { error: { code: "LAST_ADMIN", message: "Cannot delete the last admin account" } },
        { status: 403 },
      );
    }
    return NextResponse.json({ data: { message: "User and all data permanently deleted" } });
  }

  await prisma.user.delete({ where: { id } });

  return NextResponse.json({ data: { message: "User and all data permanently deleted" } });
}
