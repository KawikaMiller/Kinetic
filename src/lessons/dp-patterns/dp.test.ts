import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import {
  breakEven, chainIntervals, chainParenthesis, chainPrefixOnly, chainStateCounts, chainTable, citiesOf, greedyByRatio, isSubsequence,
  knapsackChosen, knapsackPath, knapsackPrefixOnly, knapsackRolling, knapsackTable, lisEndingAt, lisPrefixOnly, lisReconstruct, lisStartingAt,
  lisTails, nominalStates, tableStates, countedTransitions, countedBreakEven, seededDistances, tourCount, tourLength, transitionBound, tspBitmask, tspLastOnly, tspMaskOnly, type Item,
} from './dp';

import { bruteKnapsack01, bruteLis, bruteTsp, bruteUnbounded, catalan, parenthesisationCosts } from './oracles.test';

const randomItems = (rnd: () => number, n: number): Item[] => Array.from({ length: n }, () => ({ w: 1 + Math.floor(rnd() * 12), v: Math.floor(rnd() * 100) }));
const randomArray = (rnd: () => number, n: number): number[] => Array.from({ length: n }, () => Math.floor(rnd() * 30) - 10);

describe('knapsack', () => {
  it('the table, the downward 1-D array and the brute force over all 2^n subsets agree on 500 seeded instances (n up to 15)', () => {
    const rnd = mulberry32(2024);
    for (let t = 0; t < 500; t++) {
      const n = 1 + Math.floor(rnd() * 15);
      const items = randomItems(rnd, n);
      const cap = Math.floor(rnd() * 40);
      const brute = bruteKnapsack01(items, cap);
      expect(knapsackTable(items, cap)[n][cap], `table ${t}`).toBe(brute);
      const down = knapsackRolling(items, cap, 'down');
      expect(down[n][cap], `down ${t}`).toBe(brute);
      expect(down, `rows ${t}`).toEqual(knapsackTable(items, cap));
    }
  });

  it('the upward loop equals the unbounded knapsack (brute force over counts) and differs from 0/1 on the default instance', () => {
    const rnd = mulberry32(7);
    for (let t = 0; t < 300; t++) {
      const items = randomItems(rnd, 1 + Math.floor(rnd() * 6));
      const cap = Math.floor(rnd() * 30);
      const rows = knapsackRolling(items, cap, 'up');
      expect(rows[items.length][cap], `up ${t}`).toBe(bruteUnbounded(items, cap));
    }
    const items: Item[] = [{ w: 2, v: 3 }, { w: 3, v: 4 }, { w: 4, v: 5 }, { w: 5, v: 8 }];
    expect(bruteKnapsack01(items, 9)).toBe(13);
    expect(bruteUnbounded(items, 9)).toBe(14);
    expect(knapsackRolling(items, 9, 'down')[4][9]).toBe(13);
    expect(knapsackRolling(items, 9, 'up')[4][9]).toBe(14);
  });

  it('reconstruction returns items within capacity whose value is the table answer (0/1: each at most once; up: counts allowed)', () => {
    const rnd = mulberry32(99);
    for (let t = 0; t < 300; t++) {
      const items = randomItems(rnd, 1 + Math.floor(rnd() * 8));
      const cap = Math.floor(rnd() * 35);
      for (const dir of ['down', 'up'] as const) {
        const rows = knapsackRolling(items, cap, dir);
        const counts = knapsackChosen(items, cap, rows, dir);
        const weight = counts.reduce((s, c, i) => s + c * items[i].w, 0);
        const value = counts.reduce((s, c, i) => s + c * items[i].v, 0);
        expect(weight, `${dir} ${t}`).toBeLessThanOrEqual(cap);
        expect(value, `${dir} ${t}`).toBe(rows[items.length][cap]);
        if (dir === 'down') expect(Math.max(...counts), `${dir} ${t}`).toBeLessThanOrEqual(1);
        const path = knapsackPath(items, cap, rows, dir);
        expect(path[0]).toEqual([items.length, cap]);
        expect(path[path.length - 1][0]).toBe(0);
      }
    }
  });

  it('a capacity of 0 gives value 0, and weight-1 items fill exactly the capacity', () => {
    expect(knapsackTable([{ w: 1, v: 5 }], 0)[1][0]).toBe(0);
    expect(knapsackTable([{ w: 1, v: 5 }, { w: 1, v: 6 }, { w: 1, v: 7 }], 2)[3][2]).toBe(13);
  });

  it('greedy by ratio loses to the DP on the default instance and on the trap preset, by exactly the brute-force gap', () => {
    const items: Item[] = [{ w: 2, v: 3 }, { w: 3, v: 4 }, { w: 4, v: 5 }, { w: 5, v: 8 }];
    expect(greedyByRatio(items, 9).value).toBe(11);
    const trap: Item[] = [{ w: 2, v: 6 }, { w: 4, v: 10 }, { w: 6, v: 12 }, { w: 1, v: 1 }];
    expect(greedyByRatio(trap, 10).value).toBe(17);
    expect(bruteKnapsack01(trap, 10)).toBe(22);
  });

  it('the dp[i]-only state returns a wrong value on at least one small instance, never above the optimum, and its set always fits', () => {
    const rnd = mulberry32(5);
    let wrong = 0;
    for (let t = 0; t < 500; t++) {
      const items = randomItems(rnd, 1 + Math.floor(rnd() * 6));
      const cap = Math.floor(rnd() * 25);
      const out = knapsackPrefixOnly(items, cap);
      const last = out[out.length - 1];
      const brute = bruteKnapsack01(items, cap);
      expect(last.value).toBeLessThanOrEqual(brute);
      expect(last.weight).toBeLessThanOrEqual(cap);
      if (last.value !== brute) wrong++;
    }
    expect(wrong).toBeGreaterThan(0);
  });
});

describe('longest increasing subsequence', () => {
  it('both quadratic states and the tails array equal the brute force over all subsequences (n up to 14) and each other on 1,000 seeded arrays', () => {
    const rnd = mulberry32(31);
    for (let t = 0; t < 1000; t++) {
      const a = randomArray(rnd, Math.floor(rnd() * 15));
      const brute = a.length <= 14 ? bruteLis(a) : 0;
      const end = lisEndingAt(a);
      expect(end.length, `end ${t}`).toBe(brute);
      expect(lisStartingAt(a).length, `start ${t}`).toBe(brute);
      expect(lisTails(a).length, `tails ${t}`).toBe(brute);
      const picked = lisReconstruct(end).map((i) => a[i]);
      expect(picked.length).toBe(brute);
      expect(picked.every((x, k) => k === 0 || picked[k - 1] < x)).toBe(true);
      expect(isSubsequence(picked, a)).toBe(true);
    }
  });

  it('the tails array is not itself a subsequence on the default array, and the counts are 45 pair checks against 22 probes there', () => {
    const a = [3, 1, 4, 1, 5, 9, 2, 6, 5, 3];
    const { steps, length, probes } = lisTails(a);
    expect(steps[steps.length - 1].tails).toEqual([1, 2, 3, 6]);
    expect(isSubsequence([1, 2, 3, 6], a)).toBe(false);
    expect(length).toBe(4);
    expect(lisEndingAt(a).comparisons).toBe((a.length * (a.length - 1)) / 2);
    expect(probes).toBe(steps.reduce((s, x) => s + x.probes, 0));
  });

  it('the first-i state returns a wrong length on an array where the first two elements are large', () => {
    const a = [5, 6, 1, 2, 3];
    const out = lisPrefixOnly(a);
    expect(out[out.length - 1].len).toBe(2);
    expect(bruteLis(a)).toBe(3);
    const rnd = mulberry32(8);
    for (let t = 0; t < 300; t++) {
      const arr = randomArray(rnd, 1 + Math.floor(rnd() * 10));
      const o = lisPrefixOnly(arr);
      expect(o[o.length - 1].len).toBeLessThanOrEqual(bruteLis(arr));
    }
  });

  it('an empty and a single-element array have lengths 0 and 1', () => {
    expect(lisEndingAt([]).length).toBe(0);
    expect(lisTails([]).length).toBe(0);
    expect(lisEndingAt([4]).length).toBe(1);
  });
});

describe('matrix-chain multiplication', () => {
  it('the interval table equals the minimum over every parenthesisation (Catalan many) for n up to 8, 300 seeded dimension lists', () => {
    const rnd = mulberry32(12);
    for (let t = 0; t < 300; t++) {
      const n = 1 + Math.floor(rnd() * 8);
      const dims = Array.from({ length: n + 1 }, () => 1 + Math.floor(rnd() * 30));
      const all = parenthesisationCosts(dims, 1, n);
      expect(all.length).toBe(catalan(n - 1));
      expect(chainTable(dims).answer, `n=${n} #${t}`).toBe(Math.min(...all.map((x) => x.cost)));
    }
  });

  it('the textbook instance 30,35,15,5,10,20,25 costs 15125 with the split ((A1 (A2 A3)) ((A4 A5) A6))', () => {
    const dims = [30, 35, 15, 5, 10, 20, 25];
    const run = chainTable(dims);
    expect(run.answer).toBe(15125);
    expect(chainParenthesis(run.split, 1, 6)).toBe('((A1 (A2 A3)) ((A4 A5) A6))');
    expect(chainIntervals(run.split, 1, 6).length).toBe(11);
    expect(run.unfilledReads).toBe(0);
  });

  it('filling row by row reads unfilled cells and returns a wrong cost on the textbook instance', () => {
    const dims = [30, 35, 15, 5, 10, 20, 25];
    const bad = chainTable(dims, 'row');
    expect(bad.unfilledReads).toBeGreaterThan(0);
    expect(bad.answer).not.toBe(15125);
    expect(bad.answer).toBeLessThan(15125);
  });

  it('the prefix-only state is the left-to-right cost: never below the optimum, and above it on the textbook instance', () => {
    const dims = [30, 35, 15, 5, 10, 20, 25];
    const out = chainPrefixOnly(dims);
    expect(out[6]).toBeGreaterThan(15125);
    const rnd = mulberry32(3);
    for (let t = 0; t < 200; t++) {
      const n = 2 + Math.floor(rnd() * 6);
      const d = Array.from({ length: n + 1 }, () => 1 + Math.floor(rnd() * 30));
      expect(chainPrefixOnly(d)[n]).toBeGreaterThanOrEqual(chainTable(d).answer);
    }
  });

  it('state counts follow the closed forms C(n+1,2) and C(n+1,3)', () => {
    for (let n = 1; n <= 10; n++) {
      expect(chainStateCounts(n)).toEqual({ interval: ((n + 1) * n) / 2, withSplit: ((n + 1) * n * (n - 1)) / 6 });
    }
  });
});

describe('bitmask travelling salesman', () => {
  it('the table equals the minimum over all permutations (n up to 8) on 200 seeded matrices, and the reconstructed tour has that length', () => {
    const rnd = mulberry32(77);
    for (let t = 0; t < 200; t++) {
      const n = 3 + Math.floor(rnd() * 6);
      const d = seededDistances(n, rnd);
      const run = tspBitmask(d);
      expect(run.best, `n=${n} #${t}`).toBe(bruteTsp(d));
      expect(tourLength(d, run.tour)).toBe(run.best);
      expect(new Set(run.tour.slice(0, -1)).size).toBe(n);
      expect(run.tour[0]).toBe(0);
      expect(run.tour[run.tour.length - 1]).toBe(0);
    }
  });

  it('the counted transitions equal the closed form: sum over set sizes k of C(n-1,k)*k*(k-1), and the state count is (n-1)*2^(n-2)', () => {
    const choose = (n: number, k: number): number => (k === 0 || k === n ? 1 : choose(n - 1, k - 1) + choose(n - 1, k));
    for (let n = 3; n <= 9; n++) {
      const d = seededDistances(n, mulberry32(n));
      const run = tspBitmask(d);
      let transitions = 0;
      for (let k = 2; k <= n - 1; k++) transitions += choose(n - 1, k) * k * (k - 1);
      expect(run.transitions).toBe(transitions);
      expect(run.states.length).toBe((n - 1) * 2 ** (n - 2));
    }
  });

  it('the mask-only state is never below the optimum and is wrong on some instance; the last-only walk is never above it and is wrong on some', () => {
    const rnd = mulberry32(21);
    let maskWrong = 0;
    let lastWrong = 0;
    for (let t = 0; t < 300; t++) {
      const n = 4 + Math.floor(rnd() * 4);
      const d = seededDistances(n, rnd);
      const best = tspBitmask(d).best;
      const m = tspMaskOnly(d).best;
      const l = tspLastOnly(d).best;
      expect(m).toBeGreaterThanOrEqual(best);
      expect(l).toBeLessThanOrEqual(best);
      if (m !== best) maskWrong++;
      if (l !== best) lastWrong++;
    }
    expect(maskWrong).toBeGreaterThan(0);
    expect(lastWrong).toBeGreaterThan(0);
  });

  it('masks are listed by size, cities come out ascending, and the growth numbers cross at n = 10', () => {
    expect(citiesOf(0b10110)).toEqual([2, 3, 5]);
    expect(tourCount(5)).toBe(24);
    expect(tourCount(8)).toBe(5040);
    expect(nominalStates(5)).toBe(160);
    expect(transitionBound(10)).toBe(102400);
    expect(tourCount(10)).toBe(362880);
    expect(breakEven(20)).toBe(10);
    expect(transitionBound(9) < tourCount(9)).toBe(false);
  });

  it('the table really holds (n-1) 2^(n-2) states and evaluates (n-1)(n-2) 2^(n-3) transitions, so the counted break-even is n = 7', () => {
    const countedBreak: number[] = [];
    for (let n = 4; n <= 9; n++) {
      const run = tspBitmask(seededDistances(n, mulberry32(7)));
      expect(run.states.length, `states n=${n}`).toBe(tableStates(n));
      expect(run.transitions, `transitions n=${n}`).toBe(countedTransitions(n));
      if (run.transitions < (n - 1 <= 1 ? 1 : Array.from({ length: n - 1 }, (_, i) => i + 1).reduce((a, b) => a * b))) countedBreak.push(n);
    }
    expect(countedBreak[0]).toBe(7);
    expect(countedBreakEven(20)).toBe(7);
    expect(tspBitmask(seededDistances(5, mulberry32(7))).states.length).toBe(32);
  });
});
