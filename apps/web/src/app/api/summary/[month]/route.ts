import { type NextRequest, NextResponse } from "next/server";
import { Decimal } from "@prisma/client/runtime/library";
import { auth } from "~/lib/auth";
import { withRLS, UNAUTHORIZED_RESPONSE } from "~/lib/middleware-helpers";

/**
 * GET /api/summary/:month
 *
 * Returns monthly spending summary for the authenticated user.
 * Excludes transactions with isExcluded=true (Story 3.5 AC5).
 *
 * Response shape:
 * {
 *   "data": {
 *     "totalSpent": "1234.56",
 *     "byCategory": [{ "category": "Groceries", "total": "245.00", "pct": 19 }],
 *     "transactionCount": 42
 *   }
 * }
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ month: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(UNAUTHORIZED_RESPONSE, { status: 401 });
  }

  const { month } = await params;
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "month must be YYYY-MM format" } },
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
        isExcluded: false,
        date: { gte: monthStart, lt: monthEnd },
      },
      select: { amount: true, category: true },
    }),
  );

  // Sum only positive amounts (debit transactions)
  const positiveTransactions = transactions.filter((t) => t.amount.gt(0));
  const totalSpent = positiveTransactions.reduce(
    (sum, t) => sum.add(t.amount),
    new Decimal(0),
  );

  // Group by category
  const categoryMap: Record<string, Decimal> = {};
  for (const t of positiveTransactions) {
    const cat = t.category ?? "Uncategorized";
    categoryMap[cat] = (categoryMap[cat] ?? new Decimal(0)).add(t.amount);
  }

  const byCategory = Object.entries(categoryMap)
    .map(([category, total]) => ({
      category,
      total: total.toFixed(2),
      pct: totalSpent.gt(0)
        ? Math.round(total.div(totalSpent).mul(100).toNumber())
        : 0,
    }))
    .sort((a, b) => parseFloat(b.total) - parseFloat(a.total));

  return NextResponse.json({
    data: {
      totalSpent: totalSpent.toFixed(2),
      byCategory,
      transactionCount: positiveTransactions.length,
    },
  });
}
