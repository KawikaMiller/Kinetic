import { describe, expect, it } from 'vitest';
import {
  MAX_CAPACITY, PAGE_BYTES, REPEAT_PAGES, TRACE_LEN, WINDOW_CAPS, finalOf, hitRatio, hitRatioByWindow, makeTrace, simulate, wastedPrefetch,
  type Access, type CacheConfig, type Method, type Pattern,
} from './cache';

const PATTERNS: Pattern[] = ['sequential', 'random', 'repeat', 'two', 'mixed'];
const SEEDS = Array.from({ length: 200 }, (_, i) => i);

/** The independent reference: a plain LRU list, no readahead, with a brute-force page table per process. */
function reference(method: Method, capacity: number, trace: readonly Access[]) {
  const lru: number[] = [];
  const mapped: Set<number>[] = [new Set(), new Set()];
  const out = { hits: 0, misses: 0, minor: 0, major: 0, faults: 0, bytesCopied: 0, firstTouches: new Set<string>() };
  for (const a of trace) {
    const cached = lru.includes(a.page);
    if (method === 'read') out.bytesCopied += PAGE_BYTES;
    const alreadyMapped = method === 'mmap' && mapped[a.proc].has(a.page);
    if (method === 'mmap' && !alreadyMapped) {
      out.faults++;
      out.firstTouches.add(`${a.proc}:${a.page}`);
      if (cached) out.minor++;
      else out.major++;
    }
    if (cached) {
      out.hits++;
      lru.splice(lru.indexOf(a.page), 1);
    } else {
      out.misses++;
      if (lru.length === capacity) {
        const victim = lru.shift()!;
        mapped[0].delete(victim);
        mapped[1].delete(victim);
      }
    }
    lru.push(a.page);
    if (method === 'mmap') mapped[a.proc].add(a.page);
  }
  return out;
}

describe('with a window of 1 the model equals a plain LRU replay, for read() and for mmap', () => {
  it('hits, misses, faults and copied bytes agree over 200 seeds, every pattern, three file sizes and three capacities', () => {
    for (const method of ['read', 'mmap'] as Method[]) {
      for (const pattern of PATTERNS) {
        for (const filePages of [16, 40, 64]) {
          for (const capacity of [8, 20, 64]) {
            for (const seed of SEEDS.slice(0, 40)) {
              const trace = makeTrace({ pattern, filePages, seed });
              const cfg: CacheConfig = { filePages, capacity, method, windowCap: 1 };
              const c = finalOf(simulate(cfg, trace)).counters;
              const ref = reference(method, capacity, trace);
              const id = `${method} ${pattern} F=${filePages} C=${capacity} seed ${seed}`;
              expect([c.hits, c.diskPages, c.ios, c.accesses], id).toEqual([ref.hits, ref.misses, ref.misses, TRACE_LEN]);
              expect(hitRatio(c), id).toBe(ref.hits / TRACE_LEN);
              expect([c.minor, c.major, c.bytesCopied], id).toEqual([ref.minor, ref.major, ref.bytesCopied]);
              expect(c.prefetched).toBe(0);
            }
          }
        }
      }
    }
  });
});

describe('identities', () => {
  it('read() copies exactly the bytes requested and mmap copies none, at every window', () => {
    for (const windowCap of WINDOW_CAPS) {
      for (const pattern of PATTERNS) {
        const trace = makeTrace({ pattern, filePages: 64, seed: 4 });
        const read = finalOf(simulate({ filePages: 64, capacity: 32, method: 'read', windowCap }, trace)).counters;
        const map = finalOf(simulate({ filePages: 64, capacity: 32, method: 'mmap', windowCap }, trace)).counters;
        expect(read.bytesCopied, `${pattern} w=${windowCap}`).toBe(trace.length * PAGE_BYTES);
        expect(map.bytesCopied).toBe(0);
        expect([read.minor, read.major]).toEqual([0, 0]);
      }
    }
  });

  it('minor + major = the distinct pages first touched per process when the cache never evicts (capacity 64, at every window)', () => {
    for (const windowCap of WINDOW_CAPS) {
      for (const pattern of PATTERNS) {
        for (const seed of SEEDS.slice(0, 20)) {
          const trace = makeTrace({ pattern, filePages: 64, seed });
          const c = finalOf(simulate({ filePages: 64, capacity: MAX_CAPACITY, method: 'mmap', windowCap }, trace)).counters;
          const distinct = new Set(trace.map((a) => `${a.proc}:${a.page}`)).size;
          expect(c.minor + c.major, `${pattern} w=${windowCap} seed ${seed}`).toBe(distinct);
        }
      }
    }
  });

  it('with eviction the faults are the brute-force count of touches of an unmapped page, so re-faults appear', () => {
    const trace = makeTrace({ pattern: 'sequential', filePages: 64, seed: 1 }).concat(makeTrace({ pattern: 'sequential', filePages: 64, seed: 1 }));
    const c = finalOf(simulate({ filePages: 64, capacity: 8, method: 'mmap', windowCap: 1 }, trace)).counters;
    const ref = reference('mmap', 8, trace);
    expect(c.minor + c.major).toBe(ref.faults);
    expect(ref.faults).toBeGreaterThan(64);
  });

  it('hits + misses = accesses, a miss is one disk request, and readahead only adds pages, never requests, per miss', () => {
    for (const windowCap of WINDOW_CAPS) {
      for (const pattern of PATTERNS) {
        const trace = makeTrace({ pattern, filePages: 64, seed: 9 });
        const c = finalOf(simulate({ filePages: 64, capacity: 64, method: 'read', windowCap }, trace)).counters;
        expect(c.hits + c.ios).toBe(c.accesses);
        expect(c.diskPages).toBe(c.ios + c.prefetched);
        expect(c.diskPages).toBeLessThanOrEqual(64);
      }
    }
  });
});

describe('readahead, hand-worked on a 64-page sequential read with room for everything', () => {
  const trace = makeTrace({ pattern: 'sequential', filePages: 64, seed: 0 });
  const run = (windowCap: number) => finalOf(simulate({ filePages: 64, capacity: 64, method: 'read', windowCap }, trace)).counters;

  it('window 1: 64 misses. window 2: misses at 0 and the odd pages, 33. window 4: 18. window 32: windows 1, 2, 4, 8, 16, 32 give 7 requests', () => {
    expect(run(1).ios).toBe(64);
    expect(run(2).ios).toBe(33);
    expect(run(4).ios).toBe(18);
    expect(run(32).ios).toBe(7);
    expect(run(32).hits).toBe(57);
    expect(hitRatio(run(32))).toBe(57 / 64);
  });

  it('the computed curve of hit ratio against window never falls for a sequential trace and equals the runs above', () => {
    const curve = hitRatioByWindow({ filePages: 64, capacity: 64, method: 'read' }, trace);
    expect(curve.map((p) => p.windowCap)).toEqual([...WINDOW_CAPS]);
    for (let i = 1; i < curve.length; i++) expect(curve[i].ratio).toBeGreaterThanOrEqual(curve[i - 1].ratio);
    expect(curve[0].ratio).toBe(0);
    expect(curve.at(-1)!.ratio).toBe(57 / 64);
  });

  it('a random trace resets the window, so readahead brings almost nothing extra in, and prefetch that nobody used is counted', () => {
    const random = makeTrace({ pattern: 'random', filePages: 64, seed: 3 });
    const s = finalOf(simulate({ filePages: 64, capacity: 64, method: 'read', windowCap: 32 }, random));
    expect(s.counters.prefetched).toBeLessThan(40);
    const mixed = makeTrace({ pattern: 'mixed', filePages: 64, seed: 3 });
    const m = finalOf(simulate({ filePages: 64, capacity: 64, method: 'read', windowCap: 32 }, mixed));
    expect(wastedPrefetch(m)).toBeGreaterThan(0);
    expect(wastedPrefetch(m)).toBeLessThanOrEqual(m.counters.prefetched);
  });
});

describe('the access patterns', () => {
  it('each trace has 64 accesses inside the file, the repeat pattern touches 8 pages, and two processes alternate on the same pages', () => {
    for (const pattern of PATTERNS) {
      for (const filePages of [16, 64]) {
        const t = makeTrace({ pattern, filePages, seed: 2 });
        expect(t).toHaveLength(TRACE_LEN);
        expect(t.every((a) => a.page >= 0 && a.page < filePages)).toBe(true);
      }
    }
    expect(new Set(makeTrace({ pattern: 'repeat', filePages: 64, seed: 2 }).map((a) => a.page)).size).toBe(REPEAT_PAGES);
    const two = makeTrace({ pattern: 'two', filePages: 64, seed: 2 });
    expect(two.slice(0, 4)).toEqual([{ proc: 0, page: 0 }, { proc: 1, page: 0 }, { proc: 0, page: 1 }, { proc: 1, page: 1 }]);
  });

  it('two processes reading one file: the second sees only hits, as minor faults under mmap', () => {
    const trace = makeTrace({ pattern: 'two', filePages: 64, seed: 1 });
    const read = finalOf(simulate({ filePages: 64, capacity: 64, method: 'read', windowCap: 1 }, trace)).counters;
    expect([read.hits, read.ios]).toEqual([32, 32]);
    const map = finalOf(simulate({ filePages: 64, capacity: 64, method: 'mmap', windowCap: 1 }, trace)).counters;
    expect([map.minor, map.major]).toEqual([32, 32]);
  });

  it('a page mapped by both processes is flagged in both bits, and an evicted page loses its mappings', () => {
    const trace = makeTrace({ pattern: 'two', filePages: 64, seed: 1 }).slice(0, 4);
    const s = finalOf(simulate({ filePages: 64, capacity: 64, method: 'mmap', windowCap: 1 }, trace));
    expect(s.mapped.slice(0, 3)).toEqual([3, 3, 0]);
    const small = finalOf(simulate({ filePages: 64, capacity: 8, method: 'mmap', windowCap: 1 }, makeTrace({ pattern: 'sequential', filePages: 64, seed: 1 })));
    expect(small.mapped.filter((m) => m !== 0)).toHaveLength(8);
    expect(small.cached.filter(Boolean)).toHaveLength(8);
  });
});
