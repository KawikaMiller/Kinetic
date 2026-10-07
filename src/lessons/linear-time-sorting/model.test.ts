import { describe, expect, it } from 'vitest';
import { mulberry32, randInt, type Rnd } from '../../core/random';
import { factorial, log2Factorial } from '../../core/stats';
import {
  answersFor, boundSeries, childrenOf, comparisonLeading, costRow, COUNT_KEYS, COUNT_PRESETS, countingSort, DECISION_TREE, digitOf,
  firstBreak, INPUT_ORDERS, isSorted, isStable, itemsOf, leaves, LETTERS, lowerBound, nodeOf, parseKeys, RADIX_MAX, RADIX_PRESETS,
  radixSort, TREE_ROOT, treeHeight, walkAnswers, type Item, type Letter,
} from './model';

const numeric = (a: readonly number[]) => [...a].sort((x, y) => x - y);
const keysOf = (items: readonly Item[]) => items.map((i) => i.key);
/** Array.prototype.sort is stable (ES2019+): the independent reference for "equal keys keep input order". */
const stableIds = (keys: readonly number[]) => itemsOf(keys).sort((x, y) => x.key - y.key).map((i) => i.id);

function seededKeys(rnd: Rnd, max: number, maxLen: number): number[] {
  const n = randInt(1, maxLen, rnd);
  // A narrow range half the time, so duplicates are common.
  const hi = rnd() < 0.5 ? randInt(0, Math.min(max, 5), rnd) : max;
  return Array.from({ length: n }, () => randInt(0, hi, rnd));
}

const permutations = <T,>(xs: readonly T[]): T[][] =>
  xs.length <= 1 ? [xs.slice()] : xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));

describe('the decision tree for three items', () => {
  it('has exactly 3! = 6 leaves, one per permutation', () => {
    const orders = leaves().map((l) => l.order.join(''));
    expect(orders).toHaveLength(6);
    expect(new Set(orders)).toEqual(new Set(permutations(LETTERS).map((p) => p.join(''))));
  });

  it('is a proper binary tree: every internal node has two children, every node is reached once', () => {
    const seen: string[] = [];
    const visit = (id: string) => {
      seen.push(id);
      childrenOf(id).forEach(visit);
    };
    visit(TREE_ROOT);
    expect(seen.sort()).toEqual([...DECISION_TREE.keys()].sort());
    for (const n of DECISION_TREE.values()) if (n.kind === 'ask') expect(childrenOf(n.id)).toHaveLength(2);
  });

  it('sorts every input order: the leaf reached names the values smallest first', () => {
    for (const perm of permutations([10, 20, 30])) {
      const values = { a: perm[0], b: perm[1], c: perm[2] };
      const path = walkAnswers(answersFor(values));
      const end = nodeOf(path[path.length - 1]);
      expect(end.kind).toBe('leaf');
      if (end.kind !== 'leaf') continue;
      expect(end.order.map((l: Letter) => values[l])).toEqual([10, 20, 30]);
    }
  });

  it('has height 3 = ⌈log₂ 3!⌉, and two inputs finish after only 2 comparisons', () => {
    expect(treeHeight()).toBe(3);
    expect(lowerBound(3)).toBe(3);
    const lengths = INPUT_ORDERS.map((v) => answersFor(v).length).sort();
    expect(lengths).toEqual([2, 2, 3, 3, 3, 3]);
  });

  it('offers each of the six input orders once', () => {
    expect(new Set(INPUT_ORDERS.map((v) => `${v.a}${v.b}${v.c}`)).size).toBe(6);
  });

  it('stops at a leaf however many answers are given', () => {
    expect(walkAnswers([true, true, true, false])).toEqual(['n0', 'n1', 'abc']);
  });
});

describe('the lower bound', () => {
  it('log2Factorial(n) matches the sum of log₂ i to 1e-9', () => {
    for (let n = 0; n <= 200; n++) {
      let s = 0;
      for (let i = 1; i <= n; i++) s += Math.log2(i);
      expect(Math.abs(log2Factorial(n) - s)).toBeLessThan(1e-9);
    }
  });

  it('lowerBound(n) is ⌈log₂ n!⌉ by definition: 2^(b−1) < n! ≤ 2^b, and within 1 above the float sum', () => {
    for (let n = 2; n <= 64; n++) {
      const b = lowerBound(n);
      const f = factorial(n);
      expect(1n << BigInt(b - 1), `n = ${n}`).toBeLessThan(f);
      expect(f, `n = ${n}`).toBeLessThanOrEqual(1n << BigInt(b));
      expect(b - log2Factorial(n)).toBeGreaterThanOrEqual(0);
      expect(b - log2Factorial(n)).toBeLessThan(1);
    }
    expect(lowerBound(1)).toBe(0);
  });

  it('plots ⌈log₂ n!⌉ under n log₂ n, with their ratio rising', () => {
    const s = boundSeries(64);
    expect(s).toHaveLength(64);
    expect(s[63]).toMatchObject({ n: 64, bound: 296, nlogn: 384 });
    for (const p of s.slice(1)) expect(p.bound).toBeLessThanOrEqual(p.nlogn + 1);
    expect(s[63].bound / s[63].nlogn).toBeGreaterThan(s[15].bound / s[15].nlogn);
  });
});

describe('counting sort', () => {
  it('equals Array.prototype.sort on 500 seeded arrays, and is stable', () => {
    const rnd = mulberry32(14);
    for (let t = 0; t < 500; t++) {
      const keys = seededKeys(rnd, COUNT_KEYS - 1, 12);
      const { out } = countingSort(keys);
      expect(keysOf(out)).toEqual(numeric(keys));
      expect(out.map((i) => i.id)).toEqual(stableIds(keys));
      expect(isStable(out)).toBe(true);
    }
  });

  it('records n counts, k starts and n placements', () => {
    const keys = [...COUNT_PRESETS[0].keys];
    const { steps } = countingSort(keys);
    expect(steps.filter((s) => s.t === 'count')).toHaveLength(keys.length);
    expect(steps.filter((s) => s.t === 'start')).toHaveLength(COUNT_KEYS);
    expect(steps.filter((s) => s.t === 'place')).toHaveLength(keys.length);
  });

  it('starts each key at the number of smaller keys (hand-checked)', () => {
    // keys 4 1 3 4 0 3 9 1 4: one 0, two 1s, two 3s, three 4s, one 9.
    const { steps } = countingSort([...COUNT_PRESETS[0].keys]);
    const last = steps.filter((s) => s.t === 'start').pop();
    expect(last?.t === 'start' && last.starts).toEqual([0, 1, 3, 3, 5, 8, 8, 8, 8, 8]);
  });
});

describe('LSD radix sort', () => {
  it('equals Array.prototype.sort on 500 seeded arrays, and is stable', () => {
    const rnd = mulberry32(15);
    for (let t = 0; t < 500; t++) {
      const keys = seededKeys(rnd, RADIX_MAX, 10);
      const { out } = radixSort(keys);
      expect(keysOf(out)).toEqual(numeric(keys));
      expect(out.map((i) => i.id)).toEqual(stableIds(keys));
    }
  });

  it('after pass p the strip is sorted by its lowest p digits', () => {
    const rnd = mulberry32(16);
    for (let t = 0; t < 200; t++) {
      const { steps } = radixSort(seededKeys(rnd, RADIX_MAX, 10));
      for (const s of steps) if (s.t === 'collect') expect(firstBreak(s.order, s.pass + 1)).toBeNull();
    }
  });

  it('reads one digit per item per pass', () => {
    expect(radixSort([...RADIX_PRESETS[0].keys]).digitReads).toBe(3 * RADIX_PRESETS[0].keys.length);
  });

  it('with newest-first (unstable) buckets, fails on every preset that shares a digit', () => {
    for (const p of RADIX_PRESETS) {
      const { out } = radixSort([...p.keys], 'lifo');
      expect(isSorted(out), p.id).toBe(false);
    }
  });

  it('digitOf reads ones, tens and hundreds', () => {
    expect([0, 1, 2].map((d) => digitOf(457, d))).toEqual([7, 5, 4]);
    expect([0, 1, 2].map((d) => digitOf(5, d))).toEqual([5, 0, 0]);
  });
});

describe('isSorted and isStable', () => {
  it('spot a swapped pair of equal keys', () => {
    const items = itemsOf([2, 2]);
    expect(isStable(items)).toBe(true);
    expect(isStable([items[1], items[0]])).toBe(false);
    expect(isSorted([items[1], items[0]])).toBe(true);
  });
});

describe('parseKeys', () => {
  const p = (s: string) => parseKeys(s, 999, 10);
  it('accepts commas and spaces', () => {
    expect(p('329, 457 657')).toEqual({ ok: true, keys: [329, 457, 657] });
    expect(p(' 007 ')).toEqual({ ok: true, keys: [7] });
  });
  it.each([
    ['', 'at least one'],
    ['   ', 'at least one'],
    ['-1', 'this demo sorts 0-999'],
    ['1, -5', 'this demo sorts 0-999'],
    ['12345678901234567890123', 'this demo sorts 0-999'],
    ['1000', 'this demo sorts 0-999'],
    ['1e400', 'Whole numbers'],
    ['1.5', 'Whole numbers'],
    ['🙂', 'Whole numbers'],
    ['<b>1</b>', 'Whole numbers'],
    ['1,,2', 'gap'],
    ['1, 2,', 'gap'],
    ['1 2 3 4 5 6 7 8 9 10 11', 'Up to 10'],
  ])('refuses %j', (text, msg) => {
    const r = p(text);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(msg);
  });
  it('uses the counting range in its messages', () => {
    const r = parseKeys('10', 9, 12);
    expect(!r.ok && r.error).toContain('this demo sorts 0-9');
  });
});

describe('the cost table', () => {
  it('works out counting and base-256 radix costs by hand', () => {
    expect(costRow(32)).toEqual({ bits: 32, countingWork: 1000 + 4294967296, radixPasses: 4, radixWork: 4 * 1256 });
    expect(costRow(8)).toEqual({ bits: 8, countingWork: 1256, radixPasses: 1, radixWork: 1256 });
    expect(Math.round(comparisonLeading())).toBe(9966);
  });
});
