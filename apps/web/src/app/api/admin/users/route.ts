import { type NextRequest, NextResponse } from "next/server";
import bcryptjs from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "~/lib/db";
import { requireAdmin } from "~/lib/middleware-helpers";

/**
 * GET /api/admin/users
 *
 * Returns all users with operational metadata only.
 * NEVER joins transactions, statements, or correction_logs tables.
 * Statement count returned via Prisma _count (subquery, not JOIN).
 *
 * Response shape:
 * { "data": [{ id, email, name, role, isActive, lastLoginAt, createdAt, statementCount }] }
 */
export async function GET() {
  const { response } = await requireAdmin();
  if (response) return response;

  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      lastLoginAt: true,
      createdAt: true,
      _count: { select: { statements: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    data: users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      isActive: u.isActive,
      lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
      createdAt: u.createdAt.toISOString(),
      statementCount: u._count.statements,
    })),
  });
}

/**
 * POST /api/admin/users
 *
 * Creates a new USER-role account.
 * Body: { email: string, password: string }
 *
 * Returns 409 if email already exists.
 */
export async function POST(req: NextRequest) {
  const { response } = await requireAdmin();
  if (response) return response;

  let body: { email?: unknown; password?: unknown };
  try {
    body = await req.json() as { email?: unknown; password?: unknown };
  } catch {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "Invalid JSON body" } },
      { status: 400 },
    );
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "Valid email is required" } },
      { status: 400 },
    );
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "Password must be at least 8 characters" } },
      { status: 400 },
    );
  }

  const passwordHash = await bcryptjs.hash(password, 12);
  try {
    const user = await prisma.user.create({
      data: { email, passwordHash, role: "USER", isActive: true },
      select: { id: true, email: true, role: true, isActive: true, createdAt: true },
    });
    return NextResponse.json({ data: { ...user, createdAt: user.createdAt.toISOString() } }, { status: 201 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json(
        { error: { code: "CONFLICT", message: "A user with this email already exists" } },
        { status: 409 },
      );
    }
    throw err;
  }
}
