/**
 * Domain type stubs.
 * These mirror the Prisma schema (Story 1.2) and will expand as features are added.
 *
 * Naming convention: PascalCase, no "I" prefix.
 * Dates: UTC ISO 8601 strings in API responses.
 * Currency amounts: string (from NUMERIC(12,2) in DB) — format with formatCurrency() from utils.ts.
 * Month IDs: "YYYY-MM" string — use formatMonth() from utils.ts.
 * IDs: always UUID string, never integer.
 */

/** Job processing status stages (exact enum — never deviate) */
export type JobStage =
  | "QUEUED"
  | "UPLOADING"
  | "READING"
  | "CATEGORIZING"
  | "COMPLETE"
  | "FAILED";

/** User role (enforced at API layer for admin routes) */
export type UserRole = "USER" | "ADMIN";

/** The 8 fixed spending categories (FR19) */
export type CategoryName =
  | "Groceries"
  | "Dining"
  | "Transport"
  | "Shopping"
  | "Subscriptions"
  | "Healthcare"
  | "Entertainment"
  | "Utilities"
  | "Uncategorized";

/** Transaction domain type (mirrors Prisma Transaction model) */
export type Transaction = {
  id: string;
  userId: string;
  statementId: string;
  date: string; // ISO 8601 UTC
  merchantRaw: string;
  merchantNormalized: string | null;
  amount: string; // NUMERIC(12,2) as string
  category: CategoryName | null;
  confidence: number | null; // 0.0–1.0
  isFlagged: boolean;
  isExcluded: boolean;
  correctedAt: string | null;
  createdAt: string;
};

/** Statement domain type (mirrors Prisma Statement model) */
export type Statement = {
  id: string;
  userId: string;
  filename: string;
  bank: string | null;
  uploadedAt: string;
  status: JobStage;
  transactionCount: number | null;
};

/** Job status type (for polling — mirrors Prisma JobStatus model) */
export type JobStatus = {
  id: string;
  statementId: string;
  stage: JobStage;
  progress: number | null; // 0–100
  message: string | null;
  updatedAt: string;
};

/** Category type (for taxonomy display) */
export type Category = {
  name: CategoryName;
  displayName: string;
  colorBg: string;
  colorText: string;
};

/** Monthly spending summary (for dashboard KPI strip and bar chart) */
export type MonthlySummary = {
  month: string; // "YYYY-MM"
  totalSpend: string; // formatted as currency string
  byCategory: Array<{
    category: CategoryName;
    total: string;
    percentage: number; // 0–100
    transactionCount: number;
  }>;
};

/** Admin user view (never includes financial data) */
export type AdminUser = {
  id: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  lastLoginAt: string | null;
  statementCount: number;
  createdAt: string;
};
