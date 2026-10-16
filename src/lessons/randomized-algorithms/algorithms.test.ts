import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import { bruteMinCut, kargerBound, kargerRun, PRESETS, repeat, runsNeeded, V_MAX, V_MIN, type Graph } from './karger';
import { DART_RUNS, expectedAbsError, meanAbsErrors, runCheckpoints, standardError } from './monteCarlo';
import { boundAfter, census, classify, exactErrorAfter, meanWitnessTries, passesRound, rounds, trialErrors, TRIALS } from './primality';
import { expectedByRecurrence, expectedComparisons, fixedPivotWorst, median3Killer, quicksort, randomPivotCounts, shapeArray, tailShare, type PivotRule } from './sorting';

const RULES: PivotRule[] = ['first', 'median3', 'random'];

describe('quicksort (Las Vegas: always correct, running time random)', () => {
  it('every rule sorts 500 seeded arrays, duplicates included, exactly as Array.prototype.sort does', () => {
    const rnd = mulberry32(1);
    for (let t = 0; t < 500; t++) {
      const a = Array.from({ length: Math.floor(rnd() * 40) }, () => Math.floor(rnd() * 12) - 4);
      const expected = [...a].sort((x, y) => x - y);
      for (const rule of RULES) expect(quicksort(a, rule, mulberry32(t)).sorted, `${rule} #${t}`).toEqual(expected);
    }
  });

  it('a fixed first-element pivot on sorted input makes exactly n(n-1)/2 comparisons, and reverse input too', () => {
    for (const n of [2, 3, 10, 57, 200, 1000]) {
      expect(quicksort(shapeArray('sorted', n, 0), 'first').comparisons).toBe((n * (n - 1)) / 2);
      expect(quicksort(shapeArray('reverse', n, 0), 'first').comparisons).toBe((n * (n - 1)) / 2);
      expect(fixedPivotWorst(n)).toBe((n * (n - 1)) / 2);
    }
  });

  it('the recurrence C(n) = (n-1) + (2/n) sum C(i) equals 2(n+1)H_n - 4n for n up to 200', () => {
    const c = expectedByRecurrence(200);
    for (let n = 0; n <= 200; n++) expect(Math.abs(c[n] - expectedComparisons(n)), `n=${n}`).toBeLessThan(1e-8 * Math.max(1, c[n]));
    expect(c[1]).toBe(0);
    expect(c[2]).toBe(1);
    expect(c[3]).toBeCloseTo(8 / 3, 12);
  });

  it('the closed form is the exact average over every permutation of six keys for a first-element pivot', () => {
    const permutations = <T,>(xs: readonly T[]): T[][] => (xs.length <= 1 ? [xs.slice()] : xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p])));
    const all = permutations([1, 2, 3, 4, 5, 6]);
    const mean = all.reduce((s, p) => s + quicksort(p, 'first').comparisons, 0) / all.length;
    expect(mean).toBeCloseTo(expectedComparisons(6), 10);
  });

  it('the mean of 1,000 seeded random-pivot runs is within 2% of the closed form at n = 100 and n = 500, whatever the input shape', () => {
    for (const n of [100, 500]) {
      for (const shape of ['sorted', 'reverse', 'organ', 'random'] as const) {
        const counts = randomPivotCounts(shapeArray(shape, n, 3), 1000, 42);
        const mean = counts.reduce((s, c) => s + c, 0) / counts.length;
        expect(Math.abs(mean - expectedComparisons(n)) / expectedComparisons(n), `${shape} ${n}`).toBeLessThan(0.02);
      }
    }
  });

  it('the bad tail is small: no random-pivot run at n = 500 reaches a quarter of the fixed pivot\'s sorted-input count', () => {
    const counts = randomPivotCounts(shapeArray('sorted', 500, 0), 1000, 42);
    expect(Math.max(...counts)).toBeLessThan(fixedPivotWorst(500) / 4);
    expect(tailShare(counts, expectedComparisons(500), 2)).toBe(0);
  });

  it('median of three handles sorted input well, but the constructed killer makes it quadratic', () => {
    const n = 400;
    const sortedCount = quicksort(shapeArray('sorted', n, 0), 'median3').comparisons;
    expect(sortedCount).toBeLessThan(n * Math.log2(n) * 2);
    const killer = median3Killer(n);
    expect([...killer].sort((a, b) => a - b)).toEqual(Array.from({ length: n }, (_, i) => i + 1));
    const killed = quicksort(killer, 'median3').comparisons;
    expect(killed).toBeGreaterThan(0.2 * n * n);
    expect(killed).toBeGreaterThan(5 * sortedCount);
    // a random pivot on the same input is unaffected
    expect(randomPivotCounts(killer, 200, 9).every((c) => c < 0.2 * n * n)).toBe(true);
  });
});

describe('Monte Carlo pi', () => {
  it('the standard error 4 sqrt(p(1-p)/n) matches the spread of 400 seeded estimates at n = 1024, and four times the darts halve it', () => {
    const at = (n: number) => {
      const errs = Array.from({ length: 400 }, (_, i) => runCheckpoints(1000 + i).find((c) => c.n === n)!.estimate);
      const mean = errs.reduce((s, x) => s + x, 0) / errs.length;
      return Math.sqrt(errs.reduce((s, x) => s + (x - mean) ** 2, 0) / errs.length);
    };
    const sd = at(1024);
    expect(Math.abs(sd - standardError(1024)) / standardError(1024)).toBeLessThan(0.12);
    expect(standardError(4096) / standardError(1024)).toBeCloseTo(0.5, 12);
    expect(Math.abs(at(4096) / sd - 0.5)).toBeLessThan(0.1);
  });

  it('the mean absolute error follows sigma times sqrt(2/pi) and falls by about half per fourfold darts', () => {
    const series = meanAbsErrors(5);
    expect(series).toHaveLength(11);
    expect(DART_RUNS).toBe(200);
    for (const { n, error } of series) expect(Math.abs(error - expectedAbsError(n)) / expectedAbsError(n), `n=${n}`).toBeLessThan(0.3);
    for (let k = 0; k + 2 < series.length; k++) expect(Math.abs(series[k + 2].error / series[k].error - 0.5), `k=${k}`).toBeLessThan(0.2);
  });
});

/** Strong liar by the definition, written out separately from primality.ts. */
const isStrongLiar = (a: number, n: number): boolean => {
  let d = n - 1;
  let s = 0;
  while (d % 2 === 0) {
    d /= 2;
    s++;
  }
  const pow = (b: number, e: number): number => {
    let r = 1n;
    let base = BigInt(b);
    let ex = BigInt(e);
    while (ex > 0n) {
      if (ex & 1n) r = (r * base) % BigInt(n);
      base = (base * base) % BigInt(n);
      ex >>= 1n;
    }
    return Number(r);
  };
  let x = pow(a, d);
  if (x === 1 || x === n - 1) return true;
  for (let r = 1; r < s; r++) {
    x = Number((BigInt(x) * BigInt(x)) % BigInt(n));
    if (x === n - 1) return true;
  }
  return false;
};
const gcdN = (a: number, b: number): number => (b ? gcdN(b, a % b) : a);

describe('Miller-Rabin (one-sided error)', () => {
  it('passesRound agrees with the textbook definition for every base of every odd n up to 400', () => {
    for (let n = 5; n <= 400; n += 2) for (let a = 2; a <= n - 2; a++) expect(passesRound(BigInt(a), BigInt(n)), `a=${a} n=${n}`).toBe(isStrongLiar(a, n));
  });

  it('for every odd composite from 9 to 3,001, at most a quarter of the bases 2..n-2 are liars; primes pass every base', () => {
    let composites = 0;
    for (let n = 9; n <= 3001; n += 2) {
      if (classify(BigInt(n)) === 'prime') {
        for (let a = 2; a <= n - 2; a++) expect(isStrongLiar(a, n)).toBe(true);
        continue;
      }
      composites++;
      let liars = 0;
      for (let a = 2; a <= n - 2; a++) if (isStrongLiar(a, n)) liars++;
      expect(liars / (n - 3), `n=${n}`).toBeLessThanOrEqual(0.25);
    }
    expect(composites).toBeGreaterThan(1000);
  });

  it('for 561 the census counts every base: liars by brute force, and the Fermat test is fooled by every coprime base', () => {
    const c = census(561n, 1);
    let liars = 0;
    let fermat = 0;
    for (let a = 2; a <= 559; a++) {
      if (isStrongLiar(a, 561)) liars++;
      if (gcdN(a, 561) === 1) fermat++;
    }
    expect(c.exact).toBe(true);
    expect(c.bases).toBe(558);
    expect(c.liars).toBe(liars);
    expect(c.fermat).toBe(fermat);
    expect(fermat).toBe(318);
    expect(c.fraction).toBeLessThanOrEqual(0.25);
    for (let a = 1; a <= 560; a++) if (gcdN(a, 561) === 1) expect(((BigInt(a) ** 560n) % 561n)).toBe(1n);
  });

  it('classify finds primes, evens and odd composites', () => {
    expect(classify(2n)).toBe('prime');
    expect(classify(3n)).toBe('prime');
    expect(classify(4n)).toBe('even');
    expect(classify(561n)).toBe('odd-composite');
    expect(classify(1009n)).toBe('prime');
    expect(classify(999_999_937n)).toBe('prime');
  });

  it('the measured error rate after k rounds tracks (liar share)^k and never exceeds (1/4)^k, over 10,000 seeded trials', () => {
    for (const n of [91n, 221n, 561n]) {
      const c = census(n, 1);
      const measured = trialErrors(n, 17);
      measured.forEach((rate, i) => {
        const k = i + 1;
        const exact = exactErrorAfter(c.fraction, k);
        expect(exact, `${n} k=${k}`).toBeLessThanOrEqual(boundAfter(k));
        const sigma = Math.sqrt((exact * (1 - exact)) / TRIALS);
        expect(Math.abs(rate - exact), `${n} k=${k}`).toBeLessThanOrEqual(4 * sigma + 1e-12);
      });
    }
  });

  it('a "no" is certain: a base that proves compositeness is a witness for the composite, and rounds stop there; a prime never shows one', () => {
    const run = rounds(561n, 8, 1);
    const last = run[run.length - 1];
    if (!last.passed) expect(isStrongLiar(Number(last.base), 561)).toBe(false);
    for (let seed = 0; seed < 50; seed++) expect(rounds(1009n, 8, seed).every((r) => r.passed)).toBe(true);
  });

  it('retrying until a witness appears takes at most 4/3 tries on average for an odd composite, whatever its liars', () => {
    for (const n of [91n, 221n, 561n]) {
      const mean = meanWitnessTries(n, 2000, 3);
      expect(mean, `${n}`).toBeLessThan(4 / 3 + 0.08);
    }
  });
});

const graphKey = (g: Graph) => JSON.stringify(g.edges);

describe("Karger's min-cut", () => {
  it('every preset has 6 to 8 vertices, simple edges, and the brute-force minimum cut over all partitions', () => {
    for (const p of PRESETS) {
      expect(p.graph.n).toBeGreaterThanOrEqual(V_MIN);
      expect(p.graph.n).toBeLessThanOrEqual(V_MAX);
      expect(new Set(p.graph.edges.map(([a, b]) => `${Math.min(a, b)}-${Math.max(a, b)}`)).size).toBe(p.graph.edges.length);
    }
    expect(bruteMinCut(PRESETS.find((p) => p.id === 'cycle')!.graph)).toEqual({ size: 2, count: 21 });
    expect(bruteMinCut(PRESETS.find((p) => p.id === 'clusters')!.graph).size).toBe(2);
    expect(bruteMinCut({ n: 6, edges: [[0, 1], [1, 2], [3, 4]] }).size).toBe(0);
  });

  it('the brute force agrees with a separate enumeration over vertex subsets, counting each partition twice and halving', () => {
    for (const p of PRESETS) {
      const { n, edges } = p.graph;
      let min = Infinity;
      let twice = 0;
      for (let mask = 1; mask < (1 << n) - 1; mask++) {
        const cut = edges.filter(([a, b]) => ((mask >> a) & 1) !== ((mask >> b) & 1)).length;
        if (cut < min) { min = cut; twice = 1; } else if (cut === min) twice++;
      }
      expect(bruteMinCut(p.graph)).toEqual({ size: min, count: twice / 2 });
    }
  });

  it('a run never beats the true minimum, its cut edges really cross its two sides, and a run on a ring finds a cut of 2 every time', () => {
    for (const p of PRESETS) {
      const min = bruteMinCut(p.graph).size;
      const rnd = mulberry32(4);
      for (let r = 0; r < 300; r++) {
        const run = kargerRun(p.graph, rnd);
        expect(run.cut).toBeGreaterThanOrEqual(min);
        expect(new Set(run.group).size).toBe(2);
        expect(run.steps).toHaveLength(p.graph.n - 2);
        for (const i of run.cutEdges) expect(run.group[p.graph.edges[i][0]]).not.toBe(run.group[p.graph.edges[i][1]]);
      }
    }
    expect(repeat(PRESETS.find((p) => p.id === 'cycle')!.graph, 500, 1, 2).hits).toBe(500);
  });

  it('over 10,000 seeded runs the success rate is at least 2/(n(n-1)) on every preset, and runs needed follow from the bound', () => {
    for (const p of PRESETS) {
      const min = bruteMinCut(p.graph).size;
      const { hits } = repeat(p.graph, 10_000, 99, min);
      expect(hits / 10_000, p.id).toBeGreaterThanOrEqual(kargerBound(p.graph.n));
    }
    expect(kargerBound(6)).toBeCloseTo(1 / 15, 12);
    const r = runsNeeded(7, 0.01);
    expect((1 - kargerBound(7)) ** r).toBeLessThanOrEqual(0.01);
    expect((1 - kargerBound(7)) ** (r - 1)).toBeGreaterThan(0.01);
  });

  it('a disconnected graph is cut for free, and contracting stops without looping', () => {
    const g: Graph = { n: 6, edges: [[0, 1], [1, 2], [3, 4], [4, 5]] };
    const run = kargerRun(g, mulberry32(1));
    expect(run.cut).toBe(0);
    expect(graphKey(g)).toBe(graphKey({ n: 6, edges: g.edges }));
  });
});
