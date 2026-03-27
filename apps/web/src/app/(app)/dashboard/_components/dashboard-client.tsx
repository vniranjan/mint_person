"use client";

import { useState } from "react";
import Link from "next/link";
import UploadDropZone from "~/components/upload-drop-zone";
import UploadPipeline from "~/components/upload-pipeline";

/**
 * Dashboard interactive shell.
 *
 * States:
 * - No active job: full-page centered UploadDropZone (new user empty state)
 * - Active job: UploadPipeline with progress
 * - COMPLETE: success message with link to statements page
 * - FAILED: error shown inside UploadPipeline + option to retry
 *
 * Full KPI strip, spending chart, transaction table → Epic 4.
 */
export default function DashboardClient() {
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [finishedStage, setFinishedStage] = useState<"COMPLETE" | "FAILED" | null>(null);

  function handleUploadStart(jobId: string) {
    setActiveJobId(jobId);
    setFinishedStage(null);
  }

  function handleJobFinished(stage: "COMPLETE" | "FAILED") {
    setFinishedStage(stage);
  }

  function handleRetry() {
    setActiveJobId(null);
    setFinishedStage(null);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-stone-900">Dashboard</h1>
        <p className="mt-1 text-sm text-stone-500">
          Upload a bank statement to get started.
        </p>
      </div>

      {/* Upload section */}
      <div className="rounded-xl border border-stone-200 bg-white p-6">
        {activeJobId && finishedStage === null && (
          <UploadPipeline jobId={activeJobId} onFinished={handleJobFinished} />
        )}

        {finishedStage === "COMPLETE" && (
          <div className="space-y-3 text-center">
            <p className="text-sm font-medium text-emerald-700">
              Statement processed successfully!
            </p>
            <Link
              href="/statements"
              className="inline-block text-sm text-stone-900 underline underline-offset-2"
            >
              View all statements →
            </Link>
          </div>
        )}

        {finishedStage === "FAILED" && (
          <div className="space-y-3">
            <p className="text-sm text-red-700">Processing failed. Try uploading again.</p>
            <button
              onClick={handleRetry}
              className="text-sm text-stone-900 underline underline-offset-2"
            >
              Upload another file
            </button>
          </div>
        )}

        {!activeJobId && (
          <UploadDropZone onUploadStart={handleUploadStart} />
        )}
      </div>

      {/* TODO Epic 4: SummaryStrip, SpendingBarChart, CategoryFilterChips, TransactionTable */}
    </div>
  );
}
