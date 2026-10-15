import { zipfSampler } from '../../core/distributions';
import { mulberry32, shuffle } from '../../core/random';

/**
 * A teaching buffer pool: a few frames over a small disk, three eviction policies, pins and dirty pages. Pure and
 * immutable. Real pools hash pages to buffers, use latches and run a background writer; none of that is here.
 */

export const DISK_PAGES = 24;
export const DEFAULT_FRAMES = 8;
export const SIZE_RANGE = { min: 4, max: 16 } as const;
/** Usage counts stop here (a clock sweep's cap, as the author remembers PostgreSQL's: check the source). */
export const USAGE_CAP = 5;
/** Frames a scan may use under the ring policy (size from memory: check the source). */
export const RING_SIZE = 4;
export const SKEW = { min: 0, max: 2, initial: 1.1 } as const;
export const DEFAULT_SEED = 7;

export type Policy = 'lru' | 'clock' | 'ring';
export const POLICIES: { value: Policy; label: string }[] = [
  { value: 'lru', label: 'LRU' }, { value: 'clock', label: 'Clock' }, { value: 'ring', label: 'Clock + scan ring' },
];

export interface Frame {
  page: number | null;
  pins: number;
  dirty: boolean;
  usage: number;
  /** When the page was last used (the LRU clock). */
  used: number;
}

export interface Counters {
  requests: number;
  hits: number;
  misses: number;
  /** Requests that found every frame pinned. */
  failed: number;
  diskReads: number;
  dirtyEvictions: number;
  flushes: number;
}

export interface Pool {
  policy: Policy;
  frames: readonly Frame[];
  hand: number;
  clock: number;
  /** Frames a scan has claimed (ring policy), and the next to reuse. */
  ring: readonly number[];
  ringPos: number;
  count: Counters;
  /** The frame the last request touched, and how it went. */
  last: { page: number; frame: number | null; result: 'hit' | 'miss' | 'failed'; evicted: { page: number; dirty: boolean } | null } | null;
}

export const writeBacks = (c: Counters): number => c.dirtyEvictions + c.flushes;

export function newPool(policy: Policy, size = DEFAULT_FRAMES): Pool {
  return {
    policy,
    frames: Array.from({ length: size }, () => ({ page: null, pins: 0, dirty: false, usage: 0, used: 0 })),
    hand: 0, clock: 0, ring: [], ringPos: 0,
    count: { requests: 0, hits: 0, misses: 0, failed: 0, diskReads: 0, dirtyEvictions: 0, flushes: 0 },
    last: null,
  };
}

export interface Request {
  page: number;
  write?: boolean;
  /** Part of a big sequential scan (confined to the ring under the ring policy). */
  scan?: boolean;
}

interface Pick {
  frame: number;
  hand: number;
}

/** The frame to reuse by clock sweep: skip pinned frames, decrement usage counts, take the first at zero. Null if all are pinned. */
function sweep(frames: readonly Frame[], start: number, allowed: (i: number) => boolean): { pick: Pick; frames: Frame[] } | null {
  const n = frames.length;
  const next = frames.map((f) => ({ ...f }));
  const candidates = next.filter((f, i) => allowed(i) && f.pins === 0);
  if (candidates.length === 0) return null;
  let hand = start % n;
  for (let step = 0; step < n * (USAGE_CAP + 2); step++) {
    const f = next[hand];
    if (allowed(hand) && f.pins === 0) {
      if (f.usage === 0) return { pick: { frame: hand, hand: (hand + 1) % n }, frames: next };
      f.usage--;
    }
    hand = (hand + 1) % n;
  }
  return null;
}

/** The unpinned frame used longest ago. */
function leastRecent(frames: readonly Frame[], allowed: (i: number) => boolean): number | null {
  let best: number | null = null;
  frames.forEach((f, i) => {
    if (allowed(i) && f.pins === 0 && (best === null || f.used < frames[best].used)) best = i;
  });
  return best;
}

/**
 * One page request. A hit refreshes the page; a miss takes a free frame or a victim chosen by the policy, writes the victim
 * back first if it is dirty, and reads the page. `broken` ignores pins when choosing a victim (the bug the tests plant).
 */
export function request(pool: Pool, req: Request, opts: { broken?: boolean } = {}): Pool {
  const clock = pool.clock + 1;
  const count = { ...pool.count, requests: pool.count.requests + 1 };
  const hitAt = pool.frames.findIndex((f) => f.page === req.page);
  if (hitAt >= 0) {
    const frames = pool.frames.map((f, i) => (i === hitAt ? { ...f, used: clock, usage: Math.min(USAGE_CAP, f.usage + 1), dirty: f.dirty || !!req.write } : f));
    return { ...pool, frames, clock, count: { ...count, hits: count.hits + 1 }, last: { page: req.page, frame: hitAt, result: 'hit', evicted: null } };
  }
  const free = pool.frames.findIndex((f) => f.page === null);
  const view = opts.broken ? pool.frames.map((f) => ({ ...f, pins: 0 })) : pool.frames;
  const useRing = pool.policy === 'ring' && req.scan === true;
  let victim: number | null = null;
  let hand = pool.hand;
  let frames: Frame[] = pool.frames.map((f) => ({ ...f }));
  let ring = pool.ring;
  let ringPos = pool.ringPos;
  if (free >= 0) {
    victim = free;
    if (useRing && ring.length < RING_SIZE && !ring.includes(free)) ring = [...ring, free];
  } else if (useRing && ring.length >= RING_SIZE) {
    for (let k = 0; k < ring.length && victim === null; k++) {
      const slot = ring[(ringPos + k) % ring.length];
      if (view[slot].pins === 0) {
        victim = slot;
        ringPos = (ringPos + k + 1) % ring.length;
      }
    }
  }
  if (victim === null && pool.policy === 'lru') victim = leastRecent(view, () => true);
  else if (victim === null) {
    const swept = sweep(view, pool.hand, (i) => !(useRing && ring.includes(i)));
    if (swept) {
      victim = swept.pick.frame;
      hand = swept.pick.hand;
      frames = frames.map((f, i) => ({ ...f, usage: swept.frames[i].usage }));
      if (useRing && ring.length < RING_SIZE) ring = [...ring, victim];
    }
  }
  if (victim === null) return { ...pool, clock, count: { ...count, failed: count.failed + 1 }, last: { page: req.page, frame: null, result: 'failed', evicted: null } };
  const old = frames[victim];
  const evicted = old.page === null ? null : { page: old.page, dirty: old.dirty };
  frames[victim] = { page: req.page, pins: old.pins, dirty: !!req.write, usage: useRing ? 0 : 1, used: clock };
  return {
    ...pool, frames, hand, clock, ring, ringPos,
    count: { ...count, misses: count.misses + 1, diskReads: count.diskReads + 1, dirtyEvictions: count.dirtyEvictions + (evicted?.dirty ? 1 : 0) },
    last: { page: req.page, frame: victim, result: 'miss', evicted },
  };
}

/** Pin or unpin the page in a frame: a running query is using it, so eviction skips it. */
export const togglePin = (pool: Pool, frame: number): Pool => ({
  ...pool,
  frames: pool.frames.map((f, i) => (i === frame && f.page !== null ? { ...f, pins: f.pins > 0 ? 0 : 1 } : f)),
});

/** Write every dirty page back to disk. */
export function checkpoint(pool: Pool): Pool {
  const dirty = pool.frames.filter((f) => f.dirty).length;
  return { ...pool, frames: pool.frames.map((f) => ({ ...f, dirty: false })), count: { ...pool.count, flushes: pool.count.flushes + dirty } };
}

export const hitRatio = (c: Counters): number | null => (c.requests - c.failed === 0 ? null : c.hits / (c.requests - c.failed));
export const framesInUse = (pool: Pool): number => pool.frames.filter((f) => f.page !== null).length;

// ── The seeded workload ───────────────────────────────────────────────

/** Which page is the hottest, the next hottest, and so on: a fixed shuffle of the disk, so hot pages are not simply 0, 1, 2. */
const heat = (seed: number): number[] => shuffle(Array.from({ length: DISK_PAGES }, (_, i) => i), mulberry32(seed * 31 + 5));

/** An endless Zipf-skewed stream of page requests: the same seed and skew give the same pages. */
export function workload(seed: number, skew: number): () => number {
  const order = heat(seed);
  const draw = zipfSampler(DISK_PAGES, skew);
  const rnd = mulberry32(seed);
  return () => order[draw(rnd) - 1];
}

export const SCAN: Request[] = Array.from({ length: DISK_PAGES }, (_, page) => ({ page, scan: true }));

export function run(pool: Pool, pages: Iterable<number>): Pool {
  let p = pool;
  for (const page of pages) p = request(p, { page });
  return p;
}

/** The first n pages of a stream. */
export function take(next: () => number, n: number): number[] {
  return Array.from({ length: n }, next);
}

export const WARM_UP = 300;
export const MEASURE = 20;

/** Hit ratio of the next MEASURE workload requests, before and after one full scan, for a policy. Computed by running it. */
export function scanExperiment(policy: Policy, seed: number, skew: number, size = DEFAULT_FRAMES): { before: number; after: number } {
  const next = workload(seed, skew);
  let pool = run(newPool(policy, size), take(next, WARM_UP));
  const measure = (p: Pool): { pool: Pool; ratio: number } => {
    const hits = p.count.hits;
    const done = run(p, take(next, MEASURE));
    return { pool: done, ratio: (done.count.hits - hits) / MEASURE };
  };
  const before = measure(pool);
  pool = before.pool;
  for (const r of SCAN) pool = request(pool, r);
  return { before: before.ratio, after: measure(pool).ratio };
}

/** Hit ratio over `requests` workload requests (after a warm-up) at each pool size, for a policy: the plot of scene 4. */
export function sizeCurve(policy: Policy, seed: number, skew: number, requests = 2000, warm = 200): { size: number; ratio: number }[] {
  const sizes = Array.from({ length: SIZE_RANGE.max - SIZE_RANGE.min + 1 }, (_, i) => SIZE_RANGE.min + i);
  return sizes.map((size) => {
    const next = workload(seed, skew);
    const warmed = run(newPool(policy, size), take(next, warm));
    const done = run(warmed, take(next, requests));
    return { size, ratio: (done.count.hits - warmed.count.hits) / requests };
  });
}

/** The smallest pool that reaches share of the biggest pool's hit ratio: where the curve stops paying for more frames. */
export const KNEE_SHARE = 0.95;
export function knee(curve: readonly { size: number; ratio: number }[], share = KNEE_SHARE): number {
  const top = curve[curve.length - 1].ratio;
  return curve.find((p) => p.ratio >= share * top)!.size;
}
