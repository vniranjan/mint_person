import { NextResponse } from "next/server";
import { VALID_CATEGORIES, CATEGORY_COLORS } from "~/lib/categories";

/**
 * GET /api/categories
 * Returns the 8 default category definitions with color tokens (FR19, UX-DR2).
 * No auth required — public taxonomy.
 */
export function GET() {
  const data = VALID_CATEGORIES.map((name) => ({
    name,
    ...CATEGORY_COLORS[name],
  }));
  return NextResponse.json({ data });
}
