import IORedis from "ioredis";

let redis: IORedis | null = null;

function client(): IORedis | null {
  try {
    if (!redis) {
      redis = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
        // Queue commands while (re)connecting; give up fast when Redis is
        // down so callers fail open instead of hanging. Reconnects keep
        // trying in the background with the default backoff.
        maxRetriesPerRequest: 2,
        connectTimeout: 2000,
      });
      // An unhandled 'error' event would crash the process; the try/catch in
      // rateLimit() only covers command failures, not emitter errors.
      redis.on("error", () => undefined);
    }
    return redis;
  } catch {
    return null;
  }
}

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  /** Milliseconds until the window resets. */
  resetAfterMs: number;
};

/**
 * Fixed-window rate limiter backed by Redis. Fails OPEN when Redis is
 * unreachable so limits never take the app down with them.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  try {
    const connection = client();
    if (!connection) return { ok: true, remaining: limit, resetAfterMs: 0 };

    const windowKey = `ratelimit:${key}:${Math.floor(Date.now() / (windowSeconds * 1000))}`;
    const count = await connection.incr(windowKey);
    if (count === 1) await connection.expire(windowKey, windowSeconds);
    const ttl = await connection.ttl(windowKey);
    return {
      ok: count <= limit,
      remaining: Math.max(0, limit - count),
      resetAfterMs: Math.max(0, ttl) * 1000,
    };
  } catch (error) {
    console.error("[ratelimit] Redis unavailable, failing open", error);
    return { ok: true, remaining: limit, resetAfterMs: 0 };
  }
}

/** Best-effort client IP for throttling (proxy-aware). */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || "unknown";
}
