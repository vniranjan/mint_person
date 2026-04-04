import { type NextRequest, NextResponse } from "next/server";
import { Decimal } from "@prisma/client/runtime/library";
import { auth } from "~/lib/auth";
import { withRLS, UNAUTHORIZED_RESPONSE } from "~/lib/middleware-helpers";

/** Adjust the largest category's pct so all pcts sum to exactly 100. */
function normalizePcts<T extends { pct: number }>(items: T[]): T[] {
  if (items.length === 0) return items;
  const sum = items.reduce((acc, i) => acc + i.pct, 0);
  if (sum === 100 || sum === 0) return items;
  // Apply correction to the largest item (index 0, already sorted desc)
  const diff = 100 - sum;
  return items.map((item, idx) =>
    idx === 0 ? { ...item, pct: item.pct + diff } : item,
  );
}

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
 *     "transactionCount": 42,
 *     "vsLastMonth": "+12.3%"   // null if no prior month data
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

  // Prior month date range for vsLastMonth comparison
  const priorMonthEnd = new Date(monthStart);
  const priorMonthStart = new Date(monthStart);
  priorMonthStart.setUTCMonth(priorMonthStart.getUTCMonth() - 1);

  const [transactions, priorTransactions] = await Promise.all([
    withRLS(session.user.id, (tx) =>
      tx.transaction.findMany({
        where: {
          userId: session.user.id,
          isExcluded: false,
          date: { gte: monthStart, lt: monthEnd },
        },
        select: { amount: true, category: true },
      }),
    ),
    withRLS(session.user.id, (tx) =>
      tx.transaction.findMany({
        where: {
          userId: session.user.id,
          isExcluded: false,
          date: { gte: priorMonthStart, lt: priorMonthEnd },
        },
        select: { amount: true },
      }),
    ),
  ]);

  // Sum only positive amounts (debit transactions)
  const positiveTransactions = transactions.filter((t) => t.amount.gt(0));
  const totalSpent = positiveTransactions.reduce(
    (sum, t) => sum.add(t.amount),
    new Decimal(0),
  );

  // Prior month total for vsLastMonth
  const priorPositive = priorTransactions.filter((t) => t.amount.gt(0));
  const priorTotal = priorPositive.reduce(
    (sum, t) => sum.add(t.amount),
    new Decimal(0),
  );
  let vsLastMonth: string | null = null;
  if (priorTotal.gt(0)) {
    let pct = totalSpent.sub(priorTotal).div(priorTotal).mul(100);
    // Cap at ±999% to prevent layout overflow from extreme deltas
    if (pct.gt(999)) pct = new Decimal(999);
    else if (pct.lt(-99)) pct = new Decimal(-99);
    const sign = pct.gte(0) ? "+" : "";
    vsLastMonth = `${sign}${pct.toFixed(1)}%`;
  }

  // Group by category
  const categoryMap: Record<string, Decimal> = {};
  for (const t of positiveTransactions) {
    const cat = t.category ?? "Uncategorized";
    categoryMap[cat] = (categoryMap[cat] ?? new Decimal(0)).add(t.amount);
  }

  const byCategoryRaw = Object.entries(categoryMap)
    .map(([category, total]) => ({
      category,
      total: total.toFixed(2),
      pct: totalSpent.gt(0)
        ? Math.round(total.div(totalSpent).mul(100).toNumber())
        : 0,
    }))
    .sort((a, b) => parseFloat(b.total) - parseFloat(a.total));

  // Normalize percentages so they sum to exactly 100
  const byCategory = normalizePcts(byCategoryRaw);

  return NextResponse.json({
    data: {
      totalSpent: totalSpent.toFixed(2),
      byCategory,
      transactionCount: positiveTransactions.length,
      vsLastMonth,
    },
  });
}
