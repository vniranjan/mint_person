import { type NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import bcryptjs from "bcryptjs";
import { prisma } from "~/lib/db";

const INVALID_TOKEN_RESPONSE = {
  error: {
    code: "INVALID_OR_EXPIRED_TOKEN",
    message: "This reset link has expired or already been used",
  },
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      token?: unknown;
      password?: unknown;
    };
    const token = typeof body.token === "string" ? body.token.trim() : "";
    const password =
      typeof body.password === "string" ? body.password : "";

    if (!token) {
      return NextResponse.json(INVALID_TOKEN_RESPONSE, { status: 400 });
    }

    if (password.length < 8 || password.length > 128) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Password must be between 8 and 128 characters",
          },
        },
        { status: 400 },
      );
    }

    const tokenHash = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    const passwordHash = await bcryptjs.hash(password, 12);

    // Interactive transaction: atomically validate, mark used, and update password.
    // The updateMany with `usedAt: null` guard ensures only one concurrent request
    // can consume the token — fixing a TOCTOU race on the previous findUnique pattern.
    const success = await prisma.$transaction(async (tx) => {
      const record = await tx.passwordResetToken.findUnique({
        where: { tokenHash },
        include: { user: { select: { isActive: true } } },
      });

      // Reject if not found, expired, already used, or account deactivated.
      if (
        !record ||
        record.expiresAt < new Date() ||
        record.usedAt !== null ||
        !record.user.isActive
      ) {
        return false;
      }

      // Atomic mark-used: if another concurrent request beat us, count === 0.
      const marked = await tx.passwordResetToken.updateMany({
        where: { id: record.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (marked.count === 0) {
        return false;
      }

      await tx.user.update({
        where: { id: record.userId },
        data: { passwordHash },
      });

      await tx.session.deleteMany({ where: { userId: record.userId } });

      return true;
    });

    if (!success) {
      return NextResponse.json(INVALID_TOKEN_RESPONSE, { status: 400 });
    }

    return NextResponse.json(
      { data: { message: "Password updated" } },
      { status: 200 },
    );
  } catch {
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Password reset failed" } },
      { status: 500 },
    );
  }
}
