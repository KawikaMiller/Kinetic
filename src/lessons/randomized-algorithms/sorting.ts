import type { Rnd } from '../../core/random';
import { mulberry32 } from '../../core/random';
import { histogram, type Histogram } from '../../core/stats';

export type PivotRule = 'first' | 'median3' | 'random';

/** One key: a value, with its original position breaking ties so every key is distinct. */
interface Key {
  v: number;
  i: number;
}
const less = (a: Key, b: Key) => a.v < b.v || (a.v === b.v && a.i < b.i);

export interface SortRun {
  comparisons: number;
  sorted: number[];
}

/**
 * Quicksort counting key comparisons: each partition compares every other element in the segment with the pivot once.
 * Partitions are stable (the elements below the pivot, then those above, each in input order), so a segment is always a
 * subsequence of the input. Ties are broken by position, so duplicate values behave like distinct keys.
 */
export function quicksort(values: readonly number[], rule: PivotRule, rnd: Rnd = mulberry32(0)): SortRun {
  const keys: Key[] = values.map((v, i) => ({ v, i }));
  const out: Key[] = [];
  let comparisons = 0;
  // An explicit stack: a fixed pivot on sorted input recurses n deep.
  const todo: (Key[] | Key)[] = [keys];
  while (todo.length) {
    const item = todo.pop()!;
    if (!Array.isArray(item)) {
      out.push(item);
      continue;
    }
    const seg = item;
    if (seg.length <= 1) {
      out.push(...seg);
      continue;
    }
    const pivot = choosePivot(seg, rule, rnd);
    const below: Key[] = [];
    const above: Key[] = [];
    for (const k of seg) {
      if (k === pivot) continue;
      comparisons++;
      (less(k, pivot) ? below : above).push(k);
    }
    todo.push(above, pivot, below);
  }
  return { comparisons, sorted: out.map((k) => k.v) };
}

function choosePivot(seg: readonly Key[], rule: PivotRule, rnd: Rnd): Key {
  if (rule === 'first' || seg.length < 3) return seg[0];
  if (rule === 'random') return seg[Math.floor(rnd() * seg.length)];
  const [a, b, c] = [seg[0], seg[(seg.length - 1) >> 1], seg[seg.length - 1]];
  if (less(a, b)) return less(b, c) ? b : less(a, c) ? c : a;
  return less(a, c) ? a : less(b, c) ? c : b;
}

export const MAX_N = 2000;
export const MIN_N = 8;

/** The input shapes of the lesson (a custom array comes from the learner). */
export type Shape = 'sorted' | 'reverse' | 'organ' | 'random';

export function shapeArray(shape: Shape, n: number, seed: number): number[] {
  switch (shape) {
    case 'sorted':
      return Array.from({ length: n }, (_, i) => i + 1);
    case 'reverse':
      return Array.from({ length: n }, (_, i) => n - i);
    case 'organ':
      return Array.from({ length: n }, (_, i) => Math.min(i + 1, n - i));
    case 'random': {
      const rnd = mulberry32(seed);
      const a = Array.from({ length: n }, (_, i) => i + 1);
      for (let i = n - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    }
  }
}

/**
 * An input built against median-of-three (first, middle, last): at every level the sample holds the two smallest
 * remaining keys and one larger one, so the pivot is the second smallest and a partition peels off two keys.
 */
export function median3Killer(n: number): number[] {
  const build = (m: number): number[] => {
    if (m <= 2) return Array.from({ length: m }, (_, i) => i + 1);
    const rest = build(m - 2).map((r) => r + 2);
    const seg: number[] = new Array<number>(m);
    const mid = (m - 1) >> 1;
    seg[0] = 1;
    seg[mid] = 2;
    let next = 0;
    for (let p = 1; p < m; p++) if (p !== mid) seg[p] = rest[next++];
    return seg;
  };
  return build(n);
}

/** The input an adversary who knows the rule would hand it. Random pivot has none: sorted is as bad as any other. */
export function adversaryFor(rule: PivotRule, n: number): number[] {
  return rule === 'median3' ? median3Killer(n) : shapeArray('sorted', n, 0);
}

export const fixedPivotWorst = (n: number): number => (n * (n - 1)) / 2;

/** The exact expected comparisons of random-pivot quicksort on n distinct keys: 2(n+1)H_n - 4n. */
export function expectedComparisons(n: number): number {
  let h = 0;
  for (let k = 1; k <= n; k++) h += 1 / k;
  return 2 * (n + 1) * h - 4 * n;
}

/** The same expectation from the recurrence C(n) = (n-1) + (2/n) * sum of C(i) for i < n, for n = 0..maxN. */
export function expectedByRecurrence(maxN: number): number[] {
  const c = [0];
  let sum = 0;
  for (let n = 1; n <= maxN; n++) {
    c.push(n - 1 + (2 / n) * sum);
    sum += c[n];
  }
  return c;
}

export const RUNS = 1000;

/** Comparison counts of `runs` seeded random-pivot sorts of the same input. */
export function randomPivotCounts(values: readonly number[], runs: number, seed: number): number[] {
  const rnd = mulberry32(seed);
  return Array.from({ length: runs }, () => quicksort(values, 'random', rnd).comparisons);
}

export const HIST_BINS = 24;
export function countsHistogram(counts: readonly number[]): Histogram {
  const min = Math.min(...counts);
  const max = Math.max(...counts);
  return histogram(counts, { bins: HIST_BINS, min, max: max === min ? min + 1 : max });
}

/** Share of the runs that took more than `factor` times the expectation. */
export const tailShare = (counts: readonly number[], expected: number, factor: number): number => counts.filter((c) => c > factor * expected).length / counts.length;
