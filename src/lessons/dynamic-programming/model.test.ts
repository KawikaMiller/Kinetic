import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import { fibFrames, lcsFrames } from './frames';
import { blankTable, lcsBottomUp, lcsStep, lcsWalkBack, memoCalls, naiveCalls } from './model';

/** Brute force: plain recursion, counting every call. */
function bruteFib(n: number): { value: number; calls: number } {
  let calls = 0;
  const f = (k: number): number => {
    calls++;
    return k <= 1 ? k : f(k - 1) + f(k - 2);
  };
  return { value: f(n), calls };
}

const isSubsequence = (s: string, of: string) => {
  let i = 0;
  for (const ch of of) if (ch === s[i]) i++;
  return i === s.length;
};

/** Brute force: every subsequence of `a` that is also one of `b`, keeping the longest. */
function bruteLcs(a: string, b: string): Set<string> {
  let best = new Set<string>(['']);
  let len = 0;
  for (let mask = 1; mask < 1 << a.length; mask++) {
    const s = [...a].filter((_, i) => mask & (1 << i)).join('');
    if (s.length < len || !isSubsequence(s, b)) continue;
    if (s.length > len) [best, len] = [new Set(), s.length];
    best.add(s);
  }
  return best;
}

const PAIRS = [['ABCBDAB', 'BDCABA'], ['STONE', 'LONGEST'], ['DYNAMIC', 'PROGRAM']] as const;

describe('Fibonacci', () => {
  it('naive call counts match brute-force recursion, and grow as 2·fib(n+1) − 1', () => {
    for (let n = 0; n <= 22; n++) {
      expect(naiveCalls(n)).toBe(bruteFib(n).calls);
      expect(naiveCalls(n)).toBe(2 * bruteFib(n + 1).value - 1);
    }
    expect(naiveCalls(30)).toBe(2692537); // the chart's label at n = 30
  });

  it('top-down: the memo holds the right values, with 2n − 1 calls and n − 2 cache hits', () => {
    for (let n = 3; n <= 12; n++) {
      const last = fibFrames(n, 'topdown').at(-1)!;
      expect(last.memo).toEqual(Array.from({ length: n + 1 }, (_, k) => bruteFib(k).value));
      expect(last.calls).toBe(memoCalls(n));
      expect(last.calls).toBe(2 * n - 1);
      expect(last.hits).toBe(n - 2); // every other call computes one of the n + 1 subproblems exactly once
      expect(last.calls - last.hits).toBe(n + 1);
    }
  });

  it('bottom-up: same values, one table cell filled per subproblem, no calls on the stack', () => {
    for (let n = 3; n <= 12; n++) {
      const frames = fibFrames(n, 'bottomup');
      const last = frames.at(-1)!;
      expect(last.memo[n]).toBe(bruteFib(n).value);
      expect(last.calls).toBe(n + 1);
      expect(frames.every((f) => f.stack.length === 0)).toBe(true);
    }
  });

  it('memoized calls stay linear while naive calls explode (the chart)', () => {
    expect(memoCalls(30)).toBe(59);
    expect(naiveCalls(30) / memoCalls(30)).toBeGreaterThan(40000);
  });
});

describe('Longest common subsequence', () => {
  it('a match takes the diagonal plus 1; a mismatch takes the larger of up and left', () => {
    const dp = blankTable(2, 2);
    dp[1][1] = 1;
    dp[1][2] = 1;
    dp[2][1] = 1;
    expect(lcsStep(dp, 'AB', 'AB', 2, 2)).toMatchObject({ match: true, chosen: [1, 1] });
    expect(dp[2][2]).toBe(2);
    const dp2 = blankTable(1, 2);
    dp2[1][1] = 1;
    expect(lcsStep(dp2, 'A', 'AC', 1, 2)).toMatchObject({ match: false, chosen: [1, 1] });
    expect(dp2[1][2]).toBe(1);
  });

  it('the table\'s answer matches brute force on 300 seeded string pairs, and the walk back spells a real LCS', () => {
    const rand = mulberry32(21);
    const word = () => Array.from({ length: Math.floor(rand() * 9) }, () => 'ABCD'[Math.floor(rand() * 4)]).join('');
    for (let k = 0; k < 300; k++) {
      const [a, b] = [word(), word()];
      const best = bruteLcs(a, b);
      const dp = lcsBottomUp(a, b);
      expect(dp[a.length][b.length]).toBe([...best][0].length);
      expect(best.has(lcsWalkBack(dp, a, b).answer)).toBe(true);
    }
  });

  it('both approaches recover the same answer as the model for every preset', () => {
    for (const [a, b] of PAIRS) {
      const expected = lcsWalkBack(lcsBottomUp(a, b), a, b).answer;
      for (const style of ['topdown', 'bottomup'] as const) expect(lcsFrames(a, b, style).at(-1)!.answer).toBe(expected);
    }
  });

  it('bottom-up computes every cell; top-down computes only what the answer needs, with the same values', () => {
    for (const [a, b] of PAIRS) {
      const full = lcsBottomUp(a, b);
      expect(lcsFrames(a, b, 'bottomup').at(-1)!.computed).toBe(a.length * b.length);
      const td = lcsFrames(a, b, 'topdown').at(-1)!;
      expect(td.computed).toBeLessThanOrEqual(a.length * b.length);
      td.dp.forEach((row, i) => row.forEach((v, j) => v != null && expect(v).toBe(full[i][j])));
    }
    const dyn = lcsFrames('DYNAMIC', 'PROGRAM', 'topdown').at(-1)!;
    expect(dyn.computed).toBeLessThan(49); // the try-this and the quiz: some cells are never computed
  });

  it('ties break one way, so presets can hide equally long answers (the disclosure)', () => {
    const [a, b] = PAIRS[0];
    const all = bruteLcs(a, b);
    expect(all.size).toBeGreaterThan(1);
    expect(all.has(lcsFrames(a, b, 'bottomup').at(-1)!.answer)).toBe(true);
  });
});
