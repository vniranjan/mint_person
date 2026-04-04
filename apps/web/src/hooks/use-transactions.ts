import { useQuery } from "@tanstack/react-query";
import { type Transaction } from "~/components/transaction-row";

async function fetchTransactions(month: string): Promise<Transaction[]> {
  const res = await fetch(`/api/transactions?month=${month}`);
  if (!res.ok) throw new Error("Failed to fetch transactions");
  const json = await res.json() as { data: Transaction[] };
  return json.data;
}

/**
 * Fetches all transactions for the given YYYY-MM month.
 * Query key: ["transactions", month] — matches TransactionRow optimistic updates.
 */
export function useTransactions(month: string) {
  return useQuery({
    queryKey: ["transactions", month],
    queryFn: () => fetchTransactions(month),
    staleTime: 30_000,
  });
}
