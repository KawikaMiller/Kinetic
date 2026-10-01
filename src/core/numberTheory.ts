/**
 * Number theory on `bigint`, for the modular-arithmetic, gcd-euclid, primes-factoring, rsa,
 * diffie-hellman, digital-signatures-pki and rolling-hash lessons. Everything is exact; the
 * only probabilistic answer (`isProbablePrime` above the deterministic bound) says so.
 */

/** a mod m, always in [0, m): JavaScript's % keeps the sign of a, which is rarely what maths means. */
export function mod(a: bigint, m: bigint): bigint {
  if (m <= 0n) throw new RangeError('modulus must be positive');
  const r = a % m;
  return r < 0n ? r + m : r;
}

/** base^exp mod m by square-and-multiply. exp must be non-negative. */
export function modPow(base: bigint, exp: bigint, m: bigint): bigint {
  if (exp < 0n) throw new RangeError('exponent must be non-negative');
  if (m === 1n) return 0n;
  let result = 1n;
  let b = mod(base, m);
  let e = exp;
  while (e > 0n) {
    if (e & 1n) result = (result * b) % m;
    b = (b * b) % m;
    e >>= 1n;
  }
  return result;
}

const abs = (a: bigint) => (a < 0n ? -a : a);

/** Greatest common divisor, always non-negative; gcd(0, 0) = 0. */
export function gcd(a: bigint, b: bigint): bigint {
  let x = abs(a);
  let y = abs(b);
  while (y) [x, y] = [y, x % y];
  return x;
}

/** One row of Euclid's remainder table: a = q·b + r. */
export interface EuclidStep {
  a: bigint;
  b: bigint;
  q: bigint;
  r: bigint;
}

/**
 * Extended Euclid: g = gcd(a, b) and Bézout coefficients with a·x + b·y = g, plus every
 * division step for the lesson's remainder table. Inputs must be non-negative.
 */
export function egcd(a: bigint, b: bigint): { g: bigint; x: bigint; y: bigint; steps: EuclidStep[] } {
  if (a < 0n || b < 0n) throw new RangeError('egcd takes non-negative inputs');
  const steps: EuclidStep[] = [];
  let [oldR, r] = [a, b];
  let [oldS, s] = [1n, 0n];
  let [oldT, t] = [0n, 1n];
  while (r !== 0n) {
    const q = oldR / r;
    steps.push({ a: oldR, b: r, q, r: oldR - q * r });
    [oldR, r] = [r, oldR - q * r];
    [oldS, s] = [s, oldS - q * s];
    [oldT, t] = [t, oldT - q * t];
  }
  return { g: oldR, x: oldS, y: oldT, steps };
}

/** The x with a·x ≡ 1 (mod m), or null when gcd(a, m) ≠ 1 and no inverse exists. */
export function modInverse(a: bigint, m: bigint): bigint | null {
  if (m <= 0n) throw new RangeError('modulus must be positive');
  if (m === 1n) return 0n;
  const { g, x } = egcd(mod(a, m), m);
  return g === 1n ? mod(x, m) : null;
}

/** The first 13 primes. As Miller-Rabin bases they decide primality exactly below MR_DETERMINISTIC_BOUND. */
const MR_BASES = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n, 41n];

/** Sorenson & Webster (2015): the 13 bases above are deterministic for every n below this. */
export const MR_DETERMINISTIC_BOUND = 3_317_044_064_679_887_385_961_981n;

/**
 * Miller-Rabin with the first 13 primes as bases. `certain` is true below
 * MR_DETERMINISTIC_BOUND (the answer is a proof); above it a "prime" is only probable.
 */
export function isProbablePrime(n: bigint): { prime: boolean; certain: boolean } {
  if (n < 2n) return { prime: false, certain: true };
  for (const p of MR_BASES) {
    if (n === p) return { prime: true, certain: true };
    if (n % p === 0n) return { prime: false, certain: true };
  }
  let d = n - 1n;
  let s = 0;
  while ((d & 1n) === 0n) {
    d >>= 1n;
    s++;
  }
  const certain = n < MR_DETERMINISTIC_BOUND;
  for (const a of MR_BASES) {
    let x = modPow(a, d, n);
    if (x === 1n || x === n - 1n) continue;
    let witness = true;
    for (let i = 1; i < s; i++) {
      x = (x * x) % n;
      if (x === n - 1n) {
        witness = false;
        break;
      }
    }
    // A witness proves n composite, whatever the bound.
    if (witness) return { prime: false, certain: true };
  }
  return { prime: true, certain };
}

/** One prime's pass in the Sieve of Eratosthenes: the multiples it crosses out, in order. */
export interface SievePass {
  prime: number;
  crossed: number[];
}

/**
 * Sieve of Eratosthenes up to n (inclusive). `passes` is the crossing-out order for the
 * animation: each prime p ≤ √n crosses out p², p²+p, … (multiples below p² were already
 * crossed by a smaller prime). A number already crossed isn't listed again.
 */
export function sieve(n: number): { isPrime: boolean[]; primes: number[]; passes: SievePass[] } {
  const isPrime = Array.from({ length: n + 1 }, (_, i) => i >= 2);
  const passes: SievePass[] = [];
  for (let p = 2; p * p <= n; p++) {
    if (!isPrime[p]) continue;
    const crossed: number[] = [];
    for (let m = p * p; m <= n; m += p) {
      if (isPrime[m]) {
        isPrime[m] = false;
        crossed.push(m);
      }
    }
    passes.push({ prime: p, crossed });
  }
  const primes = isPrime.flatMap((prime, i) => (prime ? [i] : []));
  return { isPrime, primes, passes };
}

/**
 * Prime factors by trial division, smallest first with repeats (12 → [2, 2, 3]).
 * `steps` counts the divisions tried, which is the cost the lesson compares.
 */
export function trialFactor(n: bigint): { factors: bigint[]; steps: number } {
  if (n < 1n) throw new RangeError('trialFactor takes a positive integer');
  const factors: bigint[] = [];
  let rest = n;
  let steps = 0;
  for (let d = 2n; d * d <= rest; d += d === 2n ? 1n : 2n) {
    steps++;
    while (rest % d === 0n) {
      factors.push(d);
      rest /= d;
      steps++;
    }
  }
  if (rest > 1n) factors.push(rest);
  return { factors, steps };
}

export type ToyRsa =
  | { ok: true; n: bigint; phi: bigint; e: bigint; d: bigint }
  | { ok: false; reason: string };

/**
 * A textbook RSA key from two primes and a public exponent, or the reason it's invalid.
 * Toy only: real RSA uses random 1024-bit-plus primes and padding (OAEP/PSS).
 */
export function toyRsa(p: bigint, q: bigint, e: bigint): ToyRsa {
  if (!isProbablePrime(p).prime) return { ok: false, reason: `p = ${p} isn't prime` };
  if (!isProbablePrime(q).prime) return { ok: false, reason: `q = ${q} isn't prime` };
  if (p === q) return { ok: false, reason: 'p and q must be different primes' };
  const n = p * q;
  const phi = (p - 1n) * (q - 1n);
  if (e <= 1n || e >= phi) return { ok: false, reason: `e must be between 1 and φ(n) = ${phi}` };
  const d = modInverse(e, phi);
  if (d === null) return { ok: false, reason: `e = ${e} shares a factor with φ(n) = ${phi}, so it has no inverse` };
  return { ok: true, n, phi, e, d };
}
