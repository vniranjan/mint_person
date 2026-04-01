"use client";

import { useQuery } from "@tanstack/react-query";

interface SummaryData {
  totalSpent: string;
  byCategory: { category: string; total: string; pct: number }[];
  transactionCount: number;
}

async function fetchSummary(month: string): Promise<SummaryData> {
  const res = await fetch(`/api/summary/${month}`);
  if (!res.ok) throw new Error("Failed to fetch summary");
  const json = await res.json() as { data: SummaryData };
  return json.data;
}

interface SummaryStripProps {
  month: string;
}

/**
 * KPI strip showing Total Spent, Top Category, and Transaction Count
 * for the given month. Excludes isExcluded=true transactions (via API).
 */
export default function SummaryStrip({ month }: SummaryStripProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["summary", month],
    queryFn: () => fetchSummary(month),
    staleTime: 60_000,
  });

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl bg-stone-100" />
        ))}
      </div>
    );
  }

  const topCategory = data.byCategory[0];

  return (
    <div className="grid grid-cols-3 gap-4">
      <div className="rounded-xl border border-stone-200 bg-white p-4">
        <p className="text-xs text-stone-500">Total Spent</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums text-stone-900">
          ${parseFloat(data.totalSpent).toLocaleString("en-US", { minimumFractionDigits: 2 })}
        </p>
      </div>

      <div className="rounded-xl border border-stone-200 bg-white p-4">
        <p className="text-xs text-stone-500">Top Category</p>
        {topCategory ? (
          <>
            <p className="mt-1 text-lg font-semibold text-stone-900">{topCategory.category}</p>
            <p className="text-xs text-stone-400">{topCategory.pct}% of spending</p>
          </>
        ) : (
          <p className="mt-1 text-sm text-stone-400">—</p>
        )}
      </div>

      <div className="rounded-xl border border-stone-200 bg-white p-4">
        <p className="text-xs text-stone-500">Transactions</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums text-stone-900">
          {data.transactionCount}
        </p>
      </div>
    </div>
  );
}
