import { useQuery } from "@tanstack/react-query";

export interface SummaryData {
  totalSpent: string;
  byCategory: { category: string; total: string; pct: number }[];
  transactionCount: number;
  vsLastMonth: string | null;
}

async function fetchSummary(month: string): Promise<SummaryData> {
  const res = await fetch(`/api/summary/${month}`);
  if (!res.ok) throw new Error("Failed to fetch summary");
  const json = await res.json() as { data: SummaryData };
  return json.data;
}

/**
 * Fetches monthly spending summary for the given YYYY-MM month.
 * Backed by TanStack Query with 60s stale time.
 * Single source of truth for the fetchSummary logic and SummaryData type.
 */
export function useMonthSummary(month: string) {
  return useQuery({
    queryKey: ["summary", month],
    queryFn: () => fetchSummary(month),
    staleTime: 60_000,
  });
}
