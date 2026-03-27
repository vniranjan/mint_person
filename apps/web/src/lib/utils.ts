import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** shadcn/ui utility: merge Tailwind classes safely */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ── Currency formatter (UX-DR3: amount — tabular-nums, right-aligned) ──

/**
 * Format a numeric amount as USD currency string.
 * Uses Intl.NumberFormat — never manual string formatting.
 * Returns "$0.00" on non-numeric input (guards against NaN from parseFloat).
 * @example formatCurrency(42.5) → "$42.50"
 * @example formatCurrency("abc") → "$0.00"
 */
export function formatCurrency(amount: number | string): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  const safeNum = Number.isNaN(num) ? 0 : num;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safeNum);
}

// ── Date formatters ──

/**
 * Format a Date or ISO string to month identifier: "YYYY-MM".
 * This is the canonical month ID format used throughout the system.
 * Returns "0000-00" on invalid date input.
 * @example formatMonth(new Date("2026-03-15")) → "2026-03"
 */
export function formatMonth(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "0000-00";
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

/**
 * Format a month identifier "YYYY-MM" to a human-readable label.
 * Uses UTC to avoid timezone-boundary display bugs.
 * @example formatMonthLabel("2026-03") → "March 2026"
 */
export function formatMonthLabel(monthId: string): string {
  const [year, month] = monthId.split("-");
  if (!year || !month) return monthId;
  // Use Date.UTC to stay in UTC — avoids local timezone shifting the month label
  const date = new Date(Date.UTC(parseInt(year), parseInt(month) - 1, 1));
  if (isNaN(date.getTime())) return monthId;
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/**
 * Format a date to a short display string.
 * Returns empty string on invalid date input.
 * @example formatDate("2026-03-15T14:32:00Z") → "Mar 15, 2026"
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
}

/**
 * Parse a month identifier "YYYY-MM" into { year, month } integers.
 * Returns { year: 0, month: 0 } on malformed input (NaN-safe via || 0).
 */
export function parseMonthId(monthId: string): { year: number; month: number } {
  const [yearStr, monthStr] = monthId.split("-");
  const year = parseInt(yearStr ?? "0", 10) || 0;
  const month = parseInt(monthStr ?? "0", 10) || 0;
  return { year, month };
}
