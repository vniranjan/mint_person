/**
 * API response type wrappers.
 * All API routes use { "data": ... } wrapper on success.
 * All API errors use { "error": { "code": "UPPER_SNAKE_CASE", "message": "..." } }.
 *
 * Client code switches on error.code — NEVER on error.message.
 */

/** Standard success response wrapper */
export type ApiSuccess<T> = {
  data: T;
};

/** Standard error response */
export type ApiError = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

/** Pagination metadata for list endpoints */
export type PaginatedMeta = {
  total: number;
  page: number;
  pageSize: number;
};

/** Paginated list response */
export type PaginatedResponse<T> = {
  data: T[];
  meta: PaginatedMeta;
};

/** Union type for API route responses */
export type ApiResponse<T> = ApiSuccess<T> | ApiError;

/** Known error codes (extend as features are added) */
export const API_ERROR_CODES = {
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  PARSE_FAILED: "PARSE_FAILED",
  DUPLICATE_TRANSACTION: "DUPLICATE_TRANSACTION",
  JOB_NOT_FOUND: "JOB_NOT_FOUND",
} as const;

export type ApiErrorCode =
  (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES];
