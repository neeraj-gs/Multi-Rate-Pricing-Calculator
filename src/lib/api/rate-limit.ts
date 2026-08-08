/**
 * A fixed-window rate limiter held in process memory.
 *
 * ## The honest limitation
 *
 * On Vercel this counts per warm container, not per deployment. An attacker who
 * can spread requests across enough concurrent containers gets a proportionally
 * higher effective limit. That is a real gap, and pretending otherwise would be
 * worse than naming it.
 *
 * It is still worth having: it costs nothing, it absorbs the accidental
 * traffic that causes most incidents (a runaway retry loop, a mis-configured
 * client, a script hammering an endpoint), and it does so without adding a
 * network round trip to every request.
 *
 * The attack that actually matters here — credential stuffing — is defended
 * durably instead: `src/lib/auth` locks an *account* after repeated failures,
 * and that counter lives in MongoDB, so it holds across every container.
 *
 * For production, this module is the seam: swap the `RateLimiter` interface for
 * an Upstash Redis or Vercel KV implementation and nothing else changes.
 */

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Unix seconds when the current window resets. */
  resetAt: number;
  retryAfterSeconds: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/** Bounded so a flood of unique keys cannot grow the map without limit. */
const MAX_TRACKED_KEYS = 10_000;

function sweep(now: number): void {
  if (buckets.size < MAX_TRACKED_KEYS) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
  // Still full of live buckets: drop the oldest half rather than grow forever.
  if (buckets.size >= MAX_TRACKED_KEYS) {
    const keys = [...buckets.keys()].slice(0, Math.floor(MAX_TRACKED_KEYS / 2));
    for (const key of keys) buckets.delete(key);
  }
}

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    return {
      allowed: true,
      limit,
      remaining: limit - 1,
      resetAt: Math.ceil(resetAt / 1000),
      retryAfterSeconds: 0,
    };
  }

  existing.count += 1;
  const allowed = existing.count <= limit;
  return {
    allowed,
    limit,
    remaining: Math.max(0, limit - existing.count),
    resetAt: Math.ceil(existing.resetAt / 1000),
    retryAfterSeconds: allowed ? 0 : Math.ceil((existing.resetAt - now) / 1000),
  };
}

/** Test seam — clears all windows. */
export function resetRateLimits(): void {
  buckets.clear();
}

export const RATE_LIMITS = {
  /** Sign-in and sign-up: tight, because these are the guessing endpoints. */
  auth: { limit: 10, windowMs: 15 * 60 * 1000 },
  /** Writes: generous enough for an autosaving editor, low enough to notice a loop. */
  write: { limit: 120, windowMs: 60 * 1000 },
  /** Reads. */
  read: { limit: 300, windowMs: 60 * 1000 },
} as const;
