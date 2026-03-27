import { NextResponse } from "next/server";

// Force per-request evaluation so Azure Container Apps liveness probes always
// hit a live handler — a statically cached 200 would mask container failures.
export const dynamic = "force-dynamic";

/**
 * Health check endpoint.
 * Used by Azure Container Apps liveness probes.
 * Returns { "data": { "status": "ok" } } with HTTP 200.
 *
 * No auth required — this is a public health check.
 */
export function GET() {
  return NextResponse.json({ data: { status: "ok" } }, { status: 200 });
}
