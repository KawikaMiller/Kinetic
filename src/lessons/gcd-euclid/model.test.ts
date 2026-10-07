import { describe, expect, it } from 'vitest';
import {
  MAX_VALUE, bezoutRows, euclid, fibonacciUpTo, inverse, isConsecutiveFibonacci, leftover, naiveGcd, naiveTrials, pairError,
  parseValue, tiling, worstSteps,
} from './model';

const bruteGcd = (a: number, b: number) => {
  let g = 0;
  for (let d = 1; d <= Math.max(a, b); d++) if (a % d === 0 && b % d === 0) g = d;
  return g;
};

describe('euclid', () => {
  it('matches brute force and satisfies Bézout for every 1 ≤ a, b ≤ 300', () => {
    for (let a = 1; a <= 300; a++) {
      for (let b = 1; b <= 300; b++) {
        const e = euclid(a, b);
        expect(e.g).toBe(bruteGcd(a, b));
        expect(a * e.x + b * e.y).toBe(e.g);
        for (const row of e.rows) expect(row.q * row.b + row.r).toBe(row.a);
      }
    }
  });

  it('gives the spec example: 1071, 462 → 21 in 3 steps with x = −3, y = 7', () => {
    const e = euclid(1071, 462);
    expect(e).toMatchObject({ g: 21, x: -3, y: 7 });
    expect(e.rows).toEqual([
      { a: 1071, q: 2, b: 462, r: 147 },
      { a: 462, q: 3, b: 147, r: 21 },
      { a: 147, q: 7, b: 21, r: 0 },
    ]);
  });

  it('swaps on the first step when a < b, and handles a zero argument', () => {
    expect(euclid(462, 1071).rows[0]).toEqual({ a: 462, q: 0, b: 1071, r: 462 });
    expect(euclid(462, 1071).g).toBe(21);
    expect(euclid(35, 0)).toMatchObject({ g: 35, rows: [] });
    expect(euclid(0, 35).g).toBe(35);
  });

  it('agrees with the naive method, which needs min(a, b) trials', () => {
    for (let a = 0; a <= 60; a++) {
      for (let b = 0; b <= 60; b++) {
        if (a === 0 && b === 0) continue;
        const naive = naiveGcd(a, b);
        expect(naive.g).toBe(euclid(a, b).g);
        expect(naive.trials).toBe(naiveTrials(a, b));
      }
    }
  });
});

describe('bezoutRows', () => {
  it('keeps r = a·x + b·y on every row and ends on the gcd with egcd\'s coefficients', () => {
    for (let a = 0; a <= 120; a++) {
      for (let b = 0; b <= 120; b++) {
        if (a === 0 && b === 0) continue;
        const rows = bezoutRows(a, b);
        for (const row of rows) expect(a * row.x + b * row.y).toBe(row.r);
        const e = euclid(a, b);
        const last = rows.at(-1)!;
        expect(last.r).toBe(e.g);
        expect([last.x, last.y]).toEqual([e.x, e.y]);
      }
    }
  });

  it('shows 1071·(−3) + 462·7 = 21', () => {
    expect(bezoutRows(1071, 462).map((r) => [r.r, r.q, r.x, r.y])).toEqual([
      [1071, null, 1, 0],
      [462, null, 0, 1],
      [147, 2, 1, -2],
      [21, 3, -3, 7],
    ]);
  });
});

describe('inverse', () => {
  it('finds 3⁻¹ mod 11 = 4 and the RSA example 17⁻¹ mod 3120 = 2753', () => {
    expect(inverse(3, 11)).toBe(4);
    expect(inverse(17, 3120)).toBe(2753);
  });

  it('exists exactly when gcd = 1, and then a·inverse ≡ 1', () => {
    for (let m = 2; m <= 60; m++) {
      for (let a = 0; a <= 70; a++) {
        const inv = inverse(a, m);
        expect(inv !== null).toBe(euclid(a, m).g === 1);
        if (inv !== null) expect((a * inv) % m).toBe(1);
      }
    }
  });
});

describe('tiling', () => {
  it('covers the rectangle exactly, ending on gcd-sized squares, for every 1 ≤ a, b ≤ 60', () => {
    for (let a = 1; a <= 60; a++) {
      for (let b = 1; b <= 60; b++) {
        const runs = tiling(a, b);
        const area = runs.reduce((s, r) => s + r.count * r.size * r.size, 0);
        expect(area).toBe(a * b);
        expect(runs.at(-1)!.size).toBe(euclid(a, b).g);
        const w = Math.max(a, b);
        const h = Math.min(a, b);
        for (const run of runs) {
          const end = run.axis === 'x' ? run.x + run.count * run.size : run.y + run.count * run.size;
          expect(end).toBeLessThanOrEqual(run.axis === 'x' ? w : h);
        }
        const last = runs.at(-1)!;
        const left = leftover(last, last.count, w, h);
        expect(left.w * left.h).toBe(0);
      }
    }
  });

  it('lays 2 squares of 462, then 3 of 147, then 7 of 21 for 1071 × 462', () => {
    expect(tiling(1071, 462).map((r) => [r.count, r.size, r.axis])).toEqual([[2, 462, 'x'], [3, 147, 'y'], [7, 21, 'x']]);
  });
});

describe('worst case', () => {
  it('consecutive Fibonacci pairs take the most steps of any pair up to their size (brute force to 1,000)', () => {
    const N = 1000;
    let best = 0;
    const bestAt: number[] = [0];
    const steps = Array.from({ length: N + 1 }, () => new Array<number>(N + 1).fill(0));
    for (let a = 1; a <= N; a++) {
      for (let b = 1; b <= a; b++) {
        steps[a][b] = b === 0 ? 0 : a % b === 0 ? 1 : 1 + steps[b][a % b];
        best = Math.max(best, steps[a][b]);
      }
      bestAt.push(best);
    }
    for (let n = 1; n <= N; n++) expect(worstSteps(n), `N = ${n}`).toBe(bestAt[n]);
    expect(euclid(89, 55).rows.length).toBe(worstSteps(89));
    expect(worstSteps(89)).toBe(9);
  });

  it('spots consecutive Fibonacci pairs', () => {
    expect(fibonacciUpTo(100)).toEqual([1, 2, 3, 5, 8, 13, 21, 34, 55, 89]);
    expect(isConsecutiveFibonacci(89, 55)).toBe(true);
    expect(isConsecutiveFibonacci(55, 89)).toBe(true);
    expect(isConsecutiveFibonacci(89, 34)).toBe(false);
    expect(isConsecutiveFibonacci(1071, 462)).toBe(false);
  });
});

describe('parseValue', () => {
  it('accepts 0 to 10¹² with optional digit grouping', () => {
    expect(parseValue(' 1071 ')).toEqual({ ok: true, value: 1071 });
    expect(parseValue('0')).toEqual({ ok: true, value: 0 });
    expect(parseValue('1,000,000,000,000')).toEqual({ ok: true, value: MAX_VALUE });
  });

  it('refuses hostile input with a reason', () => {
    for (const bad of ['', '  ', '-1', '−5', '1.5', '1e400', '12345678901234567890123', '1000000000001', '😀', '<b>3</b>', '0x10', '1 2', '1,2', '10,71', '1,,000']) {
      expect('error' in parseValue(bad), bad).toBe(true);
    }
    expect(pairError(0, 0)).not.toBeNull();
    expect(pairError(0, 5)).toBeNull();
  });
});
