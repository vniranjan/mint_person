import DashboardClient from "./_components/dashboard-client";

/**
 * Dashboard page.
 *
 * Server component — minimal shell that renders the interactive client wrapper.
 * Full KPI strip, spending chart, and transaction table → Epic 4.
 */
export default function DashboardPage() {
  return <DashboardClient />;
}
