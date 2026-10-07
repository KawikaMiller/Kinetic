/**
 * Scene 2: a binary search run for real, with its loop invariant checked on the actual
 * state at the top of every iteration:
 *
 *   0 ≤ lo ≤ hi + 1 ≤ n, and if target is in a, its index is in [lo, hi].
 *
 * The variant (range size hi − lo + 1) must shrink every iteration, which is what proves the
 * loop ends; at exit, the invariant plus "lo > hi" (an empty range) is what justifies -1.
 * Each injected bug changes one line and breaks exactly one of those checks.
 */

export type Bug = 'none' | 'lo-mid' | 'lt' | 'hi-n';
export const BUGS: readonly Bug[] = ['none', 'lo-mid', 'lt', 'hi-n'];

/** The infinite loop is stopped here so it can be seen. */
export const ITERATION_CAP = 50;

const BASE = [
  'function search(a, target) {',
  '  let lo = 0, hi = a.length - 1;',
  '  while (lo <= hi) {',
  '    const mid = (lo + hi) >> 1;   // floor of the midpoint',
  '    if (a[mid] === target) return mid;',
  '    if (a[mid] < target) lo = mid + 1;',
  '    else hi = mid - 1;',
  '  }',
  '  return -1;',
  '}',
];
/** Each bug's one changed line. */
export const BUG_LINE: Record<Exclude<Bug, 'none'>, { line: number; text: string }> = {
  'lo-mid': { line: 5, text: '    if (a[mid] < target) lo = mid;' },
  lt: { line: 2, text: '  while (lo < hi) {' },
  'hi-n': { line: 1, text: '  let lo = 0, hi = a.length;' },
};
export const LINE = { init: 1, loop: 2, mid: 3, found: 4, right: 5, left: 6, notFound: 8 } as const;

export function sourceFor(bug: Bug): string[] {
  const src = [...BASE];
  if (bug !== 'none') src[BUG_LINE[bug].line] = BUG_LINE[bug].text;
  return src;
}

export interface Check {
  /** 0 ≤ lo ≤ hi + 1 ≤ n. */
  bounds: boolean;
  /** Target absent, or its index in [lo, hi]. */
  contains: boolean;
}
export const invariantHolds = (c: Check) => c.bounds && c.contains;

export interface Iteration {
  lo: number;
  hi: number;
  check: Check;
  /** Range size at the top of this iteration. */
  size: number;
  mid: number;
  /** a[mid]; undefined when mid is outside the array. */
  value: number | undefined;
  outcome: 'found' | 'right' | 'left';
  /** Range size after this iteration's update (null once found). */
  sizeAfter: number | null;
}

export type Verdict =
  /** Invariant held, the variant shrank, and the exit justified the answer. */
  | { kind: 'ok' }
  /** The invariant was false at the top of iteration `at` (0 = before the first). */
  | { kind: 'invariant'; at: number; part: 'bounds' | 'contains' }
  /** The variant stopped shrinking at iteration `at`, and the loop hit the cap. */
  | { kind: 'non-termination'; at: number }
  /** The loop stopped with the range still non-empty, so "-1" wasn't justified. */
  | { kind: 'exit'; wrongAnswer: boolean };

export interface SearchRun {
  iterations: Iteration[];
  /** The loop head after the last iteration (or the only one), where it decided to stop. */
  exit: { lo: number; hi: number; check: Check } | null;
  /** The returned index; null when the cap stopped it. */
  result: number | null;
  /** Some iteration read a[mid] outside the array. */
  outOfBounds: boolean;
  verdict: Verdict;
}

function checkAt(a: readonly number[], target: number, lo: number, hi: number): Check {
  const idx = a.indexOf(target);
  return { bounds: 0 <= lo && lo <= hi + 1 && hi + 1 <= a.length, contains: idx < 0 || (lo <= idx && idx <= hi) };
}

/** Runs the (possibly buggy) search on a sorted array of distinct numbers. */
export function runSearch(a: readonly number[], target: number, bug: Bug = 'none'): SearchRun {
  let lo = 0;
  let hi = bug === 'hi-n' ? a.length : a.length - 1;
  const keepGoing = (l: number, h: number) => (bug === 'lt' ? l < h : l <= h);
  const iterations: Iteration[] = [];
  let result: number | null = null;
  let outOfBounds = false;

  while (true) {
    if (!keepGoing(lo, hi)) {
      result = -1;
      break;
    }
    if (iterations.length === ITERATION_CAP) break;
    const check = checkAt(a, target, lo, hi);
    const mid = (lo + hi) >> 1;
    const value = mid >= 0 && mid < a.length ? a[mid] : undefined;
    if (value === undefined) outOfBounds = true;
    const it: Iteration = { lo, hi, check, size: hi - lo + 1, mid, value, outcome: 'left', sizeAfter: null };
    iterations.push(it);
    // Comparisons exactly as JavaScript does them: undefined === x and undefined < x are both false.
    if (value === target) {
      it.outcome = 'found';
      result = mid;
      break;
    }
    if (value !== undefined && value < target) {
      it.outcome = 'right';
      lo = bug === 'lo-mid' ? mid : mid + 1;
    } else {
      it.outcome = 'left';
      hi = mid - 1;
    }
    it.sizeAfter = hi - lo + 1;
  }

  const exit = result === null || iterations.at(-1)?.outcome === 'found' ? null : { lo, hi, check: checkAt(a, target, lo, hi) };
  return { iterations, exit, result, outOfBounds, verdict: verdictOf(a, target, iterations, exit, result) };
}

function verdictOf(a: readonly number[], target: number, its: Iteration[], exit: SearchRun['exit'], result: number | null): Verdict {
  const checks = [...its.map((i) => i.check), ...(exit ? [exit.check] : [])];
  const broken = checks.findIndex((c) => !invariantHolds(c));
  if (broken >= 0) return { kind: 'invariant', at: broken, part: checks[broken].bounds ? 'contains' : 'bounds' };
  if (result === null) return { kind: 'non-termination', at: its.findIndex((i) => i.sizeAfter !== null && i.sizeAfter >= i.size) };
  if (exit && exit.lo <= exit.hi) return { kind: 'exit', wrongAnswer: (result === -1) !== (a.indexOf(target) < 0) };
  return { kind: 'ok' };
}
