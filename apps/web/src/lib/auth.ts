import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcryptjs from "bcryptjs";
import { prisma } from "~/lib/db";

// Augment the NextAuth Session to include user.id and user.role.
// Note: we only augment Session (not User) to avoid the @auth/core version
// conflict between @auth/prisma-adapter and next-auth's bundled @auth/core.
// The role is accessed via a cast in the session callback.
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "USER" | "ADMIN";
    } & DefaultSession["user"];
  }
}

/**
 * NextAuth.js v5 configuration.
 *
 * Auth strategy: database sessions stored in PostgreSQL via PrismaAdapter.
 * This enables immediate server-side session revocation (unlike JWT).
 * Session cookie: httpOnly, SameSite=Strict — no JWT exposed to JavaScript.
 *
 * Route protection: the `authorized` callback drives middleware behaviour.
 * Export `auth` as middleware in middleware.ts — unauthenticated requests to
 * protected routes are redirected to pages.signIn ("/login").
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = (credentials?.email as string | undefined) ?? "";
        const password = (credentials?.password as string | undefined) ?? "";
        if (!email || !password || password.length > 128) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        // Guard order matters for TypeScript control flow narrowing — keep explicit.
        // eslint-disable-next-line @typescript-eslint/prefer-optional-chain
        if (!user || !user.passwordHash || !user.isActive) return null;

        const valid = await bcryptjs.compare(password, user.passwordHash);
        if (!valid) return null;

        // Record login time — non-blocking (failure must not affect auth).
        try {
          await prisma.user.update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() },
          });
        } catch {
          // Intentionally swallowed — a write timeout here must not prevent login.
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name ?? null,
        };
      },
    }),
  ],
  session: { strategy: "database" },
  callbacks: {
    session({ session, user }) {
      // user comes from the database via PrismaAdapter and includes all fields.
      // TypeScript only knows the default NextAuth User fields, so we cast for role.
      session.user.id = user.id;
      session.user.role = (user as typeof user & { role: "USER" | "ADMIN" }).role ?? "USER";
      return session;
    },
    authorized({ auth: session }) {
      // Called by middleware for every matched route.
      // Return true to allow, false to redirect to pages.signIn ("/login").
      return !!session?.user;
    },
  },
  cookies: {
    sessionToken: {
      name: "next-auth.session-token",
      options: {
        httpOnly: true,
        sameSite: "strict" as const,
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
});
