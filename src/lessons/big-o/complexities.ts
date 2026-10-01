import { superscript } from '../../core/format';

/** Narrow no-break space: there is no superscript comma, so long exponents group like "10³⁰¹ ⁰²⁹". */
const EXP_GROUP = ' ';

/** 10 to a (possibly huge) integer power, with the exponent's digits grouped in threes. */
export function tenTo(k: number): string {
  const digits = superscript(k);
  const groups: string[] = [];
  for (let end = digits.length; end > 0; end -= 3) groups.unshift(digits.slice(Math.max(0, end - 3), end));
  return `10${groups.join(EXP_GROUP)}`;
}

export type CxId = 'c1' | 'log' | 'n' | 'nlogn' | 'n2' | 'exp';

export interface Complexity {
  id: CxId;
  label: string;
  color: string;
  /** Caption chip class in the same colour as the curve (`hl <chip>`). */
  chip: string;
  example: string;
  /** Operations for input size n. */
  f: (n: number) => number;
  /** log10 of the operation count; stays finite for n = 1,000,000,000. */
  log10: (n: number) => number;
}

const lg = (n: number) => Math.log2(Math.max(1, n));

export const COMPLEXITIES: Complexity[] = [
  { id: 'c1', label: 'O(1)', color: 'var(--ok)', chip: 'ok', example: 'array index, hash lookup',
    f: () => 1, log10: () => 0 },
  { id: 'log', label: 'O(log n)', color: 'var(--info)', chip: 'info', example: 'binary search',
    f: (n) => lg(n), log10: (n) => Math.log10(Math.max(1, lg(n))) },
  { id: 'n', label: 'O(n)', color: 'var(--violet)', chip: 'violet', example: 'loop over every item',
    f: (n) => n, log10: (n) => Math.log10(n) },
  { id: 'nlogn', label: 'O(n log n)', color: 'var(--amber)', chip: 'bo-amber', example: 'merge sort, quicksort',
    f: (n) => n * lg(n), log10: (n) => Math.log10(n) + Math.log10(Math.max(1, lg(n))) },
  { id: 'n2', label: 'O(n²)', color: 'var(--orange)', chip: 'bo-orange', example: 'nested loops, bubble sort',
    f: (n) => n * n, log10: (n) => 2 * Math.log10(n) },
  { id: 'exp', label: 'O(2ⁿ)', color: 'var(--bad)', chip: 'bad', example: 'try every subset',
    f: (n) => Math.pow(2, n), log10: (n) => n * Math.LOG10E * Math.LN2 },
];

export const complexity = (id: CxId) => COMPLEXITIES.find((c) => c.id === id)!;

/** Below this many digits a count is written out in full; above it, as a power of ten. */
const FULL_DIGITS = 15;

/** An operation count of 10^log10, written out ("1,000") or as a power ("10³⁰¹ ⁰²⁹"). */
export function fmtOps(log10: number): string {
  if (log10 < FULL_DIGITS) return Math.round(Math.pow(10, log10)).toLocaleString();
  return tenTo(Math.floor(log10));
}

/** The same count with its unit: "1 op", "20 ops", "10³⁰ ops". */
export function fmtOpsCount(log10: number): string {
  const text = fmtOps(log10);
  return `${text} ${text === '1' ? 'op' : 'ops'}`;
}

/** Age of the universe in seconds (13.8 billion years). */
export const UNIVERSE_S = 4.35e17;
/** Seconds in a (365-day) year, roughly. */
const YEAR_S = 3.15e7;

/** Human time for 10^log10 operations at 1 µs each. */
export function fmtTime(log10ops: number): string {
  const log10s = log10ops - 6;
  if (log10s > Math.log10(UNIVERSE_S) + 1) {
    const times = log10s - Math.log10(UNIVERSE_S);
    return times < FULL_DIGITS
      ? `${Math.round(Math.pow(10, times)).toLocaleString()}× the age of the universe`
      : `${tenTo(Math.floor(times))}× the age of the universe`;
  }
  const s = Math.pow(10, log10s);
  if (s < 1e-3) return `${+(s * 1e6).toPrecision(3)} µs`;
  if (s < 1) return `${+(s * 1e3).toPrecision(3)} ms`;
  if (s < 60) return `${+s.toPrecision(3)} s`;
  if (s < 3600) return `${+(s / 60).toPrecision(3)} min`;
  if (s < 86400) return `${+(s / 3600).toPrecision(3)} hours`;
  if (s < YEAR_S) return `${+(s / 86400).toPrecision(3)} days`;
  return `${Math.round(s / YEAR_S).toLocaleString()} years`;
}
