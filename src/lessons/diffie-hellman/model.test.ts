import { describe, expect, it } from 'vitest';
import { modPow } from '../../core/numberTheory';
import { ecdhAgree } from './ecdh';
import {
  DEFAULTS, EVE_SECRETS, bruteForce, bruteLog10Seconds, exchange, mix, gStrength, orderOf, paint, parseParams, sameMix,
} from './model';

const P = 23n;

describe('the exchange', () => {
  it('gives Bᵃ ≡ Aᵇ (mod p) for every a, b in 1 … p − 2 and every g on the toy group', () => {
    for (let g = 2n; g <= P - 2n; g++) {
      for (let a = 1n; a <= P - 2n; a++) {
        for (let b = 1n; b <= P - 2n; b++) {
          const x = exchange({ p: P, g, a, b }, false);
          expect(x.sAlice).toBe(x.sBob);
          // Independent of the model: both equal g^(ab) mod p.
          expect(x.sAlice).toBe(modPow(g, a * b, P));
        }
      }
    }
  });

  it('matches the hand-worked defaults: A = 8, B = 19, s = 2', () => {
    // 5⁶ = 15625 = 679·23 + 8; 5¹⁵ mod 23 = 19; 19⁶ mod 23 = 2 = 8¹⁵ mod 23.
    expect(exchange(DEFAULTS, false)).toMatchObject({ A: 8n, B: 19n, sAlice: 2n, sBob: 2n });
  });

  it('never sends the secret: A and B alone are what crosses the wire', () => {
    const x = exchange(DEFAULTS, false);
    expect([x.A, x.B]).not.toContain(x.sAlice);
  });
});

describe('man in the middle', () => {
  it('splits the secret on the defaults, and Eve holds both halves', () => {
    const x = exchange(DEFAULTS, true);
    expect(x.sAlice).not.toBe(x.sBob);
    expect(x.mitm!.withAlice).toBe(x.sAlice);
    expect(x.mitm!.withBob).toBe(x.sBob);
  });

  it('gives Eve each side\'s secret for every a and b, whether or not the two happen to coincide', () => {
    let coincide = 0;
    for (let a = 1n; a <= P - 2n; a++) {
      for (let b = 1n; b <= P - 2n; b++) {
        const x = exchange({ p: P, g: 5n, a, b }, true);
        expect(x.sAlice).toBe(modPow(5n, EVE_SECRETS.toAlice * a, P));
        expect(x.mitm!.withAlice).toBe(x.sAlice);
        expect(x.mitm!.withBob).toBe(x.sBob);
        if (x.sAlice === x.sBob) coincide++;
      }
    }
    // In a group this small some pairs coincide by chance; the caption is computed, never assumed.
    expect(coincide).toBeGreaterThan(0);
    expect(coincide).toBeLessThan(Number((P - 2n) * (P - 2n)) / 4);
  });
});

describe('the generator check', () => {
  it('counts the distinct values g makes, against brute force for every g mod 23', () => {
    for (let g = 2n; g <= P - 2n; g++) {
      const seen = new Set<bigint>();
      for (let k = 1n; k < P; k++) seen.add(modPow(g, k, P));
      expect(orderOf(g, P)).toBe(seen.size);
    }
    expect(orderOf(5n, P)).toBe(22);
    expect(orderOf(2n, P)).toBe(11);
  });

  it('calls a g weak only when its order is small, not for the prime-order subgroup real groups use', () => {
    expect(gStrength(5n, 23n)).toEqual({ order: 22, kind: 'generator' });
    // 23 = 2·11 + 1 is a safe prime: 2 generates the order-11 subgroup, on purpose in real groups.
    expect(gStrength(2n, 23n)).toEqual({ order: 11, kind: 'prime-subgroup' });
    // 5³ = 125 = 4·31 + 1: only 3 values.
    expect(gStrength(5n, 31n)).toEqual({ order: 3, kind: 'weak' });
    // 31 isn't a safe prime ((31 − 1)/2 = 15 isn't prime), so every non-generator mod 31 is weak.
    for (let g = 2n; g <= 29n; g++) {
      const { order, kind } = gStrength(g, 31n);
      expect(kind).toBe(order === 30 ? 'generator' : 'weak');
    }
  });
});

describe('Eve\'s brute force', () => {
  it('recovers the shared secret for every a, with a generator and with a weak g', () => {
    for (const g of [5n, 2n]) {
      for (let a = 1n; a <= P - 2n; a++) {
        const x = exchange({ p: P, g, a, b: 15n }, false);
        const eve = bruteForce(P, g, x.A, x.B);
        expect(eve.secret).toBe(x.sAlice);
        expect(modPow(g, eve.found, P)).toBe(x.A);
        if (g === 5n) expect(eve.found).toBe(a);
      }
    }
    expect(bruteForce(P, 5n, 8n, 19n)).toEqual({ found: 6n, tries: 6, secret: 2n });
  });

  it('projects a 617-digit p in log space, without overflowing', () => {
    expect(bruteLog10Seconds(617)).toBe(608);
    expect(Number.isFinite(bruteLog10Seconds(617))).toBe(true);
  });
});

describe('parseParams', () => {
  const base = { p: '23', g: '5', a: '6', b: '15' };
  const err = (patch: Partial<typeof base>) => {
    const r = parseParams({ ...base, ...patch });
    return r.ok ? null : r.error;
  };
  it('accepts the defaults and refuses hostile input with a message', () => {
    expect(parseParams(base)).toEqual({ ok: true, value: DEFAULTS });
    expect(err({ p: '21' })).toContain('isn\'t prime');
    expect(err({ p: '561' })).toContain('isn\'t prime');
    expect(err({ p: '' })).toBe('Type a prime p.');
    expect(err({ p: '  ' })).toBe('Type a prime p.');
    expect(err({ p: '-1' })).toBe('p must be a positive prime.');
    expect(err({ p: '1e400' })).toContain('isn\'t a whole number');
    expect(err({ p: '12345678901234567890123' })).toContain('Toy primes only');
    expect(err({ p: '<b>' })).toContain('isn\'t a whole number');
    expect(err({ p: '😀' })).toContain('isn\'t a whole number');
    expect(err({ g: '22' })).toBe('g must be between 2 and p − 2 = 21.');
    expect(err({ g: '1' })).toBe('g must be between 2 and p − 2 = 21.');
    expect(err({ a: '0' })).toBe('a must be between 1 and p − 2 = 21.');
    expect(err({ b: '1, ,2' })).toContain('isn\'t a whole number');
  });
});

describe('paint', () => {
  it('mixes to the same colour in either order, and Eve\'s two mixtures don\'t make it', () => {
    const base = paint('amber');
    const alice = paint('sky');
    const bob = paint('pink');
    const aliceSide = mix(mix(base, bob), alice);
    const bobSide = mix(mix(base, alice), bob);
    expect(aliceSide.color).toBe(bobSide.color);
    expect(sameMix(aliceSide, bobSide)).toBe(true);
    const eveGuess = mix(mix(base, alice), mix(base, bob));
    expect(sameMix(eveGuess, aliceSide)).toBe(false);
    expect(eveGuess.parts).toEqual(['amber', 'amber', 'pink', 'sky']);
  });
});

describe('ECDH (real WebCrypto)', () => {
  it('derives byte-equal 256-bit secrets on both sides, from non-extractable private keys', async () => {
    const r = (await ecdhAgree())!;
    expect(r.alice.secret).toHaveLength(32);
    expect([...r.alice.secret]).toEqual([...r.bob.secret]);
    expect(r.alice.publicRaw).toHaveLength(65);
    expect(r.alice.publicRaw[0]).toBe(4);
    expect(r.alice.privateExtractable).toBe(false);
    expect([...r.alice.publicRaw]).not.toEqual([...r.bob.publicRaw]);
  });
});
