import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import { formatProbability } from './config';
import {
  EDGE_VALUES, MAX_LENGTH, OPENING_GENERATOR, RANGES, caseRng, distOf, distinctProbability, drawValue, generate, repeatProbability, repeatWithin,
  type ValueDist,
} from './generator';
import { forAll } from './runner';
import { bugOf } from './sorts';

/** Exact probability that `length` draws are all different, by enumerating every sequence of outcomes. */
function enumerateDistinct(dist: ValueDist, length: number): number {
  const values = Array.from({ length: dist.hi - dist.lo + 1 }, (_, i) => dist.lo + i);
  const prob = (v: number) => {
    const uniform = (1 - (dist.edge.length ? dist.share : 0)) / values.length;
    return uniform + (dist.edge.includes(v) ? dist.share / dist.edge.length : 0);
  };
  let total = 0;
  const walk = (depth: number, used: Set<number>, p: number) => {
    if (depth === length) {
      total += p;
      return;
    }
    for (const v of values) if (!used.has(v)) walk(depth + 1, new Set([...used, v]), p * prob(v));
  };
  walk(0, new Set(), 1);
  return total;
}

describe('the birthday formula', () => {
  it('gives the textbook 50.73% for a repeat among 23 draws from 365 values', () => {
    const dist: ValueDist = { lo: 1, hi: 365, edge: [], share: 0 };
    expect(1 - distinctProbability(dist, 23)).toBeCloseTo(0.507297, 5);
  });

  it('equals full enumeration for small plain and edge-biased distributions', () => {
    const dists: ValueDist[] = [
      { lo: 0, hi: 3, edge: [], share: 0 },
      { lo: -1, hi: 2, edge: [0], share: 0.5 },
      { lo: 0, hi: 4, edge: [0, 4], share: 0.7 },
      { lo: 0, hi: 5, edge: [1, 2, 3], share: 0.25 },
    ];
    for (const dist of dists) {
      for (let length = 0; length <= 5; length++) {
        expect(distinctProbability(dist, length), `${JSON.stringify(dist)} length ${length}`).toBeCloseTo(enumerateDistinct(dist, length), 12);
      }
    }
  });

  it('is 1 for fewer than two draws and 0 for more draws than values', () => {
    for (const r of RANGES) {
      expect(distinctProbability(r.dist, 0)).toBeCloseTo(1, 12);
      expect(distinctProbability(r.dist, 1)).toBeCloseTo(1, 12);
    }
    expect(distinctProbability(distOf('tiny'), 12)).toBe(0);
  });

  it('matches how often the generator really repeats, within Monte Carlo error, in every range', () => {
    for (const r of RANGES) {
      const config = { range: r.id, maxLength: 8, fixedLength: 8, seed: 5 } as const;
      const trials = 40_000;
      let repeats = 0;
      for (let k = 1; k <= trials; k++) {
        const xs = generate(config, k);
        if (new Set(xs).size < xs.length) repeats++;
      }
      const p = repeatProbability(config);
      const sd = Math.sqrt((p * (1 - p)) / trials);
      expect(Math.abs(repeats / trials - p), `${r.id} p=${p}`).toBeLessThan(Math.max(5 * sd, 1e-4));
    }
  });

  it('averages over the uniform length when the length is not fixed, against a Monte Carlo run', () => {
    const config = { range: 'tiny', maxLength: 6, seed: 2 } as const;
    const trials = 40_000;
    let repeats = 0;
    for (let k = 1; k <= trials; k++) {
      const xs = generate(config, k);
      if (new Set(xs).size < xs.length) repeats++;
    }
    const p = repeatProbability(config);
    expect(Math.abs(repeats / trials - p)).toBeLessThan(5 * Math.sqrt((p * (1 - p)) / trials));
  });

  it('try-this 4: the opening 8-value arrays from 0..1,000,000 repeat in 2.8 × 10⁻⁵ of cases, the seeded run finds nothing, and -5..5 fails at case 1', () => {
    expect(formatProbability(repeatProbability(OPENING_GENERATOR))).toBe('2.8 × 10⁻⁵');
    expect(repeatWithin(OPENING_GENERATOR, 100)).toBeCloseTo(1 - (1 - repeatProbability(OPENING_GENERATOR)) ** 100, 12);
    expect(forAll(bugOf('dedupe').fn, ['sameLength'], OPENING_GENERATOR).failure).toBeNull();
    const narrow = forAll(bugOf('dedupe').fn, ['sameLength'], { ...OPENING_GENERATOR, range: 'tiny' });
    expect(narrow.failure!.k).toBe(1);
  });
});

describe('formatProbability', () => {
  it('writes tiny chances as powers of ten, others as percentages, and never 10.0 × 10^k', () => {
    expect(formatProbability(0)).toBe('0');
    expect(formatProbability(1)).toBe('100%');
    expect(formatProbability(0.9689)).toBe('96.9%');
    expect(formatProbability(0.0028)).toBe('0.28%');
    expect(formatProbability(2.8e-5)).toBe('2.8 × 10⁻⁵');
    expect(formatProbability(9.99e-5)).toBe('1.0 × 10⁻⁴');
  });
});

describe('the generator', () => {
  it('is deterministic by seed and case, and case k does not depend on the other cases', () => {
    const config = { range: 'hundred', maxLength: 10, seed: 42 } as const;
    expect(generate(config, 5)).toEqual(generate(config, 5));
    expect(generate(config, 5)).not.toEqual(generate({ ...config, seed: 43 }, 5));
    expect(generate(config, 5)).not.toEqual(generate(config, 6));
    expect(caseRng(1, 1)()).not.toBe(caseRng(1, 2)());
  });

  it('keeps lengths and values within bounds across every range', () => {
    for (const r of RANGES) {
      for (let k = 1; k <= 400; k++) {
        const xs = generate({ range: r.id, maxLength: MAX_LENGTH, seed: 9 }, k);
        expect(xs.length).toBeLessThanOrEqual(MAX_LENGTH);
        for (const v of xs) {
          expect(v).toBeGreaterThanOrEqual(r.dist.lo);
          expect(v).toBeLessThanOrEqual(r.dist.hi);
          expect(Number.isInteger(v)).toBe(true);
        }
      }
    }
  });

  it('edge-biased draws land on the edge values about 70% of the time, plus the few uniform draws that hit them', () => {
    const rnd = mulberry32(1);
    const dist = distOf('edge');
    let onEdge = 0;
    const trials = 20_000;
    for (let i = 0; i < trials; i++) if (EDGE_VALUES.includes(drawValue(dist, rnd))) onEdge++;
    expect(onEdge / trials).toBeGreaterThan(0.68);
    expect(onEdge / trials).toBeLessThan(0.72);
  });

  it('draws lengths from 0 up to the longest array and reaches both ends', () => {
    const lengths = new Set<number>();
    for (let k = 1; k <= 2000; k++) lengths.add(generate({ range: 'tiny', maxLength: 5, seed: 3 }, k).length);
    expect([...lengths].sort()).toEqual([0, 1, 2, 3, 4, 5]);
  });
});
