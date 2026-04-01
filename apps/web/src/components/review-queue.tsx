"use client";

import { formatDistanceToNow } from "date-fns";
import CategoryBadge from "./category-badge";

export interface FlaggedTransaction {
  id: string;
  date: string;
  merchantNorm: string;
  amount: string;
  category: string | null;
  confidence: number | null;
  isReviewed: boolean;
}

interface ReviewQueueProps {
  transactions: FlaggedTransaction[];
  /** Called when user selects a correction from within a row. */
  onCorrect: (id: string, category: string) => void;
}

/**
 * Inline review queue — no modal, no page navigation.
 * UX-DR6: role="list", each row is role="listitem".
 * Corrected rows dim to 80% opacity.
 */
export default function ReviewQueue({ transactions, onCorrect }: ReviewQueueProps) {
  if (transactions.length === 0) return null;

  return (
    <div
      role="list"
      className="divide-y divide-stone-100 rounded-xl border border-amber-200 bg-white"
    >
      {transactions.map((txn) => (
        <ReviewQueueRow key={txn.id} txn={txn} onCorrect={onCorrect} />
      ))}
    </div>
  );
}

function ReviewQueueRow({
  txn,
  onCorrect,
}: {
  txn: FlaggedTransaction;
  onCorrect: (id: string, category: string) => void;
}) {
  const reasonText = getReasonText(txn.confidence, txn.merchantNorm);
  const dimmed = txn.isReviewed;

  return (
    <div
      role="listitem"
      className={`flex items-center gap-3 px-4 py-3 transition-opacity ${dimmed ? "opacity-50" : ""}`}
    >
      {/* Date */}
      <span className="w-28 flex-shrink-0 text-xs text-stone-400">
        {formatDistanceToNow(new Date(txn.date), { addSuffix: true })}
      </span>

      {/* Merchant */}
      <span className="min-w-0 flex-1 truncate text-sm text-stone-900">{txn.merchantNorm}</span>

      {/* Amount */}
      <span className="w-20 flex-shrink-0 text-right text-sm tabular-nums text-stone-900">
        ${parseFloat(txn.amount).toFixed(2)}
      </span>

      {/* CategoryBadge with amber ring */}
      <div className="flex-shrink-0">
        <CategoryBadge category={txn.category} flagged />
      </div>

      {/* Flag icon with reason tooltip */}
      <div className="group relative flex-shrink-0">
        <button
          type="button"
          aria-label={`Categorization reason: ${reasonText}`}
          className="rounded p-0.5 text-amber-500 hover:text-amber-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v18m0-13.5h12l-2.5 3 2.5 3H3" />
          </svg>
        </button>
        {/* Tooltip */}
        <div
          role="tooltip"
          className="pointer-events-none absolute bottom-full right-0 z-10 mb-1 hidden w-48 rounded-md bg-stone-900 px-2 py-1 text-xs text-white group-hover:block group-focus-within:block"
        >
          {reasonText}
        </div>
      </div>
    </div>
  );
}

function getReasonText(confidence: number | null, merchantNorm: string): string {
  if (confidence === null || confidence === 0.0) return "Could not determine category";
  if (confidence === 0.60) return `Matched keyword — ${merchantNorm} (rule-based fallback)`;
  return `Low confidence (${Math.round(confidence * 100)}%)`;
}
