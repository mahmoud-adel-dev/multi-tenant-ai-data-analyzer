/**
 * GET /api/ready — readiness probe: DB ping, storage connectivity, and
 * (when configured) the Python analytics service. No sensitive details.
 */
import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Check = { ok: boolean; latencyMs?: number; error?: string };

async function checkDatabase(): Promise<Check> {
  try {
    const start = Date.now();
    const mongoose = (await import("mongoose")).default;
    if (mongoose.connection.readyState !== 1) {
      await import("@/lib/db").then((m) => m.default());
    }
    await mongoose.connection.db?.admin().command({ ping: 1 });
    return { ok: true, latencyMs: Date.now() - start };
  } catch {
    return { ok: false, error: "unavailable" };
  }
}

async function checkStorage(): Promise<Check> {
  try {
    const start = Date.now();
    const { getStorage } = await import("@/lib/storage");
    await getStorage().exists("__readiness_probe__");
    return { ok: true, latencyMs: Date.now() - start };
  } catch {
    return { ok: false, error: "unavailable" };
  }
}

async function checkAnalytics(): Promise<Check | null> {
  const env = getEnv();
  if (!env.ANALYTICS_SERVICE_URL) return null; // Worker-tier dependency, not web-tier.
  try {
    const start = Date.now();
    const res = await fetch(`${env.ANALYTICS_SERVICE_URL.replace(/\/$/, "")}/healthz`, {
      signal: AbortSignal.timeout(5000),
    });
    return { ok: res.ok, latencyMs: Date.now() - start };
  } catch {
    return { ok: false, error: "unreachable" };
  }
}

export async function GET(): Promise<NextResponse> {
  const [database, storage, analyticsService] = await Promise.all([
    checkDatabase(),
    checkStorage(),
    checkAnalytics(),
  ]);

  const checks: Record<string, Check> = { database, storage };
  if (analyticsService) checks.analyticsService = analyticsService;

  // Analytics service unavailability does not block web readiness —
  // jobs simply wait in queue until the worker can reach it.
  const ready = database.ok && storage.ok;

  return NextResponse.json(
    { status: ready ? "ready" : "degraded", checks, timestamp: new Date().toISOString() },
    { status: ready ? 200 : 503 }
  );
}
