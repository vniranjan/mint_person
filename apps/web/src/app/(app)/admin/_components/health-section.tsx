"use client";

import { useQuery } from "@tanstack/react-query";

interface HealthData {
  app: "ok" | "unknown";
  worker: "ok" | "unknown";
  queueDepth: number | null;
  failedJobsLast24h: number;
  failedJobs: {
    id: string;
    statementId: string | null;
    userEmail: string;
    failedAt: string;
    errorMessage: string | null;
  }[];
}

async function fetchHealth(): Promise<HealthData> {
  const res = await fetch("/api/admin/health");
  if (!res.ok) throw new Error("Failed to fetch health");
  const json = await res.json() as { data: HealthData };
  return json.data;
}

function StatusBadge({ status }: { status: "ok" | "unknown" }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
        status === "ok"
          ? "bg-emerald-50 text-emerald-700"
          : "bg-stone-100 text-stone-500"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          status === "ok" ? "bg-emerald-500" : "bg-stone-400"
        }`}
      />
      {status === "ok" ? "Healthy" : "Unknown"}
    </span>
  );
}

/**
 * System health section for the admin dashboard (Story 5.3).
 * Polls every 60s. Shows app/worker status, queue depth, failed jobs.
 */
export default function HealthSection() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-health"],
    queryFn: fetchHealth,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl bg-stone-100" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Status cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <p className="text-xs text-stone-500">App Container</p>
          <div className="mt-2">
            <StatusBadge status={data.app} />
          </div>
        </div>

        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <p className="text-xs text-stone-500">Worker Container</p>
          <div className="mt-2">
            <StatusBadge status={data.worker} />
          </div>
        </div>

        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <p className="text-xs text-stone-500">Queue Depth</p>
          {data.queueDepth === null ? (
            <div className="mt-2">
              <StatusBadge status="unknown" />
            </div>
          ) : (
            <p className="mt-1 text-2xl font-semibold tabular-nums text-stone-900">
              {data.queueDepth}
            </p>
          )}
        </div>

        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <p className="text-xs text-stone-500">Failed Jobs (24h)</p>
          <p
            className={`mt-1 text-2xl font-semibold tabular-nums ${
              data.failedJobsLast24h > 0 ? "text-red-600" : "text-stone-900"
            }`}
          >
            {data.failedJobsLast24h}
          </p>
        </div>
      </div>

      {/* Failed jobs table */}
      {data.failedJobs.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-100">
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-stone-400">User</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-stone-400">Statement ID</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-stone-400">Failed At</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-stone-400">Error</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-50">
              {data.failedJobs.map((job) => (
                <tr key={job.id} className="hover:bg-stone-50">
                  <td className="px-4 py-3 text-sm text-stone-700">{job.userEmail}</td>
                  <td className="px-4 py-3 text-xs text-stone-400 font-mono">
                    {job.statementId?.slice(0, 8) ?? "—"}…
                  </td>
                  <td className="px-4 py-3 text-xs text-stone-500">
                    {new Date(job.failedAt).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-4 py-3 text-xs text-red-600 max-w-xs truncate">
                    {job.errorMessage ?? "No message"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
