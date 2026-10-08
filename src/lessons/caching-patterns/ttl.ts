// The TTL trade-off, measured on a seeded workload rather than computed from a formula: the same
// stream of reads and writes is replayed against a cache with each TTL.
import { expSample, mulberry32, type Rnd } from '../../core/random';

export const WORKLOAD = {
  keys: 100,
  /** Reads per second across all keys. */
  readRate: 50,
  /** Zipf exponent: a few keys take most of the reads. */
  zipf: 1,
  /** Writes per key per second (one every two minutes). */
  writeRate: 1 / 120,
  reads: 40_000,
  seed: 7,
} as const;

export interface Event {
  t: number;
  key: number;
  kind: 'read' | 'write';
}

/** A key drawn by Zipf popularity: key 0 is the hottest. */
function zipfSampler(n: number, s: number, rnd: Rnd): () => number {
  const weights = Array.from({ length: n }, (_, i) => 1 / (i + 1) ** s);
  const total = weights.reduce((x, y) => x + y, 0);
  const cumulative: number[] = [];
  let running = 0;
  for (const w of weights) {
    running += w / total;
    cumulative.push(running);
  }
  return () => {
    const u = rnd();
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cumulative[mid] < u) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
}

/** The workload as one time-ordered event list. Same seed, same events. */
export function makeEvents(w: typeof WORKLOAD = WORKLOAD): Event[] {
  const rnd = mulberry32(w.seed);
  const pick = zipfSampler(w.keys, w.zipf, rnd);
  const events: Event[] = [];
  let t = 0;
  for (let i = 0; i < w.reads; i++) {
    t += expSample(1 / w.readRate, rnd);
    events.push({ t, key: pick(), kind: 'read' });
  }
  const horizon = t;
  for (let key = 0; key < w.keys; key++) {
    let tw = expSample(1 / w.writeRate, rnd);
    while (tw < horizon) {
      events.push({ t: tw, key, kind: 'write' });
      tw += expSample(1 / w.writeRate, rnd);
    }
  }
  return events.sort((a, b) => a.t - b.t);
}

export interface TtlResult {
  ttl: number;
  reads: number;
  hits: number;
  /** Reads that returned a value from before the key's latest write. */
  stale: number;
  /** The longest a stale value was served after the write it missed (seconds). */
  maxStaleness: number;
  hitRate: number;
  staleRate: number;
}

/** Replay the events against a TTL-only cache: nothing invalidates a key, entries just expire. */
export function simulateTtl(events: readonly Event[], ttl: number): TtlResult {
  const dbVersion = new Map<number, number>();
  const entry = new Map<number, { version: number; expiry: number; missedAt: number | null }>();
  let reads = 0;
  let hits = 0;
  let stale = 0;
  let maxStaleness = 0;
  for (const e of events) {
    if (e.kind === 'write') {
      dbVersion.set(e.key, (dbVersion.get(e.key) ?? 0) + 1);
      const c = entry.get(e.key);
      if (c && c.missedAt === null && e.t < c.expiry) c.missedAt = e.t;
      continue;
    }
    reads += 1;
    const c = entry.get(e.key);
    const version = dbVersion.get(e.key) ?? 0;
    if (c && e.t < c.expiry) {
      hits += 1;
      if (c.version < version) {
        stale += 1;
        maxStaleness = Math.max(maxStaleness, e.t - c.missedAt!);
      }
    } else {
      entry.set(e.key, { version, expiry: e.t + ttl, missedAt: null });
    }
  }
  return { ttl, reads, hits, stale, maxStaleness, hitRate: hits / reads, staleRate: stale / reads };
}

/** TTLs worth a point on the curve: log-spaced from 1 s to 600 s. */
export const TTL_GRID: readonly number[] = Array.from({ length: 25 }, (_, i) => Math.round(10 ** (i * (Math.log10(600) / 24)) * 10) / 10);

let cache: { events: Event[]; curve: TtlResult[] } | null = null;
/** The curve for the standard workload, computed once. */
export function ttlCurve(): { events: Event[]; curve: TtlResult[] } {
  if (!cache) {
    const events = makeEvents();
    cache = { events, curve: TTL_GRID.map((ttl) => simulateTtl(events, ttl)) };
  }
  return cache;
}
