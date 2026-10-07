import { describe, expect, it } from 'vitest';
import {
  egcd,
  gcd,
  isProbablePrime,
  mod,
  modInverse,
  modPow,
  MR_DETERMINISTIC_BOUND,
  sieve,
  toyRsa,
  trialFactor,
} from './numberTheory';

const LIMIT = 10_000;

/** Reference primality by brute force. */
const bruteIsPrime = (n: number) => {
  if (n < 2) return false;
  for (let d = 2; d * d <= n; d++) if (n % d === 0) return false;
  return true;
};
const bruteGcd = (a: number, b: number) => {
  let g = 1;
  for (let d = 1; d <= Math.max(a, b); d++) if (a % d === 0 && b % d === 0) g = d;
  return a === 0 && b === 0 ? 0 : a === 0 ? b : b === 0 ? a : g;
};

describe('mod', () => {
  it('is always non-negative', () => {
    expect(mod(-7n, 3n)).toBe(2n);
    expect(mod(7n, 3n)).toBe(1n);
    expect(mod(-9n, 3n)).toBe(0n);
  });
  it('rejects a non-positive modulus', () => {
    expect(() => mod(1n, 0n)).toThrow(RangeError);
  });
});

describe('modPow', () => {
  it('matches repeated multiplication', () => {
    for (let b = 0; b < 20; b++)
      for (let e = 0; e < 20; e++)
        for (const m of [1, 2, 7, 13, 100]) {
          let ref = 1 % m;
          for (let i = 0; i < e; i++) ref = (ref * b) % m;
          expect(modPow(BigInt(b), BigInt(e), BigInt(m))).toBe(BigInt(ref));
        }
  });
  it('handles negative bases and big numbers', () => {
    expect(modPow(-2n, 3n, 5n)).toBe(2n); // -8 mod 5
    expect(modPow(2n, 127n, 2n ** 127n - 1n)).toBe(1n); // Fermat on a Mersenne prime
  });
});

describe('gcd and egcd', () => {
  it('gcd matches brute force for small pairs', () => {
    for (let a = 0; a < 60; a++) for (let b = 0; b < 60; b++) expect(gcd(BigInt(a), BigInt(b))).toBe(BigInt(bruteGcd(a, b)));
  });
  it('egcd returns Bézout coefficients and a consistent remainder table', () => {
    for (let a = 0; a < 80; a++)
      for (let b = 0; b < 80; b++) {
        const { g, x, y, steps } = egcd(BigInt(a), BigInt(b));
        expect(g).toBe(gcd(BigInt(a), BigInt(b)));
        expect(BigInt(a) * x + BigInt(b) * y).toBe(g);
        for (const s of steps) expect(s.a).toBe(s.q * s.b + s.r);
      }
  });
  it('the classic table: gcd(240, 46) = 2 in 4 divisions', () => {
    const { g, steps } = egcd(240n, 46n);
    expect(g).toBe(2n);
    expect(steps.map((s) => s.r)).toEqual([10n, 6n, 4n, 2n, 0n]);
  });
});

describe('modInverse', () => {
  it('finds an inverse exactly when gcd is 1', () => {
    for (let m = 1; m < 60; m++)
      for (let a = 0; a < m; a++) {
        const inv = modInverse(BigInt(a), BigInt(m));
        if (bruteGcd(a, m) === 1) {
          expect(inv).not.toBeNull();
          expect(mod(BigInt(a) * inv!, BigInt(m))).toBe(1n % BigInt(m));
        } else expect(inv).toBeNull();
      }
  });
});

describe('isProbablePrime', () => {
  it('agrees with brute force for every n below 10⁴, and is certain', () => {
    for (let n = 0; n < LIMIT; n++) {
      const r = isProbablePrime(BigInt(n));
      expect(r.prime).toBe(bruteIsPrime(n));
      expect(r.certain).toBe(true);
    }
  });
  it('catches Carmichael numbers that fool the Fermat test', () => {
    for (const c of [561n, 1105n, 1729n, 2465n, 2821n, 6601n, 8911n, 41041n, 825265n]) {
      expect(modPow(2n, c - 1n, c)).toBe(1n); // they pass Fermat for base 2
      expect(isProbablePrime(c).prime).toBe(false);
    }
  });
  it('is certain below the bound and only probable above it', () => {
    expect(isProbablePrime(2n ** 61n - 1n)).toEqual({ prime: true, certain: true });
    const big = 2n ** 127n - 1n; // a Mersenne prime above the bound
    expect(big > MR_DETERMINISTIC_BOUND).toBe(true);
    expect(isProbablePrime(big)).toEqual({ prime: true, certain: false });
    expect(isProbablePrime(big * 3n)).toEqual({ prime: false, certain: true });
  });
});

describe('sieve', () => {
  it('finds exactly the primes up to n, and crosses each composite once', () => {
    for (const n of [0, 1, 2, 10, 30, 100, 1000]) {
      const { primes, passes, isPrime } = sieve(n);
      const ref = Array.from({ length: n + 1 }, (_, i) => i).filter(bruteIsPrime);
      expect(primes).toEqual(ref);
      const crossed = passes.flatMap((p) => p.crossed);
      expect(new Set(crossed).size).toBe(crossed.length);
      expect(crossed.sort((a, b) => a - b)).toEqual(
        Array.from({ length: n + 1 }, (_, i) => i).filter((i) => i >= 2 && !bruteIsPrime(i)),
      );
      expect(isPrime.length).toBe(n + 1);
    }
  });
  it('each pass starts at p² and only uses primes up to √n', () => {
    const { passes } = sieve(100);
    expect(passes.map((p) => p.prime)).toEqual([2, 3, 5, 7]);
    for (const p of passes) if (p.crossed.length) expect(p.crossed[0]).toBe(p.prime * p.prime);
  });
});

describe('trialFactor', () => {
  it('returns factors whose product is n, all prime, in order', () => {
    for (let n = 1; n < 3000; n++) {
      const { factors } = trialFactor(BigInt(n));
      expect(factors.reduce((a, b) => a * b, 1n)).toBe(BigInt(n));
      for (const f of factors) expect(bruteIsPrime(Number(f))).toBe(true);
      expect([...factors].sort((a, b) => (a < b ? -1 : 1))).toEqual(factors);
    }
    expect(trialFactor(12n).factors).toEqual([2n, 2n, 3n]);
  });
  it('a semiprime of two close primes takes about √n steps', () => {
    const { factors, steps } = trialFactor(101n * 103n);
    expect(factors).toEqual([101n, 103n]);
    expect(steps).toBeGreaterThan(40);
  });
});

describe('toyRsa', () => {
  it('the textbook key p=61, q=53, e=17 gives d=2753', () => {
    expect(toyRsa(61n, 53n, 17n)).toEqual({ ok: true, n: 3233n, phi: 3120n, e: 17n, d: 2753n });
  });
  it('round-trips every message below n on toy keys', () => {
    for (const [p, q, e] of [
      [61n, 53n, 17n],
      [11n, 13n, 7n],
      [17n, 19n, 5n],
    ] as const) {
      const key = toyRsa(p, q, e);
      expect(key.ok).toBe(true);
      if (!key.ok) continue;
      for (let m = 0n; m < key.n; m++) expect(modPow(modPow(m, key.e, key.n), key.d, key.n)).toBe(m);
    }
  });
  it('explains why a key is invalid', () => {
    expect(toyRsa(4n, 7n, 5n)).toEqual({ ok: false, reason: "p = 4 isn't prime" });
    expect(toyRsa(7n, 7n, 5n).ok).toBe(false);
    const shared = toyRsa(61n, 53n, 3n); // φ = 3120 is divisible by 3
    expect(shared.ok).toBe(false);
    if (!shared.ok) expect(shared.reason).toContain('shares a factor');
    expect(toyRsa(61n, 53n, 1n)).toEqual({ ok: false, reason: 'e must be greater than 1' });
  });
  it('accepts any e > 1 coprime to φ, above φ too: 65537 with p = 61, q = 53 gives the same d as 17', () => {
    expect(toyRsa(61n, 53n, 65537n)).toEqual({ ok: true, n: 3233n, phi: 3120n, e: 65537n, d: 2753n });
    const key = toyRsa(11n, 13n, 127n); // φ = 120 < 127
    expect(key.ok).toBe(true);
    if (key.ok) for (let m = 0n; m < key.n; m++) expect(modPow(modPow(m, key.e, key.n), key.d, key.n)).toBe(m);
    expect(toyRsa(11n, 13n, 125n).ok).toBe(false); // 125 shares the factor 5 with 120
  });
});
