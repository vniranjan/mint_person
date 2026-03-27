"use client";

import { CheckCircle, XCircle } from "lucide-react";
import { Progress } from "~/components/ui/progress";
import { useJobStatus } from "~/hooks/use-job-status";

interface UploadPipelineProps {
  jobId: string;
  /** Called when the job reaches COMPLETE or FAILED */
  onFinished?: (stage: "COMPLETE" | "FAILED") => void;
}

const STAGE_LABELS: Record<string, string> = {
  QUEUED: "Getting ready…",
  UPLOADING: "Uploading…",
  READING: "Reading transactions…",
  CATEGORIZING: "Categorizing…",
  COMPLETE: "Done",
  FAILED: "Processing failed",
};

const STAGE_ORDER = ["QUEUED", "UPLOADING", "READING", "CATEGORIZING", "COMPLETE"];

function stageProgress(stage: string): number {
  const idx = STAGE_ORDER.indexOf(stage);
  if (idx < 0) return 0;
  return Math.round(((idx + 1) / STAGE_ORDER.length) * 100);
}

/**
 * Narrative upload pipeline status component (UX-DR5).
 *
 * Shows stage labels with a progress bar and live transaction count.
 * role="status" + aria-live="polite" for screen readers.
 * Respects prefers-reduced-motion (UX-DR18).
 */
export default function UploadPipeline({ jobId, onFinished }: UploadPipelineProps) {
  const { data, isError } = useJobStatus(jobId);
  const stage = data?.data?.stage ?? "QUEUED";
  const count = data?.data?.transactionCount ?? 0;
  const errorMessage = data?.data?.errorMessage;
  const isDone = stage === "COMPLETE" || stage === "FAILED";

  // Notify parent when finished
  if (isDone && onFinished) {
    onFinished(stage as "COMPLETE" | "FAILED");
  }

  function getLabel(): string {
    if (stage === "READING" && count > 0) return `Reading transactions… ${count} found`;
    if (stage === "CATEGORIZING" && count > 0) return `Categorizing… ${count} transactions`;
    if (stage === "COMPLETE") return `Done — ${count} transactions imported`;
    if (stage === "FAILED") return errorMessage ?? "Processing failed";
    return STAGE_LABELS[stage] ?? stage;
  }

  const progress = stageProgress(stage);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`Upload progress: ${getLabel()}`}
      className="w-full space-y-3"
    >
      <div className="flex items-center gap-3">
        {stage === "COMPLETE" && (
          <CheckCircle className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
        )}
        {stage === "FAILED" && (
          <XCircle className="h-5 w-5 shrink-0 text-red-600" aria-hidden="true" />
        )}
        <p
          className={
            stage === "COMPLETE"
              ? "text-sm font-medium text-emerald-700"
              : stage === "FAILED"
                ? "text-sm font-medium text-red-700"
                : "text-sm text-stone-700"
          }
        >
          {getLabel()}
        </p>
      </div>

      {!isDone && !isError && (
        <Progress
          value={progress}
          className="h-1.5 w-full"
          aria-hidden="true"
        />
      )}
    </div>
  );
}
