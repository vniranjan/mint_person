"use client";

import { useMonthSummary } from "~/hooks/use-month-summary";

export type { SummaryData } from "~/hooks/use-month-summary";

const currencyFmt = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

interface SummaryStripProps {
  month: string;
}

/** Parse the numeric value from vsLastMonth string like "+12.3%" or "-5.0%" */
function vsColor(vs: string): string {
  const num = parseFloat(vs.replace("%", ""));
  if (Math.abs(num) < 0.05) return "text-stone-500";
  return num > 0 ? "text-red-600" : "text-emerald-600";
}

/**
 * KPI strip — 4 cards: Total Spent, Top Category, Transactions, vs Prior Month.
 * Excludes isExcluded=true transactions (via API).
 */
export default function SummaryStrip({ month }: SummaryStripProps) {
  const { data, isLoading } = useMonthSummary(month);

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl bg-stone-100" />
        ))}
      </div>
    );
  }

  const topCategory = data.byCategory[0];

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <div className="rounded-xl border border-stone-200 bg-white p-4">
        <p className="text-xs text-stone-500">Total Spent</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums text-stone-900">
          ${currencyFmt.format(parseFloat(data.totalSpent))}
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

      <div className="rounded-xl border border-stone-200 bg-white p-4">
        <p className="text-xs text-stone-500">vs Prior Month</p>
        {data.vsLastMonth ? (
          <p className={`mt-1 text-2xl font-semibold tabular-nums ${vsColor(data.vsLastMonth)}`}>
            {data.vsLastMonth}
          </p>
        ) : (
          <p className="mt-1 text-sm text-stone-400">—</p>
        )}
      </div>
    </div>
  );
}
