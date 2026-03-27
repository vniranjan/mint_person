export { auth as middleware } from "~/lib/auth";

export const config = {
  // Protect all routes under /dashboard, /statements, /admin.
  // The authorized() callback in auth.ts handles redirect logic —
  // unauthenticated requests are redirected to pages.signIn ("/login").
  matcher: [
    "/dashboard/:path*",
    "/statements/:path*",
    "/admin/:path*",
    "/settings/:path*",
  ],
};
