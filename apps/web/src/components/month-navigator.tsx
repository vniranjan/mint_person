"use client";

import { useEffect, useCallback } from "react";

interface MonthNavigatorProps {
  /** Currently selected month in YYYY-MM format. */
  month: string;
  /** All months that have transaction data, sorted descending (newest first). */
  availableMonths: string[];
  onChange: (month: string) => void;
}

/** Format "2026-03" → "March 2026" */
function formatMonth(month: string): string {
  const [year, mon] = month.split("-");
  const date = new Date(parseInt(year!), parseInt(mon!) - 1, 1);
  return date.toLocaleString("en-US", { month: "long", year: "numeric" });
}

/**
 * Month navigation strip — ← [Month Year] →
 * availableMonths is sorted descending: index 0 = most recent.
 * Disables → at most recent, ← at oldest.
 * Supports left/right arrow key navigation (skips interactive elements).
 */
export default function MonthNavigator({ month, availableMonths, onChange }: MonthNavigatorProps) {
  const currentIdx = availableMonths.indexOf(month);

  // Guard: if month not found in list, disable both directions
  const canGoNext = currentIdx > 0;
  const canGoPrev = currentIdx !== -1 && currentIdx < availableMonths.length - 1;

  const goNext = useCallback(() => {
    if (canGoNext) onChange(availableMonths[currentIdx - 1]!);
  }, [canGoNext, availableMonths, currentIdx, onChange]);

  const goPrev = useCallback(() => {
    if (canGoPrev) onChange(availableMonths[currentIdx + 1]!);
  }, [canGoPrev, availableMonths, currentIdx, onChange]);

  // Arrow key support — skip when focus is inside interactive elements
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target.isContentEditable ||
        target.closest('[role="listbox"]') ||
        target.closest('[role="dialog"]')
      ) {
        return;
      }
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [goPrev, goNext]);

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={goPrev}
        disabled={!canGoPrev}
        aria-label="Previous month"
        aria-disabled={!canGoPrev}
        className="rounded p-1 text-stone-500 hover:text-stone-900 disabled:cursor-not-allowed disabled:opacity-30 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400"
      >
        ←
      </button>

      <span className="min-w-36 text-center text-sm font-medium text-stone-700">
        {formatMonth(month)}
      </span>

      <button
        type="button"
        onClick={goNext}
        disabled={!canGoNext}
        aria-label="Next month"
        aria-disabled={!canGoNext}
        className="rounded p-1 text-stone-500 hover:text-stone-900 disabled:cursor-not-allowed disabled:opacity-30 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400"
      >
        →
      </button>
    </div>
  );
}
