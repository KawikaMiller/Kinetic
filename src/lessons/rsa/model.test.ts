import { describe, expect, it } from 'vitest';
import { sieve, toyRsa } from '../../core/numberTheory';
import { mulberry32 } from '../../core/random';
import {
  BITS_MAX, DEFAULT_PARAMS, decrypt, edited, encrypt, factorToy, fixedPoints, keygen, keygenError, parseMessage, parseParam,
  repeatedCiphertexts, runItems, sign, trialSeconds, unsign, verify, type RsaKey,
} from './model';

const PRIMES = sieve(200).primes.map(BigInt);
const keyOf = (p: bigint, q: bigint, e: bigint) => keygen({ p, q, e }).key;

/** Twenty seeded valid toy keys from primes under 200. */
function seededKeys(): RsaKey[] {
  const rnd = mulberry32(2026);
  const keys: RsaKey[] = [];
  while (keys.length < 20) {
    const p = PRIMES[Math.floor(rnd() * PRIMES.length)];
    const q = PRIMES[Math.floor(rnd() * PRIMES.length)];
    const e = BigInt(3 + Math.floor(rnd() * 200));
    const k = keyOf(p, q, e);
    if (k) keys.push(k);
  }
  return keys;
}

describe('keygen', () => {
  it('builds the textbook key: n = 3233, φ = 3120, d = 2753', () => {
    const k = keygen(DEFAULT_PARAMS).key!;
    expect([k.n, k.phi, k.d]).toEqual([3233n, 3120n, 2753n]);
    expect(toyRsa(61n, 53n, 17n)).toMatchObject({ ok: true, n: 3233n, phi: 3120n, d: 2753n });
  });

  it('agrees with core toyRsa on validity and d, for every prime pair under 60 and e from 2 to 60', () => {
    const small = PRIMES.filter((p) => p < 60n);
    for (const p of small) {
      for (const q of small) {
        for (let e = 2n; e <= 60n; e++) {
          const mine = keygen({ p, q, e });
          const ref = toyRsa(p, q, e);
          expect(mine.key !== null).toBe(ref.ok);
          if (ref.ok) expect(mine.key!.d).toBe(ref.d);
        }
      }
    }
  });

  it('gives a d with e·d ≡ 1 (mod φ), checked by multiplying', () => {
    for (const k of seededKeys()) expect((k.e * k.d) % k.phi).toBe(1n);
  });

  it('stops at the first failure with its own reason', () => {
    const cases: [bigint, bigint, bigint, string][] = [
      [57n, 53n, 17n, 'p = 57 isn\'t prime'],
      [61n, 51n, 17n, 'q = 51 isn\'t prime'],
      [61n, 61n, 17n, 'p and q are both 61'],
      [61n, 53n, 3120n, 'e = 3120 must be between 1 and φ = 3120'],
      [61n, 53n, 65537n, 'e = 65537 must be between 1 and φ = 3120'],
      [61n, 53n, 15n, 'gcd(e, φ) = 15'],
    ];
    const reasons = cases.map(([p, q, e, want]) => {
      const r = keygenError(keygen({ p, q, e }))!;
      expect(r).toContain(want);
      return r;
    });
    expect(new Set(reasons).size).toBe(cases.length);
    expect(keygen({ p: 57n, q: 53n, e: 17n }).steps[0].factors).toEqual([3n, 19n]);
    expect(keygen({ p: 61n, q: 53n, e: 15n }).steps.at(-1)!.id).toBe('gcd');
  });

  it('records the remainder table that finds d (Euclid on 3120 and 17)', () => {
    const euclid = keygen(DEFAULT_PARAMS).euclid!;
    // Worked by hand: 3120 = 183·17 + 9, 17 = 1·9 + 8, 9 = 1·8 + 1, 8 = 8·1 + 0.
    expect(euclid.map((s) => [s.a, s.b, s.q, s.r])).toEqual([
      [3120n, 17n, 183n, 9n], [17n, 9n, 1n, 8n], [9n, 8n, 1n, 1n], [8n, 1n, 8n, 0n],
    ]);
    // Back-substituting: 1 = 9 − 8 = 2·9 − 17 = 2·3120 − 367·17, so y = −367 and d = 3120 − 367 = 2753.
    expect(keygen(DEFAULT_PARAMS).y).toBe(-367n);
  });
});

describe('encrypt and decrypt', () => {
  it('round-trips every message below n on the textbook key', () => {
    const k = keyOf(61n, 53n, 17n)!;
    for (let m = 0n; m < k.n; m++) expect(decrypt(k, encrypt(k, m))).toBe(m);
  });

  it('round-trips every message below n on twenty seeded toy keys', () => {
    for (const k of seededKeys()) {
      for (let m = 0n; m < k.n; m++) {
        if (decrypt(k, encrypt(k, m)) !== m) throw new Error(`round trip failed for m = ${m} on n = ${k.n}`);
      }
    }
  });

  it('is a permutation: no two messages share a ciphertext', () => {
    const k = keyOf(61n, 53n, 17n)!;
    const seen = new Set<bigint>();
    for (let m = 0n; m < k.n; m++) seen.add(encrypt(k, m));
    expect(seen.size).toBe(Number(k.n));
  });

  it('matches a hand-worked value: 65¹⁷ mod 3233 = 2790', () => {
    const k = keyOf(61n, 53n, 17n)!;
    expect(encrypt(k, 65n)).toBe(2790n);
    expect(decrypt(k, 2790n)).toBe(65n);
  });

  it('is deterministic: equal letters give equal ciphertexts', () => {
    const k = keyOf(61n, 53n, 17n)!;
    const parsed = parseMessage({ mode: 'word', text: 'ABBA' }, k.n);
    if (!parsed.ok) throw new Error(parsed.error);
    const items = runItems(k, parsed.value);
    expect(repeatedCiphertexts(items)).toEqual([[0, 3], [1, 2]]);
    expect(items.every((it) => it.back === it.m)).toBe(true);
  });

  it('leaves 0, 1 and n − 1 unchanged on every key', () => {
    for (const k of seededKeys()) expect(fixedPoints(k)).toEqual([0n, 1n, k.n - 1n]);
  });
});

describe('sign and verify', () => {
  it('verifies sign(m) for every m, and fails for the edited message', () => {
    const k = keyOf(61n, 53n, 17n)!;
    for (let m = 0n; m < k.n; m++) {
      const s = sign(k, m);
      expect(unsign(k, s)).toBe(m);
      expect(verify(k, m, s)).toBe(true);
      expect(verify(k, edited(m, k.n), s)).toBe(false);
    }
  });

  it('edits to m + 1, or m − 1 at the top of the range', () => {
    expect(edited(42n, 3233n)).toBe(43n);
    expect(edited(3232n, 3233n)).toBe(3231n);
  });
});

describe('parseMessage', () => {
  const n = 3233n;
  it('refuses hostile input with a message and accepts what fits', () => {
    const err = (mode: 'number' | 'word', text: string) => {
      const r = parseMessage({ mode, text }, n);
      return r.ok ? null : r.error;
    };
    expect(err('number', '')).toBe('Type a message number.');
    expect(err('number', '   ')).toBe('Type a message number.');
    expect(err('number', '-1')).toContain('from 0 up to n − 1');
    expect(err('number', '3233')).toContain('smaller than n = 3233');
    expect(err('number', '12345678901234567890123')).toContain('smaller than n');
    expect(err('number', '1e400')).toContain('isn\'t a whole number');
    expect(err('number', '<b>')).toContain('isn\'t a whole number');
    expect(err('number', '1, ,2')).toContain('isn\'t a whole number');
    expect(err('number', '3,000')).toBeNull();
    expect(err('word', '')).toBe('Type a short word.');
    expect(err('word', '   ')).toBe('Type a short word.');
    expect(err('word', 'ABCDEFGHI')).toContain('8 characters');
    expect(err('word', '😀')).toContain('128512');
    expect(err('word', '<b>')).toBeNull();
  });

  it('refuses letters when n is too small for their codes', () => {
    const r = parseMessage({ mode: 'word', text: 'A' }, 15n);
    expect(r.ok ? null : r.error).toContain('"A" has code 65, which isn\'t below n = 15');
  });

  it('parses the key fields within the toy bounds', () => {
    expect(parseParam('p', '61')).toEqual({ ok: true, value: 61n });
    expect(parseParam('p', '10007').ok).toBe(false);
    expect(parseParam('e', '65537')).toEqual({ ok: true, value: 65537n });
    expect(parseParam('q', '-5')).toEqual({ ok: false, error: 'q must be a positive whole number.' });
    expect(parseParam('q', '').ok).toBe(false);
  });
});

describe('why size matters', () => {
  it('trial division recovers p and q of the textbook n in 28 steps', () => {
    // By hand: divisors 2, 3, 5 … 53 are 27 tries, plus 1 for the division by 53; then 53² > 61 ends it.
    expect(factorToy(3233n)).toEqual({ factors: [53n, 61n], steps: 28 });
  });

  it('recovers p and q of every seeded key', () => {
    for (const k of seededKeys()) {
      expect(factorToy(k.n).factors).toEqual(k.p < k.q ? [k.p, k.q] : [k.q, k.p]);
    }
  });

  it('projects 2048-bit trial division past the age of the universe, without overflowing', () => {
    const ageOfUniverse = 13.8e9 * 365.25 * 86400;
    expect(Number.isFinite(trialSeconds(BITS_MAX))).toBe(true);
    expect(trialSeconds(BITS_MAX)).toBeGreaterThan(ageOfUniverse);
    expect(trialSeconds(32)).toBeLessThan(1);
  });
});
