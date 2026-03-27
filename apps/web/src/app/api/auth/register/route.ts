import { type NextRequest, NextResponse } from "next/server";
import bcryptjs from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "~/lib/db";

// Minimal email validation — must contain @ and a dot after @.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { email?: unknown; password?: unknown };
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";

    // Validate inputs
    if (!EMAIL_REGEX.test(email)) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "A valid email address is required" } },
        { status: 400 },
      );
    }
    if (password.length < 8 || password.length > 128) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Password must be between 8 and 128 characters" } },
        { status: 400 },
      );
    }

    // Check for existing account
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { error: { code: "EMAIL_ALREADY_EXISTS", message: "An account with this email already exists" } },
        { status: 409 },
      );
    }

    // Hash password and create user — bcryptjs cost factor 12 (architecture requirement)
    const passwordHash = await bcryptjs.hash(password, 12);
    const user = await prisma.user.create({
      data: { email, passwordHash, role: "USER", isActive: true },
      select: { id: true, email: true, role: true },
    });

    return NextResponse.json({ data: user }, { status: 201 });
  } catch (err) {
    // Race condition: two concurrent requests with the same email — both pass findUnique,
    // one hits the unique constraint. Return 409 instead of 500.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json(
        { error: { code: "EMAIL_ALREADY_EXISTS", message: "An account with this email already exists" } },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Registration failed" } },
      { status: 500 },
    );
  }
}
