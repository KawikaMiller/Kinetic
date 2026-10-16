/** Input monitors: the population stability index over baseline-decile bins, and the two-sample KS statistic. */

import { ksAgainstSorted } from '../../core/distributions';

/** A share of 0 is floored here so the logarithm stays finite. */
export const PSI_FLOOR = 1e-4;
/** Rule-of-thumb PSI bands: 0.1 and 0.25, from memory, not a standard. */
export const PSI_WATCH = 0.1;
export const PSI_ALERT = 0.25;
export const BINS = 10;

/** PSI = sum over bins of (a - e) ln(a / e), with expected shares e and actual shares a. */
export function psi(expected: readonly number[], actual: readonly number[]): number {
  if (expected.length !== actual.length) throw new RangeError('bins differ');
  let total = 0;
  for (let i = 0; i < expected.length; i++) {
    const e = Math.max(expected[i], PSI_FLOOR);
    const a = Math.max(actual[i], PSI_FLOOR);
    total += (a - e) * Math.log(a / e);
  }
  return total;
}

/** Inner bin edges at the baseline's deciles (nearest-rank on the sorted baseline). */
export function decileEdges(baseline: readonly number[], bins = BINS): number[] {
  const sorted = [...baseline].sort((a, b) => a - b);
  return Array.from({ length: bins - 1 }, (_, i) => sorted[Math.min(sorted.length - 1, Math.floor(((i + 1) * sorted.length) / bins))]);
}

/** Share of `values` in each bin: bin i holds values below edges[i] (and at or above edges[i - 1]). */
export function binShares(values: readonly number[], edges: readonly number[]): number[] {
  const counts = new Array<number>(edges.length + 1).fill(0);
  for (const v of values) {
    let b = 0;
    while (b < edges.length && v >= edges[b]) b++;
    counts[b]++;
  }
  return counts.map((c) => c / values.length);
}

const byValue = (p: number, q: number) => p - q;

/** What a monitor compares each day with. */
export interface Baseline {
  edges: readonly number[];
  shares: readonly number[];
  sample: readonly number[];
  /** The sample in ascending order, so a day's KS reading sorts only the day. */
  sorted: readonly number[];
}

export function makeBaseline(sample: readonly number[]): Baseline {
  const edges = decileEdges(sample);
  return { edges, shares: binShares(sample, edges), sample, sorted: [...sample].sort(byValue) };
}

export interface MonitorReading {
  psi: number;
  ks: number;
}

export const readDay = (baseline: Baseline, values: readonly number[]): MonitorReading => ({
  psi: psi(baseline.shares, binShares(values, baseline.edges)),
  ks: ksAgainstSorted(values, baseline.sorted),
});
