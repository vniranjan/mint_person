import { redirect } from "next/navigation";
import { auth } from "~/lib/auth";
import AdminClient from "./_components/admin-client";

/**
 * Admin page — server component.
 * Redirects non-admin users to /dashboard.
 */
export default async function AdminPage() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/dashboard");

  return <AdminClient />;
}
