import { NextResponse } from "next/server";
import { auth } from "~/lib/auth";
import { withRLS, UNAUTHORIZED_RESPONSE } from "~/lib/middleware-helpers";

/**
 * GET /api/months
 *
 * Returns a list of months that have transaction data for the authenticated user,
 * sorted descending. Used by Epic 4 month picker.
 *
 * Response shape: { "data": ["2026-03", "2026-02", "2026-01"] }
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(UNAUTHORIZED_RESPONSE, { status: 401 });
  }

  // Use raw query to extract distinct YYYY-MM strings from transaction dates
  const rows = await withRLS(session.user.id, (tx) =>
    tx.$queryRaw<{ month: string }[]>`
      SELECT DISTINCT TO_CHAR(date, 'YYYY-MM') AS month
      FROM transactions
      WHERE "userId" = ${session.user.id}::uuid
      ORDER BY month DESC
    `,
  );

  return NextResponse.json({ data: rows.map((r) => r.month) });
}
