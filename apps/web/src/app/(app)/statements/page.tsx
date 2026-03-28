import { auth } from "~/lib/auth";
import { withRLS } from "~/lib/middleware-helpers";
import StatementsClient from "./_components/statements-client";

/**
 * Statements page — server component.
 *
 * Fetches statements list server-side via withRLS and passes initialStatements
 * to StatementsClient. This prevents the "Loading…" flash on first render and
 * allows the empty-state check to happen server-side without a network round-trip.
 */
export default async function StatementsPage() {
  const session = await auth();
  const userId = session?.user?.id ?? "";

  type StatementRow = {
    id: string;
    filename: string;
    institution: string | null;
    uploadedAt: Date;
    jobStatus: { stage: string; transactionCount: number; errorMessage: string | null } | null;
  };

  let initialStatements: StatementRow[] = [];
  if (userId) {
    initialStatements = await withRLS(userId, (tx) =>
      tx.statement.findMany({
        where: { userId },
        orderBy: { uploadedAt: "desc" },
        include: {
          jobStatuses: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { stage: true, transactionCount: true, errorMessage: true },
          },
        },
      }),
    ).then((rows) =>
      rows.map((s) => ({
        id: s.id,
        filename: s.filename,
        institution: s.institution,
        uploadedAt: s.uploadedAt,
        jobStatus: s.jobStatuses[0] ?? null,
      })),
    );
  }

  return <StatementsClient initialStatements={initialStatements} />;
}
