# Story 1.3: User Registration & Login

**Status:** review
**Epic:** 1 — Foundation, Infrastructure & Authentication
**Created:** 2026-03-27

---

## Story

As a new user,
I want to register an account with my email and password and log in securely,
so that I can access my personal finance dashboard.

---

## Acceptance Criteria

**AC1 — Login happy path:**
Given I am on `/login`, when I submit a valid email and password, then I am authenticated and redirected to `/dashboard`; a secure httpOnly SameSite=Strict session cookie is set; no JWT is exposed to JavaScript.

**AC2 — Login error:**
Given I am on `/login`, when I submit an email that does not exist or an incorrect password, then I see inline error "Invalid email or password" (no field-specific error that reveals which is wrong); no redirect occurs.

**AC3 — Registration:**
Given I submit a valid email and password ≥ 8 characters via the registration form, then my password is hashed with bcrypt cost factor 12; a `users` row is created with `role: USER`, `isActive: true`; I am redirected to `/dashboard`.

**AC4 — Logout:**
Given I am logged in, when I click "Sign out", then my session is invalidated server-side; I am redirected to `/login`; the session cookie is cleared.

**AC5 — Protected routes:**
Given I am not authenticated, when I navigate to any `/dashboard` or `/statements` route, then I am redirected to `/login`.

**AC6 — Form behavior:**
The login and register forms validate on blur (re-validate on change once error is shown); labels are always visible above fields; submit button shows a loading spinner during in-flight requests; password field has show/hide toggle.

---

## Tasks

- [x] **Task 1: Implement auth.ts — full Credentials provider** (AC: 1, 2, 3, 4)
  - [x] Wire Credentials `authorize()` to DB: `prisma.user.findUnique({ where: { email } })`, then `bcryptjs.compare(password, user.passwordHash!)`
  - [x] Return `null` on failure (triggers NextAuth "CredentialsSignin" error); return `{ id, email, name }` on success
  - [x] Update `user.lastLoginAt` on successful authorize: `prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })`
  - [x] Check `user.isActive === true` — return `null` if account is disabled
  - [x] Switch `session.strategy` from `"jwt"` to `"database"` and add `PrismaAdapter(prisma)`
  - [x] Add `session` callback to expose `user.id` and `user.role` on the session object
  - [x] Add `authorized` callback for middleware-based route protection
  - [x] Add `pages: { signIn: "/login", error: "/login" }`
  - [x] Module augmentation for Session type inline in auth.ts (Session only — no User augmentation to avoid @auth/prisma-adapter type conflict)

- [x] **Task 2: Create NextAuth API route handler** (AC: 1, 4)
  - [x] Create `apps/web/src/app/api/auth/[...nextauth]/route.ts`
  - [x] Content: `import { handlers } from "~/lib/auth"; export const { GET, POST } = handlers;`

- [x] **Task 3: Create registration API endpoint** (AC: 3)
  - [x] Create `apps/web/src/app/api/auth/register/route.ts` — `POST` handler only
  - [x] Validate: email format (basic regex), password ≥ 8 chars — 400 VALIDATION_ERROR
  - [x] Check uniqueness — 409 EMAIL_ALREADY_EXISTS
  - [x] Hash: `await bcryptjs.hash(password, 12)`
  - [x] Create user: `prisma.user.create({ data: { email, passwordHash: hash, role: "USER", isActive: true } })`
  - [x] Return 201 `{ data: { id, email, role } }` — NEVER includes `passwordHash`

- [x] **Task 4: Enable auth middleware** (AC: 5)
  - [x] Replace stub in `apps/web/src/middleware.ts` with `export { auth as middleware }`
  - [x] Export `config.matcher` covering `/dashboard/:path*`, `/statements/:path*`, `/admin/:path*`

- [x] **Task 5: Implement login page** (AC: 1, 2, 6)
  - [x] Full form in `apps/web/src/app/(auth)/login/page.tsx`
  - [x] Email + password fields with show/hide toggle (Eye/EyeOff from lucide-react)
  - [x] Client component with blur validation, loading state, error display
  - [x] Generic "Invalid email or password" error (no field disclosure)
  - [x] Redirect to /dashboard on success; link to /register

- [x] **Task 6: Create registration page** (AC: 3, 6)
  - [x] Create `apps/web/src/app/(auth)/register/page.tsx`
  - [x] Email, password, confirm password fields with show/hide toggles
  - [x] Blur validation (email format, password ≥ 8 chars, passwords match)
  - [x] POST /api/auth/register → auto signIn on 201 → redirect /dashboard

- [x] **Task 7: Update `(app)` layout with auth guard and navigation** (AC: 4, 5)
  - [x] `const session = await auth()` + `redirect("/login")` if not authenticated
  - [x] Nav header with app name "mint" and server-action sign out form
  - [x] `<SessionProvider session={session}>` wrapping children

- [x] **Task 8: Update root page redirect** (AC: 5)
  - [x] `apps/web/src/app/page.tsx` checks session: authenticated → /dashboard, else → /login

- [x] **Task 9: Write auth tests** (AC: 1, 2, 3)
  - [x] Create `apps/web/src/__tests__/auth-register.test.ts`
  - [x] Add `"test:auth"` script to package.json
  - [x] Tests: valid registration → 201 + bcrypt hash stored, duplicate → 409, short password → 400, no passwordHash in response, email trimmed/lowercased

---

## Dev Notes

### CRITICAL: Exact auth.ts Implementation

Replace the stub entirely. Key decisions:

```typescript
// apps/web/src/lib/auth.ts
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcryptjs from "bcryptjs";
import { prisma } from "~/lib/db";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const email = credentials.email as string;
        const password = credentials.password as string;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.passwordHash || !user.isActive) return null;

        const valid = await bcryptjs.compare(password, user.passwordHash);
        if (!valid) return null;

        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });

        return { id: user.id, email: user.email, role: user.role, name: user.name ?? undefined };
      },
    }),
  ],
  session: { strategy: "database" },
  callbacks: {
    session({ session, user }) {
      session.user.id = user.id;
      // @ts-expect-error — role comes from DB user record, not DefaultUser
      session.user.role = user.role;
      return session;
    },
    authorized({ auth }) {
      return !!auth?.user; // true = allow, false = redirect to signIn page
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
});
```

### CRITICAL: NextAuth v5 Session Type Augmentation

Without this, TypeScript will error on `session.user.id` and `session.user.role`:

```typescript
// apps/web/src/types/next-auth.d.ts
import { type DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "USER" | "ADMIN";
    } & DefaultSession["user"];
  }
  interface User {
    role: "USER" | "ADMIN";
  }
}
```

### CRITICAL: Middleware Pattern (NextAuth v5)

```typescript
// apps/web/src/middleware.ts
export { auth as middleware } from "~/lib/auth";

export const config = {
  matcher: ["/dashboard/:path*", "/statements/:path*", "/admin/:path*"],
};
```

The `authorized` callback in `auth.ts` handles redirect logic. When `authorized` returns `false`, NextAuth redirects to the `pages.signIn` URL (`/login`). Do NOT add separate redirect logic in middleware.

### CRITICAL: Registration Route Is NOT a NextAuth Route

NextAuth does not handle user registration. It only handles authentication (login/logout). Registration must be a custom API route at `POST /api/auth/register`. The registration flow is:
1. `POST /api/auth/register` creates the user and returns 201
2. Client then calls `signIn("credentials", ...)` to log the user in automatically
3. Never combine these steps — they are independent operations

### CRITICAL: PrismaAdapter with database sessions

With `strategy: "database"` and PrismaAdapter, NextAuth stores sessions in the `sessions` table (already in schema). The `Account`, `Session`, `VerificationToken` models in the Prisma schema were added in Story 1.1 specifically for this purpose — do NOT modify them.

The `session` callback receives `{ session, user }` (NOT `{ session, token }`) when using database sessions. Using `token` is the JWT pattern — wrong for this story.

### Existing File: auth.ts Is a Stub

`apps/web/src/lib/auth.ts` exists but has:
- `authorize()` that always returns `null` — REPLACE this
- `strategy: "jwt"` — CHANGE to `"database"`
- No `PrismaAdapter` — ADD it
- No `pages` config — ADD it
- No `authorized` callback — ADD it

**Do NOT create a new file** — replace the stub content.

### Existing Stub: `[...nextauth]` Directory

`apps/web/src/app/api/auth/[...nextauth]/` directory exists but has no `route.ts`. Create the file:

```typescript
// apps/web/src/app/api/auth/[...nextauth]/route.ts
import { handlers } from "~/lib/auth";
export const { GET, POST } = handlers;
```

This is the complete file. No other content needed.

### Password Hashing

`bcryptjs` (not `bcrypt`) is already installed. Use bcryptjs throughout — it is pure JS (no native bindings) and works in Next.js Edge runtime and serverless environments. Cost factor 12 (from architecture spec).

```typescript
import bcryptjs from "bcryptjs";
const hash = await bcryptjs.hash(password, 12);
const valid = await bcryptjs.compare(plaintext, hash);
```

### RLS and Auth Sessions

Protected API routes still need `withRLS()` from `~/lib/middleware-helpers`. The `session.user.id` (added by the session callback) is the userId for RLS context:

```typescript
// In protected API route handlers:
const session = await auth();
if (!session?.user?.id) return NextResponse.json(UNAUTHORIZED_RESPONSE, { status: 401 });
const result = await withRLS(session.user.id, (tx) => tx.something.findMany());
```

The `withRLS()` already has UUID format validation (added in Story 1.2 code review) — it will throw if `session.user.id` is not a valid UUID.

### UX — Login & Register Forms

Follow the patterns from `apps/web/src/components/ui/` — all shadcn components are already installed:
- `Button` — primary variant (`stone-900` bg) for submit
- `Input` — for email/password fields
- `Card`, `CardHeader`, `CardContent` — for form container

Form layout pattern (match the existing login stub layout):
```tsx
<main id="main-content" className="flex min-h-screen items-center justify-center bg-stone-50">
  <div className="w-full max-w-sm space-y-6 rounded-xl border border-stone-200 bg-white p-8 shadow-sm">
    {/* form content */}
  </div>
</main>
```

Field error display:
```tsx
{errors.email && (
  <p className="mt-1 text-xs text-red-600" role="alert">{errors.email}</p>
)}
```

Password show/hide toggle (import Eye, EyeOff from `lucide-react`):
```tsx
<div className="relative">
  <Input type={showPassword ? "text" : "password"} ... />
  <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400"
    onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Hide password" : "Show password"}>
    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
  </button>
</div>
```

Submit button with spinner:
```tsx
<Button type="submit" className="w-full" disabled={isPending}>
  {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
</Button>
```

### Navigation Header in `(app)/layout.tsx`

Keep it minimal — full navigation comes in later epics. For Story 1.3, just show app name and sign out:

```tsx
// Server component — use signOut server action
import { signOut } from "~/lib/auth";

<header className="border-b border-stone-200 bg-white">
  <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
    <span className="text-sm font-semibold text-stone-900">mint</span>
    <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
      <button type="submit" className="text-sm text-stone-500 hover:text-stone-900">Sign out</button>
    </form>
  </div>
</header>
```

### SessionProvider Placement

`SessionProvider` from `next-auth/react` must wrap any client component that calls `useSession()`. In `(app)/layout.tsx`:

```tsx
import { SessionProvider } from "next-auth/react";

export default async function AppLayout({ children }) {
  const session = await auth();
  if (!session) redirect("/login");
  return (
    <SessionProvider session={session}>
      <div className="min-h-screen bg-stone-50">
        {/* nav header */}
        <main id="main-content" className="mx-auto max-w-7xl px-4 py-6">{children}</main>
      </div>
    </SessionProvider>
  );
}
```

### Registration Validation Rules

- **Email:** must contain `@` and a `.` after it (simple check — full RFC validation is unnecessary complexity); trim whitespace
- **Password:** ≥ 8 characters; no maximum (bcrypt truncates at 72 bytes, which is fine)
- **Confirm password:** must match password (client-side only — server doesn't receive it)

### Test File Pattern

Use the same test setup as `rls-isolation.test.ts`:
- Import `prisma` from `~/lib/db`
- Use raw SQL or Prisma calls for setup/teardown
- `afterAll`: `DELETE FROM users WHERE email LIKE 'auth-test-%@mint-test.invalid'`
- Test the API route handler directly by constructing a `NextRequest` and calling the handler

```typescript
// Testing the register route handler directly
import { POST } from "~/app/api/auth/register/route";
import { NextRequest } from "next/server";

const req = new NextRequest("http://localhost/api/auth/register", {
  method: "POST",
  body: JSON.stringify({ email: "auth-test-1@mint-test.invalid", password: "password123" }),
  headers: { "Content-Type": "application/json" },
});
const res = await POST(req);
expect(res.status).toBe(201);
```

---

## Learnings from Previous Stories

**From Story 1.1 & 1.2 code review patterns:**
- All API responses must use `{ data: ... }` on success, `{ error: { code, message } }` on error — code is UPPER_SNAKE_CASE
- Never use `// @ts-ignore` — use `// @ts-expect-error` with a comment explaining why
- `withRLS()` already validates UUID format — don't add duplicate validation in route handlers
- Use `Optional[...]` typing (already applies to Python, not relevant here; TypeScript is fine with `T | null`)
- `prisma` singleton is at `~/lib/db` — never instantiate `new PrismaClient()` elsewhere
- The `~` path alias maps to `src/` — use it for all internal imports
- Tests use Vitest (not Jest) — already configured in `vitest.config.ts`

**From Story 1.2 codebase patterns established:**
- `middleware-helpers.ts` exports `withRLS`, `UNAUTHORIZED_RESPONSE`, `FORBIDDEN_RESPONSE` — reuse these
- Auth uses `auth()` from NextAuth v5 (not `getServerSession`) — the stub already has this import pattern
- `bcryptjs` is already in `package.json` dependencies — do NOT add `bcrypt` (native bindings, breaks Edge)

---

## Architecture Compliance

- **Auth library:** NextAuth.js v5 beta (`"next-auth": "^5.0.0-beta.25"`) — already installed
- **Adapter:** `@auth/prisma-adapter@^2.7.2` — already installed
- **Password hashing:** `bcryptjs@^2.4.3` — already installed (NOT `bcrypt`)
- **Session:** database strategy (PostgreSQL) — NOT JWT; enables immediate server-side revocation
- **Cookies:** httpOnly, SameSite=Strict — configured in existing `auth.ts` stub, preserve these settings
- **Schema:** All auth models (`User`, `Account`, `Session`, `VerificationToken`) exist — do NOT run new migrations
- **File locations:** All source under `apps/web/src/` using `~` alias; no changes outside `apps/web/`
- **No new packages** needed — all dependencies are installed

---

## NFR Coverage

- **Security:** bcrypt cost 12, httpOnly cookies, generic auth error (no oracle), isActive check
- **Accessibility:** Labels above fields, focus rings, aria-describedby on errors, Eye button aria-label, skip-to-content in root layout (already present)
- **UX:** Blur validation, loading state in button, password show/hide, links between login/register
- **Reduced motion:** Existing `prefers-reduced-motion` in globals.css covers spinner animation — no additional work needed

---

## Definition of Done

- [x] `POST /api/auth/register` creates user with bcrypt-hashed password, returns 201
- [x] `POST /api/auth/register` with duplicate email returns 409
- [x] Login with valid credentials redirects to `/dashboard` (session in DB)
- [x] Login with invalid credentials shows "Invalid email or password" inline
- [x] Navigating to `/dashboard` without session redirects to `/login`
- [x] Sign out clears session from DB and redirects to `/login`
- [x] `npm run typecheck` passes with no new errors
- [x] `npm run test:auth` passes (registration API tests)
- [x] `npm run test:rls` still passes (no regressions)
- [x] Python tests: `pytest tests/ -v` still 61/61 passing

---

## Dev Agent Record

**Completed by:** Claude (dev-story workflow)
**Completed:** 2026-03-27
**Session notes:**

All 9 tasks implemented. Key decisions made during implementation:

1. **`@auth/prisma-adapter` + `next-auth` dual `@auth/core` type conflict**: Augmenting `interface User` in the `declare module "next-auth"` block caused a TypeScript error because `@auth/prisma-adapter` and `next-auth` bundle separate `@auth/core` copies. Fixed by augmenting `Session` only; role accessed via cast `(user as typeof user & { role: "USER" | "ADMIN" }).role ?? "USER"` in the session callback.

2. **`prefer-optional-chain` lint error on credentials check**: `if (!credentials?.email || ...)` was flagged. Fixed by extracting to variables first: `const email = (credentials?.email as string | undefined) ?? ""`.

3. **`prefer-optional-chain` on `!user || !user.passwordHash || !user.isActive`**: This guard form is intentional — required for TypeScript control flow narrowing so `user.passwordHash` access is type-safe after the guard. Added `eslint-disable-next-line` comment with explanation.

4. **`NextRequest` type-only import**: ESLint `consistent-type-imports` required `import { type NextRequest, NextResponse }` in `register/route.ts`.

5. **`role` not returned from `authorize()`**: Including `role` in the return object caused `no-unsafe-assignment` lint errors. Removed `role` from authorize return — it's available in the session callback via PrismaAdapter's DB user lookup.

### File List

**Modified:**
- `apps/web/src/lib/auth.ts` — full replacement; Credentials provider, PrismaAdapter, database session strategy, session/authorized callbacks, cookie config
- `apps/web/src/middleware.ts` — replaced stub with `export { auth as middleware }` + matcher config
- `apps/web/src/app/(auth)/login/page.tsx` — replaced stub; full form with blur validation, Eye/EyeOff toggle, Loader2 spinner, signIn integration
- `apps/web/src/app/(app)/layout.tsx` — replaced stub; auth guard, nav header with sign-out, SessionProvider
- `apps/web/src/app/page.tsx` — redirects to /dashboard if authenticated, /login if not
- `apps/web/package.json` — added `test:auth` script

**Created:**
- `apps/web/src/app/api/auth/[...nextauth]/route.ts` — NextAuth handler
- `apps/web/src/app/api/auth/register/route.ts` — registration POST endpoint
- `apps/web/src/app/(auth)/register/page.tsx` — registration form page
- `apps/web/src/__tests__/auth-register.test.ts` — 7 integration tests

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-03-27 | 1.0 | Story created | SM Agent |
| 2026-03-27 | 1.1 | Implementation complete; status → review | Dev Agent |
