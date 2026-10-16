import { describe, expect, it } from 'vitest';
import type { Item, Matrix } from './dp';

// Brute-force references shared by this lesson's tests, written separately from dp.ts.

export const bruteKnapsack01 = (items: readonly Item[], cap: number): number => {
  let best = 0;
  for (let mask = 0; mask < 1 << items.length; mask++) {
    let w = 0;
    let v = 0;
    for (let i = 0; i < items.length; i++) if ((mask >> i) & 1) { w += items[i].w; v += items[i].v; }
    if (w <= cap && v > best) best = v;
  }
  return best;
};

export const bruteUnbounded = (items: readonly Item[], cap: number, from = 0): number => {
  if (from === items.length) return 0;
  let best = 0;
  for (let count = 0; count * items[from].w <= cap; count++) {
    best = Math.max(best, count * items[from].v + bruteUnbounded(items, cap - count * items[from].w, from + 1));
  }
  return best;
};

export const bruteLis = (a: readonly number[]): number => {
  let best = 0;
  for (let mask = 0; mask < 1 << a.length; mask++) {
    let last = -Infinity;
    let ok = true;
    let len = 0;
    for (let i = 0; i < a.length && ok; i++) {
      if (!((mask >> i) & 1)) continue;
      if (a[i] <= last) ok = false;
      last = a[i];
      len++;
    }
    if (ok && len > best) best = len;
  }
  return best;
};

/** Every parenthesisation of matrices lo..hi as a cost, enumerated as explicit trees (Catalan many). */
export const parenthesisationCosts = (dims: readonly number[], lo: number, hi: number): { cost: number }[] => {
  if (lo === hi) return [{ cost: 0 }];
  const out: { cost: number }[] = [];
  for (let k = lo; k < hi; k++) {
    for (const l of parenthesisationCosts(dims, lo, k)) {
      for (const r of parenthesisationCosts(dims, k + 1, hi)) out.push({ cost: l.cost + r.cost + dims[lo - 1] * dims[k] * dims[hi] });
    }
  }
  return out;
};

const permutations = <T,>(xs: readonly T[]): T[][] => (xs.length <= 1 ? [xs.slice()] : xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p])));

export const bruteTsp = (d: Matrix): number => {
  const cities = Array.from({ length: d.length - 1 }, (_, i) => i + 1);
  return Math.min(...permutations(cities).map((p) => {
    const tour = [0, ...p, 0];
    return tour.slice(1).reduce((sum, c, i) => sum + d[tour[i]][c], 0);
  }));
};

export const catalan = (n: number): number => (n <= 1 ? 1 : Array.from({ length: n }, (_, i) => catalan(i) * catalan(n - 1 - i)).reduce((a, b) => a + b, 0));

describe('the brute-force oracles themselves', () => {
  it('count Catalan(5) = 42 groupings of six matrices, and find hand-worked optima', () => {
    expect(parenthesisationCosts([1, 1, 1, 1, 1, 1, 1], 1, 6)).toHaveLength(42);
    expect(catalan(5)).toBe(42);
    expect(bruteKnapsack01([{ w: 2, v: 3 }, { w: 3, v: 4 }, { w: 4, v: 5 }, { w: 5, v: 8 }], 9)).toBe(13);
    expect(bruteUnbounded([{ w: 2, v: 3 }, { w: 5, v: 8 }], 9)).toBe(14);
    expect(bruteLis([5, 6, 1, 2, 3])).toBe(3);
    const square: Matrix = [[0, 1, 5, 1], [1, 0, 1, 5], [5, 1, 0, 1], [1, 5, 1, 0]];
    expect(bruteTsp(square)).toBe(4);
  });
});
