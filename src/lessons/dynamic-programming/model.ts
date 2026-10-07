/** The DP lesson's pure pieces: Fibonacci call counts and the LCS recurrence, fill and walk back. */

export type Style = 'topdown' | 'bottomup';
export type Cell = [number, number];

// ── Fibonacci ──────────────────────────────────────────────────────

/** Calls made by naive recursive fib(n): C(0) = C(1) = 1, C(n) = C(n-1) + C(n-2) + 1. */
export function naiveCalls(n: number) {
  let a = 1; // C(0)
  let b = 1; // C(1)
  if (n === 0) return 1;
  for (let k = 2; k <= n; k++) [a, b] = [b, a + b + 1];
  return b;
}

/** Calls a memoized fib(n) makes: each k in 2..n calls fib(k-1) (a new call) and fib(k-2) (a cache hit). */
export const memoCalls = (n: number) => Math.max(1, 2 * n - 1);

// ── Longest common subsequence ─────────────────────────────────────

export type LcsTable = (number | null)[][];

/** Row 0 and column 0 are 0 (an empty string shares nothing); every other cell starts unknown. */
export const blankTable = (m: number, n: number): LcsTable =>
  Array.from({ length: m + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => (i === 0 || j === 0 ? 0 : null)));

export interface LcsStep {
  match: boolean;
  /** The cells this one reads. */
  deps: Cell[];
  /** The one its value came from. Ties go up. */
  chosen: Cell;
}

/** Fill dp[i][j] from its neighbours: diagonal + 1 on a match, else the larger of up and left. */
export function lcsStep(dp: LcsTable, a: string, b: string, i: number, j: number): LcsStep {
  if (a[i - 1] === b[j - 1]) {
    dp[i][j] = dp[i - 1][j - 1]! + 1;
    return { match: true, deps: [[i - 1, j - 1]], chosen: [i - 1, j - 1] };
  }
  const up = dp[i - 1][j]!;
  const lf = dp[i][j - 1]!;
  dp[i][j] = Math.max(up, lf);
  return { match: false, deps: [[i - 1, j], [i, j - 1]], chosen: up >= lf ? [i - 1, j] : [i, j - 1] };
}

/** Bottom-up: every cell, row by row. */
export function lcsBottomUp(a: string, b: string): LcsTable {
  const dp = blankTable(a.length, b.length);
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) lcsStep(dp, a, b, i, j);
  return dp;
}

/** One step of the walk back from (i, j): diagonal on a match, else toward the larger neighbour (up on a tie). */
export function backStep(dp: LcsTable, a: string, b: string, i: number, j: number): 'diag' | 'up' | 'left' {
  if (a[i - 1] === b[j - 1]) return 'diag';
  return (dp[i - 1][j] ?? -1) >= (dp[i][j - 1] ?? -1) ? 'up' : 'left';
}

/** Walk back from the bottom-right corner, collecting matched letters. */
export function lcsWalkBack(dp: LcsTable, a: string, b: string): { answer: string; path: Cell[] } {
  let i = a.length;
  let j = b.length;
  let answer = '';
  const path: Cell[] = [];
  while (i > 0 && j > 0) {
    path.push([i, j]);
    const step = backStep(dp, a, b, i, j);
    if (step === 'diag') {
      answer = a[i - 1] + answer;
      i--;
      j--;
    } else if (step === 'up') i--;
    else j--;
  }
  return { answer, path };
}
