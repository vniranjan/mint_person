"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { useQuery } from "@tanstack/react-query";
import { CATEGORY_DOT_COLORS } from "~/lib/categories";

interface TrendEntry {
  month: string;
  byCategory: { category: string; total: string }[];
}

interface TrendsData {
  data: TrendEntry[];
}

async function fetchTrends(): Promise<TrendEntry[]> {
  const res = await fetch("/api/trends");
  if (!res.ok) throw new Error("Failed to fetch trends");
  const json = await res.json() as TrendsData;
  return json.data;
}

/** Format "2026-03" → "Mar '26" for axis labels */
function shortMonth(month: string): string {
  const [year, mon] = month.split("-");
  const date = new Date(parseInt(year!), parseInt(mon!) - 1, 1);
  return date.toLocaleString("en-US", { month: "short" }) + " '" + year!.slice(2);
}

/**
 * Multi-month spending trend chart (Story 4.5).
 * Shows one line per category across all available months.
 * Falls back to an empty-state message when < 2 months of data.
 */
export default function TrendChart() {
  const { data: months, isLoading } = useQuery({
    queryKey: ["trends"],
    queryFn: fetchTrends,
    staleTime: 60_000,
  });

  if (isLoading || !months) {
    return <div className="h-48 animate-pulse rounded-xl bg-stone-100" />;
  }

  if (months.length < 2) {
    return (
      <div className="rounded-xl border border-stone-200 bg-white px-6 py-10 text-center">
        <p className="text-sm text-stone-400">
          Upload more statements to see trends across months
        </p>
      </div>
    );
  }

  // Build flat chart data: one row per month with each category as a key
  const allCategories = Array.from(
    new Set(months.flatMap((m) => m.byCategory.map((c) => c.category))),
  );

  const chartData = months.map((m) => {
    const row: Record<string, string | number> = { month: shortMonth(m.month) };
    for (const cat of allCategories) {
      const entry = m.byCategory.find((c) => c.category === cat);
      row[cat] = entry ? parseFloat(entry.total) : 0;
    }
    return row;
  });

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-6">
      <h2 className="mb-4 text-sm font-medium text-stone-700">Spending Trends</h2>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
            <XAxis
              dataKey="month"
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
            <Tooltip
              formatter={(value: number, name: string) => [
                `$${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2 }).format(value)}`,
                name,
              ]}
            />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
            {allCategories.map((cat) => (
              <Line
                key={cat}
                type="monotone"
                dataKey={cat}
                stroke={CATEGORY_DOT_COLORS[cat] ?? "#a8a29e"}
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
