import { type NextRequest, NextResponse } from "next/server";
import { auth } from "~/lib/auth";
import { withRLS, UNAUTHORIZED_RESPONSE } from "~/lib/middleware-helpers";

/**
 * GET /api/transactions/search?q=...&month=YYYY-MM
 *
 * Searches transactions for the authenticated user by merchant name (case-insensitive
 * contains) OR exact amount match.
 *
 * Response shape: { "data": [...transactions] }
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(UNAUTHORIZED_RESPONSE, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const q = searchParams.get("q")?.trim() ?? "";
  const month = searchParams.get("month");

  if (!q) {
    return NextResponse.json({ data: [] });
  }

  // Build base where clause — month filter if provided
  const monthFilter: Record<string, unknown> = {};
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const monthStart = new Date(`${month}-01T00:00:00.000Z`);
    const monthEnd = new Date(monthStart);
    monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);
    monthFilter.date = { gte: monthStart, lt: monthEnd };
  }

  const transactions = await withRLS(session.user.id, (tx) =>
    tx.transaction.findMany({
      where: {
        userId: session.user.id,
        ...monthFilter,
        OR: [
          { merchantNorm: { contains: q, mode: "insensitive" } },
          { merchantRaw: { contains: q, mode: "insensitive" } },
          // Amount exact match — stored as Decimal, compare numerically
          ...(isValidAmount(q)
            ? [{ amount: { equals: parseFloat(q) } }]
            : []),
        ],
      },
      orderBy: { date: "desc" },
      take: 100,
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

function isValidAmount(q: string): boolean {
  return /^\d+(\.\d{1,2})?$/.test(q) && !isNaN(parseFloat(q));
}
