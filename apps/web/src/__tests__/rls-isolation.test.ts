/**
 * Cross-tenant RLS isolation test (AC5 — Story 1.2).
 *
 * Verifies that the PostgreSQL Row Level Security policies correctly isolate
 * tenant data: a query under User A's RLS context cannot see User B's rows,
 * even with an explicit WHERE clause targeting user B's userId.
 *
 * Prerequisites:
 *   - PostgreSQL running with migrations applied (including RLS policies)
 *   - DATABASE_URL env var set to the test database
 *   - Run: npm run test:rls (from apps/web/)
 *
 * This test runs in CI against the postgres service container defined in ci.yml.
 * It is intentionally integration-only — it MUST talk to a real PostgreSQL
 * instance with RLS enabled. Mocking would defeat the purpose.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "~/lib/db";
import { withRLS } from "~/lib/middleware-helpers";

describe("Cross-tenant RLS isolation", () => {
  let userAId: string;
  let userBId: string;

  beforeAll(async () => {
    // Insert two test users directly via raw SQL — bypasses RLS since
    // there is no current_user_id session variable set at this point.
    const [userA] = await prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO users (id, email, role, "isActive", "createdAt", "updatedAt")
      VALUES (
        gen_random_uuid(),
        'rls-test-a@mint-test.invalid',
        'USER'::"Role",
        true,
        NOW(),
        NOW()
      )
      RETURNING id
    `;
    const [userB] = await prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO users (id, email, role, "isActive", "createdAt", "updatedAt")
      VALUES (
        gen_random_uuid(),
        'rls-test-b@mint-test.invalid',
        'USER'::"Role",
        true,
        NOW(),
        NOW()
      )
      RETURNING id
    `;

    userAId = userA.id;
    userBId = userB.id;

    // Insert one statement + one transaction + one correction_log + one job_status
    // for each user (raw SQL bypasses RLS)
    const [stmtA] = await prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO statements (id, "userId", filename, "uploadedAt")
      VALUES (gen_random_uuid(), ${userAId}::uuid, 'user-a.csv', NOW())
      RETURNING id
    `;

    await prisma.$executeRaw`
      INSERT INTO transactions (
        id, "userId", "statementId", date,
        "merchantRaw", "merchantNorm", amount, "createdAt"
      ) VALUES (
        gen_random_uuid(), ${userAId}::uuid, ${stmtA.id}::uuid,
        NOW(), 'ACME CORP', 'Acme Corp', 42.00, NOW()
      )
    `;

    await prisma.$executeRaw`
      INSERT INTO correction_logs (id, "userId", "merchantPattern", "correctedCategory", "createdAt")
      VALUES (gen_random_uuid(), ${userAId}::uuid, 'acme corp', 'Shopping', NOW())
    `;

    await prisma.$executeRaw`
      INSERT INTO job_status (id, "userId", "statementId", stage, "transactionCount", "createdAt", "updatedAt")
      VALUES (gen_random_uuid(), ${userAId}::uuid, ${stmtA.id}::uuid, 'COMPLETE'::"JobStage", 1, NOW(), NOW())
    `;

    const [stmtB] = await prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO statements (id, "userId", filename, "uploadedAt")
      VALUES (gen_random_uuid(), ${userBId}::uuid, 'user-b.csv', NOW())
      RETURNING id
    `;

    await prisma.$executeRaw`
      INSERT INTO transactions (
        id, "userId", "statementId", date,
        "merchantRaw", "merchantNorm", amount, "createdAt"
      ) VALUES (
        gen_random_uuid(), ${userBId}::uuid, ${stmtB.id}::uuid,
        NOW(), 'OTHER MART', 'Other Mart', 99.00, NOW()
      )
    `;

    await prisma.$executeRaw`
      INSERT INTO correction_logs (id, "userId", "merchantPattern", "correctedCategory", "createdAt")
      VALUES (gen_random_uuid(), ${userBId}::uuid, 'other mart', 'Groceries', NOW())
    `;

    await prisma.$executeRaw`
      INSERT INTO job_status (id, "userId", "statementId", stage, "transactionCount", "createdAt", "updatedAt")
      VALUES (gen_random_uuid(), ${userBId}::uuid, ${stmtB.id}::uuid, 'QUEUED'::"JobStage", 0, NOW(), NOW())
    `;
  });

  afterAll(async () => {
    // Cleanup: cascade delete removes statements + transactions automatically
    await prisma.$executeRaw`
      DELETE FROM users WHERE email LIKE 'rls-test-%@mint-test.invalid'
    `;
    await prisma.$disconnect();
  });

  it("User A context sees only User A transactions", async () => {
    const transactions = await withRLS(userAId, (tx) =>
      tx.transaction.findMany(),
    );

    expect(transactions).toHaveLength(1);
    expect(transactions[0].userId).toBe(userAId);
    expect(transactions[0].merchantRaw).toBe("ACME CORP");
  });

  it("User A context returns zero rows when querying for User B userId", async () => {
    // This is the critical cross-tenant assertion:
    // Even an explicit WHERE userId = userBId returns 0 rows because RLS
    // filters at the database layer before the WHERE clause is evaluated.
    const transactions = await withRLS(userAId, (tx) =>
      tx.transaction.findMany({
        where: { userId: userBId },
      }),
    );

    expect(transactions).toHaveLength(0);
  });

  it("User B context sees only User B transactions", async () => {
    const transactions = await withRLS(userBId, (tx) =>
      tx.transaction.findMany(),
    );

    expect(transactions).toHaveLength(1);
    expect(transactions[0].userId).toBe(userBId);
    expect(transactions[0].merchantRaw).toBe("OTHER MART");
  });

  it("Statements are also RLS-isolated per user", async () => {
    const statementsA = await withRLS(userAId, (tx) =>
      tx.statement.findMany(),
    );
    const statementsB = await withRLS(userBId, (tx) =>
      tx.statement.findMany(),
    );

    expect(statementsA).toHaveLength(1);
    expect(statementsA[0].userId).toBe(userAId);

    expect(statementsB).toHaveLength(1);
    expect(statementsB[0].userId).toBe(userBId);
  });

  it("CorrectionLogs are RLS-isolated per user", async () => {
    const correctionsA = await withRLS(userAId, (tx) =>
      tx.correctionLog.findMany(),
    );
    const correctionsB = await withRLS(userBId, (tx) =>
      tx.correctionLog.findMany(),
    );

    expect(correctionsA).toHaveLength(1);
    expect(correctionsA[0].userId).toBe(userAId);

    expect(correctionsB).toHaveLength(1);
    expect(correctionsB[0].userId).toBe(userBId);
  });

  it("JobStatus rows are RLS-isolated per user", async () => {
    const jobsA = await withRLS(userAId, (tx) =>
      tx.jobStatus.findMany(),
    );
    const jobsB = await withRLS(userBId, (tx) =>
      tx.jobStatus.findMany(),
    );

    expect(jobsA).toHaveLength(1);
    expect(jobsA[0].userId).toBe(userAId);

    expect(jobsB).toHaveLength(1);
    expect(jobsB[0].userId).toBe(userBId);
  });
});
