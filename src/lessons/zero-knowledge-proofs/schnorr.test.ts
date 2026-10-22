import { describe, expect, it } from 'vitest';
import { isProbablePrime } from '../../core/numberTheory';
import { mulberry32 } from '../../core/random';
import { nodeDigest } from '../../core/testing/nodeCrypto';
import {
  DEFAULT_R, DEFAULT_X, GROUP_A, GROUP_B, REAL_COST, SEARCH_REFUSAL, challengeText, commit, compareTriples, editsThatPass, extract, fiatShamirChallenge, guessAttempt, proveFiatShamir, publicKey,
  readExponent, realTriples, realYears, respond, searchSecret, simulate, simulatedTriples, verify, verifyFiatShamir, type Group,
} from './schnorr';

// An independent power function with plain repeated multiplication (no shared code with core/numberTheory).
const powSlow = (base: bigint, exp: bigint, m: bigint): bigint => {
  let acc = 1n;
  for (let i = 0n; i < exp; i++) acc = (acc * base) % m;
  return acc;
};

describe('the toy groups', () => {
  it.each([GROUP_A, GROUP_B])('group $id: p and q prime, p = 2q + 1, g is not 1 and g^q = 1 mod p, so g has order q', (G: Group) => {
    expect(isProbablePrime(G.p).prime).toBe(true);
    expect(isProbablePrime(G.q).prime).toBe(true);
    expect(G.p).toBe(2n * G.q + 1n);
    expect(G.g).not.toBe(1n);
    expect(powSlow(G.g, G.q, G.p)).toBe(1n);
    expect(G.p.toString(2)).toHaveLength(G.bits);
  });

  it('by hand for A: 2^11 = 2048 = 89 x 23 + 1; for B: 4 = 2^2 and 4^1019 = 2^2038 = 1 by Fermat', () => {
    expect(89n * 23n + 1n).toBe(2048n);
    expect(2n ** 11n % 23n).toBe(1n);
    expect(powSlow(2n, 2038n, 2039n)).toBe(1n);
  });
});

describe('the group A hand vectors (x = 7, y = 2^7 = 128 = 13)', () => {
  it('y = 13, r = 5 gives t = 9; c = 4 gives s = 0 and both sides 1; c = 3 gives s = 4 and both sides 16', () => {
    expect(publicKey(GROUP_A, DEFAULT_X)).toBe(13n);
    expect(commit(GROUP_A, DEFAULT_R)).toBe(9n);
    expect(respond(GROUP_A, DEFAULT_R, 4n, DEFAULT_X)).toBe(0n);
    // 13^2 = 169 = 8, 13^4 = 64 = 18, 9 x 18 = 162 = 1
    expect(verify(GROUP_A, 13n, 9n, 4n, 0n)).toEqual({ lhs: 1n, rhs: 1n, ok: true });
    expect(respond(GROUP_A, DEFAULT_R, 3n, DEFAULT_X)).toBe(4n);
    // 13^3 = 13 x 8 = 104 = 12, 9 x 12 = 108 = 16 and 2^4 = 16
    expect(verify(GROUP_A, 13n, 9n, 3n, 4n)).toEqual({ lhs: 16n, rhs: 16n, ok: true });
  });

  it('the extractor: (0 - 4) / (4 - 3) = -4 = 7 mod 11', () => {
    expect(extract(GROUP_A, 4n, 0n, 3n, 4n)).toBe(7n);
    expect(extract(GROUP_A, 4n, 0n, 4n, 0n)).toBeNull();
  });
});

describe('the group B vector (x = 100, r = 77, c = 500)', () => {
  it('y = 1153, t = 360, s = 146 and both sides 450, each by an independent slow power', () => {
    expect(powSlow(4n, 100n, 2039n)).toBe(1153n);
    expect(publicKey(GROUP_B, 100n)).toBe(1153n);
    expect(commit(GROUP_B, 77n)).toBe(360n);
    expect(powSlow(4n, 77n, 2039n)).toBe(360n);
    expect(respond(GROUP_B, 77n, 500n, 100n)).toBe(146n);
    expect(verify(GROUP_B, 1153n, 360n, 500n, 146n)).toEqual({ lhs: 450n, rhs: 450n, ok: true });
  });
});

describe('completeness and soundness', () => {
  it('completeness: every x, r and c in group A (10 x 11 x 11 = 1,210 combinations) is accepted; 10,000 seeded ones in group B', () => {
    let count = 0;
    for (let x = 1n; x < GROUP_A.q; x++) {
      const y = publicKey(GROUP_A, x);
      for (let r = 0n; r < GROUP_A.q; r++) {
        for (let c = 0n; c < GROUP_A.q; c++) {
          expect(verify(GROUP_A, y, commit(GROUP_A, r), c, respond(GROUP_A, r, c, x)).ok).toBe(true);
          count++;
        }
      }
    }
    expect(count).toBe(1210);
    const rnd = mulberry32(3);
    for (let i = 0; i < 10_000; i++) {
      const x = 1n + BigInt(Math.floor(rnd() * 1018));
      const r = BigInt(Math.floor(rnd() * 1019));
      const c = BigInt(Math.floor(rnd() * 1019));
      expect(verify(GROUP_B, publicKey(GROUP_B, x), commit(GROUP_B, r), c, respond(GROUP_B, r, c, x)).ok).toBe(true);
    }
  });

  it('the extractor recovers x from every pair of accepting answers to one commitment: all 110 ordered pairs of challenges for every x and r in A', () => {
    let pairs = 0;
    for (let x = 1n; x < GROUP_A.q; x++) {
      for (let r = 0n; r < GROUP_A.q; r++) {
        for (let c1 = 0n; c1 < GROUP_A.q; c1++) {
          for (let c2 = 0n; c2 < GROUP_A.q; c2++) {
            if (c1 === c2) continue;
            expect(extract(GROUP_A, c1, respond(GROUP_A, r, c1, x), c2, respond(GROUP_A, r, c2, x))).toBe(x);
            pairs++;
          }
        }
      }
    }
    expect(pairs).toBe(10 * 11 * 110);
  });

  it('a cheater guessing the challenge passes about 1,000/q rounds out of 1,000 seeded rounds, within 3 sigma, in each group; c = 0 always passes', () => {
    for (const [G, seed] of [[GROUP_A, 4], [GROUP_B, 4]] as const) {
      const y = publicKey(G, 5n);
      const rnd = mulberry32(seed);
      const q = Number(G.q);
      let pass = 0;
      for (let i = 0; i < 1000; i++) {
        const guess = BigInt(Math.floor(rnd() * q));
        const s = BigInt(Math.floor(rnd() * q));
        const challenge = BigInt(Math.floor(rnd() * q));
        if (guessAttempt(G, y, guess, s, challenge).ok) pass++;
      }
      const p = 1 / q;
      const sigma = Math.sqrt(1000 * p * (1 - p));
      expect(Math.abs(pass - 1000 * p), `group ${G.id}: ${pass} passes`).toBeLessThanOrEqual(3 * sigma);
      // a predictable verifier that always picks c = 0: any t = g^s passes
      for (let s = 0n; s < G.q; s++) expect(verify(G, y, commit(G, s), 0n, s).ok).toBe(true);
    }
  });

  it('manipulation 4: the exhaustive search over s finds x within q tries in both toy groups, and refuses any other group', () => {
    expect(searchSecret(GROUP_A, 13n)).toEqual({ x: 7n, tries: 8 });
    for (const G of [GROUP_A, GROUP_B]) {
      for (let x = 0n; x < G.q; x += G.q > 100n ? 37n : 1n) expect(searchSecret(G, publicKey(G, x)).x).toBe(x);
    }
    expect(() => searchSecret({ id: 'A', p: 1000003n, q: 500001n, g: 4n, bits: 20 }, 4n)).toThrow(SEARCH_REFUSAL);
  });

  it('the real-size cost line: about 2^128 steps and about 1e19 years at 10^12 steps per second', () => {
    expect(REAL_COST.log2).toBe(128);
    expect(realYears()).toBeGreaterThan(1.0e19);
    expect(realYears()).toBeLessThan(1.2e19);
  });
});

describe('zero knowledge, by exhaustion', () => {
  it('group A: the 121 real triples and the 121 simulated triples are the same multiset for every secret x in 1..10 (10 x 121 checks)', () => {
    for (let x = 1n; x < GROUP_A.q; x++) {
      const y = publicKey(GROUP_A, x);
      const real = realTriples(GROUP_A, x);
      const sim = simulatedTriples(GROUP_A, y);
      expect(real).toHaveLength(121);
      expect(sim).toHaveLength(121);
      const cmp = compareTriples(GROUP_A, y, real, sim);
      expect(cmp.identical, `x = ${x}`).toBe(true);
      expect(cmp.firstFailing).toBeNull();
      // each triple exactly once: no duplicates among the 121
      expect(new Set(real.map((t) => `${t.t}|${t.c}|${t.s}`)).size).toBe(121);
    }
  });

  it('a simulator that forgets y^(-c) fails: its triples differ from the real ones and the first one the verifier rejects is named', () => {
    const y = publicKey(GROUP_A, DEFAULT_X);
    const cmp = compareTriples(GROUP_A, y, realTriples(GROUP_A, DEFAULT_X), simulatedTriples(GROUP_A, y, true));
    expect(cmp.identical).toBe(false);
    expect(cmp.firstFailing).not.toBeNull();
    // 121 triples a side; the page says 110 simulated triples are not real (11 coincide, those with c x = 0), not 220
    expect([cmp.missing, cmp.unmatched]).toEqual([110, 110]);
    // by hand: c = 1, s = 0 gives t = 2^0 = 1 and 2^0 = 1 against 1 x 13^1 = 13: the equation fails
    expect(verify(GROUP_A, y, 1n, 1n, 0n).ok).toBe(false);
    // the correct simulator gives t = 13^-1 = 16 (13 x 16 = 208 = 9 x 23 + 1), and 16 x 13 = 208 = 1 = g^0
    expect(simulate(GROUP_A, y, 1n, 0n)).toBe(16n);
    expect(verify(GROUP_A, y, 16n, 1n, 0n).ok).toBe(true);
  });

  it('group B: the same equality over all 1,019 x 1,019 = 1,038,361 pairs', () => {
    const x = 100n;
    const y = publicKey(GROUP_B, x);
    const real = realTriples(GROUP_B, x);
    const sim = simulatedTriples(GROUP_B, y);
    expect(real).toHaveLength(1_038_361);
    expect(compareTriples(GROUP_B, y, real, sim).identical).toBe(true);
  }, 300_000);
});

describe('Fiat-Shamir', () => {
  it('c = SHA-256("kinetic-zk|23|2|13|9") mod 11 = 9 from node, s = 5 + 9 x 7 = 68 = 2, and both sides are 4', () => {
    expect(challengeText(GROUP_A, 13n, 9n)).toBe('kinetic-zk|23|2|13|9');
    const digest = BigInt(`0x${nodeDigest('sha256', 'kinetic-zk|23|2|13|9', 'hex')}`);
    expect(digest % 11n).toBe(9n);
    expect(fiatShamirChallenge(GROUP_A, 13n, 9n)).toBe(9n);
    const proof = proveFiatShamir(GROUP_A, 7n, 5n);
    expect(proof).toEqual({ y: 13n, t: 9n, c: 9n, s: 2n });
    // 2^2 = 4 and 13^9: 13^2 = 8, 13^4 = 18, 13^8 = 324 = 2, 13^9 = 26 = 3, 9 x 3 = 27 = 4
    expect(verifyFiatShamir(GROUP_A, 13n, 9n, 2n)).toEqual({ c: 9n, lhs: 4n, rhs: 4n, ok: true });
  });

  it('group B: x = 100, r = 77 gives t = 360, c = SHA-256(...) mod 1019 from node, and the proof verifies', () => {
    const proof = proveFiatShamir(GROUP_B, 100n, 77n);
    const text = challengeText(GROUP_B, proof.y, proof.t);
    expect(BigInt(`0x${nodeDigest('sha256', text, 'hex')}`) % 1019n).toBe(proof.c);
    expect(verifyFiatShamir(GROUP_B, proof.y, proof.t, proof.s).ok).toBe(true);
    expect(verify(GROUP_B, proof.y, proof.t, proof.c, proof.s).lhs).toBe(verify(GROUP_B, proof.y, proof.t, proof.c, proof.s).rhs);
  });

  it('manipulation 3: an edited t fails the check, except for the few values that slip through in a toy group (counted)', () => {
    const proof = proveFiatShamir(GROUP_A, 7n, 5n);
    let slipped = 0;
    let tried = 0;
    for (let t = 1n; t < GROUP_A.p; t++) {
      if (t === proof.t) continue;
      tried++;
      if (verifyFiatShamir(GROUP_A, proof.y, t, proof.s).ok) slipped++;
    }
    expect(tried).toBe(21);
    expect(verifyFiatShamir(GROUP_A, proof.y, 10n, proof.s).ok).toBe(false);
    // about 1 in q = 11 edited commitments slips through: that is the toy, and the page says so
    expect(slipped).toBeLessThanOrEqual(5);
    expect(slipped).toBeGreaterThanOrEqual(0);
  });

  it('the page counts the edits that slip through from the model: an independent count (node SHA-256, repeated multiplication) agrees in both groups, and the old "1 in 11" claim fails', () => {
    for (const [G, x, r] of [[GROUP_A, 7n, 5n], [GROUP_B, 100n, 77n]] as const) {
      const y = powSlow(G.g, x, G.p);
      const t = powSlow(G.g, r, G.p);
      const hashC = (tt: bigint) => BigInt(`0x${nodeDigest('sha256', `kinetic-zk|${G.p}|${G.g}|${y}|${tt}`, 'hex')}`) % G.q;
      const s = (r + hashC(t) * x) % G.q;
      let tried = 0;
      let passing = 0;
      for (let e = 1n; e < G.p; e++) {
        if (e === t) continue;
        tried++;
        const c = hashC(e);
        if (powSlow(G.g, s, G.p) === (e * powSlow(y, c, G.p)) % G.p) passing++;
      }
      expect(editsThatPass(G, x, r)).toEqual({ tried, passing });
    }
    // group A, x = 7, r = 5: 21 other values, 1 in 11 would be 2; the count is higher because only subgroup elements can pass
    const a = editsThatPass(GROUP_A, 7n, 5n);
    expect(a.tried).toBe(21);
    expect(a.passing).not.toBe(Math.round(21 / 11));
  });

  it('the toy guard: extract refuses a group that is not one of the two toys, like searchSecret', () => {
    const real: Group = { id: 'A', p: 1000003n, q: 500001n, g: 2n, bits: 20 };
    expect(() => extract(real, 4n, 0n, 3n, 4n)).toThrow(SEARCH_REFUSAL);
    expect(extract(GROUP_A, 4n, 0n, 3n, 4n)).toBe(7n);
  });

});

describe('readExponent: the one reader behind the x and r fields of three scenes', () => {
  it('keeps a value inside the bounds as a bigint', () => {
    expect(readExponent('7', 'x', 1n, 10n)).toEqual({ ok: true, value: 7n });
    expect(readExponent(' 10 ', 'x', 1n, 10n)).toEqual({ ok: true, value: 10n });
    expect(readExponent('0', 'r', 0n, 10n)).toEqual({ ok: true, value: 0n });
  });

  it('refuses out-of-range values with the sentence the scenes showed before, naming the field and both bounds', () => {
    expect(readExponent('0', 'x', 1n, 10n)).toEqual({ ok: false, error: 'Keep x between 1 and 10.' });
    expect(readExponent('11', 'x', 1n, 10n)).toEqual({ ok: false, error: 'Keep x between 1 and 10.' });
    expect(readExponent('-1', 'r', 0n, 10n)).toEqual({ ok: false, error: 'Keep r between 0 and 10.' });
  });

  it('refuses empty, decimal, exponent, sign and markup text, and a 400-digit run, without throwing', () => {
    for (const text of ['', '  ', '1.5', '1e3', '+7', '<b>7</b>', 'x'.repeat(3), '9'.repeat(400)]) {
      expect(readExponent(text, 'x', 1n, 10n).ok, text).toBe(false);
    }
  });
});
