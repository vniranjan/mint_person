import { type NextRequest, NextResponse } from "next/server";
import { auth } from "~/lib/auth";
import { withRLS, UNAUTHORIZED_RESPONSE } from "~/lib/middleware-helpers";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(UNAUTHORIZED_RESPONSE, { status: 401 });
  }

  const { id } = await params;

  const job = await withRLS(session.user.id, (tx) =>
    tx.jobStatus.findFirst({ where: { id, userId: session.user.id } }),
  );

  if (!job) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Job not found" } },
      { status: 404 },
    );
  }

  return NextResponse.json({
    data: {
      stage: job.stage,
      transactionCount: job.transactionCount,
      errorMessage: job.errorMessage,
    },
  });
}
