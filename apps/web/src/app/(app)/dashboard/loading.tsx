/**
 * Dashboard Suspense fallback.
 * UX-DR14: Skeleton placeholder matching content shape for API calls ≥ 500ms.
 * Full skeleton implementation → Story 4.1
 */
export default function DashboardLoading() {
  return (
    <div className="space-y-6" aria-label="Loading dashboard...">
      {/* KPI strip skeleton */}
      <div className="grid grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-20 animate-pulse rounded-xl bg-stone-100"
          />
        ))}
      </div>
      {/* Chart skeleton */}
      <div className="h-64 animate-pulse rounded-xl bg-stone-100" />
      {/* Table skeleton */}
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-12 animate-pulse rounded-lg bg-stone-100" />
        ))}
      </div>
    </div>
  );
}
