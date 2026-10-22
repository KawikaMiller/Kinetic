/**
 * Arithmetic in the prime field F_p on `bigint`, for the elliptic-curves, secret-sharing and
 * zero-knowledge-proofs lessons. Built on core/numberTheory. Exact, BigInt only, no floating
 * point, and NOT constant-time: it is for showing the maths, never for protecting a real secret.
 *
 * An element is a bigint in [0, p). Every operation refuses an argument outside that range
 * with a message that names the operation, the argument position and the value, so a stray
 * negative or unreduced number never passes silently (use `norm` to reduce on purpose).
 */
import { isProbablePrime, mod, modInverse, modPow } from './numberTheory';

/** One point of a polynomial: the share `(x, y)` in secret sharing. */
export type FieldPoint = readonly [x: bigint, y: bigint];

/** What `Fp(p)` returns: the field's operations, all closed over the prime. */
export interface PrimeField {
  readonly p: bigint;
  /** Reduce any integer into [0, p), negatives included. */
  norm(a: bigint): bigint;
  add(a: bigint, b: bigint): bigint;
  sub(a: bigint, b: bigint): bigint;
  neg(a: bigint): bigint;
  mul(a: bigint, b: bigint): bigint;
  /** The multiplicative inverse; refuses 0. */
  inv(a: bigint): bigint;
  /** a / b = a · b^-1; refuses b = 0. */
  div(a: bigint, b: bigint): bigint;
  /** a^e for e ≥ 0. */
  pow(a: bigint, e: bigint): bigint;
  /** Euler's criterion: 0 for a = 0, 1 for a non-zero square, -1 for a non-square (p odd). */
  legendre(a: bigint): -1 | 0 | 1;
  /** A square root (Tonelli-Shanks), or null when a is a non-square. The other root is p - r. */
  sqrt(a: bigint): bigint | null;
  /** f(x) for f = coeffs[0] + coeffs[1]·x + …, by Horner's rule. */
  evalPoly(coeffs: readonly bigint[], x: bigint): bigint;
  /** The Lagrange basis values L_i(0) for the x-values `xs` (distinct), in order. */
  lagrangeAtZero(xs: readonly bigint[]): bigint[];
  /** f(0) of the unique polynomial of degree < points.length through the points (distinct x). */
  interpolateAtZero(points: readonly FieldPoint[]): bigint;
  /** Solve A·x = rhs by Gaussian elimination: the unique solution, or null when A is singular. */
  solveLinear(matrix: readonly (readonly bigint[])[], rhs: readonly bigint[]): bigint[] | null;
}

/** The largest modulus the exhaustive helpers in this kit are asked to work with is not limited here; only primality is. */
function assertPrime(p: bigint): void {
  if (!isProbablePrime(p).prime) throw new RangeError(`Fp: modulus ${p} is not prime`);
}

/** The field F_p. Refuses a modulus that is not prime. */
export function Fp(p: bigint): PrimeField {
  assertPrime(p);

  const check = (op: string, position: number, a: bigint): bigint => {
    if (typeof a !== 'bigint' || a < 0n || a >= p) {
      throw new RangeError(`${op}: argument ${position} = ${String(a)} is outside 0..${p - 1n} (reduce it with norm first)`);
    }
    return a;
  };

  const norm = (a: bigint) => mod(a, p);
  const add = (a: bigint, b: bigint) => (check('add', 1, a) + check('add', 2, b)) % p;
  const sub = (a: bigint, b: bigint) => mod(check('sub', 1, a) - check('sub', 2, b), p);
  const neg = (a: bigint) => mod(-check('neg', 1, a), p);
  const mul = (a: bigint, b: bigint) => (check('mul', 1, a) * check('mul', 2, b)) % p;
  const inv = (a: bigint) => {
    if (check('inv', 1, a) === 0n) throw new RangeError('inv: argument 1 = 0 has no inverse');
    return modInverse(a, p)!;
  };
  const div = (a: bigint, b: bigint) => {
    check('div', 1, a);
    if (check('div', 2, b) === 0n) throw new RangeError('div: argument 2 = 0 (division by zero)');
    return mul(a, inv(b));
  };
  const pow = (a: bigint, e: bigint) => {
    if (e < 0n) throw new RangeError(`pow: argument 2 = ${e} must be non-negative`);
    return modPow(check('pow', 1, a), e, p);
  };

  const legendre = (a: bigint): -1 | 0 | 1 => {
    check('legendre', 1, a);
    if (a === 0n) return 0;
    if (p === 2n) return 1;
    return modPow(a, (p - 1n) / 2n, p) === 1n ? 1 : -1;
  };

  const sqrt = (a: bigint): bigint | null => {
    check('sqrt', 1, a);
    if (a === 0n) return 0n;
    if (p === 2n) return a;
    if (legendre(a) !== 1) return null;
    if (p % 4n === 3n) return modPow(a, (p + 1n) / 4n, p);
    // Tonelli-Shanks: p - 1 = q · 2^s with q odd.
    let q = p - 1n;
    let s = 0n;
    while ((q & 1n) === 0n) {
      q >>= 1n;
      s++;
    }
    let z = 2n;
    while (legendre(z) !== -1) z++;
    let m = s;
    let c = modPow(z, q, p);
    let t = modPow(a, q, p);
    let r = modPow(a, (q + 1n) / 2n, p);
    while (t !== 1n) {
      let i = 0n;
      let tt = t;
      while (tt !== 1n) {
        tt = (tt * tt) % p;
        i++;
      }
      const b = modPow(c, 1n << (m - i - 1n), p);
      m = i;
      c = (b * b) % p;
      t = (t * c) % p;
      r = (r * b) % p;
    }
    return r;
  };

  const evalPoly = (coeffs: readonly bigint[], x: bigint) => {
    check('evalPoly', 2, x);
    let acc = 0n;
    for (let i = coeffs.length - 1; i >= 0; i--) acc = (acc * x + check('evalPoly', 1, coeffs[i])) % p;
    return acc;
  };

  const assertDistinct = (op: string, xs: readonly bigint[]) => {
    if (xs.length === 0) throw new RangeError(`${op}: needs at least one point`);
    xs.forEach((x, i) => {
      check(op, i + 1, x);
      const first = xs.indexOf(x);
      if (first !== i) throw new RangeError(`${op}: point ${i + 1} repeats the x-value ${x} of point ${first + 1}`);
    });
  };

  const lagrangeAtZero = (xs: readonly bigint[]) => {
    assertDistinct('lagrangeAtZero', xs);
    return xs.map((xi, i) => {
      let num = 1n;
      let den = 1n;
      xs.forEach((xj, j) => {
        if (j === i) return;
        num = (num * sub(0n, xj)) % p;
        den = (den * sub(xi, xj)) % p;
      });
      return div(num, den);
    });
  };

  const interpolateAtZero = (points: readonly FieldPoint[]) => {
    const basis = lagrangeAtZero(points.map(([x]) => x));
    return points.reduce((acc, [, y], i) => add(acc, mul(check('interpolateAtZero', i + 1, y), basis[i])), 0n);
  };

  const solveLinear = (matrix: readonly (readonly bigint[])[], rhs: readonly bigint[]) => {
    const n = matrix.length;
    if (rhs.length !== n || matrix.some((row) => row.length !== n)) throw new RangeError(`solveLinear: needs a square ${n} x ${n} matrix and ${n} right-hand sides`);
    const rows = matrix.map((row, i) => [...row.map((v, j) => check('solveLinear', i * n + j + 1, v)), check('solveLinear', n * n + i + 1, rhs[i])]);
    for (let col = 0; col < n; col++) {
      const pivot = rows.findIndex((row, r) => r >= col && row[col] !== 0n);
      if (pivot < 0) return null;
      [rows[col], rows[pivot]] = [rows[pivot], rows[col]];
      const scale = inv(rows[col][col]);
      rows[col] = rows[col].map((v) => (v * scale) % p);
      for (let r = 0; r < n; r++) {
        if (r === col || rows[r][col] === 0n) continue;
        const f = rows[r][col];
        rows[r] = rows[r].map((v, c) => sub(v, (f * rows[col][c]) % p));
      }
    }
    return rows.map((row) => row[n]);
  };

  return { p, norm, add, sub, neg, mul, inv, div, pow, legendre, sqrt, evalPoly, lagrangeAtZero, interpolateAtZero, solveLinear };
}
