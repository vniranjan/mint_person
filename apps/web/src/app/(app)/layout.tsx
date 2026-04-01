import { redirect } from "next/navigation";
import Link from "next/link";
import { SessionProvider } from "next-auth/react";
import { auth, signOut } from "~/lib/auth";
import QueryProvider from "~/components/query-provider";
import { Toaster } from "~/components/toaster";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  return (
    <QueryProvider>
    <SessionProvider session={session}>
      <div className="min-h-screen bg-stone-50">
        <header className="border-b border-stone-200 bg-white">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
            <span className="text-sm font-semibold text-stone-900">mint</span>
            <nav className="flex items-center gap-4">
              <Link
                href="/statements"
                className="text-sm text-stone-500 hover:text-stone-900"
              >
                Statements
              </Link>
              <Link
                href="/settings"
                className="text-sm text-stone-500 hover:text-stone-900"
              >
                Settings
              </Link>
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/login" });
                }}
              >
                <button
                  type="submit"
                  className="text-sm text-stone-500 hover:text-stone-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900 focus-visible:ring-offset-2"
                >
                  Sign out
                </button>
              </form>
            </nav>
          </div>
        </header>
        <main id="main-content" className="mx-auto max-w-7xl px-4 py-6">
          {children}
        </main>
        <Toaster />
      </div>
    </SessionProvider>
    </QueryProvider>
  );
}
