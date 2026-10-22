/**
 * count-min-heavy-hitters: the Count-Min sketch itself. A d x w grid of counters; each row has its own hash from a real
 * pairwise-independent family, h(x) = ((a*x + b) mod p) mod w with p = 2^31 - 1 and seeded a, b. An update adds to one cell per row,
 * and the estimate of an item is the smallest of its d cells. `update` writes into the grid it is given (a sketch is a big mutable array
 * by nature); everything else is pure.
 */
import { fnv1a } from '../hash';
import { mulberry32 } from '../random';

export const PRIME = 2 ** 31 - 1;
export const MIN_WIDTH = 4;
export const MAX_WIDTH = 2048;
export const MIN_DEPTH = 1;
export const MAX_DEPTH = 8;

export interface Family {
  a: readonly number[];
  b: readonly number[];
}

/** `d` seeded hash functions: a in [1, p - 1], b in [0, p - 1] for each row. */
export function makeFamily(seed: number, d: number): Family {
  const rnd = mulberry32(seed);
  const a: number[] = [];
  const b: number[] = [];
  for (let i = 0; i < d; i++) {
    a.push(1 + Math.floor(rnd() * (PRIME - 1)));
    b.push(Math.floor(rnd() * PRIME));
  }
  return { a, b };
}

/** An item as the integer the hash family takes: FNV-1a of its name, reduced below p. */
export const itemKey = (item: string): number => fnv1a(item) % PRIME;

const HALF = 2 ** 16;
/** (a * x) mod p for a < 2^31 and x < 2^31, without leaving the 53 exact bits of a double. */
export const mulmod = (a: number, x: number): number => {
  const high = ((a * Math.floor(x / HALF)) % PRIME) * HALF;
  return (high + a * (x % HALF)) % PRIME;
};

/** The column row `row` sends key `x` to. */
export const column = (fam: Family, row: number, x: number, w: number): number => ((mulmod(fam.a[row], x) + fam.b[row]) % PRIME) % w;

export interface Sketch {
  w: number;
  d: number;
  fam: Family;
  /** Row-major d x w counters. */
  counts: Int32Array;
  /** Sum of all updates. */
  total: number;
}

export const newSketch = (w: number, d: number, fam: Family): Sketch => ({ w, d, fam, counts: new Int32Array(w * d), total: 0 });

export const cellsOf = (s: Sketch, x: number): { row: number; col: number }[] => Array.from({ length: s.d }, (_, row) => ({ row, col: column(s.fam, row, x, s.w) }));

/** Add `delta` to the item's cell in every row. */
export function update(s: Sketch, x: number, delta = 1): void {
  for (let row = 0; row < s.d; row++) s.counts[row * s.w + column(s.fam, row, x, s.w)] += delta;
  s.total += delta;
}

export type Estimator = 'min' | 'mean';

/** The item's d cells, in row order. */
export const cellValues = (s: Sketch, x: number): number[] => cellsOf(s, x).map((c) => s.counts[c.row * s.w + c.col]);

/** The estimate: the smallest of the item's cells (or, for the broken variant, their mean). */
export function estimate(s: Sketch, x: number, how: Estimator = 'min'): number {
  const v = cellValues(s, x);
  return how === 'min' ? Math.min(...v) : v.reduce((a, b) => a + b, 0) / v.length;
}

/** A new sketch with the same shape and hashes holding the cell-by-cell sum of two. Different hashes are added anyway: the caller sees the result. */
export function addSketches(a: Sketch, b: Sketch): Sketch {
  const sum = newSketch(a.w, a.d, a.fam);
  for (let i = 0; i < sum.counts.length; i++) sum.counts[i] = a.counts[i] + b.counts[i];
  sum.total = a.total + b.total;
  return sum;
}

export const sameGrid = (a: Sketch, b: Sketch): boolean => a.w === b.w && a.d === b.d && a.counts.every((v, i) => v === b.counts[i]);

/** The width and depth the textbook bound asks for: w = ceil(e / epsilon), d = ceil(ln(1 / delta)). */
export const widthFor = (epsilon: number): number => Math.ceil(Math.E / epsilon);
export const depthFor = (delta: number): number => Math.ceil(Math.log(1 / delta));
/** The other way: the epsilon and delta a given width and depth buy. */
export const epsilonOf = (w: number): number => Math.E / w;
export const deltaOf = (d: number): number => Math.exp(-d);
