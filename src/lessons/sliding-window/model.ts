// Sliding-window algorithms as pure traces. The window is [l, r] inclusive; r < l means empty.
// Each index enters once (r moves right) and leaves at most once (l moves right): <= 2n moves.

export type WindowEvent = 'enter' | 'leave';
export type Span = [number, number];

export interface WindowStep {
  event: WindowEvent;
  /** The index that just entered or left. */
  index: number;
  l: number;
  r: number;
  /** Sum of the window (number problems) or its length (the string problem). */
  value: number;
  best: Span | null;
  /** Character counts inside the window (string problem only). */
  counts?: Record<string, number>;
}

export interface WindowTrace {
  steps: WindowStep[];
  best: Span | null;
}

export const spanLength = (s: Span | null) => (s ? s[1] - s[0] + 1 : 0);
const sumOf = (a: readonly number[], s: Span) => a.slice(s[0], s[1] + 1).reduce((x, y) => x + y, 0);

/** Longest run of characters with no repeats: grow right, shrink left while a character repeats. */
export function longestUnique(s: string): WindowTrace {
  const steps: WindowStep[] = [];
  const counts: Record<string, number> = {};
  let best: Span | null = null;
  let l = 0;
  const push = (event: WindowEvent, index: number, r: number) =>
    steps.push({ event, index, l, r, value: r - l + 1, best, counts: { ...counts } });
  for (let r = 0; r < s.length; r++) {
    counts[s[r]] = (counts[s[r]] ?? 0) + 1;
    if (counts[s[r]] === 1 && r - l + 1 > spanLength(best)) best = [l, r];
    push('enter', r, r);
    while (counts[s[r]] > 1) {
      const gone = s[l];
      counts[gone]--;
      if (counts[gone] === 0) delete counts[gone];
      l++;
      if (counts[s[r]] === 1 && r - l + 1 > spanLength(best)) best = [l, r];
      push('leave', l - 1, r);
    }
  }
  return { steps, best };
}

/** Maximum sum of any k consecutive numbers: one enters, one leaves, the window never restarts. */
export function maxSumOfK(a: readonly number[], k: number): WindowTrace {
  const steps: WindowStep[] = [];
  let best: Span | null = null;
  let bestSum = -Infinity;
  let sum = 0;
  let l = 0;
  for (let r = 0; r < a.length; r++) {
    sum += a[r];
    const full = r - l + 1 === k;
    if (full && sum > bestSum) {
      bestSum = sum;
      best = [l, r];
    }
    steps.push({ event: 'enter', index: r, l, r, value: sum, best });
    if (full && r < a.length - 1) {
      sum -= a[l];
      l++;
      steps.push({ event: 'leave', index: l - 1, l, r, value: sum, best });
    }
  }
  return { steps, best };
}

/**
 * Shortest run whose sum is at least `target`. Grow until the sum is big enough, then shrink
 * while it stays big enough, recording each qualifying window. Needs non-negative numbers:
 * with negatives, shrinking can make the sum go up and the one-pass argument breaks.
 */
export function shortestAtLeast(a: readonly number[], target: number): WindowTrace {
  const steps: WindowStep[] = [];
  let best: Span | null = null;
  let sum = 0;
  let l = 0;
  for (let r = 0; r < a.length; r++) {
    sum += a[r];
    if (sum >= target && (!best || r - l + 1 < spanLength(best))) best = [l, r];
    steps.push({ event: 'enter', index: r, l, r, value: sum, best });
    while (sum >= target && l <= r) {
      sum -= a[l];
      l++;
      if (sum >= target && l <= r && r - l + 1 < spanLength(best)) best = [l, r];
      steps.push({ event: 'leave', index: l - 1, l, r, value: sum, best });
    }
  }
  return { steps, best };
}

// Brute-force references: try every window.

export function bruteLongestUnique(s: string): number {
  let best = 0;
  for (let i = 0; i < s.length; i++) {
    for (let j = i; j < s.length; j++) if (new Set(s.slice(i, j + 1)).size === j - i + 1) best = Math.max(best, j - i + 1);
  }
  return best;
}

export function bruteMaxSumOfK(a: readonly number[], k: number): number | null {
  let best: number | null = null;
  for (let i = 0; i + k <= a.length; i++) {
    const s = sumOf(a, [i, i + k - 1]);
    if (best === null || s > best) best = s;
  }
  return best;
}

export function bruteShortestAtLeast(a: readonly number[], target: number): number {
  let best = 0;
  for (let i = 0; i < a.length; i++) {
    for (let j = i; j < a.length; j++) if (sumOf(a, [i, j]) >= target && (!best || j - i + 1 < best)) best = j - i + 1;
  }
  return best;
}

export { sumOf };

/**
 * Parse "4, 2 12" into integers; null if anything isn't one. Same as two-pointers' copy:
 * a shared core helper is a Phase 2 request (lessons don't import each other).
 */
export function parseNumbers(text: string): number[] | null {
  const nums = text.split(/[\s,]+/).filter(Boolean).map(Number);
  return nums.length && nums.every(Number.isInteger) ? nums : null;
}

/** Windows brute force looks at: every [i, j] with i <= j. */
export const allWindows = (n: number) => (n * (n + 1)) / 2;
