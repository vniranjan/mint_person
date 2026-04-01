"use client";

interface ReviewBannerProps {
  flaggedCount: number;
  onReviewNow: () => void;
  onSkip: () => void;
}

/**
 * Amber banner shown when flagged transactions need review.
 * role="alert" announces to screen readers on mount.
 * UX-DR6: amber-50 bg, Flag icon, [Review Now] + [Skip] buttons.
 */
export default function ReviewBanner({ flaggedCount, onReviewNow, onSkip }: ReviewBannerProps) {
  return (
    <div
      role="alert"
      className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-3"
    >
      <div className="flex items-center gap-2">
        {/* Flag icon */}
        <svg
          className="h-4 w-4 flex-shrink-0 text-amber-600"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 3v18m0-13.5h12l-2.5 3 2.5 3H3"
          />
        </svg>
        <p className="text-sm font-medium text-amber-700">
          {flaggedCount} {flaggedCount === 1 ? "transaction needs" : "transactions need"} review
        </p>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={onReviewNow}
          className="rounded-md bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-1"
        >
          Review Now
        </button>
        <button
          onClick={onSkip}
          className="text-xs text-amber-700 underline underline-offset-2 hover:text-amber-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-1"
        >
          Skip
        </button>
      </div>
    </div>
  );
}
