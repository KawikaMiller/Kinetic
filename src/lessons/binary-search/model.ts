import { pick, randInt, type Rnd } from '../../core/random';

/** Values are drawn from 1..n×VALUE_SPREAD so a size-n array has room for missing values. */
const VALUE_SPREAD = 3;

/** One binary-search comparison: the live range, the middle index and how the middle compared. */
export interface BinaryStep {
  lo: number;
  hi: number;
  mid: number;
  /** sign(arr[mid] - target): 0 = found, -1 = middle too small, 1 = middle too big. */
  cmp: number;
}

/** `n` distinct values, sorted ascending. */
export function makeArray(n: number, rnd: Rnd = Math.random) {
  const set = new Set<number>();
  while (set.size < n) set.add(randInt(1, n * VALUE_SPREAD, rnd));
  return [...set].sort((a, b) => a - b);
}

/** A value inside the array's range that isn't in it (or one past the end if there are no gaps). */
export function missingValue(arr: readonly number[], rnd: Rnd = Math.random) {
  const have = new Set(arr);
  const gaps: number[] = [];
  for (let v = arr[0] + 1; v < arr[arr.length - 1]; v++) if (!have.has(v)) gaps.push(v);
  return gaps.length ? pick(gaps, rnd) : arr[arr.length - 1] + 1;
}

/** Every comparison binary search makes looking for `target`; the last step has cmp 0 if it was found. */
export function binaryTrace(arr: readonly number[], target: number): BinaryStep[] {
  const steps: BinaryStep[] = [];
  let lo = 0;
  let hi = arr.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const cmp = Math.sign(arr[mid] - target);
    steps.push({ lo, hi, mid, cmp });
    if (cmp === 0) break;
    if (cmp < 0) lo = mid + 1;
    else hi = mid - 1;
  }
  return steps;
}

/** How many elements linear search looks at before finding `target` (all of them if it's missing). */
export function linearChecks(arr: readonly number[], target: number) {
  const i = arr.indexOf(target);
  return i >= 0 ? i + 1 : arr.length;
}

/** The most comparisons binary search can need on n items: ⌈log₂(n + 1)⌉. */
export const binaryWorstCase = (n: number) => Math.ceil(Math.log2(n + 1));
