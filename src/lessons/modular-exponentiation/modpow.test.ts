import { describe, expect, it } from 'vitest';
import { gcd, modInverse, modPow } from '../../core/numberTheory';
import { mulberry32 } from '../../core/random';
import {
  bitLength, bitsOf, digitSeries, digitsOf, fermatCensus, naiveMultiplications, operationCount, popcount, powRun, unreducedDigits, type Direction,
} from './modpow';

const DIRECTIONS: Direction[] = ['ltr', 'rtl'];

/** The independent oracle: repeated multiplication reduced at every step. */
const naivePow = (b: bigint, e: bigint, n: bigint): bigint => {
  let r = 1n % n;
  const base = ((b % n) + n) % n;
  for (let i = 0n; i < e; i++) r = (r * base) % n;
  return r;
};

const randBig = (rnd: () => number, digits: number): bigint => {
  let s = '';
  for (let i = 0; i < digits; i++) s += Math.floor(rnd() * 10);
  return BigInt(s);
};

describe('square-and-multiply, both directions', () => {
  it('matches repeated multiplication for every e below 2,000 with 200 seeded bases and moduli', () => {
    const rnd = mulberry32(1);
    for (let t = 0; t < 200; t++) {
      const n = 1n + BigInt(Math.floor(rnd() * 5000));
      const b = BigInt(Math.floor(rnd() * 10000)) - 3000n;
      for (let e = 0n; e < 2000n; e += t < 20 ? 1n : 37n) {
        const expected = naivePow(b, e, n);
        for (const d of DIRECTIONS) expect(powRun(b, e, n, d).result, `${d} ${b}^${e} mod ${n}`).toBe(expected);
      }
    }
  });

  it("agrees with core's modPow on 10,000 seeded large triples (moduli up to 30 digits)", () => {
    const rnd = mulberry32(2);
    for (let t = 0; t < 10_000; t++) {
      const n = 1n + randBig(rnd, 1 + Math.floor(rnd() * 30));
      const e = randBig(rnd, 1 + Math.floor(rnd() * 30));
      const b = randBig(rnd, 1 + Math.floor(rnd() * 30)) * (rnd() < 0.3 ? -1n : 1n);
      const expected = modPow(b, e, n);
      for (const d of DIRECTIONS) expect(powRun(b, e, n, d).result).toBe(expected);
    }
  });

  it('reproduces the published vector 4^13 mod 497 = 445, with 3 squarings and 2 multiplications', () => {
    for (const d of DIRECTIONS) expect(powRun(4n, 13n, 497n, d).result).toBe(445n);
    const ltr = powRun(4n, 13n, 497n, 'ltr');
    expect([ltr.squarings, ltr.multiplications]).toEqual([3, 2]);
  });

  it('edge cases: e = 0 gives 1 (0 when n = 1), n = 1 gives 0, and a base past n or negative equals the reduced base', () => {
    for (const d of DIRECTIONS) {
      expect(powRun(5n, 0n, 7n, d).result).toBe(1n);
      expect(powRun(5n, 0n, 1n, d).result).toBe(0n);
      expect(powRun(5n, 9n, 1n, d).result).toBe(0n);
      expect(powRun(0n, 0n, 7n, d).result).toBe(1n);
      expect(powRun(20n, 5n, 7n, d).result).toBe(powRun(6n, 5n, 7n, d).result);
      expect(powRun(-1n, 5n, 7n, d).result).toBe(powRun(6n, 5n, 7n, d).result);
      expect(powRun(-1n, 4n, 7n, d).result).toBe(1n);
    }
    expect(() => powRun(2n, 3n, 0n, 'ltr')).toThrow();
  });

  it('left to right uses bitLength - 1 squarings and popcount - 1 multiplications for every exponent up to 2^16, and right to left the same counts', () => {
    for (let e = 1n; e <= 65536n; e++) {
      const ltr = powRun(7n, e, 1_000_003n, 'ltr');
      expect(ltr.squarings, `e=${e}`).toBe(bitLength(e) - 1);
      expect(ltr.multiplications, `e=${e}`).toBe(popcount(e) - 1);
      if (e % 97n === 0n) {
        const rtl = powRun(7n, e, 1_000_003n, 'rtl');
        expect([rtl.squarings, rtl.multiplications]).toEqual([ltr.squarings, ltr.multiplications]);
      }
    }
  });

  it('the headline 7^1000000: 20 bits, 7 ones, 19 squarings and 6 multiplications = 25 against 999,999, and the result equals the full power reduced', () => {
    const n = 1_000_003n;
    const run = powRun(7n, 1_000_000n, n, 'ltr');
    expect(bitsOf(1_000_000n)).toHaveLength(20);
    expect(popcount(1_000_000n)).toBe(7);
    expect([run.squarings, run.multiplications, operationCount(run)]).toEqual([19, 6, 25]);
    expect(naiveMultiplications(1_000_000n)).toBe(999_999n);
    expect(run.result).toBe((7n ** 1_000_000n) % n);
  });

  it('the work depends on the exponent: 32768 and 65535 have the same length but 15 and 30 operations', () => {
    expect(bitLength(32768n)).toBe(bitLength(65535n));
    expect(operationCount(powRun(3n, 32768n, 1009n, 'ltr'))).toBe(15);
    expect(operationCount(powRun(3n, 65535n, 1009n, 'ltr'))).toBe(30);
  });

  it('right to left keeps two numbers, left to right one, and a step list ends on the result', () => {
    const ltr = powRun(3n, 1234n, 1009n, 'ltr');
    const rtl = powRun(3n, 1234n, 1009n, 'rtl');
    expect([ltr.held, rtl.held]).toEqual([1, 2]);
    expect(ltr.steps.at(-1)!.after).toBe(ltr.result);
    expect(bitsOf(0n)).toEqual([0]);
    expect(() => bitsOf(-1n)).toThrow();
  });

  it('exponents up to 10^30 need 100 bits, past what core/bits can hold', () => {
    expect(bitLength(10n ** 30n)).toBe(100);
    expect(bitsOf(10n ** 30n)).toHaveLength(100);
  });
});

describe('the size of the numbers', () => {
  it('floor(e log10 b) + 1 equals the digit count of b^e written out, for every base 2..40 and e up to 200', () => {
    for (let b = 2n; b <= 40n; b++) for (let e = 1n; e <= 200n; e++) expect(unreducedDigits(b, e), `${b}^${e}`).toBe(digitsOf(b ** e));
  });

  it('the unreduced 7^1000000 has 845,099 digits: 10^845098 <= 7^1000000 < 10^845099', () => {
    expect(unreducedDigits(7n, 1_000_000n)).toBe(845_099);
    const full = 7n ** 1_000_000n;
    expect(full >= 10n ** 845_098n).toBe(true);
    expect(full < 10n ** 845_099n).toBe(true);
  });

  it('with reduction the running value never exceeds the modulus size, while without it the digits roughly double at every bit', () => {
    const series = digitSeries(7n, 1_000_000n, 1_000_003n);
    expect(series).toHaveLength(20);
    expect(Math.max(...series.map((p) => p.reduced))).toBeLessThanOrEqual(7);
    expect(series.at(-1)!.unreduced).toBe(845_099);
    for (let i = 3; i < series.length; i++) expect(series[i].unreduced / series[i - 1].unreduced).toBeGreaterThan(1.5);
  });

  it('counts the digits of the base as typed: a negative base or one past the modulus is written out in full, not reduced first', () => {
    for (const base of [-7n, 7n, -123n, 10n ** 20n + 3n, -(10n ** 20n + 3n), 1_000_004n]) {
      const series = digitSeries(base, 1000n, 1_000_003n);
      series.forEach((point, i) => {
        const prefix = 1000n >> BigInt(series.length - 1 - i);
        expect(point.unreduced, `${base}^${prefix}`).toBe(digitsOf((base < 0n ? -base : base) ** prefix));
      });
    }
    expect(digitSeries(-7n, 1_000_000n, 1_000_003n).at(-1)!.unreduced).toBe(845_099);
  });
});

describe('the same trick elsewhere', () => {
  it('a^(p-2) mod p equals the egcd inverse for every a in 1..p-1 for several primes', () => {
    for (const p of [7n, 101n, 1009n, 7919n]) {
      for (let a = 1n; a < p; a++) expect(powRun(a, p - 2n, p, 'ltr').result, `a=${a} p=${p}`).toBe(modInverse(a, p));
    }
  });

  it('for a composite modulus the Fermat inverse is not an inverse in general', () => {
    let wrong = 0;
    for (let a = 2n; a < 15n; a++) if ((powRun(a, 13n, 15n, 'ltr').result * a) % 15n !== 1n) wrong++;
    expect(wrong).toBeGreaterThan(0);
  });

  it('561 passes the Fermat test for every base coprime to it (318 of the bases 2..559), and 221 and 1009 do not behave that way', () => {
    const c = fermatCensus(561);
    expect(c.coprime).toBe(318);
    expect(c.passing).toBe(c.coprime);
    expect(c.shareFactor).toBe(558 - 318);
    for (let a = 1n; a <= 560n; a++) if (gcd(a, 561n) === 1n) expect(modPow(a, 560n, 561n)).toBe(1n);
    const s = fermatCensus(221);
    expect(s.passing).toBeLessThan(s.coprime);
    expect(s.firstExposing).not.toBeNull();
    const prime = fermatCensus(1009);
    expect(prime.passing).toBe(prime.coprime);
    expect(prime.shareFactor).toBe(0);
  });
});
