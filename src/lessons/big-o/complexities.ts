export type CxId = 'c1' | 'log' | 'n' | 'nlogn' | 'n2' | 'exp';

export interface Complexity {
  id: CxId;
  label: string;
  color: string;
  example: string;
  /** Operations for input size n. */
  f: (n: number) => number;
  /** log10 of the operation count; stays finite for n = 1,000,000,000. */
  log10: (n: number) => number;
}

const lg = (n: number) => Math.log2(Math.max(1, n));

export const COMPLEXITIES: Complexity[] = [
  { id: 'c1', label: 'O(1)', color: 'var(--ok)', example: 'array index, hash lookup',
    f: () => 1, log10: () => 0 },
  { id: 'log', label: 'O(log n)', color: 'var(--info)', example: 'binary search',
    f: (n) => lg(n), log10: (n) => Math.log10(Math.max(1, lg(n))) },
  { id: 'n', label: 'O(n)', color: 'var(--violet)', example: 'loop over every item',
    f: (n) => n, log10: (n) => Math.log10(n) },
  { id: 'nlogn', label: 'O(n log n)', color: 'var(--hi)', example: 'merge sort, quicksort',
    f: (n) => n * lg(n), log10: (n) => Math.log10(n) + Math.log10(Math.max(1, lg(n))) },
  { id: 'n2', label: 'O(n²)', color: 'var(--orange)', example: 'nested loops, bubble sort',
    f: (n) => n * n, log10: (n) => 2 * Math.log10(n) },
  { id: 'exp', label: 'O(2ⁿ)', color: 'var(--bad)', example: 'try every subset',
    f: (n) => Math.pow(2, n), log10: (n) => n * Math.LOG10E * Math.LN2 },
];

export function fmtOps(log10: number): string {
  if (log10 < 15) return Math.round(Math.pow(10, log10)).toLocaleString();
  return `10^${Math.floor(log10).toLocaleString()}`;
}

const UNIVERSE_S = 4.35e17;

/** Human time for 10^log10 operations at 1 µs each. */
export function fmtTime(log10ops: number): string {
  const log10s = log10ops - 6;
  if (log10s > Math.log10(UNIVERSE_S) + 1) {
    const times = log10s - Math.log10(UNIVERSE_S);
    return times < 15
      ? `${Math.round(Math.pow(10, times)).toLocaleString()}× the age of the universe`
      : `10^${Math.floor(times).toLocaleString()}× the age of the universe`;
  }
  const s = Math.pow(10, log10s);
  if (s < 1e-3) return `${+(s * 1e6).toPrecision(3)} µs`;
  if (s < 1) return `${+(s * 1e3).toPrecision(3)} ms`;
  if (s < 60) return `${+s.toPrecision(3)} s`;
  if (s < 3600) return `${+(s / 60).toPrecision(3)} min`;
  if (s < 86400) return `${+(s / 3600).toPrecision(3)} hours`;
  if (s < 3.15e7) return `${+(s / 86400).toPrecision(3)} days`;
  return `${Math.round(s / 3.15e7).toLocaleString()} years`;
}
