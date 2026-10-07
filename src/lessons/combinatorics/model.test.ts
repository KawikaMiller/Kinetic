import { describe, expect, it } from 'vitest';
import { choose, factorial } from '../../core/stats';
import {
  GROWTHS, LEAF_CAP, MAX_N, MIN_N, PASCAL_ROWS, arrangements, choiceChildren, counts, deepestShown, doublingFactor, groups,
  pascal, permutations, scientific, withRepeats,
} from './model';

/** All k-subsets of 0..n−1 by brute force. */
const subsets = (n: number, k: number) => {
  let count = 0;
  for (let mask = 0; mask < 1 << n; mask++) if (mask.toString(2).split('1').length - 1 === k) count++;
  return count;
};

describe('choose and factorial', () => {
  it('match enumeration for every n ≤ 10', () => {
    for (let n = 0; n <= 10; n++) {
      let f = 1;
      for (let i = 2; i <= n; i++) f *= i;
      expect(factorial(n)).toBe(BigInt(f));
      for (let k = 0; k <= n; k++) expect(choose(n, k)).toBe(BigInt(subsets(n, k)));
    }
  });
});

describe('choice tree', () => {
  it('has P(n, k) distinct leaves that merge k! at a time into C(n, k) groups, for every n ≤ 6, k ≤ n', () => {
    for (let n = 1; n <= MAX_N; n++) {
      for (let k = 0; k <= n; k++) {
        const leaves = arrangements(n, k);
        expect(BigInt(leaves.length)).toBe(permutations(n, k));
        expect(new Set(leaves).size).toBe(leaves.length);
        const g = groups(n, k);
        expect(BigInt(g.length)).toBe(choose(n, k));
        for (const { orders } of g) expect(BigInt(orders.length)).toBe(factorial(k));
      }
    }
  });

  it('never repeats a tile on a branch', () => {
    expect(choiceChildren(4, 3, 'AC')).toEqual(['ACB', 'ACD']);
    expect(choiceChildren(4, 2, 'AC')).toEqual([]);
  });

  it('draws as deep as it can while a level has at most 120 nodes', () => {
    expect(deepestShown(5, 3)).toBe(3);
    expect(deepestShown(5, 5)).toBe(5);
    expect(deepestShown(6, 6)).toBe(3);
    for (let n = MIN_N; n <= MAX_N; n++) {
      for (let k = 1; k <= n; k++) {
        const d = deepestShown(n, k);
        expect(permutations(n, d)).toBeLessThanOrEqual(BigInt(LEAF_CAP));
        if (d < k) expect(permutations(n, d + 1)).toBeGreaterThan(BigInt(LEAF_CAP));
      }
    }
  });
});

describe('Pascal', () => {
  it('every cell built by addition equals choose(r, c)', () => {
    pascal(PASCAL_ROWS).forEach((row, r) => row.forEach((v, c) => expect(BigInt(v)).toBe(choose(r, c))));
    expect(pascal(PASCAL_ROWS)[10][5]).toBe(252);
  });
});

describe('the four ways to count', () => {
  it('match enumeration with and without repeats for n ≤ 5, k ≤ 4', () => {
    for (let n = 1; n <= 5; n++) {
      for (let k = 0; k <= 4; k++) {
        const c = counts(n, k);
        const all = withRepeats(n, k);
        expect(BigInt(all.length)).toBe(c.orderedRepeat);
        expect(BigInt(new Set(all.map((s) => [...s].sort().join(''))).size)).toBe(c.unorderedRepeat);
        const distinct = all.filter((s) => new Set(s).size === s.length);
        expect(BigInt(distinct.length)).toBe(c.ordered);
        expect(BigInt(new Set(distinct.map((s) => [...s].sort().join(''))).size)).toBe(c.unordered);
      }
    }
  });
});

describe('explosion', () => {
  const g = (id: string) => GROWTHS.find((x) => x.id === id)!;

  it('gives the spec numbers exactly', () => {
    expect(g('flags').count(10)).toBe(1024n);
    expect(g('passwords').count(8)).toBe(208_827_064_576n);
    expect(g('orders').count(10)).toBe(3_628_800n);
    expect(scientific(208_827_064_576n)).toEqual({ mantissa: '2.1', exponent: 11 });
    expect(scientific(9_960n)).toEqual({ mantissa: '1.0', exponent: 4 });
  });

  it('doubling n never just doubles the count', () => {
    expect(doublingFactor(g('flags'), 10)).toBe(1024n);
    expect(doublingFactor(g('orders'), 10)).toBe(factorial(20) / factorial(10));
    for (const growth of GROWTHS) for (let n = 2; n <= 10; n++) expect(doublingFactor(growth, n)).toBeGreaterThan(2n);
  });
});
