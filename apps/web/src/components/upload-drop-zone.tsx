"use client";

import { useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { cn } from "~/lib/utils";

interface UploadDropZoneProps {
  /** Called with the jobId after a successful upload completes */
  onUploadComplete: (jobId: string) => void;
  /** Compact inline variant for returning users (default: false = full-page) */
  compact?: boolean;
}

type DropState = "idle" | "hover" | "drag-over" | "uploading";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

/**
 * CSV statement upload drop zone.
 *
 * States (UX-DR4):
 * - idle: stone-200 border
 * - hover: stone-400 border
 * - drag-over: amber-400 border + amber-50 bg
 * - uploading: replaced by spinner
 *
 * Keyboard: Enter/Space triggers file picker.
 * Screen reader: role="button", aria-label.
 */
export default function UploadDropZone({
  onUploadComplete,
  compact = false,
}: UploadDropZoneProps) {
  const [dropState, setDropState] = useState<DropState>("idle");
  const [error, setError] = useState<string | undefined>();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isUploading = dropState === "uploading";

  function openFilePicker() {
    fileInputRef.current?.click();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openFilePicker();
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    if (!isUploading) setDropState("drag-over");
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    if (!isUploading) setDropState("idle");
  }

  function handleMouseEnter() {
    if (dropState === "idle") setDropState("hover");
  }

  function handleMouseLeave() {
    if (dropState === "hover") setDropState("idle");
  }

  async function uploadFile(file: File) {
    // Client-side validation before round-trip (Finding #8)
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("Only CSV files are supported.");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError("File exceeds the 10 MB limit.");
      return;
    }
    if (file.size === 0) {
      setError("File is empty.");
      return;
    }

    setError(undefined);
    setDropState("uploading");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/statements/upload", {
        method: "POST",
        body: formData,
      });

      const body = (await res.json()) as {
        data?: { jobId: string; statementId: string };
        error?: { message?: string };
      };

      if (!res.ok) {
        setError(body.error?.message ?? "Upload failed. Please try again.");
        setDropState("idle");
        return;
      }

      if (body.data) {
        onUploadComplete(body.data.jobId);
      }
    } catch {
      setError("Unable to connect. Please try again.");
      setDropState("idle");
    }
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    // Guard against concurrent uploads (Finding #7)
    if (isUploading) return;
    const file = e.dataTransfer.files[0];
    if (!file) return;
    await uploadFile(file);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset input so the same file can be re-selected after an error
    e.target.value = "";
    await uploadFile(file);
  }

  return (
    <div className={cn("flex flex-col items-center", compact ? "gap-2" : "gap-4")}>
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload CSV statement — click or drag and drop"
        aria-busy={isUploading}
        onKeyDown={handleKeyDown}
        onClick={isUploading ? undefined : openFilePicker}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={cn(
          "flex cursor-pointer select-none flex-col items-center justify-center rounded-xl border-2 border-dashed transition-colors",
          compact ? "w-full gap-2 px-6 py-4" : "w-full gap-4 px-8 py-16",
          {
            "border-stone-200 bg-white": dropState === "idle",
            "border-stone-400 bg-white": dropState === "hover",
            "border-amber-400 bg-amber-50": dropState === "drag-over",
            "cursor-not-allowed border-stone-200 bg-stone-50": isUploading,
          },
        )}
      >
        {isUploading ? (
          <>
            <Loader2 className="h-6 w-6 animate-spin text-stone-400" />
            <p className="text-sm text-stone-500">Uploading…</p>
          </>
        ) : (
          <>
            <Upload
              className={cn(
                "transition-colors",
                compact ? "h-5 w-5" : "h-8 w-8",
                dropState === "drag-over" ? "text-amber-600" : "text-stone-400",
              )}
            />
            {compact ? (
              <p className="text-sm text-stone-500">
                Drop a CSV here or{" "}
                <span className="font-medium text-stone-900 underline-offset-2 hover:underline">
                  browse
                </span>
              </p>
            ) : (
              <>
                <p className="text-base font-medium text-stone-900">
                  Drop your CSV here
                </p>
                <p className="text-sm text-stone-500">
                  or{" "}
                  <span className="underline underline-offset-2">click to browse</span>
                  {" "}— Chase, Amex, BofA, Capital One, Wells Fargo
                </p>
              </>
            )}
          </>
        )}
      </div>

      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={handleFileChange}
        aria-hidden="true"
        tabIndex={-1}
      />
    </div>
  );
}
