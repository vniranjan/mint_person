import { type NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "~/lib/db";
import { sendPasswordResetEmail } from "~/lib/email";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Always the same response — never reveal whether the email exists (AC1).
const ALWAYS_OK = {
  data: { message: "If that email is registered, a reset link has been sent" },
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { email?: unknown };
    const email =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

    if (!EMAIL_REGEX.test(email)) {
      // Return the same generic OK to avoid timing-based email enumeration.
      return NextResponse.json(ALWAYS_OK, { status: 200 });
    }

    const user = await prisma.user.findUnique({ where: { email } });

    // Always generate a token to normalize wall-clock time regardless of
    // whether the user exists. This mitigates statistical timing oracles that
    // could distinguish a registered email from an unregistered one.
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");

    if (user?.isActive) {
      // Delete any existing unused tokens before creating a new one.
      await prisma.passwordResetToken.deleteMany({
        where: { userId: user.id, usedAt: null },
      });

      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await prisma.passwordResetToken.create({
        data: { userId: user.id, tokenHash, expiresAt },
      });

      // Fire-and-forget email — failure must not affect the HTTP response.
      void sendPasswordResetEmail(user.email, rawToken).catch((err: unknown) => {
        console.error("[forgot-password] Email send failed:", err);
      });
    }

    // Always respond identically regardless of lookup result.
    return NextResponse.json(ALWAYS_OK, { status: 200 });
  } catch {
    // Even on error, return the same generic response to avoid enumeration.
    return NextResponse.json(ALWAYS_OK, { status: 200 });
  }
}
