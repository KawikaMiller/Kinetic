/**
 * A token bucket, as pure functions over a plain value: it refills at `rate` tokens per second up
 * to `capacity`, and each request spends one whole token or is refused. Time is in seconds and is
 * whatever clock the caller uses (a sim's `now`, a scripted request time).
 */

export interface BucketParams {
  /** Tokens added per second. */
  rate: number;
  /** The most tokens the bucket holds: the largest burst it lets through at once. */
  capacity: number;
}

export interface Bucket {
  tokens: number;
  /** When the bucket was last refilled. */
  last: number;
}

export interface TakeResult {
  allowed: boolean;
  /** The bucket after the decision: refilled to `now`, minus the token if one was spent. */
  bucket: Bucket;
  /** Whole seconds until a refused request would find a token (0 when allowed): an HTTP Retry-After. */
  retryAfter: number;
}

/** A bucket filled to capacity at `now`. */
export const fullBucket = (p: BucketParams, now = 0): Bucket => ({ tokens: p.capacity, last: now });

/** Add the tokens earned since `last` (never past capacity) and move the clock to `now`. */
export function refill(b: Bucket, now: number, p: BucketParams): Bucket {
  return { tokens: Math.min(p.capacity, b.tokens + (now - b.last) * p.rate), last: now };
}

/** Refill to `now`, then spend one token if there is a whole one. */
export function takeToken(b: Bucket, now: number, p: BucketParams): TakeResult {
  const filled = refill(b, now, p);
  if (filled.tokens >= 1) return { allowed: true, bucket: { tokens: filled.tokens - 1, last: now }, retryAfter: 0 };
  return { allowed: false, bucket: filled, retryAfter: Math.ceil((1 - filled.tokens) / p.rate) };
}
