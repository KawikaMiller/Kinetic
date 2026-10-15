import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import {
  DEFAULT_SEED, DISK_PAGES, MEASURE, RING_SIZE, SCAN, SCAN_SEEDS, SIZE_RANGE, WARM_UP, checkpoint, framesInUse, hitRatio, newPool, request, run, scanAverage, scanExperiment, sizeCurve, take, togglePin, workload, writeBacks,
  type Policy, type Pool,
} from './pool';

/** A plain array-based LRU: the independent reference. Returns hit or miss for each request. */
function referenceLru(trace: readonly number[], capacity: number): boolean[] {
  const order: number[] = [];
  return trace.map((page) => {
    const at = order.indexOf(page);
    if (at >= 0) {
      order.splice(at, 1);
      order.push(page);
      return true;
    }
    if (order.length === capacity) order.shift();
    order.push(page);
    return false;
  });
}

const POLICIES: Policy[] = ['lru', 'clock', 'ring'];

describe('LRU equals a plain array LRU, hit for hit, on seeded Zipf traces', () => {
  it('for 40 seeds, several skews and every pool size', () => {
    for (let seed = 1; seed <= 40; seed++) {
      for (const skew of [0, 0.8, 1.1, 1.8]) {
        const trace = take(workload(seed, skew), 400);
        for (const size of [SIZE_RANGE.min, 6, 8, 11, SIZE_RANGE.max]) {
          const want = referenceLru(trace, size);
          let pool = newPool('lru', size);
          const got = trace.map((page) => {
            pool = request(pool, { page });
            return pool.last!.result === 'hit';
          });
          expect(got, `seed ${seed} skew ${skew} size ${size}`).toEqual(want);
        }
      }
    }
  });
});

describe('Clock', () => {
  it('a hand-worked sequence: pages 1, 2, 3, then 1 again, then 4 evicts page 2 and leaves the hand on frame 2', () => {
    let pool = newPool('clock', 3);
    for (const page of [1, 2, 3, 1]) pool = request(pool, { page });
    expect(pool.frames.map((f) => [f.page, f.usage])).toEqual([[1, 2], [2, 1], [3, 1]]);
    pool = request(pool, { page: 4 });
    expect(pool.last).toMatchObject({ result: 'miss', frame: 1, evicted: { page: 2, dirty: false } });
    expect(pool.frames.map((f) => f.page)).toEqual([1, 4, 3]);
    expect(pool.frames.map((f) => f.usage)).toEqual([0, 1, 0]);
    expect(pool.hand).toBe(2);
  });

  it('usage counts stop at the cap', () => {
    let pool = request(newPool('clock', 4), { page: 1 });
    for (let i = 0; i < 20; i++) pool = request(pool, { page: 1 });
    expect(pool.frames[0].usage).toBe(5);
  });
});

describe('invariants at every step, over seeded traces with pins, writes and checkpoints', () => {
  function drive(policy: Policy, seed: number, broken = false): string | null {
    const rnd = mulberry32(seed);
    const size = SIZE_RANGE.min + Math.floor(rnd() * 8);
    let pool: Pool = newPool(policy, size);
    const next = workload(seed, 1.1);
    let reads = 0;
    let dirtyOut = 0;
    let flushed = 0;
    for (let i = 0; i < 300; i++) {
      const roll = rnd();
      const pinnedBefore = pool.frames.filter((f) => f.pins > 0).map((f) => f.page);
      if (roll < 0.06) pool = togglePin(pool, Math.floor(rnd() * size));
      else if (roll < 0.09) {
        const dirty = pool.frames.filter((f) => f.dirty).length;
        pool = checkpoint(pool);
        flushed += dirty;
      } else {
        const page = roll < 0.2 ? Math.floor(rnd() * DISK_PAGES) : next();
        const after = request(pool, { page, write: rnd() < 0.3, scan: policy === 'ring' && rnd() < 0.2 }, { broken });
        if (after.last!.result === 'miss') reads++;
        if (after.last!.evicted?.dirty) dirtyOut++;
        pool = after;
      }
      for (const page of pinnedBefore) if (!pool.frames.some((f) => f.page === page)) return `a pinned page (${page}) was evicted at step ${i}`;
      if (framesInUse(pool) > size) return 'more frames in use than the pool has';
      const c = pool.count;
      if (c.hits + c.misses + c.failed !== c.requests) return 'hits + misses + failed is not the number of requests';
      if (c.diskReads !== reads || c.diskReads !== c.misses) return 'disk reads are not the misses';
      if (writeBacks(c) !== dirtyOut + flushed) return 'write-backs are not dirty evictions plus checkpoint flushes';
      if (new Set(pool.frames.flatMap((f) => (f.page === null ? [] : [f.page]))).size !== framesInUse(pool)) return 'a page is in two frames';
    }
    return null;
  }

  it('holds for every policy over 300 seeds', () => {
    for (const policy of POLICIES) for (let seed = 1; seed <= 300; seed++) expect(drive(policy, seed), `${policy} ${seed}`).toBeNull();
  });

  it('a broken policy that evicts pinned frames fails the first invariant', () => {
    let caught = 0;
    for (const policy of POLICIES) for (let seed = 1; seed <= 100; seed++) if (drive(policy, seed, true)?.startsWith('a pinned page')) caught++;
    expect(caught).toBeGreaterThan(30);
  });

  it('pinning every frame makes a request for a missing page fail, and a hit still works', () => {
    for (const policy of POLICIES) {
      let pool = run(newPool(policy, 8), [0, 1, 2, 3, 4, 5, 6, 7]);
      for (let i = 0; i < 8; i++) pool = togglePin(pool, i);
      const failed = request(pool, { page: 20 });
      expect(failed.last!.result).toBe('failed');
      expect(failed.count.failed).toBe(1);
      expect(failed.frames).toEqual(pool.frames);
      expect(request(pool, { page: 3 }).last!.result).toBe('hit');
    }
  });
});

describe('dirty pages', () => {
  it('evicting a dirty page costs a write-back; a clean one does not; a checkpoint flushes each dirty page once', () => {
    let pool = newPool('lru', 2);
    pool = request(pool, { page: 1, write: true });
    pool = request(pool, { page: 2 });
    pool = request(pool, { page: 3 });
    expect(pool.last!.evicted).toEqual({ page: 1, dirty: true });
    expect(pool.count.dirtyEvictions).toBe(1);
    pool = request(pool, { page: 3, write: true });
    pool = checkpoint(pool);
    expect(pool.count.flushes).toBe(1);
    expect(checkpoint(pool).count.flushes).toBe(1);
    expect(pool.frames.some((f) => f.dirty)).toBe(false);
    pool = request(request(pool, { page: 4 }), { page: 5 });
    expect(pool.count.dirtyEvictions).toBe(1);
  });
});

describe('a full scan costs hits on average, and the scan ring contains it (paired control: the same requests with and without the scan)', () => {
  const mean = (policy: Policy, skew: number) => scanAverage(policy, skew);

  it('the paired LRU numbers equal an independent array-LRU replay of warm-up + scan + window, on 30 seeds', () => {
    for (let seed = 1; seed <= SCAN_SEEDS; seed++) {
      const next = workload(seed, 1.1);
      const warm = take(next, WARM_UP);
      const window = take(next, MEASURE);
      const scan = SCAN.map((r) => r.page);
      const windowHits = (trace: number[]) => referenceLru(trace, 8).slice(-MEASURE).filter(Boolean).length / MEASURE;
      const got = scanExperiment('lru', seed, 1.1);
      expect(got.without, `seed ${seed}`).toBeCloseTo(windowHits([...warm, ...window]), 10);
      expect(got.withScan, `seed ${seed}`).toBeCloseTo(windowHits([...warm, ...scan, ...window]), 10);
      expect(got.change).toBeCloseTo(got.withScan - got.without, 10);
    }
  });

  it('on average over 30 seeds the scan lowers LRU and Clock hit ratios by 7 to 10 points and the ring by under 2; the means and the seeds hurt are pinned', () => {
    const lru = mean('lru', 1.1);
    const clock = mean('clock', 1.1);
    const ring = mean('ring', 1.1);
    expect(lru.change).toBeCloseTo(-0.077, 3);
    expect(clock.change).toBeCloseTo(-0.097, 3);
    expect(ring.change).toBeCloseTo(-0.013, 3);
    expect([lru.hurt, clock.hurt, ring.hurt]).toEqual([24, 24, 11]);
    expect(ring.change - lru.change).toBeGreaterThan(0.05);
  });

  it('single seeds scatter: the scan raises LRU on some seeds (the lesson says the effect is on average), including the default seed', () => {
    const changes = Array.from({ length: SCAN_SEEDS }, (_, i) => scanExperiment('lru', i + 1, 1.1).change);
    expect(changes.filter((c) => c > 0).length).toBeGreaterThan(0);
    expect(scanExperiment('lru', DEFAULT_SEED, 1.1).change).toBeGreaterThan(0);
  });

  it('the effect is larger at a stronger skew too, and shrinks when requests are spread evenly', () => {
    expect(mean('ring', 1.5).change - mean('lru', 1.5).change).toBeGreaterThan(0.05);
    expect(Math.abs(mean('lru', 0).change)).toBeLessThan(Math.abs(mean('lru', 1.1).change));
  });

  it('the ring claims at most its size in frames during a scan of a warm pool, and the other frames keep their pages', () => {
    const warm = run(newPool('ring', 8), take(workload(7, 1.1), 300));
    let pool = warm;
    for (const r of SCAN) pool = request(pool, r);
    expect(pool.ring.length).toBeLessThanOrEqual(RING_SIZE);
    const untouched = warm.frames.filter((f, i) => !pool.ring.includes(i) && pool.frames[i].page === f.page).length;
    expect(untouched).toBe(8 - pool.ring.length);
  });
});
describe('the size curve and the workload', () => {
  it('hit ratio never falls as the pool grows for LRU (a stack algorithm), and reaches 1 at the whole disk', () => {
    for (const seed of [3, 7, 12]) {
      const curve = sizeCurve('lru', seed, 1.1);
      curve.slice(1).forEach((p, i) => expect(p.ratio).toBeGreaterThanOrEqual(curve[i].ratio));
    }
    const whole = run(newPool('lru', DISK_PAGES), take(workload(1, 1.1), 400));
    expect(whole.count.misses).toBe(new Set(take(workload(1, 1.1), 400)).size);
  });

  it('the same seed and skew give the same stream, and skew 0 is close to uniform while skew 2 is concentrated', () => {
    expect(take(workload(5, 1.1), 50)).toEqual(take(workload(5, 1.1), 50));
    const share = (skew: number) => {
      const counts = new Map<number, number>();
      for (const p of take(workload(5, skew), 4000)) counts.set(p, (counts.get(p) ?? 0) + 1);
      return Math.max(...counts.values()) / 4000;
    };
    expect(share(0)).toBeLessThan(0.08);
    expect(share(2)).toBeGreaterThan(0.5);
  });

  it('hit ratio of a fresh pool is unknown, not zero', () => {
    expect(hitRatio(newPool('lru').count)).toBeNull();
    expect(hitRatio(request(newPool('lru'), { page: 1 }).count)).toBe(0);
  });
});
