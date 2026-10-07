import type { ReactNode } from 'react';
import type { Frame } from '../../core/types';
import { backStep, blankTable, lcsStep, naiveCalls, type Cell, type Style } from './model';

// ── Fibonacci ──────────────────────────────────────────────────────

export type FibState = 'empty' | 'filled' | 'stack' | 'active' | 'hit';
export interface FibFrame extends Frame {
  memo: (number | null)[];
  state: FibState[];
  deps: number[];
  calls: number;
  hits: number;
  stack: number[];
}

export function fibFrames(n: number, style: Style): FibFrame[] {
  const memo: (number | null)[] = Array(n + 1).fill(null);
  const state: FibState[] = Array(n + 1).fill('empty');
  const frames: FibFrame[] = [];
  let calls = 0;
  let hits = 0;
  const stack: number[] = [];
  const snap = (deps: number[], say?: ReactNode, extra: Partial<FibFrame> = {}) =>
    frames.push({ memo: memo.slice(), state: state.slice(), deps, calls, hits, stack: stack.slice(), say, ...extra });

  const settle = () => {
    for (let k = 0; k <= n; k++) if (state[k] === 'active' || state[k] === 'hit') state[k] = memo[k] != null ? 'filled' : 'stack';
  };

  if (style === 'bottomup') {
    snap([], <>Bottom-up: start from the smallest cases and fill the table left to right. No recursion at all.</>);
    memo[0] = 0;
    memo[1] = 1;
    state[0] = 'filled';
    state[1] = 'filled';
    calls = 2;
    snap([], <>Base cases: fib(0) = 0 and fib(1) = 1.</>);
    for (let k = 2; k <= n; k++) {
      memo[k] = memo[k - 1]! + memo[k - 2]!;
      calls++;
      state[k] = 'active';
      snap([k - 1, k - 2], (
        <>
          fib({k}) = fib({k - 1}) + fib({k - 2}) = {memo[k - 1]} + {memo[k - 2]} = <b>{memo[k]}</b>. Both inputs are already in the table.
        </>
      ));
      state[k] = 'filled';
    }
  } else {
    snap([], <>Top-down: the same recursion as before, but every answer is written to a <b>memo</b> table the first time it's computed.</>);
    const f = (k: number): number => {
      calls++;
      if (memo[k] != null) {
        hits++;
        settle();
        state[k] = 'hit';
        snap([], <>fib({k}) is already in the memo: <span className="hl info">cache hit</span>, return {memo[k]} instantly. No subtree.</>);
        state[k] = 'filled';
        return memo[k]!;
      }
      stack.push(k);
      settle();
      state[k] = 'active';
      if (k <= 1) {
        memo[k] = k;
        snap([], <>fib({k}) is a base case: {k}. Write it down.</>);
      } else {
        snap([], <>Call fib({k}): not in the memo yet, so recurse.</>);
        const a = f(k - 1);
        const b = f(k - 2);
        memo[k] = a + b;
        settle();
        state[k] = 'active';
        snap([k - 1, k - 2], <>fib({k}) = {a} + {b} = <b>{memo[k]}</b>. Saved to the memo.</>);
      }
      stack.pop();
      state[k] = 'filled';
      return memo[k]!;
    };
    f(n);
    settle();
  }
  snap([], (
    <>
      fib({n}) = <span className="hl ok">{memo[n]}</span>{' '}
      {style === 'topdown' ? <>with <b>{calls}</b> calls ({hits} cache hits)</> : <>by filling <b>{calls}</b> cells, no calls at all</>}. Naive recursion needs{' '}
      <span className="hl bad">{naiveCalls(n).toLocaleString()}</span>.
    </>
  ), { hold: 2.5 });
  return frames;
}

// ── Longest common subsequence ─────────────────────────────────────

export type LcsState = 'empty' | 'base' | 'filled' | 'stack' | 'active' | 'hit' | 'path' | 'pathmatch';
export interface LcsFrame extends Frame {
  dp: (number | null)[][];
  state: LcsState[][];
  cur: Cell | null;
  deps: Cell[];
  chosen: Cell | null;
  match: boolean;
  computed: number;
  hits: number;
  answer: string;
}

export function lcsFrames(a: string, b: string, style: Style): LcsFrame[] {
  const m = a.length;
  const n = b.length;
  const dp = blankTable(m, n);
  const state: LcsState[][] = Array.from({ length: m + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => (i === 0 || j === 0 ? 'base' : 'empty')));
  const frames: LcsFrame[] = [];
  let computed = 0;
  let hits = 0;
  const snap = (extra: Partial<LcsFrame>) =>
    frames.push({
      dp: dp.map((r) => r.slice()),
      state: state.map((r) => r.slice()),
      cur: null, deps: [], chosen: null, match: false, computed, hits, answer: '',
      ...extra,
    });

  const solve = (i: number, j: number) => lcsStep(dp, a, b, i, j);
  const explain = (i: number, j: number, r: ReturnType<typeof solve>) =>
    r.match ? (
      <>
        <span className="hl ok">{a[i - 1]}</span> = <span className="hl ok">{b[j - 1]}</span>: a match! Take the diagonal and add 1 → <b>{dp[i][j]}</b>.
      </>
    ) : (
      <>
        {a[i - 1]} ≠ {b[j - 1]}: take the better of <b>up</b> ({dp[i - 1][j]}) and <b>left</b> ({dp[i][j - 1]}) → {dp[i][j]}.
      </>
    );

  if (style === 'bottomup') {
    snap({ say: <>Bottom-up: row 0 and column 0 are 0 (an empty string has nothing in common). Fill the rest row by row: each cell only needs cells above and to the left.</> });
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const r = solve(i, j);
        computed++;
        state[i][j] = 'active';
        snap({ cur: [i, j], deps: r.deps, chosen: r.chosen, match: r.match, say: explain(i, j, r) });
        state[i][j] = 'filled';
      }
    }
  } else {
    snap({ say: <>Top-down: ask for the full answer LCS({m},{n}) and recurse, saving every result in the table. Only the cells the answer actually needs get computed.</> });
    const go = (i: number, j: number): number => {
      if (i === 0 || j === 0) return 0;
      if (dp[i][j] != null) {
        hits++;
        const prev = state[i][j];
        state[i][j] = 'hit';
        snap({ cur: [i, j], say: <>LCS({i},{j}) is already in the table: <span className="hl info">cache hit</span>.</> });
        state[i][j] = prev;
        return dp[i][j]!;
      }
      state[i][j] = 'stack';
      snap({ cur: [i, j], say: <>Need LCS({i},{j}) ({a[i - 1]} vs {b[j - 1]}): not known yet, so recurse into the cells it depends on.</> });
      if (a[i - 1] === b[j - 1]) go(i - 1, j - 1);
      else {
        go(i - 1, j);
        go(i, j - 1);
      }
      const r = solve(i, j);
      computed++;
      state[i][j] = 'active';
      snap({ cur: [i, j], deps: r.deps, chosen: r.chosen, match: r.match, say: explain(i, j, r) });
      state[i][j] = 'filled';
      return dp[i][j]!;
    };
    go(m, n);
  }

  // Backtrack the optimal answer.
  const total = m * n;
  snap({
    cur: [m, n],
    say: (
      <>
        The bottom-right cell holds the answer: length <span className="hl ok">{dp[m][n]}</span>. {computed}/{total} cells computed
        {style === 'topdown' ? <>, {hits} cache hits</> : null}. Now walk back to recover the letters.
      </>
    ),
  });
  let i = m;
  let j = n;
  let answer = '';
  while (i > 0 && j > 0) {
    const isMatch = a[i - 1] === b[j - 1];
    state[i][j] = isMatch ? 'pathmatch' : 'path';
    if (isMatch) {
      answer = a[i - 1] + answer;
      snap({ cur: [i, j], answer, match: true, say: <>Walk back: {a[i - 1]} matched here, so it's in the answer. Step diagonally.</> });
      i--;
      j--;
    } else {
      snap({ cur: [i, j], answer, say: <>Walk back: no match, so step toward the neighbour this value came from.</> });
      if (backStep(dp, a, b, i, j) === 'up') i--;
      else j--;
    }
  }
  snap({
    answer,
    hold: 3,
    say: (
      <>
        Longest common subsequence: <span className="hl ok">{answer || '(none)'}</span>. Diagonal steps on the green path are the matched letters. O(m × n) instead of trying all
        2<sup>{m}</sup> subsequences.
      </>
    ),
  });
  return frames;
}
