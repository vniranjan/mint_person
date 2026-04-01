import { type NextRequest, NextResponse } from "next/server";
import { auth } from "~/lib/auth";
import { withRLS, UNAUTHORIZED_RESPONSE } from "~/lib/middleware-helpers";
import { VALID_CATEGORIES } from "~/lib/categories";

/**
 * PATCH /api/transactions/:id
 *
 * Updates a transaction's category (with correction log) and/or isExcluded.
 * At least one field must be present.
 *
 * Body: { category?: string, isExcluded?: boolean }
 * Response: { "data": { id, category, isReviewed, isExcluded } }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(UNAUTHORIZED_RESPONSE, { status: 401 });
  }

  const { id } = await params;

  let body: { category?: string; isExcluded?: boolean };
  try {
    body = await req.json() as { category?: string; isExcluded?: boolean };
  } catch {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "Invalid JSON body" } },
      { status: 400 },
    );
  }
  const { category, isExcluded } = body;

  if (category === undefined && isExcluded === undefined) {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "No fields to update" } },
      { status: 400 },
    );
  }

  if (isExcluded !== undefined && typeof isExcluded !== "boolean") {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "isExcluded must be a boolean" } },
      { status: 400 },
    );
  }

  if (category !== undefined && !VALID_CATEGORIES.includes(category as typeof VALID_CATEGORIES[number])) {
    return NextResponse.json(
      { error: { code: "INVALID_CATEGORY", message: `Category must be one of: ${VALID_CATEGORIES.join(", ")}` } },
      { status: 422 },
    );
  }

  const result = await withRLS(session.user.id, async (tx) => {
    // Verify transaction belongs to authenticated user
    const txn = await tx.transaction.findFirst({
      where: { id, userId: session.user.id },
      select: { id: true, merchantNorm: true },
    });

    if (!txn) return null;

    const updateData: Record<string, unknown> = {};
    if (category !== undefined) {
      updateData.category = category;
      updateData.isReviewed = true;
      updateData.isFlagged = false;  // Clear flag when user explicitly corrects
    }
    if (isExcluded !== undefined) {
      updateData.isExcluded = isExcluded;
    }

    const updated = await tx.transaction.update({
      where: { id },
      data: updateData,
      select: { id: true, category: true, isReviewed: true, isExcluded: true },
    });

    // Insert correction log when category is updated (FR30 audit + Story 3.4 learning)
    if (category !== undefined) {
      await tx.correctionLog.create({
        data: {
          userId: session.user.id,
          merchantPattern: txn.merchantNorm,
          correctedCategory: category,
        },
      });
    }

    return updated;
  });

  if (!result) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Transaction not found" } },
      { status: 404 },
    );
  }

  return NextResponse.json({ data: result });
}
