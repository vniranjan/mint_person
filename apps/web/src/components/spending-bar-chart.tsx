"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { CATEGORY_DOT_COLORS } from "~/lib/categories";
import { type SummaryData } from "~/hooks/use-month-summary";

const currencyFmt = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

interface SpendingBarChartProps {
  data: SummaryData;
  month: string; // YYYY-MM
}

interface TooltipPayloadEntry {
  payload: { category: string; total: number; pct: number };
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
}) {
  if (!active || !payload?.length) return null;
  const { category, total, pct } = payload[0]!.payload;
  return (
    <div className="rounded-lg border border-stone-200 bg-white px-3 py-2 shadow-sm text-xs">
      <p className="font-medium text-stone-900">{category}</p>
      <p className="text-stone-600">${currencyFmt.format(total)}</p>
      <p className="text-stone-400">{pct}% of month</p>
    </div>
  );
}

/** Format month "2026-03" → "March 2026" for aria-label */
function formatMonthLabel(month: string): string {
  const [year, mon] = month.split("-");
  const date = new Date(parseInt(year!), parseInt(mon!) - 1, 1);
  return date.toLocaleString("en-US", { month: "long", year: "numeric" });
}

/**
 * Spending bar chart — one bar per category, sorted by total spend descending.
 * Uses Recharts with ResponsiveContainer for tablet/desktop responsive layout.
 * Includes accessible hidden data table for screen readers.
 */
export default function SpendingBarChart({ data, month }: SpendingBarChartProps) {
  const chartData = data.byCategory.map((item) => ({
    category: item.category,
    total: parseFloat(item.total),
    pct: item.pct,
  }));

  const monthLabel = formatMonthLabel(month);

  if (chartData.length === 0) return null;

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-6">
      <h2 className="mb-4 text-sm font-medium text-stone-700">Spending by Category</h2>

      {/* Chart */}
      <div
        role="img"
        aria-label={`Spending by category for ${monthLabel}`}
        className="h-64"
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
            <XAxis
              dataKey="category"
              tick={{ fontSize: 11, fill: "#78716c" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#78716c" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => `$${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}`}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: "#f5f5f4" }} />
            <Bar dataKey="total" radius={[4, 4, 0, 0]}>
              {chartData.map((entry) => (
                <Cell
                  key={entry.category}
                  fill={CATEGORY_DOT_COLORS[entry.category] ?? "#a8a29e"}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Screen reader fallback table */}
      <table className="sr-only">
        <caption>Spending by category for {monthLabel}</caption>
        <thead>
          <tr>
            <th scope="col">Category</th>
            <th scope="col">Total</th>
            <th scope="col">Percentage</th>
          </tr>
        </thead>
        <tbody>
          {chartData.map((row) => (
            <tr key={row.category}>
              <td>{row.category}</td>
              <td>${currencyFmt.format(row.total)}</td>
              <td>{row.pct}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
