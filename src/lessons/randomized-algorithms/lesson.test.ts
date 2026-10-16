import { describe, expect, it } from 'vitest';
import { sceneElements, sharedSceneComponents } from '../../core/testing/sceneKeys';
import { FACTS } from './facts';
import lesson from './index';
import { addEdge, BATCH, bruteMinCut, E_MAX, PRESETS, removeEdge, repeat, V_MAX, V_MIN } from './karger';
import { census, classify, meanWitnessTries, rounds } from './primality';
import { graphOf, inputFor, N_PRESETS, OPENING, parseArray, parseN, SIZES, type InputKind } from './presets';
import { expectedComparisons, MAX_N, quicksort, randomPivotCounts, shapeArray } from './sorting';

describe('scenes', () => {
  it('every scene component carries its own key and none is shared', () => {
    const els = sceneElements('randomized-algorithms');
    expect(els).toHaveLength(5);
    expect(els.every((e) => e.keyed)).toBe(true);
    expect(sharedSceneComponents('randomized-algorithms')).toEqual([]);
  });

  it('each scene opens on a fixed, pure state that its try-this relies on', () => {
    expect(OPENING.sort).toEqual({ kind: 'sorted', n: 100, seed: 42 });
    expect(OPENING.pi.exponent).toBe(10);
    expect(OPENING.primality).toMatchObject({ n: 561n, rounds: 3 });
    expect(OPENING.convert).toMatchObject({ n: 561n, budget: 1.5 });
    expect(OPENING.karger.preset).toBe('clusters');
    expect(graphOf(OPENING.karger.preset).n).toBe(6);
    expect(N_PRESETS.map((p) => classify(p.n))).toEqual(['odd-composite', 'prime', 'odd-composite', 'odd-composite']);
    expect(PRESETS.every((p) => p.graph.n >= V_MIN && p.graph.n <= V_MAX)).toBe(true);
  });
});

describe('try-this entries, each from the default state', () => {
  it('try-this 1: sorted n = 100 costs 4,950 with a first pivot, the random mean matches 2(n+1)H_n - 4n, and the median-of-three killer is quadratic', () => {
    const sorted = inputFor(OPENING.sort.kind, OPENING.sort.n, OPENING.sort.seed, []);
    expect(sorted).toEqual(shapeArray('sorted', 100, 0));
    expect(quicksort(sorted, 'first').comparisons).toBe(4950);
    expect(Math.round(expectedComparisons(100))).toBe(FACTS.expected);
    const mean = randomPivotCounts(sorted, 1000, 42).reduce((s, c) => s + c, 0) / 1000;
    expect(Math.abs(mean - expectedComparisons(100)) / expectedComparisons(100)).toBeLessThan(0.02);
    const killer = inputFor('vs-median3', 100, 42, []);
    expect(quicksort(killer, 'median3').comparisons).toBe(FACTS.medianOnKiller);
    expect(FACTS.medianOnKiller).toBeGreaterThan(0.2 * 100 * 100);
    expect(FACTS.medianOnSorted).toBeLessThan(FACTS.medianOnKiller / 4);
    expect(Math.abs(FACTS.randomOnKiller - FACTS.expected) / FACTS.expected).toBeLessThan(0.05);
    expect(lesson.tryThis[0]).toContain('4,950 comparisons');
  });

  it('try-this 2: the darts ratio tile compares 4,096 with 1,024 darts and reads about 0.5', () => {
    expect(FACTS.piDarts).toBe(1024);
    expect(FACTS.piMoreDarts).toBe(4096);
    expect(Math.abs(Number(FACTS.piRatio) - 0.5)).toBeLessThan(0.1);
    expect(Number(FACTS.piError)).toBeLessThan(4 * Number(FACTS.piSigma));
    expect(lesson.tryThis[1]).toContain(`reads ${FACTS.piRatio}`);
  });

  it('try-this 3: 561 has 8 liars in 558 bases, the Fermat test is fooled by 318 coprime bases, and the first round finds a witness', () => {
    const c = census(561n, OPENING.primality.seed);
    expect([c.liars, c.bases, c.fermat]).toEqual([8, 558, 318]);
    expect([FACTS.mrLiars, FACTS.mrBases, FACTS.mrFermat]).toEqual([8, 558, 318]);
    const run = rounds(561n, OPENING.primality.rounds, OPENING.primality.seed);
    expect(run).toHaveLength(FACTS.mrRounds);
    expect(run.some((r) => !r.passed)).toBe(true);
    expect(lesson.tryThis[2]).toContain('8 of 558');
  });

  it('try-this 4: a witness hunt on 561 averages about one draw, within 4/3, and a fixed pivot on sorted n = 100 overruns a 1.5x budget', () => {
    expect(Number(FACTS.huntMean)).toBeLessThan(4 / 3);
    expect(meanWitnessTries(561n, 1000, OPENING.convert.seed).toFixed(2)).toBe(FACTS.huntMean);
    expect(4950).toBeGreaterThan(OPENING.convert.budget * expectedComparisons(100));
    expect(Number(FACTS.overBudget)).toBeLessThan(40);
    expect(lesson.tryThis[3]).toContain('4,950 comparisons');
  });

  it("try-this 5: the clusters graph has minimum cut 2 with 3 minimum partitions, and 1,000 runs beat the 6.7% bound", () => {
    const g = graphOf('clusters');
    expect(bruteMinCut(g)).toEqual({ size: 2, count: 3 });
    const { hits } = repeat(g, BATCH, OPENING.karger.seed, 2);
    expect(hits).toBe(FACTS.kargerHits);
    expect(hits / BATCH).toBeGreaterThan(2 / (6 * 5));
    expect(FACTS.kargerBound).toBe('6.7');
    expect(lesson.tryThis[4]).toContain('minimum cut is 2');
  });
});

describe('every input kind and size sorts correctly with every rule', () => {
  const kinds: InputKind[] = ['sorted', 'reverse', 'organ', 'random', 'vs-first', 'vs-median3'];
  it('walks the control cross product', () => {
    for (const kind of kinds) {
      for (const n of SIZES.filter((s) => s <= 500)) {
        const values = inputFor(kind, n, 42, []);
        expect(values).toHaveLength(n);
        const expected = [...values].sort((a, b) => a - b);
        for (const rule of ['first', 'median3', 'random'] as const) expect(quicksort(values, rule).sorted, `${kind} ${n} ${rule}`).toEqual(expected);
      }
    }
  });

  it('the custom array is used as typed, ties included', () => {
    expect(inputFor('custom', 999, 1, [3, 3, 1])).toEqual([3, 3, 1]);
    expect(quicksort([3, 3, 1, 3], 'random').sorted).toEqual([1, 3, 3, 3]);
  });
});

describe('hidden controls do not reach the numbers', () => {
  it('the random-pivot histogram does not depend on the input kind, only on the seed and the size (distribution, and exact mean tolerance)', () => {
    const means = ['sorted', 'reverse', 'organ', 'random'].map((k) => {
      const c = randomPivotCounts(inputFor(k as InputKind, 100, 7, []), 1000, 42);
      return c.reduce((s, x) => s + x, 0) / c.length;
    });
    expect(Math.max(...means) - Math.min(...means)).toBeLessThan(0.04 * expectedComparisons(100));
  });
});

describe('hostile input', () => {
  it('an array of one value, a decimal, 2,001 values or a value past 9,999 is refused with a reason; 2,000 values are fine', () => {
    expect(parseArray('5')).toMatchObject({ ok: false });
    expect(parseArray('')).toMatchObject({ ok: false });
    expect(parseArray('1.5, 2')).toMatchObject({ ok: false });
    expect(parseArray('1e3, 2')).toMatchObject({ ok: false });
    expect(parseArray(Array.from({ length: MAX_N + 1 }, (_, i) => i).join(','))).toMatchObject({ ok: false, error: expect.stringContaining('formula') });
    expect(parseArray(Array.from({ length: MAX_N }, (_, i) => i).join(','))).toMatchObject({ ok: true });
    expect(parseArray('1, 10000')).toMatchObject({ ok: false });
    expect(parseArray('3 1 2')).toMatchObject({ ok: true, value: [3, 1, 2] });
  });

  it('n for primality refuses 0, 1, negatives, decimals, exponents and more than 10^9, and accepts 2 and 10^9', () => {
    for (const bad of ['0', '1', '-7', '5.5', '1e9', '', '1000000001', 'abc', '0x10']) expect(parseN(bad).ok, bad).toBe(false);
    expect(parseN('1')).toMatchObject({ ok: false, error: expect.stringContaining('neither prime nor composite') });
    expect(parseN('-7')).toMatchObject({ ok: false, error: expect.stringContaining('negative') });
    expect(parseN('2')).toEqual({ ok: true, value: 2n });
    expect(parseN('1000000000')).toEqual({ ok: true, value: 1_000_000_000n });
  });

  it('classify handles the smallest cases and a prime near the limit', () => {
    expect([2n, 3n, 4n, 5n, 9n].map(classify)).toEqual(['prime', 'prime', 'even', 'prime', 'odd-composite']);
    expect(classify(999_999_937n)).toBe('prime');
  });

  it('edge edits on the Karger graph refuse a self-loop, a duplicate and a twenty-first edge, and remove cleanly', () => {
    const g = graphOf('cycle');
    expect(addEdge(g, 2, 2)).toMatchObject({ ok: false });
    expect(addEdge(g, 0, 1)).toMatchObject({ ok: false, error: expect.stringContaining('already') });
    expect(addEdge(g, 1, 0)).toMatchObject({ ok: false });
    const added = addEdge(g, 0, 3);
    expect(added.ok && added.graph.edges).toHaveLength(8);
    const full = { n: 8, edges: Array.from({ length: E_MAX }, (_, i) => [i % 8, (i + 1 + Math.floor(i / 8)) % 8] as [number, number]) };
    expect(addEdge(full, 0, 7)).toMatchObject({ ok: false });
    expect(removeEdge(g, 0).edges).toHaveLength(6);
  });
});
