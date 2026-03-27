import { NextResponse } from "next/server";
import { auth } from "~/lib/auth";
import { withRLS, UNAUTHORIZED_RESPONSE } from "~/lib/middleware-helpers";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(UNAUTHORIZED_RESPONSE, { status: 401 });
  }

  const statements = await withRLS(session.user.id, (tx) =>
    tx.statement.findMany({
      where: { userId: session.user.id },
      orderBy: { uploadedAt: "desc" },
      include: {
        jobStatuses: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    }),
  );

  const data = statements.map((s) => ({
    id: s.id,
    filename: s.filename,
    institution: s.institution,
    uploadedAt: s.uploadedAt.toISOString(),
    jobStatus: s.jobStatuses[0]
      ? {
          stage: s.jobStatuses[0].stage,
          transactionCount: s.jobStatuses[0].transactionCount,
          errorMessage: s.jobStatuses[0].errorMessage,
        }
      : null,
  }));

  return NextResponse.json({ data });
}
