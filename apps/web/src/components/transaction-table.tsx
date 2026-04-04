"use client";

import { useMemo } from "react";
import TransactionRow, { type Transaction } from "~/components/transaction-row";
import CategoryFilterChips from "~/components/category-filter-chips";

interface TransactionTableProps {
  transactions: Transaction[];
  month: string;
  /** The raw query key used by TanStack Query for this transaction list. */
  queryKey: unknown[];
  activeCategory: string | null;
  onCategoryChange: (category: string | null) => void;
  searchQuery: string;
  /** When true, transactions are already filtered server-side — skip client-side search filter. */
  isServerSearch?: boolean;
  /** Called when user clicks "Clear search" in the empty state. */
  onSearchClear?: () => void;
}

/**
 * Filterable transaction table for Epic 4.
 * Supports category chip filtering and text search.
 * When isServerSearch=true, only the category filter is applied client-side.
 * No pagination — continuous scroll as per Story 4.3 AC5.
 */
export default function TransactionTable({
  transactions,
  month,
  queryKey,
  activeCategory,
  onCategoryChange,
  searchQuery,
  isServerSearch = false,
  onSearchClear,
}: TransactionTableProps) {
  // Unique categories present in this month's data (from the full unfiltered list)
  const presentCategories = useMemo(() => {
    const seen = new Set<string>();
    const cats: string[] = [];
    for (const t of transactions) {
      const cat = t.category ?? "Uncategorized";
      if (!seen.has(cat)) {
        seen.add(cat);
        cats.push(cat);
      }
    }
    return cats;
  }, [transactions]);

  const filtered = useMemo(() => {
    let result = transactions;

    // Always apply category filter client-side
    if (activeCategory) {
      result = result.filter((t) => (t.category ?? "Uncategorized") === activeCategory);
    }

    // Only apply client-side search when not using server results
    if (!isServerSearch && searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      const searchNum = parseFloat(searchQuery.trim());
      result = result.filter((t) => {
        const merchant = t.merchantNorm.toLowerCase();
        const amountNum = parseFloat(t.amount);
        return (
          merchant.includes(q) ||
          (!isNaN(searchNum) && amountNum === searchNum)
        );
      });
    }

    return result;
  }, [transactions, activeCategory, searchQuery, isServerSearch]);

  return (
    <div className="space-y-3">
      <CategoryFilterChips
        categories={presentCategories}
        activeCategory={activeCategory}
        onSelect={onCategoryChange}
      />

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-stone-200 bg-white px-6 py-10 text-center">
          {searchQuery.trim() ? (
            <>
              <p className="text-sm text-stone-500">
                No transactions matching &ldquo;{searchQuery}&rdquo;
              </p>
              <button
                type="button"
                onClick={onSearchClear}
                className="mt-2 text-xs text-stone-400 underline underline-offset-2 hover:text-stone-700"
              >
                Clear search
              </button>
            </>
          ) : activeCategory ? (
            <>
              <p className="text-sm text-stone-500">
                No {activeCategory} transactions this month
              </p>
              <button
                type="button"
                onClick={() => onCategoryChange(null)}
                className="mt-2 text-xs text-stone-400 underline underline-offset-2 hover:text-stone-700"
              >
                Clear filter
              </button>
            </>
          ) : (
            <p className="text-sm text-stone-400">No transactions this month</p>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-100">
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-stone-400">
                  Date
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-stone-400">
                  Merchant
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-stone-400">
                  Category
                </th>
                <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-stone-400 tabular-nums">
                  Amount
                </th>
                <th scope="col" className="w-20 px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-50">
              {filtered.map((txn) => (
                <TransactionRow
                  key={txn.id}
                  transaction={txn}
                  month={month}
                  queryKey={queryKey}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
