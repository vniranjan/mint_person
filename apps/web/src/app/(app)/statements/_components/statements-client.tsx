"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import UploadDropZone from "~/components/upload-drop-zone";
import UploadPipeline from "~/components/upload-pipeline";

interface JobStatus {
  stage: string;
  transactionCount: number;
  errorMessage: string | null;
}

interface StatementRow {
  id: string;
  filename: string;
  institution: string | null;
  uploadedAt: string;
  jobStatus: JobStatus | null;
}

const STAGE_LABELS: Record<string, string> = {
  QUEUED: "Queued",
  UPLOADING: "Uploading",
  READING: "Reading",
  CATEGORIZING: "Categorizing",
  COMPLETE: "Complete",
  FAILED: "Failed",
};

function stageBadgeClass(stage: string): string {
  if (stage === "COMPLETE") return "bg-emerald-100 text-emerald-700";
  if (stage === "FAILED") return "bg-red-100 text-red-700";
  return "bg-amber-100 text-amber-700";
}

async function fetchStatements(): Promise<{ data: StatementRow[] }> {
  const res = await fetch("/api/statements");
  if (!res.ok) throw new Error("Failed to load statements");
  return res.json() as Promise<{ data: StatementRow[] }>;
}

/**
 * Statements list with compact upload drop zone.
 *
 * - Empty state: full-page UploadDropZone
 * - Returning user: compact upload at top + table of past statements
 */
export default function StatementsClient() {
  const queryClient = useQueryClient();
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [finishedStage, setFinishedStage] = useState<"COMPLETE" | "FAILED" | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["statements"],
    queryFn: fetchStatements,
  });

  const statements = data?.data ?? [];
  const hasStatements = statements.length > 0;

  function handleUploadStart(jobId: string) {
    setActiveJobId(jobId);
    setFinishedStage(null);
  }

  function handleJobFinished(stage: "COMPLETE" | "FAILED") {
    setFinishedStage(stage);
    if (stage === "COMPLETE") {
      void queryClient.invalidateQueries({ queryKey: ["statements"] });
    }
  }

  function handleRetry() {
    setActiveJobId(null);
    setFinishedStage(null);
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold text-stone-900">Statements</h1>
        <p className="text-sm text-stone-400">Loading…</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold text-stone-900">Statements</h1>
        <p className="text-sm text-red-600">Failed to load statements. Please refresh.</p>
      </div>
    );
  }

  // Empty state — no prior uploads
  if (!hasStatements && !activeJobId) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-stone-900">Statements</h1>
          <p className="mt-1 text-sm text-stone-500">
            No statements yet. Upload your first bank statement to get started.
          </p>
        </div>
        <UploadDropZone onUploadStart={handleUploadStart} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-stone-900">Statements</h1>
        <p className="mt-1 text-sm text-stone-500">Your uploaded bank statements.</p>
      </div>

      {/* Active upload / pipeline */}
      {activeJobId && finishedStage === null && (
        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <UploadPipeline jobId={activeJobId} onFinished={handleJobFinished} />
        </div>
      )}

      {finishedStage === "COMPLETE" && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-medium text-emerald-700">
            Statement processed successfully!
          </p>
          <button
            onClick={handleRetry}
            className="mt-1 text-xs text-stone-500 underline underline-offset-2"
          >
            Upload another
          </button>
        </div>
      )}

      {finishedStage === "FAILED" && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-medium text-red-700">Processing failed.</p>
          <button
            onClick={handleRetry}
            className="mt-1 text-xs text-stone-500 underline underline-offset-2"
          >
            Try again
          </button>
        </div>
      )}

      {/* Compact upload zone for returning users */}
      {!activeJobId && (
        <UploadDropZone onUploadStart={handleUploadStart} compact />
      )}

      {/* Statements table */}
      {hasStatements && (
        <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-50">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-stone-500">
                  File
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-stone-500">
                  Uploaded
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-stone-500">
                  Status
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-stone-500">
                  Transactions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {statements.map((s) => (
                <tr key={s.id} className="hover:bg-stone-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-stone-900">{s.filename}</p>
                    {s.institution && (
                      <p className="text-xs text-stone-400">{s.institution}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-stone-500">
                    {formatDistanceToNow(new Date(s.uploadedAt), { addSuffix: true })}
                  </td>
                  <td className="px-4 py-3">
                    {s.jobStatus ? (
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${stageBadgeClass(s.jobStatus.stage)}`}
                      >
                        {STAGE_LABELS[s.jobStatus.stage] ?? s.jobStatus.stage}
                      </span>
                    ) : (
                      <span className="text-stone-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-stone-900">
                    {s.jobStatus?.stage === "COMPLETE"
                      ? s.jobStatus.transactionCount.toLocaleString()
                      : "—"}
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
