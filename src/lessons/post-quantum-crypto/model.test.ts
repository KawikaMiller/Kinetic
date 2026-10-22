import { describe, expect, it } from 'vitest';
import { gcd } from '../../core/numberTheory';
import { mulberry32 } from '../../core/random';
import { nodeHkdf } from '../../core/testing/nodeCrypto';
import {
  HYBRID_INFO, ML_KEM_SETS, P256_SHARE_BYTES, bitDistance, ciphertextBytes, combine, decapsulate, encapsulate, flipBit, hybridInput, hybridShareBytes, publicKeyBytes,
} from './kem';
import {
  BAD, DEFAULT_TARGET, GOOD, T_MAX, T_MIN, babai, badBasisShare, distanceText, inLattice, latticePoints, nearestPoint, normSq, orthogonalityDefect, det,
} from './lattice';
import {
  BROKEN_SEED, FAILING_MEAN_PERCENT, FAILING_SEEDS_WITH_ANY_FAILURE, DEFAULT_PARAMS, DEFAULT_SEED, FAILING_PARAMS, NOISE_LIMIT, Q, SEARCH_SPACE, SEVERE_FAILURES, accumulatedNoise, candidateSearch, centred, decodesCorrectly,
  decryptBit, encryptBit, encryptByte, keyFor, keygen, messageBits, sweep, trialStream, type LweParams,
} from './lwe';
import { MOSCA_PRESETS, X_MAX, Y_MAX, Z_MAX, harvestCells, slackText, verdict } from './mosca';
import { ADMITTED_COUNT, N_MAX, baseTable, checkN, isPrimePower, isRun, orderByLoop, orderByModPow, shorRun } from './shor';

describe('Mosca', () => {
  it('the verdict equals x + y > z over the whole slider grid (51 x 21 x 51), with the strict boundary', () => {
    let cases = 0;
    for (let x = 0; x <= X_MAX; x++) {
      for (let y = 0; y <= Y_MAX; y++) {
        for (let z = 0; z <= Z_MAX; z++) {
          const v = verdict({ x, y, z });
          expect(v.atRisk).toBe(x + y > z);
          expect(v.slack).toBe(z - x - y);
          cases++;
        }
      }
    }
    expect(cases).toBe(51 * 21 * 51);
  });

  it('hand cases: 10 + 5 > 12 (slack -3), 5 + 2 <= 12 (slack 5), and 10 + 5 = 15 is not at risk when z = 15', () => {
    expect(verdict({ x: 10, y: 5, z: 12 })).toEqual({ exposure: 15, slack: -3, atRisk: true });
    expect(verdict({ x: 5, y: 2, z: 12 })).toEqual({ exposure: 7, slack: 5, atRisk: false });
    expect(verdict({ x: 10, y: 5, z: 15 })).toEqual({ exposure: 15, slack: 0, atRisk: false });
    expect(slackText(-3)).toBe('slack -3');
  });

  it('a signature is judged like secrecy, x + y > z: x is 0 only when it is checked at the moment it is made (the old model ignored x and called a fielded firmware root key safe)', () => {
    // a signature checked once: only the migration counts
    expect(verdict({ x: 0, y: 10, z: 12 })).toEqual({ exposure: 10, slack: 2, atRisk: false });
    // the same migration with a key that stays trusted in fielded devices for 15 years is exposed
    expect(verdict({ x: 15, y: 10, z: 12 })).toEqual({ exposure: 25, slack: -13, atRisk: true });
    expect(MOSCA_PRESETS.map((p) => [p.protects, verdict(p.values).atRisk])).toEqual([['secrecy', false], ['secrecy', true], ['signature', false], ['signature', true]]);
    // the page's four presets use only values the sliders reach
    for (const p of MOSCA_PRESETS) expect([p.values.x <= X_MAX, p.values.y <= Y_MAX, p.values.z <= Z_MAX]).toEqual([true, true, true]);
  });

  it('the timeline cells are sorted by year over the whole slider grid, always contain today, the machine at z and the horizon at x + y, and a signature never reads "recorded"', () => {
    let cases = 0;
    for (let x = 0; x <= X_MAX; x += 5) {
      for (let y = 0; y <= Y_MAX; y += 4) {
        for (let z = 0; z <= Z_MAX; z += 5) {
          for (const protects of ['secrecy', 'signature'] as const) {
            const cells = harvestCells({ x, y, z }, protects);
            expect(cells.map((c) => c.year), `${x} ${y} ${z}`).toEqual([...cells.map((c) => c.year)].sort((p, q) => p - q));
            expect(cells.map((c) => c.role).sort()).toEqual(['horizon', 'machine', 'today']);
            expect(cells.find((c) => c.role === 'machine')!.year).toBe(z);
            expect(cells.find((c) => c.role === 'horizon')!.year).toBe(x + y);
            expect(cells.find((c) => c.role === 'horizon')!.atRisk).toBe(verdict({ x, y, z }).atRisk);
            if (protects === 'signature') expect(cells.map((c) => c.text).join(' ')).not.toMatch(/record/);
            cases++;
          }
        }
      }
    }
    expect(cases).toBe(11 * 6 * 11 * 2);
    // x + y before z: the horizon comes before the machine
    expect(harvestCells({ x: 2, y: 3, z: 12 }, 'secrecy').map((c) => c.role)).toEqual(['today', 'horizon', 'machine']);
    expect(harvestCells({ x: 10, y: 5, z: 12 }, 'secrecy').map((c) => c.role)).toEqual(['today', 'machine', 'horizon']);
  });
});

describe('Shor emulation', () => {
  it('the hand rows: 15/7 order 4 factors 3 and 5; 15/14 fails on a^(r/2) = -1; 21/4 order 3 is odd; 21/2 order 6 factors 7 and 3', () => {
    const r157 = shorRun(15, 7);
    expect(isRun(r157) && [r157.r, r157.steps, r157.half, r157.factors, r157.powers]).toEqual([4, 4, 4, [3, 5], [7, 4, 13, 1]]);
    const r1514 = shorRun(15, 14);
    expect(isRun(r1514) && [r1514.r, r1514.failure]).toEqual([2, 'a^(r/2) = -1']);
    const r214 = shorRun(21, 4);
    expect(isRun(r214) && [r214.r, r214.failure]).toEqual([3, 'r is odd']);
    const r212 = shorRun(21, 2);
    expect(isRun(r212) && [r212.r, r212.half, r212.factors, r212.powers]).toEqual([6, 8, [7, 3], [2, 4, 8, 16, 11, 1]]);
  });

  it('counts: 6 of 7 bases in 2..14 work for N = 15 (6 of phi = 8), and 6 of 11 for N = 21 (6 of phi = 12, exactly half)', () => {
    const t15 = baseTable(15);
    expect([t15.coprime, t15.works, t15.phi]).toEqual([7, 6, 8]);
    expect(t15.rows.map((r) => r.a)).toEqual([2, 4, 7, 8, 11, 13, 14]);
    const t21 = baseTable(21);
    expect([t21.coprime, t21.works, t21.phi]).toEqual([11, 6, 12]);
    expect(t21.rows.filter((r) => r.run.failure === null).map((r) => r.a)).toEqual([2, 8, 10, 11, 13, 19]);
    expect(t21.rows.filter((r) => r.run.failure === 'r is odd').map((r) => r.a)).toEqual([4, 16]);
    expect(t21.rows.filter((r) => r.run.failure === 'a^(r/2) = -1').map((r) => r.a)).toEqual([5, 17, 20]);
  });

  it('the loop order equals a second method (BigInt modPow search) for every coprime base of every admitted N up to 999; factors multiply to N exactly when the base works', () => {
    let admitted = 0;
    for (let N = 3; N <= N_MAX; N += 2) {
      if (!checkN(N).ok) continue;
      admitted++;
      for (let a = 2; a < N; a++) {
        if (gcd(BigInt(a), BigInt(N)) !== 1n) {
          expect(shorRun(N, a)).toHaveProperty('ok', false);
          continue;
        }
        const run = shorRun(N, a);
        if (!isRun(run)) throw new Error('coprime base refused');
        expect(run.r).toBe(orderByModPow(a, N));
        expect(run.r).toBe(orderByLoop(a, N)!.r);
        if (run.failure === null) {
          const [f, g] = run.factors!;
          expect(f * g).toBe(N);
          expect(f).toBeGreaterThan(1);
          expect(g).toBeGreaterThan(1);
        } else {
          expect(run.factors).toBeNull();
        }
      }
    }
    expect(admitted).toBeGreaterThan(100);
  }, 120_000);

  it('manipulation 2: a = 14 for N = 15 fails with a named reason, and the counted share of working bases for N = 35 is printed', () => {
    const run = shorRun(15, 14);
    expect(isRun(run) && run.failure).toBe('a^(r/2) = -1');
    const t35 = baseTable(35);
    expect([t35.coprime, t35.works]).toEqual([23, 18]);
  });

  it('refuses even N, primes, prime powers and N above 999, each with its reason, and a base that shares a factor', () => {
    expect(checkN(14)).toEqual({ ok: false, error: '14 is even: 2 is already a factor, so no order finding is needed.' });
    expect(checkN(13)).toMatchObject({ ok: false, error: '13 is prime: there is nothing to factor.' });
    expect(checkN(27)).toMatchObject({ ok: false });
    expect((checkN(27) as { error: string }).error).toContain('prime power');
    expect((checkN(1001) as { error: string }).error).toContain('above 999');
    expect(checkN(999)).toEqual({ ok: true });
    expect(checkN(1000)).toMatchObject({ ok: false });
    expect(isPrimePower(125)).toBe(true);
    expect(isPrimePower(15)).toBe(false);
    expect(shorRun(15, 3)).toMatchObject({ ok: false });
  });
});

describe('toy LWE', () => {
  const bitOf = (rnd: () => number): 0 | 1 => (rnd() < 0.5 ? 0 : 1);

  it('the decoder agrees with the analytic rule |centred(eps)| <= 24 over 100,000 seeded trials with zero disagreements, wrapping noise included', () => {
    let trials = 0;
    let wrapped = 0;
    for (let seed = 0; seed < 100; seed++) {
      const rnd = mulberry32(1000 + seed);
      const p: LweParams = { n: 2 + (seed % 7), m: 4 + (seed % 13), B: (seed * 7) % 16 };
      const kp = keygen(p, rnd);
      for (let t = 0; t < 1000; t++) {
        const bit = bitOf(rnd);
        const ct = encryptBit(kp.pub, bit, rnd);
        const eps = accumulatedNoise(kp.e, ct);
        if (Math.abs(eps) >= Q / 2) wrapped++;
        expect(decryptBit(kp.s, ct).bit === bit).toBe(decodesCorrectly(eps));
        trials++;
      }
    }
    expect(trials).toBe(100_000);
    expect(wrapped).toBeGreaterThan(0);
  });

  it('the centred reduction: 24 is fine, 25 fails, 74 wraps to -24 and decodes right by accident', () => {
    expect([centred(24), centred(25), centred(48), centred(49), centred(74), centred(-25)]).toEqual([24, 25, 48, -49, -24, -25]);
    expect([24, 25, 74, 73].map(decodesCorrectly)).toEqual([true, false, true, false]);
    expect(NOISE_LIMIT).toBe(24);
  });

  it('B = 0 gives eps = 0 and every trial correct', () => {
    for (const n of [2, 4, 8]) {
      const rnd = mulberry32(n);
      const kp = keygen({ n, m: 16, B: 0 }, rnd);
      for (let t = 0; t < 200; t++) {
        const ct = encryptBit(kp.pub, bitOf(rnd), rnd);
        expect(accumulatedNoise(kp.e, ct)).toBe(0);
      }
      expect(sweep({ n, m: 16, B: 0 }, 3).failures).toBe(0);
    }
  });

  it('the default parameters never fail on seeds 0..199, and the failing preset fails on the pinned lowest seed, at less than 90% of seeds', () => {
    let lowest = -1;
    let severe = 0;
    for (let seed = 0; seed < 200; seed++) {
      expect(sweep(DEFAULT_PARAMS, seed).failures, `default seed ${seed}`).toBe(0);
      const failures = sweep(FAILING_PARAMS, seed).failures;
      if (failures >= SEVERE_FAILURES) {
        severe++;
        if (lowest < 0) lowest = seed;
      }
    }
    expect(lowest).toBe(BROKEN_SEED);
    expect(BROKEN_SEED).not.toBe(0);
    expect(severe / 200).toBeLessThanOrEqual(0.9);
    expect(severe).toBeGreaterThan(0);
    const broken = sweep(FAILING_PARAMS, BROKEN_SEED);
    expect(broken.failures).toBeGreaterThanOrEqual(SEVERE_FAILURES);
    // the stated reason: the first failing trial's centred noise passed 24
    expect(Math.abs(broken.firstFailure!.epsCentred)).toBeGreaterThan(NOISE_LIMIT);
  });

  it('manipulation 1: raising B on the default key until bits fail, the count printed and the cause named', () => {
    const results = [0, 2, 5, 8, 12].map((B) => sweep({ n: 4, m: 8, B }, DEFAULT_SEED).failures);
    expect(results.slice(0, 3)).toEqual([0, 0, 0]);
    expect(results[3]).toBeGreaterThan(0);
    expect(results[4]).toBeGreaterThan(results[3]);
    const kp = keyFor(FAILING_PARAMS, DEFAULT_SEED);
    const rows = encryptByte(kp, messageBits(DEFAULT_SEED), trialStream(DEFAULT_SEED));
    for (const row of rows) expect(row.ok).toBe(decodesCorrectly(row.eps));
    expect(rows).toHaveLength(8);
  });

  it('the n = 2 candidate set always holds the true secret, is never empty and is searched over 98^2 = 9,604 secrets; other n are refused', () => {
    expect(SEARCH_SPACE).toBe(9604);
    for (const seed of [1, 2, 3, 7]) {
      for (const B of [0, 2, 5, 15]) {
        const kp = keyFor({ n: 2, m: 8, B }, seed);
        const r = candidateSearch(kp, B);
        expect(r.containsTrue).toBe(true);
        expect(r.candidates).toBeGreaterThanOrEqual(1);
      }
    }
    expect(candidateSearch(keyFor({ n: 2, m: 8, B: 0 }, 3), 0).candidates).toBe(1);
    expect(() => candidateSearch(keyFor({ n: 4, m: 8, B: 2 }, 3), 2)).toThrow('only offered for n = 2');
  });

  it('a message byte round-trips under the default parameters', () => {
    const kp = keyFor(DEFAULT_PARAMS, DEFAULT_SEED);
    const bits = messageBits(DEFAULT_SEED);
    const rows = encryptByte(kp, bits, trialStream(DEFAULT_SEED));
    expect(rows.map((r) => r.got)).toEqual(bits);
  });
});

describe('the lattice picture', () => {
  it('both bases have determinant 17 and generate the same lattice; the bad basis is the good one under a unimodular change', () => {
    expect(det(GOOD)).toBe(17);
    expect(Math.abs(det(BAD))).toBe(17);
    expect(BAD[0]).toEqual([GOOD[0][0] + 5 * GOOD[1][0], GOOD[0][1] + 5 * GOOD[1][1]]);
    expect(BAD[1]).toEqual([GOOD[0][0] + 6 * GOOD[1][0], GOOD[0][1] + 6 * GOOD[1][1]]);
    expect(BAD.every((v) => inLattice(v))).toBe(true);
    // the change of basis [[1, 5], [1, 6]] has determinant 6 - 5 = 1
    expect(1 * 6 - 5 * 1).toBe(1);
  });

  it('the hand target (10, 7): good basis rounds (47/17, 18/17) to (3, 1) = (11, 7) at distance 1; bad basis rounds to (16, -13) = (10, 11) at distance 4', () => {
    const g = babai(GOOD, DEFAULT_TARGET);
    expect([g.coeffs, g.rounded, g.point, distanceText(g.distSq)]).toEqual([[[47, 17], [18, 17]], [3, 1], [11, 7], '1']);
    const b = babai(BAD, DEFAULT_TARGET);
    expect([b.rounded, b.point, distanceText(b.distSq)]).toEqual([[16, -13], [10, 11], '4']);
    expect(nearestPoint(DEFAULT_TARGET).distSq).toBe(1);
    expect(orthogonalityDefect(GOOD)).toBeCloseTo(1, 12);
    expect(orthogonalityDefect(BAD)).toBeCloseTo(Math.sqrt(442 * 629) / 17, 12);
    expect(orthogonalityDefect(BAD).toFixed(1)).toBe('31.0');
  });

  it('manipulation 3: on 1,000 seeded targets the good basis equals the brute-force nearest point, the bad basis lands farther on a counted share', () => {
    const rnd = mulberry32(5);
    let farther = 0;
    for (let i = 0; i < 1000; i++) {
      const t: [number, number] = [T_MIN + Math.floor(rnd() * (T_MAX - T_MIN + 1)), T_MIN + Math.floor(rnd() * (T_MAX - T_MIN + 1))];
      const g = babai(GOOD, t);
      const b = babai(BAD, t);
      expect(g.distSq).toBe(nearestPoint(t).distSq);
      expect(inLattice(g.point)).toBe(true);
      expect(inLattice(b.point)).toBe(true);
      expect(b.distSq).toBeGreaterThanOrEqual(g.distSq);
      if (b.distSq > g.distSq) farther++;
    }
    expect(farther).toBeGreaterThan(300);
    expect(farther).toBeLessThan(1000);
  });

  it('the lattice window lists points that are all in the lattice', () => {
    const pts = latticePoints(35);
    expect(Math.abs(pts.length - (71 * 71) / 17)).toBeLessThan(10); // density 1 per det = 17
    expect(pts.every((p) => inLattice(p))).toBe(true);
    expect(normSq([4, 1])).toBe(17);
  });
});

describe('the hybrid scene', () => {
  const bytesOf = (seed: number, n: number) => {
    const rnd = mulberry32(seed);
    return Uint8Array.from({ length: n }, () => Math.floor(rnd() * 256));
  };

  it('the combiner equals node HKDF-SHA256 (ecdh || kem, empty salt, label, 32 bytes) on seeded inputs', async () => {
    for (let seed = 1; seed <= 20; seed++) {
      const ecdh = bytesOf(seed, 32);
      const kem = Math.floor(mulberry32(seed + 100)() * 65536);
      const ours = (await combine(ecdh, kem))!;
      const expected = nodeHkdf(hybridInput(ecdh, kem), new Uint8Array(0), new TextEncoder().encode(HYBRID_INFO), 32);
      expect(Array.from(ours)).toEqual(Array.from(expected));
    }
  });

  it('flipping any of the 256 + 16 input bits changes the output, by about half its bits', async () => {
    const ecdh = bytesOf(9, 32);
    const kem = 0xa5c3;
    const base = (await combine(ecdh, kem))!;
    let minDistance = 256;
    for (let i = 0; i < 256; i++) {
      const out = (await combine(flipBit(ecdh, i), kem))!;
      expect(Array.from(out)).not.toEqual(Array.from(base));
      minDistance = Math.min(minDistance, bitDistance(base, out));
    }
    for (let i = 0; i < 16; i++) {
      const out = (await combine(ecdh, kem ^ (1 << i)))!;
      expect(Array.from(out)).not.toEqual(Array.from(base));
      minDistance = Math.min(minDistance, bitDistance(base, out));
    }
    expect(minDistance).toBeGreaterThan(64);
  });

  it('the toy KEM round-trips 16 bits on 200 seeds, because the noise bound m B = 8 stays under 24', () => {
    for (let seed = 0; seed < 200; seed++) {
      const e = encapsulate(seed);
      expect(decapsulate(e.kp, e.cts)).toBe(e.secret);
    }
    expect(8 * 1).toBeLessThan(NOISE_LIMIT);
  });

  it('ML-KEM sizes: the typed constants equal 384k + 32 and 32(du k + dv); the hybrid share is 65 + 1184 = 1249 bytes, about 19 times the classical share', () => {
    for (const set of ML_KEM_SETS) {
      expect(set.publicKey).toBe(publicKeyBytes(set.k));
      expect(set.ciphertext).toBe(ciphertextBytes(set.k, set.du, set.dv));
    }
    expect(ML_KEM_SETS.map((s) => [s.publicKey, s.ciphertext])).toEqual([[800, 768], [1184, 1088], [1568, 1568]]);
    expect(hybridShareBytes(ML_KEM_SETS[1])).toBe(1249);
    expect(P256_SHARE_BYTES).toBe(65);
    expect(Math.round(1249 / 65)).toBe(19);
  });

  it('bitDistance and flipBit behave', () => {
    expect(bitDistance(Uint8Array.of(0xff, 0), Uint8Array.of(0x0f, 1))).toBe(5);
    expect(Array.from(flipBit(Uint8Array.of(0, 0), 9))).toEqual([0, 0x40]);
  });
});

describe('numbers the page prints about its own pins and claims', () => {
  it('the failing preset over seeds 0..999: 968 seeds fail at least once and the mean rate is 8.0%, as the page says; seed 4 is the lowest with at least 5%', () => {
    let any = 0;
    let total = 0;
    let lowest = -1;
    for (let seed = 0; seed < 1000; seed++) {
      const failures = sweep(FAILING_PARAMS, seed).failures;
      if (failures > 0) any++;
      total += failures;
      if (lowest < 0 && failures >= SEVERE_FAILURES) lowest = seed;
    }
    expect(any).toBe(FAILING_SEEDS_WITH_ANY_FAILURE);
    expect(Number((total / 1000 / 1000 * 100).toFixed(1))).toBe(FAILING_MEAN_PERCENT);
    expect(lowest).toBe(BROKEN_SEED);
    // so the preset fails on nearly every seed: the threshold, not rarity, picks seed 4, and the page says so
    expect(any / 1000).toBeGreaterThan(0.9);
  }, 120_000);

  it('the bad basis: worse than the nearest point on most whole-number targets and equal on the rest; the good basis is never worse', () => {
    const share = badBasisShare();
    expect(share.targets).toBe((T_MAX - T_MIN + 1) ** 2);
    expect(share.worse + share.equal).toBe(share.targets);
    expect(share.worse).toBeGreaterThan(share.targets / 2);
    expect(share.equal).toBeGreaterThan(0);
    let goodWorse = 0;
    for (let x = T_MIN; x <= T_MAX; x++) for (let y = T_MIN; y <= T_MAX; y++) if (babai(GOOD, [x, y]).distSq > nearestPoint([x, y]).distSq) goodWorse++;
    // the good basis is exactly orthogonal, so rounding is the nearest point everywhere
    expect(goodWorse).toBe(0);
  });

  it('the Shor theorem label: at least half of the phi(N) bases work for every admitted N up to 999, counted over all of them (315), tight at N = 21', () => {
    let admitted = 0;
    let tight = 0;
    for (let N = 3; N <= N_MAX; N += 2) {
      if (!checkN(N).ok) continue;
      admitted++;
      const table = baseTable(N);
      expect(table.works * 2, `N = ${N}`).toBeGreaterThanOrEqual(table.phi);
      if (table.works * 2 === table.phi) tight++;
    }
    expect(admitted).toBe(ADMITTED_COUNT);
    expect(ADMITTED_COUNT).toBe(315);
    expect(tight).toBeGreaterThan(0);
    expect(baseTable(21).works * 2).toBe(baseTable(21).phi);
  });
});
