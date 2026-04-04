import { NextResponse } from "next/server";
import { auth } from "~/lib/auth";
import { withRLS, UNAUTHORIZED_RESPONSE } from "~/lib/middleware-helpers";

interface TrendRow {
  month: string;
  category: string | null;
  total: string;
}

/**
 * GET /api/trends
 *
 * Returns per-category spending totals for all months that have transaction data.
 * Uses a single DB-level GROUP BY aggregation — no in-memory fan-out.
 * Used by the multi-month TrendChart in Story 4.5.
 *
 * Response shape:
 * {
 *   "data": [
 *     { "month": "2026-01", "byCategory": [{ "category": "Groceries", "total": "245.00" }] },
 *     ...
 *   ]
 * }
 * Sorted ascending by month.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(UNAUTHORIZED_RESPONSE, { status: 401 });
  }

  const rows = await withRLS(session.user.id, (tx) =>
    tx.$queryRaw<TrendRow[]>`
      SELECT
        TO_CHAR(date, 'YYYY-MM') AS month,
        category,
        SUM(amount)::text         AS total
      FROM transactions
      WHERE "userId"    = ${session.user.id}::uuid
        AND "isExcluded" = false
        AND amount       > 0
      GROUP BY month, category
      ORDER BY month ASC
    `,
  );

  // Group flat rows into per-month objects
  const monthMap = new Map<string, { category: string; total: string }[]>();
  for (const row of rows) {
    const cat = row.category ?? "Uncategorized";
    if (!monthMap.has(row.month)) monthMap.set(row.month, []);
    monthMap.get(row.month)!.push({ category: cat, total: row.total });
  }

  const data = Array.from(monthMap.entries()).map(([month, byCategory]) => ({
    month,
    byCategory,
  }));

  return NextResponse.json({ data });
}
