/** The lock queue and the backfill batch trade-off. PostgreSQL-flavoured and illustrative: every constant is made up, not measured. */

export const QUERY_BIG_S = 9;
export const QUERY_SMALL_S = 0.2;
export const DDL_AT_S = 2;
export const DDL_HOLD_S = 0.2;
export const REQUESTS_PER_S = 40;
export const CLIENT_TIMEOUT_S = 5;
export const RETRY_BACKOFF_S = 1;
export const DEFAULT_LOCK_TIMEOUT_S = 1;
export const MIN_LOCK_TIMEOUT_S = 0.5;
export const MAX_LOCK_TIMEOUT_S = 3;

/** Guards Math.floor against a product like 40 x 2.2 landing a hair under its exact value. */
const FLOOR_EPSILON = 1e-9;

export interface LockConfig {
  /** A big table: a long-running query holds a lock on it. */
  big: boolean;
  /** The DDL gives up after this long and retries; null waits as long as it takes. */
  lockTimeoutS: number | null;
}

export interface Attempt {
  start: number;
  end: number;
  outcome: 'acquired' | 'gave-up';
}

export interface LockRun {
  queryEnd: number;
  attempts: Attempt[];
  /** Windows during which new requests cannot start: each waiting attempt and the time the DDL holds its lock. */
  blocked: { start: number; end: number }[];
  longestBlockS: number;
  peakQueue: number;
  /** Requests that waited longer than the client timeout. */
  timedOut: number;
  done: number;
}

export function lockRun(c: LockConfig): LockRun {
  const queryEnd = c.big ? QUERY_BIG_S : QUERY_SMALL_S;
  const attempts: Attempt[] = [];
  const blocked: LockRun['blocked'] = [];
  let t = DDL_AT_S;
  let done = t;
  for (;;) {
    if (t >= queryEnd) {
      attempts.push({ start: t, end: t, outcome: 'acquired' });
      blocked.push({ start: t, end: t + DDL_HOLD_S });
      done = t + DDL_HOLD_S;
      break;
    }
    if (c.lockTimeoutS === null || t + c.lockTimeoutS >= queryEnd) {
      attempts.push({ start: t, end: queryEnd, outcome: 'acquired' });
      blocked.push({ start: t, end: queryEnd + DDL_HOLD_S });
      done = queryEnd + DDL_HOLD_S;
      break;
    }
    attempts.push({ start: t, end: t + c.lockTimeoutS, outcome: 'gave-up' });
    blocked.push({ start: t, end: t + c.lockTimeoutS });
    t += c.lockTimeoutS + RETRY_BACKOFF_S;
  }
  const longestBlockS = Math.max(...blocked.map((b) => b.end - b.start));
  const timedOut = blocked.reduce((n, b) => n + Math.max(0, Math.floor(REQUESTS_PER_S * (b.end - b.start - CLIENT_TIMEOUT_S) + FLOOR_EPSILON)), 0);
  return { queryEnd, attempts, blocked, longestBlockS, peakQueue: Math.floor(REQUESTS_PER_S * longestBlockS + FLOOR_EPSILON), timedOut, done };
}

// ── backfill batches ──────────────────────────────────────────────────

export const TABLE_ROWS = 2_000_000;
export const ROW_MS = 0.004;
export const BATCH_OVERHEAD_MS = 3;
export const BATCH_PAUSE_MS = 10;
export const MIN_BATCH = 1;
export const MAX_BATCH = 1000;
export const DEFAULT_BATCH = 100;

export interface BatchRun {
  batches: number;
  batchMs: number;
  totalS: number;
  /** The longest a single batch holds its row locks, and so about the replication lag one batch adds. */
  peakLockMs: number;
}

export function batchRun(batchRows: number): BatchRun {
  const batches = Math.ceil(TABLE_ROWS / batchRows);
  const batchMs = BATCH_OVERHEAD_MS + batchRows * ROW_MS;
  const totalMs = batches * batchMs + (batches - 1) * BATCH_PAUSE_MS;
  return { batches, batchMs, totalS: totalMs / 1000, peakLockMs: batchMs };
}
