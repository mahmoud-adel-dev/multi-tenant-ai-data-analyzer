/**
 * GET /api/health — liveness probe. Cheap, no dependencies, no details.
 */
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ status: "ok", timestamp: new Date().toISOString() });
}
