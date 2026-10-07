import { describe, expect, it } from 'vitest';
import { modInverse } from '../../core/numberTheory';
import {
  MAX_ABS, MAX_MOD, MIN_MOD, RING_SIZE, decompositions, gcdN, inverseInTable, jsRemainder, modN, parseWhole, productTable,
  ringPrevBuggy, ringPrevFixed, rowsWithoutInverse, walkPlus, walkTimes,
} from './model';

describe('modN', () => {
  it('is always in [0, n) and congruent to a, for a in −1000..1000 and n in 1..50', () => {
    for (let n = 1; n <= 50; n++) {
      for (let a = -1000; a <= 1000; a++) {
        const r = modN(a, n);
        expect(r >= 0 && r < n).toBe(true);
        expect(Math.abs((a - r) % n)).toBe(0);
      }
    }
  });

  it('differs from JavaScript % exactly when a is negative and not a multiple of n', () => {
    expect(jsRemainder(-7, 3)).toBe(-1);
    expect(modN(-7, 3)).toBe(2);
    for (let a = -60; a <= 60; a++) {
      for (let n = 2; n <= 12; n++) {
        const differs = jsRemainder(a, n) !== modN(a, n);
        expect(differs).toBe(a < 0 && a % n !== 0);
      }
    }
  });
});

describe('multiplication table', () => {
  it('has a 1 in row a exactly when gcd(a, n) = 1, for every n ≤ 50', () => {
    for (let n = MIN_MOD; n <= 50; n++) {
      const table = productTable(n);
      for (let a = 1; a < n; a++) expect(inverseInTable(table, a) !== null).toBe(gcdN(a, n) === 1);
    }
  });

  it('reads the same inverse off the table as core modInverse, and a × inverse ≡ 1', () => {
    for (let n = MIN_MOD; n <= 50; n++) {
      const table = productTable(n);
      for (let a = 1; a < n; a++) {
        const inv = modInverse(BigInt(a), BigInt(n));
        const fromTable = inverseInTable(table, a);
        if (inv === null) expect(fromTable).toBeNull();
        else {
          expect(fromTable).toBe(Number(inv));
          expect(modN(a * Number(inv), n)).toBe(1);
        }
      }
    }
  });

  it('gives the spec examples: n = 12 lacks 2, 3, 4, 6, 8, 9, 10; a prime n lacks none', () => {
    expect(rowsWithoutInverse(productTable(12))).toEqual([2, 3, 4, 6, 8, 9, 10]);
    for (const p of [2, 3, 5, 7, 11, 13, 17, 19, 23]) expect(rowsWithoutInverse(productTable(p))).toEqual([]);
  });

  it('has an empty no-inverse list exactly when n is prime (the caption relies on it)', () => {
    const isPrime = (n: number) => n >= 2 && Array.from({ length: n - 2 }, (_, i) => i + 2).every((d) => n % d !== 0);
    for (let n = MIN_MOD; n <= MAX_MOD; n++) expect(rowsWithoutInverse(productTable(n)).length === 0).toBe(isPrime(n));
  });
});

describe('clock walk', () => {
  it('lands on (from + a) mod n and (from × a) mod n for every input', () => {
    for (let n = MIN_MOD; n <= 13; n++) {
      for (let from = 0; from < n; from++) {
        for (let a = -30; a <= 60; a++) {
          const plus = walkPlus(from, a, n);
          expect(plus.result).toBe(modN(from + a, n));
          expect(plus.path.at(-1) ?? from).toBe(plus.result);
          const times = walkTimes(from, a, n);
          expect(times.result).toBe(modN(from * a, n));
          expect(times.path.at(-1) ?? 0).toBe(times.result);
        }
      }
    }
  });

  it('only reduces a when it is negative or more than two laps', () => {
    expect(walkPlus(0, 17, 12)).toMatchObject({ reduced: false, stepped: 17, result: 5 });
    expect(walkPlus(0, 25, 12)).toMatchObject({ reduced: true, stepped: 1, result: 1 });
    expect(walkPlus(5, -3, 12)).toMatchObject({ reduced: true, stepped: 9, result: 2 });
    expect(walkPlus(0, MAX_ABS, 24).path.length).toBeLessThan(24);
  });
});

describe('negative numbers', () => {
  it('splits a = q·n + r both ways, with r matching % and mod', () => {
    for (let a = -50; a <= 50; a++) {
      for (let n = 2; n <= 9; n++) {
        const d = decompositions(a, n);
        expect(d.js.q * n + d.js.r).toBe(a);
        expect(d.mod.q * n + d.mod.r).toBe(a);
        expect(d.js.r).toBe(jsRemainder(a, n) + 0);
        expect(d.mod.r).toBe(modN(a, n));
      }
    }
  });

  it('never gives a negative ring index with the fix; the buggy one does at i = 0', () => {
    for (let i = 0; i < RING_SIZE; i++) {
      const fixed = ringPrevFixed(i, RING_SIZE);
      expect(fixed >= 0 && fixed < RING_SIZE).toBe(true);
      expect(fixed).toBe(modN(i - 1, RING_SIZE));
    }
    expect(ringPrevBuggy(0, RING_SIZE)).toBe(-1);
  });
});

describe('parseWhole', () => {
  it('accepts plain integers and a typographic minus', () => {
    expect(parseWhole(' 17 ', 0, 100)).toEqual({ ok: true, value: 17 });
    expect(parseWhole('−7', -10, 10)).toEqual({ ok: true, value: -7 });
  });

  it('refuses hostile input with a reason', () => {
    for (const bad of ['', '   ', '12345678901234567890123', '1e400', '1.5', '😀', '<b>3</b>', '1,2', '0x10', '+5']) {
      expect('error' in parseWhole(bad, -MAX_ABS, MAX_ABS), bad).toBe(true);
    }
    expect(parseWhole('1', MIN_MOD, MAX_MOD)).toEqual({ ok: false, error: 'Keep it between 2 and 24.' });
    expect('error' in parseWhole('-1', MIN_MOD, MAX_MOD)).toBe(true);
    expect('error' in parseWhole('1000001', -MAX_ABS, MAX_ABS)).toBe(true);
  });
});
