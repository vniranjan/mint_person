import { auth } from "~/lib/auth";
import { withRLS } from "~/lib/middleware-helpers";
import DashboardClient from "./_components/dashboard-client";

/**
 * Dashboard page — server component.
 *
 * Checks for existing statements server-side and passes hasStatements
 * to DashboardClient so the empty-state vs. returning-user layout is
 * rendered correctly on initial load (no client-side loading flash).
 */
export default async function DashboardPage() {
  const session = await auth();
  const userId = session?.user?.id ?? "";

  let hasStatements = false;
  if (userId) {
    const count = await withRLS(userId, (tx) =>
      tx.statement.count({ where: { userId } }),
    );
    hasStatements = count > 0;
  }

  return <DashboardClient hasStatements={hasStatements} />;
}
