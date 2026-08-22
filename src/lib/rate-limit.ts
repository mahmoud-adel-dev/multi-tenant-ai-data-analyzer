/**
 * Distributed-ready rate limiting.
 *
 * Default backend is in-process (per instance). When REDIS_URL is configured,
 * a sliding-window INCR/EXPIRE limiter on Redis is used so limits hold across
 * horizontally scaled instances. Redis mode requires the `ioredis` package.
 */
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

export interface RateLimiter {
  /** Consumes one token; returns remaining allowance and retry info. */
  consume(key: string, limit: number, windowSec: number): Promise<RateLimitResult>;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
}

/* ----------------------------- Memory backend ----------------------------- */

type Bucket = { count: number; resetAt: number };
const globalForLimiter = globalThis as unknown as { __rateBuckets?: Map<string, Bucket>; __redis?: unknown };
const buckets: Map<string, Bucket> = (globalForLimiter.__rateBuckets ??= new Map());

// Periodic cleanup to avoid unbounded growth in long-lived processes.
if (!(globalForLimiter as { __rateSweeper?: boolean }).__rateSweeper) {
  (globalForLimiter as { __rateSweeper?: boolean }).__rateSweeper = true;
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }, 60_000);
  timer.unref?.();
}

const memoryLimiter: RateLimiter = {
  async consume(key, limit, windowSec) {
    const now = Date.now();
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowSec * 1000 });
      return { allowed: true, remaining: limit - 1, retryAfterSec: 0 };
    }
    bucket.count += 1;
    const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    if (bucket.count > limit) return { allowed: false, remaining: 0, retryAfterSec };
    return { allowed: true, remaining: Math.max(0, limit - bucket.count), retryAfterSec: 0 };
  },
};

/* ------------------------------ Redis backend ----------------------------- */

async function getRedis(): Promise<{ incr: (k: string) => Promise<number>; expire: (k: string, s: number) => Promise<unknown>; ttl: (k: string) => Promise<number> } | null> {
  const env = getEnv();
  if (!env.REDIS_URL) return null;
  if (globalForLimiter.__redis) return globalForLimiter.__redis as never;
  try {
    const mod = await import("ioredis");
    const Redis = mod.default;
    const client = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 2, lazyConnect: false });
    globalForLimiter.__redis = client;
    return client as never;
  } catch (err) {
    logger.warn("Redis unavailable for rate limiting; falling back to in-memory limiter.", { error: String(err) });
    return null;
  }
}

const redisLimiter: RateLimiter = {
  async consume(key, limit, windowSec) {
    const redis = await getRedis();
    if (!redis) return memoryLimiter.consume(key, limit, windowSec);
    const redisKey = `rl:${key}:${Math.floor(Date.now() / (windowSec * 1000))}`;
    const count = await redis.incr(redisKey);
    if (count === 1) await redis.expire(redisKey, windowSec + 1);
    if (count > limit) {
      const ttl = await redis.ttl(redisKey);
      return { allowed: false, remaining: 0, retryAfterSec: Math.max(1, ttl) };
    }
    return { allowed: true, remaining: Math.max(0, limit - count), retryAfterSec: 0 };
  },
};

/** Backend chosen once per process; Redis activates automatically when REDIS_URL is set. */
export const rateLimiter: RateLimiter = getEnv().REDIS_URL ? redisLimiter : memoryLimiter;

export async function enforceRateLimit(
  scope: string,
  identifier: string,
  limit: number,
  windowSec: number
): Promise<RateLimitResult> {
  return rateLimiter.consume(`${scope}:${identifier}`, limit, windowSec);
}
