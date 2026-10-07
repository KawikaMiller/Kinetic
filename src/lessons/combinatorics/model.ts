// Pure counting for combinatorics: the choice tree and its merge into groups, Pascal's
// triangle built by addition, the four ways to count, and how fast the counts explode.
import { power } from '../../core/format';
import { choose, factorial } from '../../core/stats';

export const MIN_N = 3;
export const MAX_N = 6;
export const TILES = 'ABCDEF';
/** Above this many nodes on a level the tree stops drawing deeper levels. */
export const LEAF_CAP = 120;

export const letters = (n: number) => TILES.slice(0, n).split('');

/** P(n, k) = n! / (n − k)!: ordered picks without repeats. */
export const permutations = (n: number, k: number) => factorial(n) / factorial(n - k);

/** The choice tree: a node is the letters picked so far ('' is the root). */
export function choiceChildren(n: number, k: number, id: string): string[] {
  if (id.length >= k) return [];
  return letters(n).filter((l) => !id.includes(l)).map((l) => id + l);
}

/** Every ordered pick of k distinct tiles, in tree (depth-first) order. */
export function arrangements(n: number, k: number): string[] {
  const out: string[] = [];
  const walk = (id: string) => {
    if (id.length === k) out.push(id);
    else choiceChildren(n, k, id).forEach(walk);
  };
  walk('');
  return out;
}

/** The arrangements grouped by which letters they use: each group is one combination. */
export function groups(n: number, k: number): { set: string; orders: string[] }[] {
  const bySet = new Map<string, string[]>();
  for (const a of arrangements(n, k)) {
    const set = [...a].sort().join('');
    bySet.set(set, [...(bySet.get(set) ?? []), a]);
  }
  return [...bySet].map(([set, orders]) => ({ set, orders }));
}

/** The deepest level the tree draws: the last one with at most LEAF_CAP nodes. */
export function deepestShown(n: number, k: number): number {
  let d = 0;
  while (d < k && permutations(n, d + 1) <= BigInt(LEAF_CAP)) d++;
  return d;
}

// ── Pascal's triangle ────────────────────────────────────────────────

export const PASCAL_ROWS = 11;

/** Rows 0 … rows−1, each cell the sum of the two above it (no factorials involved). */
export function pascal(rows: number): number[][] {
  const out: number[][] = [];
  for (let r = 0; r < rows; r++) {
    out.push(Array.from({ length: r + 1 }, (_, c) => (c === 0 || c === r ? 1 : out[r - 1][c - 1] + out[r - 1][c])));
  }
  return out;
}

// ── The four ways to count ───────────────────────────────────────────

export interface Counts {
  ordered: bigint;
  unordered: bigint;
  orderedRepeat: bigint;
  unorderedRepeat: bigint;
}

/** Picking k from n: with or without order, with or without repeats. */
export function counts(n: number, k: number): Counts {
  return {
    ordered: k <= n ? permutations(n, k) : 0n,
    unordered: choose(n, k),
    orderedRepeat: BigInt(n) ** BigInt(k),
    // Stars and bars: k picks with repeats from n kinds = k stars among n − 1 bars.
    unorderedRepeat: n === 0 ? (k === 0 ? 1n : 0n) : choose(n + k - 1, k),
  };
}

/** Every pick of k from n with repeats allowed, ordered (strings), for checking the formulas. */
export function withRepeats(n: number, k: number): string[] {
  let out = [''];
  for (let i = 0; i < k; i++) out = out.flatMap((s) => letters(n).map((l) => s + l));
  return out;
}

// ── Explosion ────────────────────────────────────────────────────────

export interface Growth {
  id: 'flags' | 'passwords' | 'orders';
  title: string;
  /** What n counts, for the slider. */
  unit: string;
  min: number;
  max: number;
  initial: number;
  formula: (n: number) => string;
  count: (n: number) => bigint;
}

export const GROWTHS: readonly Growth[] = [
  { id: 'flags', title: 'Feature-flag combinations', unit: 'Flags', min: 1, max: 64, initial: 10, formula: (n) => power(n, 2), count: (n) => 2n ** BigInt(n) },
  { id: 'passwords', title: 'Lower-case passwords', unit: 'Length', min: 1, max: 20, initial: 8, formula: (n) => power(n, 26), count: (n) => 26n ** BigInt(n) },
  { id: 'orders', title: 'Orders to deploy services in', unit: 'Services', min: 1, max: 30, initial: 10, formula: (n) => `${n}!`, count: (n) => factorial(n) },
];

/** How many times bigger the count gets when n doubles. */
export const doublingFactor = (g: Growth, n: number) => g.count(2 * n) / g.count(n);

/** "2.1·10¹¹"-style mantissa (rounded to 2 significant digits) and exponent of a positive bigint. */
export function scientific(v: bigint): { mantissa: string; exponent: number } {
  const s = v.toString();
  let exponent = s.length - 1;
  let m = Math.round(Number(s.slice(0, 3).padEnd(3, '0')) / 10) / 10;
  if (m >= 10) {
    m = 1;
    exponent++;
  }
  return { mantissa: m.toFixed(1), exponent };
}
