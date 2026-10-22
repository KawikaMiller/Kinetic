import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import {
  BAD_SOURCE_CASE, BYTE_PRIME, HAND_COEFFS, HAND_SECRET, SOURCE_SUPPORT, bytesText, SECRECY_WORK_LIMIT, consistentCounts, coefficientsFor, exhaustiveSecrecy, secrecyButtonText, secrecyWork, sharesLeaveText, interpolateAnyway, makeShares, parseWord, possibleSecrets, rebuild,
  reconstruct, reconstructByElimination, reconstructChecked, refusalFor, shareBytes, signed, drawCoeffs, DEFAULT_WORD,
  type Share,
} from './shamir';

const sh = (pairs: [number, number][]): Share[] => pairs.map(([x, y]) => ({ x: BigInt(x), y: BigInt(y) }));
const pairsOf = (shares: readonly Share[]) => shares.map((s) => [Number(s.x), Number(s.y)]);

describe('GF(7) hand vectors', () => {
  it('k = 2, s = 3, a1 = 2: f = 3 + 2x gives (1,5) (2,0) (3,2) (4,4) (5,6); shares 1 and 3 rebuild 3 with basis values 5 and 3', () => {
    // f(2) = 3 + 4 = 7 = 0; f(1) = 5; f(3) = 9 = 2; f(4) = 11 = 4; f(5) = 13 = 6 (all mod 7)
    const shares = makeShares(7n, 3n, [2n], [1n, 2n, 3n, 4n, 5n]);
    expect(pairsOf(shares)).toEqual([[1, 5], [2, 0], [3, 2], [4, 4], [5, 6]]);
    const r = reconstruct(7n, [shares[0], shares[2]]);
    // L1(0) = (0-3)/(1-3) = 3/2 = 3 * 4 = 12 = 5; L3(0) = (0-1)/(3-1) = -1/2 = -4 = 3; s = 5*5 + 3*2 = 31 = 3
    expect(r.basis).toEqual([5n, 3n]);
    expect(r.secret).toBe(3n);
  });

  it('k = 3, f = 2 + 3x + x^2: shares (1,6) (2,5) (3,6) (4,2) (5,0) (6,0)', () => {
    const shares = makeShares(7n, 2n, [3n, 1n], [1n, 2n, 3n, 4n, 5n, 6n]);
    expect(pairsOf(shares)).toEqual([[1, 6], [2, 5], [3, 6], [4, 2], [5, 0], [6, 0]].map(([x, y]) => [x, y]));
  });

  it('the shares (1,6) and (2,5) fit every secret 0..6 with exactly one polynomial each, listed by hand', () => {
    const held = sh([[1, 6], [2, 5]]);
    expect(consistentCounts(7, 3, held)).toEqual([1, 1, 1, 1, 1, 1, 1]);
    const byHand: [number, number, number][] = [[0, 6, 0], [1, 1, 4], [2, 3, 1], [3, 5, 5], [4, 0, 2], [5, 2, 6], [6, 4, 3]];
    for (const [s, a1, a2] of byHand) {
      // s + a1 + a2 = 6 and s + 2 a1 + 4 a2 = 5 (mod 7)
      expect((s + a1 + a2) % 7).toBe(6);
      expect((s + 2 * a1 + 4 * a2) % 7).toBe(5);
    }
  });

  it('with no shares every secret has p^(k-1) polynomials, with k shares exactly one polynomial exists and it names the secret', () => {
    expect(consistentCounts(7, 3, [])).toEqual(Array(7).fill(49));
    expect(consistentCounts(7, 2, [])).toEqual(Array(7).fill(7));
    expect(consistentCounts(7, 3, sh([[1, 6], [2, 5], [3, 6]]))).toEqual([0, 0, 1, 0, 0, 0, 0]);
  });
});

describe('perfect secrecy, exhaustively', () => {
  it('GF(7), k = 3: 15 pairs of x-values times 49 pairs of y-values = 735 share pairs, 5,145 checks, each candidate exactly one polynomial', () => {
    const r = exhaustiveSecrecy(7, 3);
    expect([r.cases, r.checks, r.exactlyOne]).toEqual([735, 5145, true]);
  });

  it('GF(7), k = 2: 6 x-values times 7 y-values = 42 single shares; GF(5), k = 3 and GF(11), k = 2 as well, so the claim is not tuned to p = 7', () => {
    expect(exhaustiveSecrecy(7, 2)).toEqual({ cases: 42, checks: 294, exactlyOne: true });
    expect(exhaustiveSecrecy(5, 3)).toEqual({ cases: 6 * 25, checks: 6 * 25 * 5, exactlyOne: true });
    expect(exhaustiveSecrecy(11, 2).exactlyOne).toBe(true);
  });
});

describe('reconstruction, two formulations', () => {
  it('Lagrange interpolation at 0 equals Gaussian elimination on the Vandermonde system for 1,000 seeded cases', () => {
    const rnd = mulberry32(77);
    const primes = [5, 7, 11, 257];
    for (let c = 0; c < 1000; c++) {
      const p = primes[Math.floor(rnd() * primes.length)];
      const maxK = Math.min(4, p - 1);
      const k = 2 + Math.floor(rnd() * (maxK - 1));
      const n = Math.min(p - 1, k + Math.floor(rnd() * 3));
      const secret = BigInt(Math.floor(rnd() * p));
      const coeffs = Array.from({ length: k - 1 }, () => BigInt(Math.floor(rnd() * p)));
      const xs = Array.from({ length: p - 1 }, (_, i) => BigInt(i + 1)).sort(() => rnd() - 0.5).slice(0, n);
      const all = makeShares(BigInt(p), secret, coeffs, xs);
      const subset = all.slice(0, k);
      expect(reconstruct(BigInt(p), subset).secret).toBe(secret);
      expect(reconstructByElimination(BigInt(p), subset)).toBe(secret);
    }
  });

  it('all C(n, k) subsets rebuild the secret: 10 for 3-of-5, 15 for 4-of-6', () => {
    for (const [k, n] of [[3, 5], [4, 6]]) {
      const coeffs = drawCoeffs(9, k - 1, 257n);
      const shares = makeShares(257n, 200n, coeffs, Array.from({ length: n }, (_, i) => BigInt(i + 1)));
      let subsets = 0;
      const walk = (start: number, chosen: Share[]) => {
        if (chosen.length === k) {
          subsets++;
          expect(reconstruct(257n, chosen).secret).toBe(200n);
          return;
        }
        for (let i = start; i < n; i++) walk(i + 1, [...chosen, shares[i]]);
      };
      walk(0, []);
      expect(subsets).toBe(k === 3 ? 10 : 15);
    }
  });

  it('k - 1 shares interpolated give a different value on at least 98% of 1,000 seeded GF(257) cases (the rate is printed, not pinned)', () => {
    const rnd = mulberry32(5);
    let different = 0;
    for (let c = 0; c < 1000; c++) {
      const secret = BigInt(Math.floor(rnd() * 257));
      const coeffs = [BigInt(Math.floor(rnd() * 257)), BigInt(Math.floor(rnd() * 257))];
      const two = makeShares(257n, secret, coeffs, [1n, 2n]);
      if (reconstruct(257n, two).secret !== secret) different++;
    }
    expect(different / 1000).toBeGreaterThanOrEqual(0.98);
  });
});

describe('the GF(257) hand vector', () => {
  const coeffs = [...HAND_COEFFS];
  const s = shareBytes([HAND_SECRET], 3, 5, [coeffs]);

  it('shares (1,199) (2,213) (3,84) (4,69) (5,168), Lagrange coefficients 3, -3, 1 and secret 42 from 1, 2, 3', () => {
    // f(1) = 42 + 100 + 57 = 199; f(2) = 42 + 200 + 228 = 470 = 213; f(3) = 42 + 300 + 513 = 855 = 84; f(4) = 1354 = 69; f(5) = 1967 = 168
    expect(s.shares.map((row, i) => [i + 1, Number(row[0])])).toEqual([[1, 199], [2, 213], [3, 84], [4, 69], [5, 168]]);
    const r = rebuild(s, [1, 2, 3]);
    expect(r.ok && r.basis.map((b) => signed(b, 257n))).toEqual([3n, -3n, 1n]);
    expect(r.ok && r.secretBytes).toEqual([42]);
    expect(r.ok && r.sum).toBe('3 x 199 + -3 x 213 + 1 x 84 = 42 = 42 mod 257');
  });

  it('all 10 subsets give 42, and {2, 4, 5} is one of them', () => {
    const subsets: number[][] = [];
    for (let a = 1; a <= 5; a++) for (let b = a + 1; b <= 5; b++) for (let c = b + 1; c <= 5; c++) subsets.push([a, b, c]);
    expect(subsets).toHaveLength(10);
    for (const sub of subsets) expect(rebuild(s, sub)).toMatchObject({ ok: true, secretBytes: [42] });
  });

  it('manipulation 1: two of three shares are refused with the reason, and "interpolate anyway" reads 185 (slope 14, intercept 185), not 42', () => {
    expect(rebuild(s, [1, 2])).toEqual({ ok: false, error: '2 shares of a 3-of-5 scheme: every one of the 257 secrets fits equally well.' });
    expect(refusalFor(1, 3, 5)).toContain('1 share of a 3-of-5');
    // by hand: slope (213 - 199) / (2 - 1) = 14, intercept 199 - 14 = 185
    expect(interpolateAnyway(s, [1, 2])).toEqual([185]);
    expect(interpolateAnyway(s, [1, 2])[0]).not.toBe(42);
  });

  it('edge secrets 0 and 255 round trip, and k = n needs every share', () => {
    for (const secret of [0, 255]) {
      const sh2 = shareBytes([secret], 3, 5, [drawCoeffs(3, 2, 257n)]);
      expect(rebuild(sh2, [2, 3, 5])).toMatchObject({ ok: true, secretBytes: [secret] });
    }
    const full = shareBytes([42], 3, 3, [drawCoeffs(3, 2, 257n)]);
    expect(rebuild(full, [1, 2, 3])).toMatchObject({ ok: true, secretBytes: [42] });
    expect(rebuild(full, [1, 2]).ok).toBe(false);
  });
});

describe('words', () => {
  it('a word of up to 6 printable ASCII characters round trips byte by byte with seeded coefficients', () => {
    const parsed = parseWord(DEFAULT_WORD);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const coeffs = coefficientsFor(parsed.bytes, 3, 12, null);
    const shares = shareBytes(parsed.bytes, 3, 5, coeffs);
    const r = rebuild(shares, [2, 4, 5]);
    expect(r.ok && bytesText(r.secretBytes)).toBe(DEFAULT_WORD);
  });

  it('refuses an empty word, seven characters and non-printable characters with the reason', () => {
    expect(parseWord('')).toEqual({ ok: false, error: 'Type 1 to 6 characters.' });
    expect(parseWord('toolong')).toEqual({ ok: false, error: 'Keep the word to at most 6 characters.' });
    expect(parseWord('a\tb')).toEqual({ ok: false, error: 'Use printable ASCII characters only.' });
    expect(parseWord('abcdef')).toMatchObject({ ok: true });
  });
});

describe('where it goes wrong', () => {
  const good = sh([[1, 199], [2, 213], [3, 84]]);

  it('manipulation 2: share 3 changed from 84 to 85 rebuilds 43 with no error', () => {
    expect(reconstructChecked(good)).toEqual({ ok: true, secret: 42n });
    // the error of 1 is multiplied by L3 = 1
    expect(reconstructChecked(sh([[1, 199], [2, 213], [3, 85]]))).toEqual({ ok: true, secret: 43n });
  });

  it('x = 0 and a repeated x are refused with their reasons', () => {
    expect(reconstructChecked(sh([[0, 42], [2, 213], [3, 84]]))).toEqual({ ok: false, error: 'x = 0 is the secret itself: share 1 cannot have it.' });
    expect(reconstructChecked(sh([[1, 199], [1, 213], [3, 84]]))).toEqual({ ok: false, error: 'Two shares with the same x are one point: shares 1 and 2 both use x = 1.' });
  });

  it('manipulation 3: with the 0-or-1 coefficient source only 1 of 7 secrets stays possible, against 7 of 7 for the uniform source', () => {
    const c = BAD_SOURCE_CASE;
    const shares = makeShares(7n, BigInt(c.secret), [...c.coeffs], [...c.xs]);
    expect(pairsOf(shares)).toEqual([[1, 4], [2, 1]]);
    expect(possibleSecrets(7, shares, SOURCE_SUPPORT.uniform(7))).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(possibleSecrets(7, shares, SOURCE_SUPPORT['zero-or-one'](7))).toEqual([2]);
    // by hand: (0,0) needs s = 4 and 4 + 0 + 0 != 1; (0,1) needs 3, 3 + 0 + 4 = 0 != 1; (1,0) needs 3, 3 + 2 + 0 = 5 != 1; only (1,1): s = 2 and 2 + 2 + 4 = 8 = 1
    const byBrute: number[] = [];
    for (let s = 0; s < 7; s++) for (const a1 of [0, 1]) for (const a2 of [0, 1]) if ((s + a1 + a2) % 7 === 4 && (s + 2 * a1 + 4 * a2) % 7 === 1) byBrute.push(s);
    expect(byBrute).toEqual([2]);
  });

  it('the field constants: 257 is a 9-bit prime and 7 is 3 bits', () => {
    expect(BYTE_PRIME.toString(2)).toHaveLength(9);
  });
});

describe('the theorem label and the stat grammar come from the model', () => {
  it('GF(11) with k = 3 holds exhaustively (5,445 cases, 59,895 checks, one polynomial per secret): the button is off for cost only', () => {
    expect(secrecyWork(11, 3)).toBeGreaterThan(SECRECY_WORK_LIMIT);
    expect(exhaustiveSecrecy(11, 3)).toEqual({ cases: 5445, checks: 59_895, exactlyOne: true });
  }, 120_000);

  it('walking every field and threshold of the first scene: the label says the button checks exactly where it is offered, and names cost where it is off', () => {
    for (const p of [5, 7, 11]) {
      for (const k of [2, 3]) {
        const text = secrecyButtonText(p, k);
        if (secrecyWork(p, k) <= SECRECY_WORK_LIMIT) expect(text, `${p} ${k}`).toBe(`the button checks GF(${p}) with threshold ${k} exhaustively`);
        else {
          expect(text, `${p} ${k}`).toContain('only because the check costs too much');
          expect(text).not.toContain('checks GF(');
          expect(text).toContain('5,445 cases and 59,895 checks');
        }
      }
    }
  });

  it('k - 1 shares read "1 share leaves" and "2 shares leave"', () => {
    expect(sharesLeaveText(2)).toBe('1 share leaves every secret possible');
    expect(sharesLeaveText(3)).toBe('2 shares leave every secret possible');
    for (const k of [2, 3]) expect(sharesLeaveText(k)).not.toMatch(/\b1 shares\b/);
  });
});
