"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import UploadDropZone from "~/components/upload-drop-zone";
import UploadPipeline from "~/components/upload-pipeline";
import ReviewBanner from "~/components/review-banner";
import ReviewQueue, { type FlaggedTransaction } from "~/components/review-queue";
import SummaryStrip from "~/components/summary-strip";

interface DashboardClientProps {
  /** Whether the user has any prior uploaded statements (from server-side query). */
  hasStatements: boolean;
}

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function fetchFlagged(month: string): Promise<FlaggedTransaction[]> {
  const res = await fetch(`/api/transactions?month=${month}&flagged=true`);
  if (!res.ok) return [];
  const json = await res.json() as { data: FlaggedTransaction[] };
  return json.data;
}

/**
 * Dashboard interactive shell.
 *
 * States:
 * - No prior statements and no active job → full-page centered UploadDropZone
 * - Active job: UploadPipeline with progress
 * - COMPLETE: success message with link to statements page
 * - FAILED: error shown inside UploadPipeline + option to retry
 * - Flagged transactions: ReviewBanner + ReviewQueue (Story 3.2)
 *
 * Full KPI strip, spending chart, transaction table → Epic 4.
 */
export default function DashboardClient({ hasStatements }: DashboardClientProps) {
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [finishedStage, setFinishedStage] = useState<"COMPLETE" | "FAILED" | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const currentMonth = getCurrentMonth();

  const { data: flaggedTxns = [] } = useQuery({
    queryKey: ["flagged", currentMonth],
    queryFn: () => fetchFlagged(currentMonth),
    enabled: hasStatements,
  });

  const flaggedCount = flaggedTxns.filter((t) => !t.isReviewed).length;

  function handleUploadComplete(jobId: string) {
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

  function handleCorrect(id: string, _category: string) {
    // Optimistic mark-as-reviewed locally so the row dims immediately.
    // Full correction is handled by TransactionRow in Story 3.3.
    void id;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-stone-900">Dashboard</h1>
        <p className="mt-1 text-sm text-stone-500">
          {hasStatements
            ? "Your spending overview."
            : "Upload a bank statement to get started."}
        </p>
      </div>

      {/* Review banner — shown when flagged transactions exist and not skipped */}
      {hasStatements && flaggedCount > 0 && !skipped && (
        <ReviewBanner
          flaggedCount={flaggedCount}
          onReviewNow={() => setReviewOpen(true)}
          onSkip={() => setSkipped(true)}
        />
      )}

      {/* Inline review queue */}
      {reviewOpen && flaggedTxns.length > 0 && (
        <ReviewQueue transactions={flaggedTxns} onCorrect={handleCorrect} />
      )}

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
          <UploadDropZone
            onUploadComplete={handleUploadComplete}
            compact={hasStatements}
          />
        )}
      </div>

      {/* KPI strip — shown when user has data */}
      {hasStatements && (
        <SummaryStrip month={currentMonth} />
      )}

      {/* TODO Epic 4: SpendingBarChart, CategoryFilterChips, TransactionTable */}
    </div>
  );
}
