import { type NextRequest, NextResponse } from "next/server";
import { auth } from "~/lib/auth";
import { withRLS, UNAUTHORIZED_RESPONSE } from "~/lib/middleware-helpers";

/**
 * GET /api/transactions?month=YYYY-MM[&flagged=true][&category=Dining]
 *
 * Returns transactions for the authenticated user filtered by month.
 * Optional filters:
 *   flagged=true  → only isFlagged=true, isReviewed=false transactions
 *   category=X    → only transactions with that category
 *
 * Response shape: { "data": [...transactions] }
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(UNAUTHORIZED_RESPONSE, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const month = searchParams.get("month");
  const flaggedParam = searchParams.get("flagged");
  const category = searchParams.get("category");

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "month parameter required (YYYY-MM)" } },
      { status: 400 },
    );
  }
  const monthNum = parseInt(month.slice(5, 7), 10);
  if (monthNum < 1 || monthNum > 12) {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "month must be between 01 and 12" } },
      { status: 400 },
    );
  }

  const monthStart = new Date(`${month}-01T00:00:00.000Z`);
  const monthEnd = new Date(monthStart);
  monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);

  const transactions = await withRLS(session.user.id, (tx) =>
    tx.transaction.findMany({
      where: {
        userId: session.user.id,
        date: { gte: monthStart, lt: monthEnd },
        ...(flaggedParam === "true" ? { isFlagged: true, isReviewed: false } : {}),
        ...(category ? { category } : {}),
      },
      orderBy: { date: "desc" },
      select: {
        id: true,
        date: true,
        merchantRaw: true,
        merchantNorm: true,
        amount: true,
        category: true,
        confidence: true,
        isFlagged: true,
        isDuplicate: true,
        isExcluded: true,
        isReviewed: true,
        patternAppliedNote: true,
      },
    }),
  );

  return NextResponse.json({
    data: transactions.map((t) => ({
      ...t,
      date: t.date.toISOString(),
      amount: t.amount.toString(),
    })),
  });
}
