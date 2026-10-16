import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import {
  ALLOC_RANGE, ARENA_UNITS, POLICIES, SCRIPT, SCRIPT_LENGTH, alloc, arenaFrom, chooseHole, emptyArena, free, holesOf, liveOf, makeScript, metrics, runScript,
  type Arena, type Policy,
} from './arena';
import {
  MAX_CLASS, MAX_REQUEST, MIN_REQUEST, PAGES, SPACINGS, WORST_FROM, classOf, classTable, freedObjects, internalWaste, requestSizes, summarisePages, worstCaseWaste,
  type FreePattern,
} from './classes';

/** Independent check that the segments tile the arena: contiguous from 0, no overlap, total 64. */
function tiles(a: Arena): boolean {
  let at = 0;
  for (const s of a.segs) {
    if (s.start !== at || s.size < 1) return false;
    at += s.size;
  }
  return at === ARENA_UNITS;
}

describe('invariants over seeded scripts', () => {
  it('after every operation of 500 seeded scripts, for each policy and both coalescing settings, blocks tile the arena, units add up, and with coalescing no holes are adjacent', () => {
    for (let seed = 1; seed <= 500; seed++) {
      const script = makeScript(seed, 60);
      for (const policy of POLICIES) {
        for (const coalesce of [true, false]) {
          const run = runScript(policy, coalesce, script.length, script);
          for (const a of run.history) {
            expect(tiles(a), `seed ${seed} ${policy}`).toBe(true);
            const m = metrics(a);
            expect(m.freeTotal + liveOf(a).reduce((s, b) => s + b.size, 0)).toBe(ARENA_UNITS);
            if (coalesce) {
              for (let i = 1; i < a.segs.length; i++) expect(a.segs[i].id === null && a.segs[i - 1].id === null).toBe(false);
            }
          }
        }
      }
    }
  });

  it('the shared 200-operation script frees only objects it allocated, once', () => {
    expect(SCRIPT).toHaveLength(SCRIPT_LENGTH);
    const live = new Set<number>();
    for (const op of SCRIPT) {
      if (op.kind === 'alloc') live.add(op.object);
      else {
        expect(live.has(op.object)).toBe(true);
        live.delete(op.object);
      }
    }
  });

  it('a double free is refused with a sentence, and the arena is left alone', () => {
    const r = alloc(emptyArena(), 4, 'first');
    const freed = free(r.arena, r.placed!.id!, true);
    expect(() => free(freed, r.placed!.id!, true)).toThrow(/not live/);
    expect(freed.segs).toEqual([{ start: 0, size: 64, id: null }]);
  });

  it('alloc sizes outside 1-32 are refused', () => {
    expect(() => alloc(emptyArena(), 0, 'first')).toThrow(RangeError);
    expect(() => alloc(emptyArena(), ALLOC_RANGE.max + 1, 'first')).toThrow(RangeError);
    expect(alloc(emptyArena(), 32, 'first').outcome).toBe('placed');
  });
});

describe('policy choice, against a separate scan of the holes', () => {
  const randomArena = (rnd: () => number): Arena => {
    const layout: [number, boolean][] = [];
    let left = ARENA_UNITS;
    while (left > 0) {
      const size = Math.min(left, 1 + Math.floor(rnd() * 14));
      layout.push([size, rnd() < 0.5]);
      left -= size;
    }
    return { ...arenaFrom(layout), rover: Math.floor(rnd() * ARENA_UNITS) };
  };

  it('first fit takes the lowest-address sufficient hole, best fit the smallest, worst fit the largest, next fit resumes from the rover', () => {
    const rnd = mulberry32(8);
    for (let k = 0; k < 2000; k++) {
      const a = randomArena(rnd);
      const n = 1 + Math.floor(rnd() * 20);
      const holes = a.segs.filter((s) => s.id === null);
      const fits = holes.filter((h) => h.size >= n).sort((x, y) => x.start - y.start);
      const pick = (policy: Policy) => chooseHole(a, n, policy)?.start ?? null;
      expect(pick('first')).toBe(fits[0]?.start ?? null);
      const smallest = Math.min(...fits.map((h) => h.size));
      expect(pick('best')).toBe(fits.find((h) => h.size === smallest)?.start ?? null);
      const largest = Math.max(...fits.map((h) => h.size));
      expect(pick('worst')).toBe(fits.find((h) => h.size === largest)?.start ?? null);
      const after = fits.filter((h) => h.start >= a.rover);
      expect(pick('next')).toBe((after[0] ?? fits[0])?.start ?? null);
    }
  });

  it('hand-worked: holes of 10, 4 and 6; a request of 4 goes to the 10 under first and worst fit, to the 4 under best fit', () => {
    const a = arenaFrom([[10, false], [10, true], [4, false], [10, true], [6, false], [24, true]]);
    expect(chooseHole(a, 4, 'first')?.size).toBe(10);
    expect(chooseHole(a, 4, 'worst')?.size).toBe(10);
    expect(chooseHole(a, 4, 'best')?.size).toBe(4);
    expect(chooseHole(a, 5, 'best')?.size).toBe(6);
  });

  it('next fit resumes after the last allocation instead of starting over', () => {
    let a = emptyArena();
    a = alloc(a, 8, 'next').arena;
    a = alloc(a, 8, 'next').arena;
    const b = alloc(a, 8, 'next');
    expect(b.placed?.start).toBe(16);
    const firstId = a.segs[0].id!;
    const freed = free(b.arena, firstId, true);
    // the hole at 0 is free again, but next fit keeps going from 24; first fit would reuse 0
    expect(alloc(freed, 8, 'next').placed?.start).toBe(24);
    expect(alloc(freed, 8, 'first').placed?.start).toBe(0);
  });
});

describe('fragmentation', () => {
  it('external fragmentation is 1 - largest / total free, recomputed from the hole list, and 0 when nothing is free', () => {
    const rnd = mulberry32(4);
    for (let k = 0; k < 500; k++) {
      let a = emptyArena();
      for (let i = 0; i < 25; i++) {
        const r = alloc(a, 1 + Math.floor(rnd() * 12), POLICIES[i % 4]);
        a = r.arena;
        if (rnd() < 0.4) {
          const live = liveOf(a);
          if (live.length) a = free(a, live[Math.floor(rnd() * live.length)].id!, rnd() < 0.5);
        }
      }
      const holes = holesOf(a).map((h) => h.size);
      const total = holes.reduce((s, x) => s + x, 0);
      const expected = total === 0 ? 0 : 1 - Math.max(...holes) / total;
      expect(metrics(a).fragmentation).toBeCloseTo(expected, 12);
    }
    expect(metrics(arenaFrom([[64, true]])).fragmentation).toBe(0);
  });

  it('the "fragmented" verdict fires exactly when total free >= n and the largest hole < n; "full" when total free < n', () => {
    const rnd = mulberry32(6);
    for (let k = 0; k < 400; k++) {
      const layout: [number, boolean][] = [];
      let left = ARENA_UNITS;
      while (left > 0) {
        const size = Math.min(left, 1 + Math.floor(rnd() * 12));
        layout.push([size, rnd() < 0.5]);
        left -= size;
      }
      const a = arenaFrom(layout);
      const holes = holesOf(a).map((h) => h.size);
      const total = holes.reduce((s, x) => s + x, 0);
      const largest = Math.max(0, ...holes);
      for (let n = 1; n <= 32; n++) {
        const out = alloc(a, n, 'first').outcome;
        if (largest >= n) expect(out).toBe('placed');
        else expect(out).toBe(total >= n ? 'fragmented' : 'full');
      }
    }
  });

  it('forty free units in four holes of ten cannot satisfy alloc(16): fragmented, not out of memory', () => {
    const a = arenaFrom([[10, false], [8, true], [10, false], [8, true], [10, false], [8, true], [10, false]]);
    expect(metrics(a)).toMatchObject({ freeTotal: 40, largestFree: 10, holes: 4 });
    expect(metrics(a).fragmentation).toBeCloseTo(0.75, 12);
    for (const policy of POLICIES) expect(alloc(a, 16, policy).outcome).toBe('fragmented');
    expect(alloc(a, 10, 'first').outcome).toBe('placed');
  });

  it('without coalescing a freed neighbour stays a separate hole and cannot hold a larger block', () => {
    let a = emptyArena();
    const x = alloc(a, 8, 'first');
    const y = alloc(x.arena, 8, 'first');
    a = free(free(y.arena, x.placed!.id!, false), y.placed!.id!, false);
    expect(holesOf(a).map((h) => h.size)).toEqual([8, 8, 48]);
    expect(alloc(a, 16, 'first').placed?.start).toBe(16);
    let b = free(free(y.arena, x.placed!.id!, true), y.placed!.id!, true);
    expect(holesOf(b).map((h) => h.size)).toEqual([64]);
    b = alloc(b, 16, 'first').arena;
    expect(liveOf(b)[0].start).toBe(0);
  });

  it('on the shared script, coalescing off fails more allocations as fragmented than coalescing on, under first fit', () => {
    const off = runScript('first', false);
    const on = runScript('first', true);
    expect(off.failedFragmented + off.failedFull).toBeGreaterThanOrEqual(on.failedFragmented + on.failedFull);
    expect(off.peakHoles).toBeGreaterThanOrEqual(on.peakHoles);
  });
});

describe('size classes', () => {
  it('for every request size 17-4,096 the class is the smallest class that holds it, for every spacing', () => {
    for (const spacing of SPACINGS) {
      const table = classTable(spacing);
      expect(table[table.length - 1]).toBe(MAX_CLASS);
      expect(table.every((c, i) => i === 0 || c > table[i - 1])).toBe(true);
      for (let r = 17; r <= MAX_CLASS; r++) {
        const c = classOf(table, r);
        expect(c).toBeGreaterThanOrEqual(r);
        // independent brute force: no smaller class in the table holds it
        expect(table.filter((x) => x >= r).sort((a, b) => a - b)[0]).toBe(c);
      }
    }
  });

  it('the worst-case waste over the enumerated sizes is about 33% for 50% spacing and just under 50% for powers of two, and finer spacing wastes less', () => {
    const worst = Object.fromEntries(SPACINGS.map((s) => [s, worstCaseWaste(classTable(s))]));
    expect(worst.half).toBeGreaterThan(0.3);
    expect(worst.half).toBeLessThan(0.34);
    expect(worst.pow2).toBeGreaterThan(0.49);
    expect(worst.pow2).toBeLessThan(0.5);
    expect(worst.eighth).toBeLessThan(worst.quarter);
    expect(worst.quarter).toBeLessThan(worst.half);
    expect(worst.half).toBeLessThan(worst.pow2);
    // independent enumeration for powers of two: request 2^k + 1 gets 2^(k+1)
    let enumerated = 0;
    for (let r = WORST_FROM; r <= MAX_CLASS; r++) {
      const c = 2 ** Math.ceil(Math.log2(r));
      enumerated = Math.max(enumerated, (c - r) / c);
    }
    expect(worst.pow2).toBeCloseTo(enumerated, 12);
  });

  it('internal waste equals the recomputed sum, finer classes waste less and need more classes', () => {
    const reqs = requestSizes();
    expect(reqs).toHaveLength(2000);
    expect(Math.min(...reqs)).toBeGreaterThanOrEqual(MIN_REQUEST);
    expect(Math.max(...reqs)).toBeLessThanOrEqual(MAX_REQUEST);
    const waste = SPACINGS.map((s) => internalWaste(classTable(s), reqs));
    const counts = SPACINGS.map((s) => classTable(s).length);
    for (let i = 1; i < SPACINGS.length; i++) {
      expect(waste[i]).toBeGreaterThan(waste[i - 1]);
      expect(counts[i]).toBeLessThan(counts[i - 1]);
    }
    const table = classTable('quarter');
    let given = 0;
    let asked = 0;
    for (const r of reqs) {
      given += table.find((c) => c >= r)!;
      asked += r;
    }
    expect(internalWaste(table, reqs)).toBeCloseTo((given - asked) / given, 12);
  });
});

describe('pages a heap can hand back', () => {
  const avg = (pattern: FreePattern, k: number, f: number) => {
    let sum = 0;
    for (let seed = 1; seed <= 200; seed++) sum += summarisePages({ objectsPerPage: k, freed: f, pattern }, seed).returnable / PAGES;
    return sum / 200;
  };

  it('random freeing returns f^k of the pages on average (within 0.02 over 200 seeded runs); oldest first returns about f of them', () => {
    for (const [k, f] of [[8, 0.9], [4, 0.5], [2, 0.8], [16, 0.9], [1, 0.7]] as const) {
      expect(Math.abs(avg('random', k, f) - f ** k)).toBeLessThan(0.02);
    }
    for (const [k, f] of [[8, 0.9], [4, 0.5], [16, 0.25]] as const) {
      expect(Math.abs(avg('oldest', k, f) - f)).toBeLessThan(0.02);
      expect(Math.abs(avg('end', k, f) - f)).toBeLessThan(0.02);
    }
  });

  it('90% freed at random over 8-object pages returns far fewer pages than 90%', () => {
    const s = summarisePages({ objectsPerPage: 8, freed: 0.9, pattern: 'random' });
    expect(s.returnable / PAGES).toBeLessThan(0.55);
    expect(s.returnedBytes).toBeLessThan(s.freedBytes * 0.6);
    expect(s.full + s.partial + s.returnable).toBe(PAGES);
  });

  it('a page is returnable only when every object on it is free, recomputed from the freed list', () => {
    const setup = { objectsPerPage: 5, freed: 0.7, pattern: 'random' as const };
    const freed = new Set(freedObjects(setup));
    const s = summarisePages(setup);
    s.kinds.forEach((kind, p) => {
      const allFree = [0, 1, 2, 3, 4].every((j) => freed.has(p * 5 + j));
      expect(kind === 'empty').toBe(allFree);
    });
    expect(freed.size).toBe(Math.round(0.7 * PAGES * 5));
  });

  it('freeing nothing returns nothing and freeing everything returns every page', () => {
    expect(summarisePages({ objectsPerPage: 8, freed: 0, pattern: 'random' }).returnable).toBe(0);
    expect(summarisePages({ objectsPerPage: 8, freed: 1, pattern: 'random' }).returnable).toBe(PAGES);
  });
});
