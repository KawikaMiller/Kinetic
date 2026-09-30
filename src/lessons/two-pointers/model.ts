// Two-pointer algorithms as pure traces: every comparison is recorded so the stage can replay it.

export type PairMove = 'found' | 'move-r' | 'move-l';

export interface PairCheck {
  l: number;
  r: number;
  sum: number;
  /** What the sum tells us: found it, too big (R moves left), too small (L moves right). */
  move: PairMove;
}

export interface PairTrace {
  checks: PairCheck[];
  pair: [number, number] | null;
}

/** Pair sum on a sorted array: L from the left, R from the right, squeezing inwards. */
export function twoPointerPairSum(arr: readonly number[], target: number): PairTrace {
  const checks: PairCheck[] = [];
  let l = 0;
  let r = arr.length - 1;
  while (l < r) {
    const sum = arr[l] + arr[r];
    if (sum === target) {
      checks.push({ l, r, sum, move: 'found' });
      return { checks, pair: [l, r] };
    }
    const move: PairMove = sum > target ? 'move-r' : 'move-l';
    checks.push({ l, r, sum, move });
    if (move === 'move-r') r--;
    else l++;
  }
  return { checks, pair: null };
}

/** The O(n²) reference: the first pair i < j (in reading order) that sums to the target. */
export function bruteForcePairSum(arr: readonly number[], target: number): [number, number] | null {
  for (let i = 0; i < arr.length; i++) {
    for (let j = i + 1; j < arr.length; j++) if (arr[i] + arr[j] === target) return [i, j];
  }
  return null;
}

/** How many pairs brute force has to consider in the worst case. */
export const allPairsCount = (n: number) => (n * (n - 1)) / 2;

export const pairKey = (i: number, j: number) => `${i},${j}`;

/**
 * The pairs a check proves impossible (on a sorted array). Too big: arr[r] plus anything
 * from L onwards is at least as big, so R's whole column goes. Too small: arr[l] plus
 * anything up to R is at most as big, so L's whole row goes.
 */
export function pairsRuledOut(check: PairCheck): [number, number][] {
  const out: [number, number][] = [];
  if (check.move === 'move-r') for (let i = check.l; i < check.r; i++) out.push([i, check.r]);
  if (check.move === 'move-l') for (let j = check.l + 1; j <= check.r; j++) out.push([check.l, j]);
  return out;
}

export const isSortedAscending = (arr: readonly number[]) => arr.every((v, i) => i === 0 || arr[i - 1] <= v);

export interface PalindromeCheck {
  l: number;
  r: number;
  match: boolean;
}

/** Compare the two ends and walk inwards; stop at the first mismatch. */
export function palindromeTrace(s: string): { checks: PalindromeCheck[]; isPalindrome: boolean } {
  const checks: PalindromeCheck[] = [];
  let l = 0;
  let r = s.length - 1;
  while (l < r) {
    const match = s[l] === s[r];
    checks.push({ l, r, match });
    if (!match) return { checks, isPalindrome: false };
    l++;
    r--;
  }
  return { checks, isPalindrome: true };
}

export interface DedupeStep {
  slow: number;
  fast: number;
  /** The array after this step (it's rewritten in place). */
  values: number[];
  /** True when arr[fast] was new and got copied to arr[slow]. */
  wrote: boolean;
}

/**
 * Remove duplicates from a sorted array in place. `slow` marks the end of the unique
 * prefix; `fast` scans ahead. Returns every step plus the new length k: the first k
 * values are the answer, whatever sits after them is leftover.
 */
export function dedupeTrace(sorted: readonly number[]): { steps: DedupeStep[]; length: number; values: number[] } {
  const a = [...sorted];
  const steps: DedupeStep[] = [];
  if (a.length === 0) return { steps, length: 0, values: a };
  let slow = 0;
  for (let fast = 1; fast < a.length; fast++) {
    const wrote = a[fast] !== a[slow];
    if (wrote) {
      slow++;
      a[slow] = a[fast];
    }
    steps.push({ slow, fast, values: [...a], wrote });
  }
  return { steps, length: slow + 1, values: a };
}

/** Parse "1, 3, 4" into numbers; null if anything isn't an integer. */
export function parseNumbers(text: string): number[] | null {
  const parts = text.split(/[\s,]+/).filter(Boolean);
  if (!parts.length) return null;
  const nums = parts.map(Number);
  return nums.every(Number.isInteger) ? nums : null;
}
