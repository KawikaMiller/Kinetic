import { parseBoundedList } from '../../core/parseKit';
import type { Result } from '../../core/result';
import { mulberry32 } from '../../core/random';
import {
  chainPrefixOnly, chainTable, knapsackOptimum, knapsackPrefixOnly, lisEndingAt, lisPrefixOnly, seededDistances, tspBitmask, tspLastOnly, tspMaskOnly,
  type Item, type Matrix,
} from './dp';

// ── limits ─────────────────────────────────────────────────────────────────
export const ITEMS_MIN = 4;
export const ITEMS_MAX = 8;
export const WEIGHT_MAX = 12;
export const VALUE_MAX = 99;
export const CAP_MAX = 20;
export const LIS_MIN = 2;
export const LIS_MAX = 14;
export const LIS_ABS = 99;
export const MATRICES_MIN = 3;
export const MATRICES_MAX = 6;
export const DIM_MAX = 30;
export const CITIES_MIN = 5;
export const CITIES_MAX = 8;

// ── opening states, one per tab (pure, so a test can pin what each try-this starts from) ───
export interface KnapsackInput {
  items: Item[];
  cap: number;
}
export const KNAPSACK_DEFAULT: KnapsackInput = { items: [{ w: 2, v: 3 }, { w: 3, v: 4 }, { w: 4, v: 5 }, { w: 5, v: 8 }], cap: 9 };
export const KNAPSACK_TRAP: KnapsackInput = { items: [{ w: 2, v: 6 }, { w: 4, v: 10 }, { w: 6, v: 12 }, { w: 1, v: 1 }], cap: 10 };
export const LIS_DEFAULT = [3, 1, 4, 1, 5, 9, 2, 6, 5, 3];
export const CHAIN_DEFAULT = [30, 35, 15, 5, 10, 20, 25];
export const TSP_DEFAULT = { n: 5, seed: 7 };

export const OPENING = {
  knapsack: { ...KNAPSACK_DEFAULT, state: 'w', direction: 'down' },
  lis: { array: LIS_DEFAULT, state: 'end' },
  chain: { dims: CHAIN_DEFAULT, state: 'ij', order: 'length' },
  tsp: { ...TSP_DEFAULT, state: 'ml' },
} as const;

// ── hostile input ──────────────────────────────────────────────────────────

/** Weights and values typed as two lists: same length, 4 to 8 items, weights 1..12 (a weight of 0 or less is refused), values 0..99. */
export function parseItems(weights: string, values: string): Result<Item[]> {
  const w = parseBoundedList(weights, { min: ITEMS_MIN, max: ITEMS_MAX, lo: 1, hi: WEIGHT_MAX, noun: 'weights' });
  if (!w.ok) return w;
  const v = parseBoundedList(values, { min: ITEMS_MIN, max: ITEMS_MAX, lo: 0, hi: VALUE_MAX, noun: 'values' });
  if (!v.ok) return v;
  if (w.value.length !== v.value.length) return { ok: false, error: `${w.value.length} weights but ${v.value.length} values: give each item one of each.` };
  return { ok: true, value: w.value.map((wt, i) => ({ w: wt, v: v.value[i] })) };
}

export const parseSequence = (text: string): Result<number[]> => parseBoundedList(text, { min: LIS_MIN, max: LIS_MAX, lo: -LIS_ABS, hi: LIS_ABS, noun: 'values' });

/** Matrix dimensions p0..pn: 3 to 6 matrices means 4 to 7 numbers, each 1..30 (a zero dimension is refused). */
export const parseDims = (text: string): Result<number[]> => parseBoundedList(text, { min: MATRICES_MIN + 1, max: MATRICES_MAX + 1, lo: 1, hi: DIM_MAX, noun: 'dimensions' });

export const itemsText = (items: readonly Item[], pick: 'w' | 'v') => items.map((i) => i[pick]).join(', ');

// ── counterexamples the lesson found against the brute force ───────────────
const SEARCH_SEED = 5;
const SEARCH_LIMIT = 5000;

function search<T>(make: (rnd: () => number) => T, wrong: (x: T) => boolean): T {
  const rnd = mulberry32(SEARCH_SEED);
  for (let i = 0; i < SEARCH_LIMIT; i++) {
    const x = make(rnd);
    if (wrong(x)) return x;
  }
  throw new Error('no counterexample found');
}

export function knapsackCounterexample(): KnapsackInput & { wrong: number; right: number } {
  const found = search(
    (rnd) => ({ items: Array.from({ length: 3 }, () => ({ w: 1 + Math.floor(rnd() * 6), v: 1 + Math.floor(rnd() * 9) })), cap: 3 + Math.floor(rnd() * 6) }),
    (x) => knapsackPrefixOnly(x.items, x.cap).at(-1)!.value !== knapsackOptimum(x.items, x.cap),
  );
  return { ...found, wrong: knapsackPrefixOnly(found.items, found.cap).at(-1)!.value, right: knapsackOptimum(found.items, found.cap) };
}

export function lisCounterexample(): { array: number[]; wrong: number; right: number } {
  const array = search((rnd) => Array.from({ length: 5 }, () => 1 + Math.floor(rnd() * 9)), (a) => lisPrefixOnly(a).at(-1)!.len !== lisEndingAt(a).length);
  return { array, wrong: lisPrefixOnly(array).at(-1)!.len, right: lisEndingAt(array).length };
}

export function chainCounterexample(): { dims: number[]; wrong: number; right: number } {
  const dims = search((rnd) => Array.from({ length: 5 }, () => 1 + Math.floor(rnd() * 9)), (d) => chainPrefixOnly(d)[d.length - 1] !== chainTable(d).answer);
  return { dims, wrong: chainPrefixOnly(dims)[dims.length - 1], right: chainTable(dims).answer };
}

export const distances = (n: number, seed: number): Matrix => seededDistances(n, mulberry32(seed));

export function tspCounterexamples(): { mask: { n: number; seed: number }; last: { n: number; seed: number } } {
  const find = (wrong: (d: Matrix) => boolean) => {
    for (let seed = 1; seed < SEARCH_LIMIT; seed++) if (wrong(distances(CITIES_MIN, seed))) return { n: CITIES_MIN, seed };
    throw new Error('no counterexample found');
  };
  return {
    mask: find((d) => tspMaskOnly(d).best !== tspBitmask(d).best),
    last: find((d) => tspLastOnly(d).best !== tspBitmask(d).best),
  };
}
