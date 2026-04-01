"use client";

import { CATEGORY_COLORS } from "~/lib/categories";

interface CategoryBadgeProps {
  category: string | null | undefined;
  /** When true, adds amber border ring to signal low-confidence (review queue). */
  flagged?: boolean;
}

/**
 * Displays a category label with UX-DR2 color pairing.
 * Flagged transactions get an amber border ring.
 */
export default function CategoryBadge({ category, flagged }: CategoryBadgeProps) {
  const label = category ?? "Uncategorized";
  const colors = CATEGORY_COLORS[label];
  const bgClass = colors?.bgClass ?? "bg-stone-100";
  const textClass = colors?.textClass ?? "text-stone-500";
  const ringClass = flagged ? "ring-1 ring-amber-400" : "";

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${bgClass} ${textClass} ${ringClass}`}
    >
      {label}
    </span>
  );
}
