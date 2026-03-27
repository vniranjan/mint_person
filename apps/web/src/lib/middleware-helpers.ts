import { type PrismaClient } from "@prisma/client";
import { prisma } from "~/lib/db";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Execute a database operation with RLS context set for the given user.
 *
 * CRITICAL: `set_config('app.current_user_id', ..., true)` sets the variable
 * LOCAL TO THE CURRENT TRANSACTION. Prisma's connection pool may route
 * `set_config` and subsequent queries to different connections, silently
 * bypassing RLS. This function wraps both in a single `prisma.$transaction()`
 * to guarantee they run on the same connection.
 *
 * Usage pattern for every protected API route:
 * ```typescript
 * const session = await auth();
 * if (!session?.user?.id) return NextResponse.json(UNAUTHORIZED_RESPONSE, { status: 401 });
 *
 * const result = await withRLS(session.user.id, (tx) =>
 *   tx.transaction.findMany({ where: { ... } })
 * );
 * ```
 *
 * Never call `prisma.*` directly in API routes — always use `withRLS`.
 * Full RLS migration SQL (policies on all tenant tables) is applied in Story 1.2.
 *
 * @param userId - The authenticated user's UUID
 * @param fn - Callback receiving the transaction client — run all queries here
 */
export async function withRLS<T>(
  userId: string,
  fn: (tx: Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">) => Promise<T>,
): Promise<T> {
  if (!UUID_REGEX.test(userId)) {
    throw new Error(`Invalid userId format: expected UUID, got "${userId}"`);
  }
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_user_id', ${userId}, true)`;
    return fn(tx);
  });
}

/**
 * Standard unauthorized response payload.
 */
export const UNAUTHORIZED_RESPONSE = {
  error: { code: "UNAUTHORIZED", message: "Authentication required" },
} as const;

/**
 * Standard forbidden response payload.
 */
export const FORBIDDEN_RESPONSE = {
  error: { code: "FORBIDDEN", message: "Insufficient permissions" },
} as const;
