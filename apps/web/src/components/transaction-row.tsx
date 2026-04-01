"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import CategoryBadge from "./category-badge";
import CategoryPickerPopover from "./category-picker-popover";
import { useToast } from "~/hooks/use-toast";

export interface Transaction {
  id: string;
  date: string;
  merchantNorm: string;
  amount: string;
  category: string | null;
  confidence: number | null;
  isFlagged: boolean;
  isDuplicate: boolean;
  isExcluded: boolean;
  isReviewed: boolean;
  patternAppliedNote?: string | null;
}

interface TransactionRowProps {
  transaction: Transaction;
  month: string;
}

async function patchTransaction(id: string, data: { category?: string; isExcluded?: boolean }) {
  const res = await fetch(`/api/transactions/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update transaction");
  return res.json() as Promise<{ data: { id: string; category: string; isReviewed: boolean; isExcluded: boolean } }>;
}

/**
 * Transaction row with 5 states: default, hover (actions reveal), corrected,
 * excluded (strikethrough + muted), flagged (amber CategoryBadge border).
 *
 * Hover actions: CategoryPickerPopover (correction) + [Exclude]/[Include] toggle.
 * Optimistic updates via TanStack Query mutation.
 */
export default function TransactionRow({ transaction: txn, month }: TransactionRowProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [corrected, setCorrected] = useState(false);

  // Correction mutation
  const correctionMutation = useMutation({
    mutationFn: (newCategory: string) => patchTransaction(txn.id, { category: newCategory }),
    onMutate: async (newCategory) => {
      await queryClient.cancelQueries({ queryKey: ["transactions", month] });
      const previous = queryClient.getQueryData(["transactions", month]);
      queryClient.setQueryData(["transactions", month], (old: { data: Transaction[] } | undefined) => {
        if (!old) return old;
        return {
          data: old.data.map((t) =>
            t.id === txn.id ? { ...t, category: newCategory, isReviewed: true } : t,
          ),
        };
      });
      return { previous };
    },
    onSuccess: (_data, newCategory) => {
      setCorrected(true);
      toast({
        title: `${txn.merchantNorm} — remembered for next time`,
        variant: "success",
      });
      void queryClient.invalidateQueries({ queryKey: ["flagged", month] });
      void queryClient.invalidateQueries({ queryKey: ["summary", month] });
      void newCategory;
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["transactions", month], context.previous);
      }
      toast({ title: "Failed to update category. Please try again.", variant: "destructive" });
    },
  });

  // Exclusion mutation
  const exclusionMutation = useMutation({
    mutationFn: (newExcluded: boolean) => patchTransaction(txn.id, { isExcluded: newExcluded }),
    onMutate: async (newExcluded) => {
      await queryClient.cancelQueries({ queryKey: ["transactions", month] });
      const previous = queryClient.getQueryData(["transactions", month]);
      queryClient.setQueryData(["transactions", month], (old: { data: Transaction[] } | undefined) => {
        if (!old) return old;
        return {
          data: old.data.map((t) =>
            t.id === txn.id ? { ...t, isExcluded: newExcluded } : t,
          ),
        };
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["transactions", month], context.previous);
      }
      toast({ title: "Failed to update transaction. Please try again.", variant: "destructive" });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["summary", month] });
    },
  });

  const isExcluded = txn.isExcluded;
  const isFlagged = txn.isFlagged && !txn.isReviewed;

  const rowOpacity = corrected ? "opacity-80" : "";
  const excludedStyle = isExcluded ? "line-through text-stone-400" : "";

  return (
    <tr
      className={`group hover:bg-stone-50 ${rowOpacity}`}
    >
      {/* Date */}
      <td className={`px-4 py-3 text-xs text-stone-400 ${excludedStyle}`}>
        {formatDistanceToNow(new Date(txn.date), { addSuffix: true })}
      </td>

      {/* Merchant */}
      <td className={`px-4 py-3 text-sm text-stone-900 ${excludedStyle}`}>
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span>{txn.merchantNorm}</span>
            {isExcluded && (
              <span className="rounded bg-stone-100 px-1.5 py-0.5 text-xs text-stone-500">
                Excluded
              </span>
            )}
            {txn.isDuplicate && !isExcluded && (
              <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-700">
                Possible duplicate
              </span>
            )}
          </div>
          {txn.patternAppliedNote && (
            <span className="text-xs text-stone-400">{txn.patternAppliedNote}</span>
          )}
        </div>
      </td>

      {/* Category — click to open picker */}
      <td className="px-4 py-3">
        <CategoryPickerPopover onSelect={(cat) => correctionMutation.mutate(cat)}>
          <button
            type="button"
            className="cursor-pointer rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400"
            aria-label={`Change category: currently ${txn.category ?? "Uncategorized"}`}
          >
            <CategoryBadge category={txn.category} flagged={isFlagged} />
          </button>
        </CategoryPickerPopover>
      </td>

      {/* Amount */}
      <td className={`px-4 py-3 text-right text-sm tabular-nums text-stone-900 ${excludedStyle}`}>
        ${parseFloat(txn.amount).toFixed(2)}
      </td>

      {/* Hover actions */}
      <td className="w-20 px-4 py-3 text-right opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        {isExcluded ? (
          <button
            type="button"
            onClick={() => exclusionMutation.mutate(false)}
            disabled={exclusionMutation.isPending}
            className="rounded px-2 py-0.5 text-xs text-stone-500 hover:text-stone-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400"
          >
            Include
          </button>
        ) : (
          <button
            type="button"
            onClick={() => exclusionMutation.mutate(true)}
            disabled={exclusionMutation.isPending}
            className="rounded px-2 py-0.5 text-xs text-stone-500 hover:text-stone-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400"
          >
            Exclude
          </button>
        )}
      </td>
    </tr>
  );
}
