/** Input monitors: the population stability index over baseline-decile bins, and the two-sample KS statistic. */

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

/** Two-sample Kolmogorov-Smirnov statistic max |F1 - F2|, by a merge of the two sorted samples. */
export function ksTwoSample(a: readonly number[], b: readonly number[]): number {
  const x = [...a].sort((p, q) => p - q);
  const y = [...b].sort((p, q) => p - q);
  let i = 0;
  let j = 0;
  let d = 0;
  while (i < x.length && j < y.length) {
    const v = Math.min(x[i], y[j]);
    while (i < x.length && x[i] <= v) i++;
    while (j < y.length && y[j] <= v) j++;
    d = Math.max(d, Math.abs(i / x.length - j / y.length));
  }
  return d;
}

/** The asymptotic two-sample critical value c(alpha) sqrt((n + m) / (n m)); c(0.05) = 1.358 (from memory of the usual table). */
export const KS_C_05 = 1.358;
export const ksCritical2 = (n: number, m: number, c = KS_C_05): number => c * Math.sqrt((n + m) / (n * m));

/** What a monitor compares each day with. */
export interface Baseline {
  edges: readonly number[];
  shares: readonly number[];
  sample: readonly number[];
}

export function makeBaseline(sample: readonly number[]): Baseline {
  const edges = decileEdges(sample);
  return { edges, shares: binShares(sample, edges), sample };
}

export interface MonitorReading {
  psi: number;
  ks: number;
}

export const readDay = (baseline: Baseline, values: readonly number[]): MonitorReading => ({
  psi: psi(baseline.shares, binShares(values, baseline.edges)),
  ks: ksTwoSample(values, baseline.sample),
});
