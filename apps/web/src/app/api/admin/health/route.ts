import { NextResponse } from "next/server";
import { prisma } from "~/lib/db";
import { requireAdmin } from "~/lib/middleware-helpers";
import { QueueServiceClient } from "@azure/storage-queue";
import { QUEUE_NAME } from "~/lib/azure-queue";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/health
 *
 * Returns operational health metrics for the admin dashboard.
 * Returns HTTP 403 for non-admin users.
 *
 * Response shape:
 * {
 *   "data": {
 *     "app": "ok",
 *     "worker": "ok" | "unknown",
 *     "queueDepth": N,
 *     "failedJobsLast24h": N,
 *     "failedJobs": [{ id, statementId, userEmail, failedAt, errorMessage }]
 *   }
 * }
 */
export async function GET() {
  const { response } = await requireAdmin();
  if (response) return response;

  // App is healthy — we are responding
  const appStatus = "ok";

  // Worker health — ping WORKER_HEALTH_URL if configured
  let workerStatus: "ok" | "unknown" = "unknown";
  const workerUrl = process.env.WORKER_HEALTH_URL;
  if (workerUrl) {
    try {
      const res = await fetch(workerUrl, { signal: AbortSignal.timeout(3000) });
      if (res.ok) workerStatus = "ok";
    } catch {
      // Timeout or connection failure — worker is unreachable
      workerStatus = "unknown";
    }
  }

  // Queue depth — approximate message count from Azure Storage Queue
  // Returns null when the queue is unreachable to distinguish "0 messages" from "unknown"
  let queueDepth: number | null = null;
  try {
    const connStr = process.env.AZURE_STORAGE_CONNECTION_STRING;
    if (connStr) {
      const queueClient = QueueServiceClient.fromConnectionString(connStr).getQueueClient(QUEUE_NAME);
      const props = await queueClient.getProperties();
      queueDepth = props.approximateMessagesCount ?? 0;
    }
  } catch {
    // Queue unavailable — leave queueDepth as null to surface the outage
  }

  // Failed jobs in last 24 hours — count separately to avoid take: 50 cap
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [failedJobsLast24h, failedJobRows] = await Promise.all([
    prisma.jobStatus.count({ where: { stage: "FAILED", updatedAt: { gte: since } } }),
    prisma.jobStatus.findMany({
      where: {
        stage: "FAILED",
        updatedAt: { gte: since },
      },
      select: {
        id: true,
        statementId: true,
        errorMessage: true,
        updatedAt: true,
        user: { select: { email: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 50,
    }),
  ]);

  const failedJobs = failedJobRows.map((j) => ({
    id: j.id,
    statementId: j.statementId,
    userEmail: j.user.email,
    failedAt: j.updatedAt.toISOString(),
    errorMessage: j.errorMessage ?? null,
  }));

  return NextResponse.json({
    data: {
      app: appStatus,
      worker: workerStatus,
      queueDepth,
      failedJobsLast24h,
      failedJobs,
    },
  });
}
