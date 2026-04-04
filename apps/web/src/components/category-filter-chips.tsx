"use client";

import { CATEGORY_COLORS } from "~/lib/categories";

interface CategoryFilterChipsProps {
  /** Categories present in the current month's data. */
  categories: string[];
  activeCategory: string | null;
  onSelect: (category: string | null) => void;
}

/**
 * Radiogroup chip strip for filtering transactions by category.
 * Only shows categories that are present in the current month (not all 8).
 */
export default function CategoryFilterChips({
  categories,
  activeCategory,
  onSelect,
}: CategoryFilterChipsProps) {
  if (categories.length === 0) return null;

  const allActive = activeCategory === null;

  return (
    <div role="radiogroup" aria-label="Filter by category" className="flex flex-wrap gap-2">
      {/* All chip */}
      <button
        type="button"
        role="radio"
        aria-checked={allActive}
        onClick={() => onSelect(null)}
        className={`rounded-full px-3 py-1 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400 ${
          allActive
            ? "bg-stone-900 text-white"
            : "bg-stone-100 text-stone-600 hover:bg-stone-200"
        }`}
      >
        All
      </button>

      {/* Per-category chips */}
      {categories.map((cat) => {
        const isActive = activeCategory === cat;
        const colors = CATEGORY_COLORS[cat];
        return (
          <button
            key={cat}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => onSelect(isActive ? null : cat)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400 ${
              isActive
                ? `${colors?.bgClass ?? "bg-stone-100"} ${colors?.textClass ?? "text-stone-700"} ring-1 ring-inset ring-current`
                : "bg-stone-100 text-stone-600 hover:bg-stone-200"
            }`}
          >
            {cat}
          </button>
        );
      })}
    </div>
  );
}
