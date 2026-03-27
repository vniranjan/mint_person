import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "~/lib/auth";
import { prisma } from "~/lib/db";

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Not authenticated" } },
      { status: 401 },
    );
  }

  const userId = session.user.id;

  // Guard: prevent the last admin from deleting their own account.
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (user?.role === "ADMIN") {
    const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
    if (adminCount <= 1) {
      return NextResponse.json(
        {
          error: {
            code: "LAST_ADMIN",
            message:
              "Cannot delete the last admin account. Assign another admin first.",
          },
        },
        { status: 403 },
      );
    }
  }

  try {
    // Deleting the user row cascades to:
    //   statements, transactions, correction_logs, job_status,
    //   password_reset_tokens, sessions, accounts
    // All FK constraints use ON DELETE CASCADE — no manual child deletion needed.
    await prisma.user.delete({ where: { id: userId } });
  } catch (err) {
    // P2025: record not found — user was already deleted (double-click, race).
    // Treat as idempotent success: the user's intent was to be gone, and they are.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2025"
    ) {
      return NextResponse.json(
        { data: { message: "Account deleted" } },
        { status: 200 },
      );
    }
    throw err;
  }

  return NextResponse.json(
    { data: { message: "Account deleted" } },
    { status: 200 },
  );
}
