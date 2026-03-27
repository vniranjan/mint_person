import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Prisma client singleton.
 * Prevents connection pool exhaustion during Next.js hot reload in development.
 * The global caching pattern ensures only one PrismaClient instance exists per process.
 *
 * CRITICAL: Never call `new PrismaClient()` directly elsewhere in the codebase.
 * Always import `prisma` from this module.
 */
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
