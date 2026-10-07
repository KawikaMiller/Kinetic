import { describe, expect, it } from 'vitest';
import { trialFactor } from '../../core/numberTheory';
import { mulberry32 } from '../../core/random';
import { baseHolds, dominoRun, DOMINOES, horseOverlap, layerOf, oddSum, stepHolds } from './dominoes';
import { factorTree, FACTOR_PRESETS, leafPrimes, proofOrder, splitOf } from './factorTree';
import { BUGS, invariantHolds, ITERATION_CAP, runSearch, sourceFor } from './search';
import { SEARCH_ARRAY } from './presets';

describe('dominoes', () => {
  it('1 + 3 + … + (2n − 1) = n² for every n up to 1000, and the step algebra holds at every k', () => {
    for (let n = 1; n <= 1000; n++) expect(oddSum(n)).toBe(n * n);
    for (let k = 1; k <= 1000; k++) expect(stepHolds('odd', k)).toBe(true);
  });

  it('an n × n square splits into L-shaped layers of 1, 3, 5 … cells', () => {
    const n = DOMINOES;
    for (let k = 1; k <= n; k++) {
      let cells = 0;
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (layerOf(r, c) === k) cells++;
      expect(cells).toBe(2 * k - 1);
    }
  });

  it('the horses step needs a shared horse, so it fails exactly at 1 → 2', () => {
    expect(baseHolds('horses')).toBe(true);
    expect(horseOverlap(1)).toBe(0);
    expect(stepHolds('horses', 1)).toBe(false);
    for (let k = 2; k < 50; k++) expect(stepHolds('horses', k)).toBe(true);
  });

  it('falls as far as what is proven allows, for every claim and toggle combination', () => {
    expect(dominoRun('odd', true, true)).toEqual({ fallen: DOMINOES, stop: { kind: 'all' } });
    expect(dominoRun('odd', false, true)).toEqual({ fallen: 0, stop: { kind: 'no-base' } });
    expect(dominoRun('odd', true, false)).toEqual({ fallen: 1, stop: { kind: 'no-step' } });
    expect(dominoRun('odd', false, false)).toEqual({ fallen: 0, stop: { kind: 'no-base' } });
    expect(dominoRun('horses', true, true)).toEqual({ fallen: 1, stop: { kind: 'gap', at: 1 } });
    expect(dominoRun('horses', false, true)).toEqual({ fallen: 0, stop: { kind: 'no-base' } });
    expect(dominoRun('horses', true, false)).toEqual({ fallen: 1, stop: { kind: 'no-step' } });
  });
});

/** A seeded sorted array of distinct integers. */
function sortedArray(rnd: () => number): number[] {
  const n = Math.floor(rnd() * 20);
  const set = new Set<number>();
  while (set.size < n) set.add(Math.floor(rnd() * 200) - 50);
  return [...set].sort((a, b) => a - b);
}

describe('binary search with its invariant', () => {
  it('the correct search keeps the invariant every iteration and terminates for every target, present or absent, in 300 seeded arrays', () => {
    const rnd = mulberry32(15);
    for (let t = 0; t < 300; t++) {
      const a = sortedArray(rnd);
      const targets = [...a, ...a.map((x) => x + 0.5), -1000, 1000];
      for (const target of targets) {
        const run = runSearch(a, target);
        expect(run.verdict).toEqual({ kind: 'ok' });
        expect(run.iterations.every((i) => invariantHolds(i.check))).toBe(true);
        expect(run.iterations.every((i) => i.sizeAfter === null || i.sizeAfter < i.size)).toBe(true);
        expect(run.result).toBe(a.indexOf(target));
        expect(run.outOfBounds).toBe(false);
        expect(run.iterations.length).toBeLessThanOrEqual(Math.ceil(Math.log2(a.length + 1)) + 1);
      }
    }
  });

  it('lo = mid keeps the invariant but stops shrinking: caught at the cap', () => {
    const run = runSearch(SEARCH_ARRAY, 91, 'lo-mid');
    expect(run.verdict.kind).toBe('non-termination');
    expect(run.iterations).toHaveLength(ITERATION_CAP);
    expect(run.iterations.every((i) => invariantHolds(i.check))).toBe(true);
    expect(run.result).toBeNull();
  });

  it('while (lo < hi) stops with one cell unchecked: a wrong "not found"', () => {
    const run = runSearch(SEARCH_ARRAY, 91, 'lt');
    expect(run.verdict).toEqual({ kind: 'exit', wrongAnswer: true });
    expect(run.result).toBe(-1);
    expect(SEARCH_ARRAY.indexOf(91)).toBeGreaterThanOrEqual(0);
  });

  it('hi = a.length breaks the invariant before the first iteration and reads past the end', () => {
    const run = runSearch(SEARCH_ARRAY, 99, 'hi-n');
    expect(run.verdict).toEqual({ kind: 'invariant', at: 0, part: 'bounds' });
    expect(run.outOfBounds).toBe(true);
    expect(run.iterations.some((i) => i.mid === SEARCH_ARRAY.length && i.value === undefined)).toBe(true);
  });

  it('every bug fails on some target of the preset array, and never as "ok" when it misbehaves', () => {
    const expected = { 'lo-mid': 'non-termination', lt: 'exit', 'hi-n': 'invariant' } as const;
    for (const bug of BUGS) {
      if (bug === 'none') continue;
      const kinds = new Set([...SEARCH_ARRAY, 1, 40, 99].map((t) => runSearch(SEARCH_ARRAY, t, bug).verdict.kind));
      expect(kinds.has(expected[bug])).toBe(true);
    }
  });

  it('each bug changes exactly one source line', () => {
    const base = sourceFor('none');
    for (const bug of BUGS) {
      if (bug === 'none') continue;
      expect(sourceFor(bug).filter((l, i) => l !== base[i])).toHaveLength(1);
    }
  });
});

describe('factor tree', () => {
  it('leaves are the prime factorisation, every child is smaller than its parent, for 2..3000 and the presets', () => {
    for (const n of [...Array.from({ length: 2999 }, (_, i) => i + 2), ...FACTOR_PRESETS, 99_991, 65_536, 100_000]) {
      const t = factorTree(n);
      expect(leafPrimes(t)).toEqual(trialFactor(BigInt(n)).factors.map(Number));
      for (const node of t.values()) {
        const kids = node.children.map((c) => t.get(c)!.value);
        if (kids.length) {
          expect(kids[0] * kids[1]).toBe(node.value);
          expect(kids.every((k) => k >= 2 && k < node.value)).toBe(true);
        }
      }
    }
  });

  it('proves children before parents, ending at the root', () => {
    const t = factorTree(360);
    const order = proofOrder(t);
    expect(order).toHaveLength(t.size);
    expect(order.at(-1)).toBe('r');
    for (const node of t.values()) for (const c of node.children) expect(order.indexOf(c)).toBeLessThan(order.indexOf(node.id));
    expect(splitOf(360)).toEqual([18, 20]);
    expect(splitOf(97)).toBeNull();
    expect(splitOf(1001)).toEqual([13, 77]); // the try-this tip
  });
});
