import { redirect } from "next/navigation";
import { auth } from "~/lib/auth";

/**
 * Root page — redirect based on auth state.
 * Authenticated users → /dashboard. Unauthenticated → /login.
 * Middleware also protects /dashboard, so this is belt-and-suspenders.
 */
export default async function RootPage() {
  const session = await auth();
  redirect(session ? "/dashboard" : "/login");
}
