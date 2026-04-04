"use client";

import { useState, useCallback, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import UploadDropZone from "~/components/upload-drop-zone";
import UploadPipeline from "~/components/upload-pipeline";
import ReviewBanner from "~/components/review-banner";
import ReviewQueue, { type FlaggedTransaction } from "~/components/review-queue";
import SummaryStrip from "~/components/summary-strip";
import SpendingBarChart from "~/components/spending-bar-chart";
import TransactionTable from "~/components/transaction-table";
import SearchInput from "~/components/search-input";
import MonthNavigator from "~/components/month-navigator";
import TrendChart from "~/components/trend-chart";
import { useMonthSummary } from "~/hooks/use-month-summary";
import { useTransactions } from "~/hooks/use-transactions";

interface DashboardClientProps {
  hasStatements: boolean;
}

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function fetchFlagged(month: string): Promise<FlaggedTransaction[]> {
  const res = await fetch(`/api/transactions?month=${month}&flagged=true`);
  if (!res.ok) return [];
  const json = await res.json() as { data: FlaggedTransaction[] };
  return json.data;
}

async function fetchAvailableMonths(): Promise<string[]> {
  const res = await fetch("/api/months");
  if (!res.ok) return [];
  const json = await res.json() as { data: string[] };
  return json.data;
}

/**
 * Dashboard interactive shell — Epic 4 complete.
 *
 * Month selection is reflected in the URL (?month=YYYY-MM).
 * State: month, activeCategory, searchQuery, upload/review states.
 */
export default function DashboardClient({ hasStatements }: DashboardClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Month from URL param, fallback to current month
  const urlMonth = searchParams.get("month");
  const [month, setMonthState] = useState<string>(
    urlMonth && /^\d{4}-\d{2}$/.test(urlMonth) ? urlMonth : getCurrentMonth(),
  );

  // Upload / job state
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [finishedStage, setFinishedStage] = useState<"COMPLETE" | "FAILED" | null>(null);

  // Review state
  const [reviewOpen, setReviewOpen] = useState(false);
  const [skipped, setSkipped] = useState(false);

  // Filter / search state
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Update URL when month changes
  const setMonth = useCallback(
    (newMonth: string) => {
      setMonthState(newMonth);
      setActiveCategory(null);
      setSearchQuery("");
      setDebouncedSearch("");
      const params = new URLSearchParams(searchParams.toString());
      params.set("month", newMonth);
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  // Sync URL → state if user navigates directly (browser back/forward)
  useEffect(() => {
    if (urlMonth && /^\d{4}-\d{2}$/.test(urlMonth) && urlMonth !== month) {
      setMonthState(urlMonth);
    }
  }, [urlMonth, month]);

  // Data queries
  const { data: availableMonths = [] } = useQuery({
    queryKey: ["months"],
    queryFn: fetchAvailableMonths,
    staleTime: 60_000,
    enabled: hasStatements,
  });

  const { data: flaggedTxns = [] } = useQuery({
    queryKey: ["flagged", month],
    queryFn: () => fetchFlagged(month),
    enabled: hasStatements,
  });

  const summaryResult = useMonthSummary(month);
  const transactionsResult = useTransactions(month);

  const flaggedCount = flaggedTxns.filter((t) => !t.isReviewed).length;
  const transactions = transactionsResult.data ?? [];

  // Search: when debouncedSearch changes call search endpoint and update results
  const { data: searchResults } = useQuery({
    queryKey: ["transactions-search", month, debouncedSearch],
    queryFn: async () => {
      if (!debouncedSearch.trim()) return null;
      const res = await fetch(
        `/api/transactions/search?q=${encodeURIComponent(debouncedSearch)}&month=${month}`,
      );
      if (!res.ok) return null;
      const json = await res.json() as { data: typeof transactions };
      return json.data;
    },
    enabled: !!debouncedSearch.trim(),
    staleTime: 10_000,
  });

  // When search is active, use search results; otherwise use full transaction list
  const displayTransactions = debouncedSearch.trim() ? (searchResults ?? []) : transactions;
  const txQueryKey: unknown[] = debouncedSearch.trim()
    ? ["transactions-search", month, debouncedSearch]
    : ["transactions", month];

  function handleUploadComplete(jobId: string) {
    setActiveJobId(jobId);
    setFinishedStage(null);
  }

  function handleJobFinished(stage: "COMPLETE" | "FAILED") {
    setFinishedStage(stage);
  }

  function handleRetry() {
    setActiveJobId(null);
    setFinishedStage(null);
  }

  function handleCorrect(id: string, _category: string) {
    void id;
  }

  // Ensure current month is in available months list for the navigator
  const navigatorMonths =
    availableMonths.length > 0
      ? availableMonths.includes(month)
        ? availableMonths
        : [month, ...availableMonths]
      : [month];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-stone-900">Dashboard</h1>
          <p className="mt-1 text-sm text-stone-500">
            {hasStatements ? "Your spending overview." : "Upload a bank statement to get started."}
          </p>
        </div>

        {/* Month navigator — only shown when user has data */}
        {hasStatements && availableMonths.length > 0 && (
          <MonthNavigator
            month={month}
            availableMonths={navigatorMonths}
            onChange={setMonth}
          />
        )}
      </div>

      {/* Review banner */}
      {hasStatements && flaggedCount > 0 && !skipped && (
        <ReviewBanner
          flaggedCount={flaggedCount}
          onReviewNow={() => setReviewOpen(true)}
          onSkip={() => setSkipped(true)}
        />
      )}

      {reviewOpen && flaggedTxns.length > 0 && (
        <ReviewQueue transactions={flaggedTxns} onCorrect={handleCorrect} />
      )}

      {/* Upload section */}
      <div className="rounded-xl border border-stone-200 bg-white p-6">
        {activeJobId && finishedStage === null && (
          <UploadPipeline jobId={activeJobId} onFinished={handleJobFinished} />
        )}

        {finishedStage === "COMPLETE" && (
          <div className="space-y-3 text-center">
            <p className="text-sm font-medium text-emerald-700">
              Statement processed successfully!
            </p>
            <Link
              href="/statements"
              className="inline-block text-sm text-stone-900 underline underline-offset-2"
            >
              View all statements →
            </Link>
          </div>
        )}

        {finishedStage === "FAILED" && (
          <div className="space-y-3">
            <p className="text-sm text-red-700">Processing failed. Try uploading again.</p>
            <button
              onClick={handleRetry}
              className="text-sm text-stone-900 underline underline-offset-2"
            >
              Upload another file
            </button>
          </div>
        )}

        {!activeJobId && (
          <UploadDropZone
            onUploadComplete={handleUploadComplete}
            compact={hasStatements}
          />
        )}
      </div>

      {/* KPI strip */}
      {hasStatements && <SummaryStrip month={month} />}

      {/* Spending bar chart */}
      {hasStatements && summaryResult.data && summaryResult.data.byCategory.length > 0 && (
        <SpendingBarChart data={summaryResult.data} month={month} />
      )}

      {/* Transaction explorer */}
      {hasStatements && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-stone-700">Transactions</h2>
            <span className="text-xs text-stone-400">
              {transactions.length} total
            </span>
          </div>

          <SearchInput
            value={searchQuery}
            onChange={(q) => {
              setSearchQuery(q);
              setDebouncedSearch(q);
            }}
          />

          <TransactionTable
            transactions={displayTransactions}
            month={month}
            queryKey={txQueryKey}
            activeCategory={activeCategory}
            onCategoryChange={setActiveCategory}
            searchQuery={debouncedSearch}
            isServerSearch={!!debouncedSearch.trim()}
            onSearchClear={() => {
              setSearchQuery("");
              setDebouncedSearch("");
            }}
          />
        </div>
      )}

      {/* Multi-month trend chart */}
      {hasStatements && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-stone-700">Trends</h2>
          <TrendChart />
        </div>
      )}
    </div>
  );
}
