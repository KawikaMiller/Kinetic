import { describe, expect, it } from 'vitest';
import { Fp } from './field';
import { P256 } from './ecc';
import { isqrt } from './numberTheory';
import { mulberry32 } from './random';

/** Every k-element subset of `items`, in order. */
function subsets<T>(items: readonly T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (items.length < k) return [];
  const [head, ...rest] = items;
  return [...subsets(rest, k - 1).map((s) => [head, ...s]), ...subsets(rest, k)];
}

describe('Fp construction and arithmetic', () => {
  it('refuses a modulus that is not prime', () => {
    for (const bad of [0n, 1n, 4n, 15n, 561n]) expect(() => Fp(bad)).toThrow(`Fp: modulus ${bad} is not prime`);
  });

  it('computes F17 by hand', () => {
    const F = Fp(17n);
    expect(F.add(12n, 9n)).toBe(4n);
    expect(F.sub(3n, 5n)).toBe(15n);
    expect(F.neg(5n)).toBe(12n);
    expect(F.mul(5n, 7n)).toBe(1n);
    expect(F.inv(2n)).toBe(9n);
    expect(F.div(3n, 2n)).toBe(10n);
    expect(F.pow(3n, 16n)).toBe(1n);
    expect(F.norm(-1n)).toBe(16n);
    expect(F.evalPoly([3n, 2n], 2n)).toBe(7n);
  });

  it('refuses out-of-range and zero inputs with positioned messages', () => {
    const F = Fp(17n);
    expect(() => F.add(3n, 17n)).toThrow('add: argument 2 = 17 is outside 0..16');
    expect(() => F.sub(-1n, 3n)).toThrow('sub: argument 1 = -1 is outside 0..16');
    expect(() => F.inv(0n)).toThrow('inv: argument 1 = 0 has no inverse');
    expect(() => F.div(1n, 0n)).toThrow('div: argument 2 = 0');
    expect(() => F.pow(2n, -1n)).toThrow('pow: argument 2 = -1');
  });

  it('every non-zero element times its inverse is 1, for several primes', () => {
    for (const p of [2n, 3n, 7n, 17n, 257n]) {
      const F = Fp(p);
      for (let a = 1n; a < p; a++) expect(F.mul(a, F.inv(a))).toBe(1n);
    }
  });
});

describe('isqrt (used for the Hasse bound and the sqrt(n) cost line)', () => {
  it('is floor(sqrt(n)) exactly, from 0 to 10,000 and at 256-bit squares', () => {
    for (let n = 0; n <= 10_000; n++) expect(Number(isqrt(BigInt(n)))).toBe(Math.floor(Math.sqrt(n)));
    const big = 2n ** 128n + 12345n;
    expect(isqrt(big * big)).toBe(big);
    expect(isqrt(big * big - 1n)).toBe(big - 1n);
    expect(() => isqrt(-1n)).toThrow('non-negative');
  });
});

describe('Legendre symbol and square roots', () => {
  // p = 3 mod 4 (7, 23) and p = 1 mod 4 (13, 17, 41, 97, 257, which need Tonelli-Shanks)
  it.each([7n, 13n, 17n, 23n, 41n, 97n, 257n])('is exact over all of F%s: brute-force squares, both roots', (p) => {
    const F = Fp(p);
    const squares = new Set<bigint>();
    for (let y = 0n; y < p; y++) squares.add((y * y) % p);
    for (let a = 0n; a < p; a++) {
      const r = F.sqrt(a);
      if (squares.has(a)) {
        expect(F.legendre(a)).toBe(a === 0n ? 0 : 1);
        expect(F.mul(r!, r!)).toBe(a);
      } else {
        expect(F.legendre(a)).toBe(-1);
        expect(r).toBeNull();
      }
    }
    expect(squares.size).toBe(Number((p - 1n) / 2n) + 1);
  });

  it('takes square roots in a 30-bit field with p = 1 mod 4 and in the 256-bit P-256 field', () => {
    const rnd = mulberry32(5);
    for (const p of [1_000_000_009n, P256.p]) {
      const F = Fp(p);
      for (let i = 0; i < 20; i++) {
        const y = BigInt(Math.floor(rnd() * 2 ** 30)) + 1n;
        const r = F.sqrt(F.mul(y, y))!;
        expect(r === y || r === p - y).toBe(true);
      }
    }
  });
});

describe('interpolate at zero (Shamir reconstruction)', () => {
  it('hand vector in GF(7): f = 3 + 2x, shares 1 and 3 give 3', () => {
    const F = Fp(7n);
    expect(F.lagrangeAtZero([1n, 3n])).toEqual([5n, 3n]);
    expect(F.interpolateAtZero([[1n, 5n], [3n, 2n]])).toBe(3n);
  });

  it('hand vector in GF(257): secret 42, coefficients 100 and 57, Lagrange values 3, -3, 1', () => {
    const F = Fp(257n);
    const shares = [1n, 2n, 3n, 4n, 5n].map((x) => [x, F.evalPoly([42n, 100n, 57n], x)] as const);
    expect(shares.map(([, y]) => y)).toEqual([199n, 213n, 84n, 69n, 168n]);
    expect(F.lagrangeAtZero([1n, 2n, 3n])).toEqual([3n, 254n, 1n]);
    for (const subset of subsets(shares, 3)) expect(F.interpolateAtZero(subset)).toBe(42n);
    expect(subsets(shares, 3)).toHaveLength(10);
    // two shares fit a different line: slope 14, intercept 185
    expect(F.interpolateAtZero(shares.slice(0, 2))).toBe(185n);
    // a corrupted share (84 -> 85) silently gives 43
    expect(F.interpolateAtZero([shares[0], shares[1], [3n, 85n]])).toBe(43n);
  });

  it('refuses a repeated x-value and no points, naming the position', () => {
    const F = Fp(257n);
    expect(() => F.interpolateAtZero([[1n, 5n], [2n, 6n], [1n, 7n]])).toThrow('point 3 repeats the x-value 1 of point 1');
    expect(() => F.lagrangeAtZero([])).toThrow('needs at least one point');
  });

  it('equals a naive Gaussian elimination of the Vandermonde system on 1,000 seeded cases', () => {
    const rnd = mulberry32(2024);
    const primes = [7n, 11n, 13n, 17n, 23n, 101n, 257n, 65537n];
    for (let i = 0; i < 1000; i++) {
      const p = primes[Math.floor(rnd() * primes.length)];
      const F = Fp(p);
      const k = 1 + Math.floor(rnd() * 4);
      const coeffs = Array.from({ length: k }, () => BigInt(Math.floor(rnd() * Number(p))));
      const xs = new Set<bigint>();
      while (xs.size < k) xs.add(1n + BigInt(Math.floor(rnd() * Number(p - 1n))));
      const points = [...xs].map((x) => [x, F.evalPoly(coeffs, x)] as const);
      const vandermonde = points.map(([x]) => Array.from({ length: k }, (_, j) => F.pow(x, BigInt(j))));
      const solved = F.solveLinear(vandermonde, points.map(([, y]) => y))!;
      expect(solved).toEqual(coeffs);
      expect(F.interpolateAtZero(points)).toBe(solved[0]);
    }
  });

  it('solveLinear reports a singular matrix as null and refuses a ragged one', () => {
    const F = Fp(7n);
    expect(F.solveLinear([[1n, 2n], [2n, 4n]], [1n, 2n])).toBeNull();
    expect(F.solveLinear([[2n, 0n], [0n, 3n]], [4n, 6n])).toEqual([2n, 2n]);
    expect(() => F.solveLinear([[1n, 2n]], [1n])).toThrow('needs a square 1 x 1 matrix');
  });
});
