import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import { DEFAULT_RANGE, favoured, isUnbiased, moduloCounts, rejectionCounts, rejectionLimit } from './bias';
import {
  EDGE_ON_DEGREES, PRESETS, RANDU, hasFullPeriod, hyperplaneBound, lcgNext, lcgSequence, pairs, planeIndex, presetById, project, randuIdentity, randuPlaneIndices, triples,
} from './lcg';
import { MAX_OUTPUTS, NEXT_COUNT, STATES, candidateCounts, candidates, outputsFrom, predictNext, seedSpace, toyOutput, toyStep } from './recovery';
import { BINS, KEY, USES } from './sources';

/** A plain BigInt LCG, written from the textbook formula, as the reference for every preset. */
function bigSequence(a: number, c: number, m: number, seed: number, n: number): number[] {
  const out: number[] = [];
  let x = BigInt(seed) % BigInt(m);
  for (let i = 0; i < n; i++) {
    out.push(Number(x));
    x = (BigInt(a) * x + BigInt(c)) % BigInt(m);
  }
  return out;
}

describe('the linear congruential generator', () => {
  it('equals a straightforward BigInt implementation for every preset and several seeds', () => {
    for (const p of PRESETS) {
      for (const seed of [0, 1, 2, 12345, 65535]) expect(lcgSequence(p, seed, 500), `${p.id} ${seed}`).toEqual(bigSequence(p.a, p.c, p.m, seed, 500));
    }
  });

  it('the toy has full period 64: running the whole cycle visits every state once and returns to the start', () => {
    const toy = presetById('toy');
    expect(hasFullPeriod(toy)).toBe(true);
    const seen = new Set<number>();
    let x = 0;
    for (let i = 0; i < toy.m; i++) {
      seen.add(x);
      x = lcgNext(x, toy);
    }
    expect(seen.size).toBe(64);
    expect(x).toBe(0);
  });

  it('the full-period condition is checked by running the cycle for a grid of small parameters', () => {
    for (const a of [1, 2, 3, 5, 9, 13]) {
      for (const c of [0, 1, 2, 3, 5]) {
        const p = { id: 'toy' as const, label: '', text: '', a, c, m: 64 };
        let x = 0;
        let period = 0;
        do {
          x = lcgNext(x, p);
          period++;
        } while (x !== 0 && period <= 64);
        const full = (() => {
          const seen = new Set<number>();
          let y = 0;
          for (let i = 0; i < 64; i++) {
            seen.add(y);
            y = lcgNext(y, p);
          }
          return seen.size === 64 && y === 0;
        })();
        expect(hasFullPeriod(p), `a=${a} c=${c}`).toBe(full);
      }
    }
  });

  it('seed 0 stays at 0 for a generator with c = 0, which is true of RANDU and the good-looking one', () => {
    for (const id of ['randu', 'minstd'] as const) expect(new Set(lcgSequence(presetById(id), 0, 50))).toEqual(new Set([0]));
    expect(new Set(lcgSequence(presetById('toy'), 0, 50)).size).toBeGreaterThan(1);
  });

  it('pairs of the toy lie on 5 lines of slope 5, a handful against 64 points', () => {
    const toy = presetById('toy');
    const lines = new Set(pairs(toy, 0, 64).map((p) => Math.round(p.y * 64 - 5 * p.x * 64 - 1) / 64));
    expect(lines.size).toBe(5);
    expect(hyperplaneBound(2, 64)).toBe(11);
    expect(lines.size).toBeLessThanOrEqual(hyperplaneBound(2, 64));
  });

  it('Marsaglia\'s bound for triples and m = 2^31 is far above the 15 planes RANDU actually uses', () => {
    expect(hyperplaneBound(3, 2 ** 31)).toBe(2344);
    expect(hyperplaneBound(3, 2 ** 31)).toBeGreaterThan(15);
  });
});

describe('RANDU', () => {
  it('satisfies x(n+2) = 6 x(n+1) - 9 x(n) mod 2^31 exactly, for 100,000 seeded states', () => {
    const rnd = mulberry32(99);
    for (let i = 0; i < 100_000; i++) {
      const x0 = Math.floor(rnd() * 2 ** 31);
      const x1 = lcgNext(x0, RANDU);
      const x2 = lcgNext(x1, RANDU);
      expect(x2, `state ${x0}`).toBe(randuIdentity(x0, x1));
    }
  });

  it('(9 x - 6 y + z) / 2^31 takes only integer values from -5 to 9, and all 15 occur in the sample', () => {
    const planes = randuPlaneIndices();
    expect(planes).toEqual(Array.from({ length: 15 }, (_, i) => i - 5));
    for (const k of planes) expect(Number.isInteger(k)).toBe(true);
  });

  it('planeIndex refuses a triple that is not from RANDU', () => {
    expect(() => planeIndex(1, 2, 4)).toThrow(RangeError);
  });

  it('viewed edge-on at the angle computed from the normal, all 100,000 points sit on integer-valued lines; at 30 degrees they do not', () => {
    expect(EDGE_ON_DEGREES).toBeCloseTo(146.31, 2);
    const ts = triples(RANDU, 1, 100_000);
    const s = Math.sqrt(9 * 9 + 6 * 6);
    let worstEdge = 0;
    let worstOther = 0;
    for (const t of ts) {
      const e = project(t, EDGE_ON_DEGREES);
      const lineValue = s * e.x * -1 + e.y;
      worstEdge = Math.max(worstEdge, Math.abs(lineValue - Math.round(lineValue)));
      const o = project(t, 30);
      const other = s * o.x * -1 + o.y;
      worstOther = Math.max(worstOther, Math.abs(other - Math.round(other)));
    }
    expect(worstEdge).toBeLessThan(1e-6);
    expect(worstOther).toBeGreaterThan(0.2);
  });
});

describe('the 16-bit toy generator and its brute-force recovery', () => {
  /** A second implementation of "which seeds produce these outputs": index every seed by its output prefix. */
  const prefixKey = (seed: number, k: number) => outputsFrom(seed, k).join(',');

  it('the toy has full period over 65,536 states and 16 equally likely outputs', () => {
    const seen = new Set<number>();
    let s = 0;
    for (let i = 0; i < STATES; i++) {
      seen.add(s);
      s = toyStep(s);
    }
    expect([seen.size, s]).toEqual([STATES, 0]);
    const outputs = new Array<number>(16).fill(0);
    for (const x of seen) outputs[toyOutput(x)] += 1;
    expect(new Set(outputs)).toEqual(new Set([4096]));
  });

  it('after one output exactly 4,096 states remain, for every seed', () => {
    for (const seed of [0, 1, 12345, 65535]) expect(candidates(outputsFrom(seed, 1)).length).toBe(4096);
  });

  it('the prefix index partitions all 65,536 seeds at each length, and a longer prefix never has more members than a shorter one (every seed)', () => {
    let previous: number[] | null = null;
    for (let k = 1; k <= MAX_OUTPUTS; k++) {
      const groups = new Map<string, number>();
      const keys = Array.from({ length: STATES }, (_, seed) => prefixKey(seed, k));
      for (const key of keys) groups.set(key, (groups.get(key) ?? 0) + 1);
      const sizes = keys.map((key) => groups.get(key)!);
      expect(sizes.reduce((sum, n) => sum + 1 / n, 0)).toBeCloseTo(groups.size, 6);
      sizes.forEach((n, seed) => {
        expect(n).toBeGreaterThanOrEqual(1);
        if (previous) expect(n, `seed ${seed} k ${k}`).toBeLessThanOrEqual(previous[seed]);
      });
      previous = sizes;
    }
  });

  it('the solver agrees with the prefix index on 300 seeded seeds at every length, includes the true seed, and is non-increasing', () => {
    const rnd = mulberry32(8);
    const counts = new Map<number, Map<string, number>>();
    for (let k = 1; k <= MAX_OUTPUTS; k++) {
      const m = new Map<string, number>();
      for (let seed = 0; seed < STATES; seed++) m.set(prefixKey(seed, k), (m.get(prefixKey(seed, k)) ?? 0) + 1);
      counts.set(k, m);
    }
    for (let i = 0; i < 300; i++) {
      const seed = Math.floor(rnd() * STATES);
      const got = candidateCounts(seed, MAX_OUTPUTS);
      got.forEach((n, j) => expect(n, `seed ${seed} k ${j + 1}`).toBe(counts.get(j + 1)!.get(prefixKey(seed, j + 1))));
      for (let j = 1; j < got.length; j++) expect(got[j]).toBeLessThanOrEqual(got[j - 1]);
      expect(candidates(outputsFrom(seed, 3))).toContain(seed);
    }
  });

  it('whenever one state remains, the next 20 predictions equal the real next 20 outputs (all seeds that become unique within 8 outputs, by the index)', () => {
    const index = new Map<string, number[]>();
    for (let seed = 0; seed < STATES; seed++) {
      const key = prefixKey(seed, MAX_OUTPUTS);
      index.set(key, [...(index.get(key) ?? []), seed]);
    }
    let unique = 0;
    for (const [, seeds] of index) {
      if (seeds.length !== 1) continue;
      unique++;
      const real = outputsFrom(seeds[0], MAX_OUTPUTS + NEXT_COUNT);
      expect(predictNext(real.slice(0, MAX_OUTPUTS)), `seed ${seeds[0]}`).toEqual(real.slice(MAX_OUTPUTS));
      if (unique >= 300) break;
    }
    expect(unique).toBeGreaterThan(0);
  });

  it('predictNext says nothing while more than one state is left', () => {
    expect(predictNext(outputsFrom(12345, 1))).toBeNull();
  });
});

describe('seed entropy', () => {
  it('a day of whole seconds is 86,400 seeds, about 16.4 bits; milliseconds about 26.4 bits; the system value is 128 bits', () => {
    const day = seedSpace('seconds', 86_400);
    expect(day.seeds).toBe(86_400);
    expect(day.bits.toFixed(1)).toBe('16.4');
    expect(day.bits).toBeCloseTo(Math.log2(86_400), 12);
    expect(seedSpace('milliseconds', 86_400).seeds).toBe(86_400_000);
    expect(seedSpace('milliseconds', 86_400).bits.toFixed(1)).toBe('26.4');
    expect(seedSpace('system', 86_400)).toEqual({ seeds: 2 ** 128, bits: 128 });
  });

  it('the window changes the count for a clock and not for the system value', () => {
    expect(seedSpace('seconds', 3600).seeds).toBe(3600);
    expect(seedSpace('system', 3600).bits).toBe(seedSpace('system', 604_800).bits);
  });
});

describe('modulo bias', () => {
  it('byte % 6 gives 43 hits each for 0 to 3 and 42 each for 4 and 5, since 256 = 42 x 6 + 4', () => {
    expect(moduloCounts(6)).toEqual([43, 43, 43, 43, 42, 42]);
    expect(256).toBe(42 * 6 + 4);
    expect(DEFAULT_RANGE).toBe(6);
  });

  it('the counts equal an enumeration over 0-255 for every n from 2 to 20, with the closed form floor and remainder', () => {
    for (let n = 2; n <= 20; n++) {
      const brute = Array.from({ length: n }, (_, k) => Array.from({ length: 256 }, (_, b) => b).filter((b) => b % n === k).length);
      expect(moduloCounts(n), `n ${n}`).toEqual(brute);
      expect(moduloCounts(n).reduce((a, b) => a + b, 0)).toBe(256);
      moduloCounts(n).forEach((c, k) => expect(c).toBe(Math.floor(256 / n) + (k < 256 % n ? 1 : 0)));
    }
  });

  it('rejection sampling gives equal counts for every n, discarding bytes at or above 252 when n is 6', () => {
    expect(rejectionLimit(6)).toBe(252);
    expect(rejectionCounts(6)).toEqual([42, 42, 42, 42, 42, 42]);
    for (let n = 2; n <= 20; n++) expect(new Set(rejectionCounts(n)).size, `n ${n}`).toBe(1);
  });

  it('the bias is zero exactly when n divides 256', () => {
    for (let n = 2; n <= 20; n++) {
      expect(isUnbiased(n), `n ${n}`).toBe(256 % n === 0);
      expect(favoured(moduloCounts(n)).length === 0, `n ${n}`).toBe(256 % n === 0);
    }
    expect(favoured(moduloCounts(6))).toEqual([0, 1, 2, 3]);
  });
});

describe('the classification key', () => {
  /** The key typed a second time, as strings. */
  const SECOND: Record<string, string> = {
    'session-id': 'csprng', 'reset-token': 'csprng', 'cbc-iv': 'csprng', 'api-key': 'csprng', 'monte-carlo': 'seeded', level: 'seeded', jitter: 'any', shuffle: 'any',
  };

  it('equals the second table, and a flipped item would fail the comparison', () => {
    expect(USES).toHaveLength(8);
    expect(BINS).toHaveLength(3);
    for (const u of USES) expect(KEY[u.id], u.id).toBe(SECOND[u.id]);
    const flipped: Record<string, string> = { ...SECOND, jitter: 'csprng' };
    expect(USES.every((u) => KEY[u.id] === flipped[u.id])).toBe(false);
  });

  it('uses every bin, and each use has a reason', () => {
    expect(new Set(USES.map((u) => u.bin))).toEqual(new Set(BINS.map((b) => b.id)));
    for (const u of USES) expect(u.reason.length).toBeGreaterThan(30);
  });
});

describe('crypto.getRandomValues', () => {
  it('passes a chi-square sanity check on 100,000 bytes at a stated threshold', () => {
    // Statistical tests can reject a bad generator but cannot certify a good one. With 255 degrees of freedom the 99.99th
    // percentile of chi-square is about 340; the threshold 400 leaves a failure by chance well under one in a million.
    const THRESHOLD = 400;
    const data = new Uint8Array(100_000);
    for (let i = 0; i < data.length; i += 65_536) crypto.getRandomValues(data.subarray(i, Math.min(data.length, i + 65_536)));
    const counts = new Array<number>(256).fill(0);
    for (const b of data) counts[b] += 1;
    const expected = data.length / 256;
    const chi = counts.reduce((sum, c) => sum + (c - expected) ** 2 / expected, 0);
    expect(chi).toBeLessThan(THRESHOLD);
  });

  it('a seeded generator shows the same sanity check failing for a deliberately bad source', () => {
    const counts = new Array<number>(256).fill(0);
    for (let i = 0; i < 100_000; i++) counts[(i * 7) % 16] += 1;
    const expected = 100_000 / 256;
    expect(counts.reduce((sum, c) => sum + (c - expected) ** 2 / expected, 0)).toBeGreaterThan(400);
  });
});
