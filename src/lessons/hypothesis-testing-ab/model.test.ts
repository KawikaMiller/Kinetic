import { describe, expect, it } from 'vitest';
import { binomialPmf } from '../../core/stats';
import { mulberry32 } from '../../core/random';
import {
  ALPHA, COUNT_MAX, FIELD_NAMES, MIN_VISITORS, OWN_DEFAULT, PEEK_LOOKS, SLICES, SLICE_REPLICATES, anySignificantRate, binomialDraw, familyWiseRate,
  firstCrossing, lookAlpha, pHistogram, parseArms, peekRates, peekRun, replicate, runExperiment, runSeed, sampleSizePerArm, sliceAlpha,
  sliceRun, slicePValues, significantSlices, verdictKind, visitorsAt, zTest, type Arms, type ArmFields, type ZTest,
} from './model';

/** An independent normal tail: Simpson's rule on the density, never the kit's erf. */
function tailBeyond(z: number): number {
  const density = (x: number) => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
  const hi = 12;
  const steps = 200_000;
  const h = (hi - Math.abs(z)) / steps;
  let s = density(Math.abs(z)) + density(hi);
  for (let i = 1; i < steps; i++) s += density(Math.abs(z) + i * h) * (i % 2 ? 4 : 2);
  return 2 * ((s * h) / 3);
}

const SIMULATION_TIMEOUT_MS = 90_000;

describe('the two-proportion z-test, against the hand-worked example', () => {
  const hand: Arms = { conversionsA: 100, visitorsA: 1000, conversionsB: 130, visitorsB: 1000 };

  it('100/1,000 vs 130/1,000: pooled 0.115, SE 0.014267, z 2.103, two-sided p 0.0355 (an independent normal tail)', () => {
    const t = zTest(hand);
    expect(t.pooled).toBeCloseTo(0.115, 12);
    expect(t.se).toBeCloseTo(Math.sqrt(0.115 * 0.885 * 0.002), 12);
    expect(t.se!).toBeCloseTo(0.014267, 5);
    expect(t.z!).toBeCloseTo(2.1028, 3);
    expect(t.p!).toBeCloseTo(tailBeyond(t.z!), 7);
    expect(t.p!).toBeCloseTo(0.0355, 3);
    expect(t.diff).toBeCloseTo(0.03, 12);
  });

  it('the 95% interval for the difference uses the unpooled standard error: 0.03 ± 1.96 × 0.014251', () => {
    const t = zTest(hand);
    const seUnpooled = Math.sqrt((0.1 * 0.9) / 1000 + (0.13 * 0.87) / 1000);
    expect(seUnpooled).toBeCloseTo(0.014251, 5);
    expect(t.lo!).toBeCloseTo(0.03 - 1.959964 * seUnpooled, 5);
    expect(t.hi!).toBeCloseTo(0.03 + 1.959964 * seUnpooled, 5);
    expect(t.lo!).toBeGreaterThan(0);
  });

  it('swapping the arms flips the sign of z and the difference, and leaves p alone', () => {
    const swapped = zTest({ conversionsA: 130, visitorsA: 1000, conversionsB: 100, visitorsB: 1000 });
    const t = zTest(hand);
    expect(swapped.z!).toBeCloseTo(-t.z!, 12);
    expect(swapped.p!).toBeCloseTo(t.p!, 12);
  });

  it('a clearly significant case has an interval above 0, and a null case has one straddling 0', () => {
    const big = zTest({ conversionsA: 1000, visitorsA: 10_000, conversionsB: 1200, visitorsB: 10_000 });
    expect(big.p!).toBeLessThan(1e-4);
    expect(big.lo!).toBeGreaterThan(0);
    const same = zTest({ conversionsA: 100, visitorsA: 1000, conversionsB: 100, visitorsB: 1000 });
    expect(same.z).toBe(0);
    expect(same.p).toBeCloseTo(1, 12);
    expect(same.lo!).toBeLessThan(0);
    expect(same.hi!).toBeGreaterThan(0);
  });

  it('zero conversions in both arms has zero variance: "undefined", no p and no interval, never NaN', () => {
    const t = zTest({ conversionsA: 0, visitorsA: 500, conversionsB: 0, visitorsB: 500 });
    expect(t.status).toBe('undefined');
    for (const v of [t.z, t.p, t.lo, t.hi]) expect(v).toBeNull();
    const all = zTest({ conversionsA: 500, visitorsA: 500, conversionsB: 500, visitorsB: 500 });
    expect(all.status).toBe('undefined');
  });

  it(`fewer than ${MIN_VISITORS} visitors per arm gets no verdict`, () => {
    const t = zTest({ conversionsA: 2, visitorsA: MIN_VISITORS - 1, conversionsB: 9, visitorsB: 1000 });
    expect(t.status).toBe('too-few');
    expect(t.p).toBeNull();
    expect(verdictKind(t, null)).toBe('no-verdict');
    expect(zTest({ conversionsA: 2, visitorsA: MIN_VISITORS, conversionsB: 9, visitorsB: MIN_VISITORS }).status).toBe('ok');
  });
});

describe('sampling', () => {
  it('binomialDraw has the Binomial(n, p) pmf: total variation below 0.01 over 200,000 draws (n = 40, p = 0.1 and p = 0.7)', () => {
    for (const p of [0.1, 0.7]) {
      const n = 40;
      const rnd = mulberry32(3);
      const counts = new Array<number>(n + 1).fill(0);
      const draws = 200_000;
      for (let i = 0; i < draws; i++) counts[binomialDraw(rnd, n, p)]++;
      let tv = 0;
      for (let k = 0; k <= n; k++) tv += Math.abs(counts[k] / draws - binomialPmf(n, k, p)) / 2;
      expect(tv, `p=${p}`).toBeLessThan(0.01);
    }
  });

  it('edge cases: p = 0 never converts, p = 1 always does, and a large n has the right mean and variance', () => {
    const rnd = mulberry32(1);
    expect(binomialDraw(rnd, 1000, 0)).toBe(0);
    expect(binomialDraw(rnd, 1000, 1)).toBe(1000);
    const xs = Array.from({ length: 2000 }, () => binomialDraw(rnd, 100_000, 0.1));
    const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
    const variance = xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length;
    expect(Math.abs(mean - 10_000)).toBeLessThan(3 * Math.sqrt(9000 / 2000));
    expect(Math.abs(variance / 9000 - 1)).toBeLessThan(0.15);
  });

  it('experiments are seeded: same spec, same counts; a different seed differs; run seeds are distinct', () => {
    const spec = { baseline: 10, lift: 2, visitors: 1000, seed: 1 };
    expect(runExperiment(spec)).toEqual(runExperiment({ ...spec }));
    expect(runExperiment({ ...spec, seed: 2 }).arms).not.toEqual(runExperiment(spec).arms);
    expect(new Set([1, 2, 3, 4, 5].map((i) => runSeed(1, i))).size).toBe(5);
  });

  it('the visitors slider reaches 100, 1,000 and 100,000 exactly', () => {
    expect([2, 3, 5].map(visitorsAt)).toEqual([100, 1000, 100_000]);
  });
});

describe('error rates and power, over seeded replications', { timeout: SIMULATION_TIMEOUT_MS }, () => {
  it('with no true lift the share of p < 0.05 is 0.05 ± 0.01 over 5,000 seeded runs, and the p-values are flat', () => {
    const r = replicate({ baseline: 10, lift: 0, visitors: 1000, seed: 7 }, 5000);
    expect(Math.abs(r.below - ALPHA)).toBeLessThan(0.01);
    const bins = pHistogram(r.pValues, 10);
    for (const c of bins) expect(Math.abs(c / r.pValues.length - 0.1), 'each tenth holds about a tenth').toBeLessThan(0.03);
    expect(pHistogram(r.pValues, 20)[0] / r.pValues.length).toBeCloseTo(r.below, 12);
  });

  it('the sample size for 10% → 11% at 80% power is about 14,750 per arm (hand arithmetic: 7.849 × 0.1879 / 0.0001)', () => {
    const handZ = 1.959964 + 0.841621;
    const hand = (handZ * handZ * (0.1 * 0.9 + 0.11 * 0.89)) / 0.01 ** 2;
    expect(hand).toBeCloseTo(14_748, -1);
    expect(Math.abs(sampleSizePerArm(0.1, 0.01) - hand)).toBeLessThanOrEqual(2);
  });

  it('at that n the empirical power over 4,000 runs is 0.80 ± 0.035', () => {
    const n = sampleSizePerArm(0.1, 0.01);
    const r = replicate({ baseline: 10, lift: 1, visitors: n, seed: 11 }, 4000);
    expect(Math.abs(r.below - 0.8)).toBeLessThan(0.035);
  });

  it('n grows like 1/δ²: halving the effect needs about 4 times the visitors, at every baseline tried', () => {
    for (const p1 of [0.05, 0.1, 0.3]) {
      const ratio = sampleSizePerArm(p1, 0.005) / sampleSizePerArm(p1, 0.01);
      expect(Math.abs(ratio / 4 - 1), `p1=${p1}`).toBeLessThan(0.05);
    }
  });

  it('a real lift moves the p-values toward 0: power rises with n at a fixed lift', () => {
    const power = (visitors: number) => replicate({ baseline: 10, lift: 2, visitors, seed: 5 }, 600).below;
    expect(power(300)).toBeLessThan(power(1000));
    expect(power(1000)).toBeLessThan(power(5000));
    expect(power(5000)).toBeGreaterThan(0.8);
  });
});

describe('peeking inflates the false-positive rate', { timeout: SIMULATION_TIMEOUT_MS }, () => {
  const rates = (looks: number, bonferroni = false) => peekRates({ baseline: 10, lift: 0, looks }, 3, bonferroni, 4000);

  it('1 look gives 0.05 ± 0.01; the rate rises with the number of looks; 20 looks is above 0.15 and below 0.40', () => {
    const byLooks = PEEK_LOOKS.map((l) => rates(l).anyLook);
    expect(Math.abs(byLooks[0] - ALPHA)).toBeLessThan(0.01);
    for (let i = 1; i < byLooks.length; i++) expect(byLooks[i], `${PEEK_LOOKS[i]} looks`).toBeGreaterThan(byLooks[i - 1]);
    expect(byLooks[3]).toBeGreaterThan(0.15);
    expect(byLooks[3]).toBeLessThan(0.4);
  });

  it('looking once at the end stays at 5% however many looks the data arrived in', () => {
    for (const looks of PEEK_LOOKS) expect(Math.abs(rates(looks).lastLook - ALPHA), `${looks} looks`).toBeLessThan(0.01);
  });

  it('Bonferroni (each look at α ÷ looks) pulls 20 looks back to at most 0.06', () => {
    for (const looks of PEEK_LOOKS) expect(rates(looks, true).anyLook, `${looks} looks`).toBeLessThanOrEqual(0.06);
    expect(lookAlpha(20, true)).toBeCloseTo(0.0025, 12);
    expect(lookAlpha(20, false)).toBe(ALPHA);
  });

  it('a broken variant that peeks and still claims 5% fails the false-positive-rate ≤ nominal assertion', () => {
    const claimedNominal = ALPHA;
    const peeking = rates(20).anyLook;
    expect(peeking <= claimedNominal + 0.01, 'a "stop when p < 0.05" policy is not a 5% test').toBe(false);
  });

  it('with a real lift most first crossings are true positives, and a few early ones point the wrong way', () => {
    const kinds = { win: 0, wrong: 0 };
    for (let seed = 1; seed <= 200; seed++) {
      const run = peekRun({ baseline: 10, lift: 1, looks: 20, seed });
      const k = firstCrossing(run, ALPHA);
      if (k < 0) continue;
      const kind = verdictKind(zTest({ ...run[k], visitorsA: run[k].visitors, visitorsB: run[k].visitors }), 1);
      expect(['real-win', 'wrong-sign']).toContain(kind);
      if (kind === 'real-win') kinds.win++;
      else kinds.wrong++;
    }
    expect(kinds.win).toBeGreaterThan(100);
    expect(kinds.win).toBeGreaterThan(5 * kinds.wrong);
  });

  it('each look tests all the data so far: visitors grow in equal steps to 10,000 and counts never fall', () => {
    const run = peekRun({ baseline: 10, lift: 0, looks: 20, seed: 4 });
    expect(run.map((l) => l.visitors)).toEqual(Array.from({ length: 20 }, (_, i) => 500 * (i + 1)));
    for (let i = 1; i < run.length; i++) {
      expect(run[i].conversionsA).toBeGreaterThanOrEqual(run[i - 1].conversionsA);
      expect(run[i].conversionsB).toBeGreaterThanOrEqual(run[i - 1].conversionsB);
    }
  });
});

describe('slicing until something is significant', { timeout: SIMULATION_TIMEOUT_MS }, () => {
  it('1 − 0.95²⁰ = 0.6415, and 64% (within 0.03) of 2,000 A/A experiments have at least one significant slice', () => {
    expect(familyWiseRate(SLICES)).toBeCloseTo(0.6415, 4);
    expect(familyWiseRate(SLICES)).toBeCloseTo(1 - 0.95 ** 20, 12);
    const pValues = slicePValues(1);
    expect(pValues).toHaveLength(SLICE_REPLICATES);
    expect(Math.abs(anySignificantRate(pValues, ALPHA) - familyWiseRate(SLICES))).toBeLessThan(0.03);
  });

  it('Bonferroni (α ÷ 20 = 0.0025) brings the share back to about 5% (at most 0.07)', () => {
    expect(sliceAlpha(true)).toBeCloseTo(0.0025, 12);
    expect(anySignificantRate(slicePValues(1), sliceAlpha(true))).toBeLessThanOrEqual(0.07);
  });

  it('every single slice is still a 5% test on its own: about 5% of all slice p-values fall below 0.05', () => {
    const flat = slicePValues(2).flat();
    expect(Math.abs(flat.filter((p) => p < ALPHA).length / flat.length - ALPHA)).toBeLessThan(0.01);
  });

  it('there are 20 invented slices, and "B wins" is a subset of the significant ones', () => {
    const run = sliceRun(3);
    expect(run).toHaveLength(SLICES);
    expect(new Set(run.map((s) => s.name)).size).toBe(SLICES);
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const r = sliceRun(seed);
      const { significant, bWins } = significantSlices(r, ALPHA);
      expect(bWins.every((i) => significant.includes(i))).toBe(true);
      expect(bWins.every((i) => r[i].test.diff > 0)).toBe(true);
    }
  });
});

describe('verdicts follow the truth the simulation knows', () => {
  const t = (p: number, diff: number): ZTest => ({
    status: 'ok', rateA: 0.1, rateB: 0.1 + diff, diff, pooled: 0.1, se: 0.01, z: diff / 0.01, p, lo: diff - 0.02, hi: diff + 0.02,
  });

  it('truth table: significant with a real lift is a win, with none a false positive, against the real sign the wrong direction', () => {
    expect(verdictKind(t(0.01, 0.02), 2)).toBe('real-win');
    expect(verdictKind(t(0.01, 0.02), 0)).toBe('false-positive');
    expect(verdictKind(t(0.01, 0.02), -1)).toBe('wrong-sign');
    expect(verdictKind(t(0.4, 0.02), 2)).toBe('miss');
    expect(verdictKind(t(0.4, 0.02), 0)).toBe('correct-null');
    expect(verdictKind(t(0.01, 0.02), null)).toBe('significant');
    expect(verdictKind(t(0.4, 0.02), null)).toBe('not-significant');
    expect(verdictKind(t(0.04, 0.02), 2, 0.025)).toBe('miss');
  });
});

describe('hostile input: your own numbers', () => {
  const fields = (patch: Partial<ArmFields>): ArmFields => ({ ...OWN_DEFAULT, ...patch });

  it('the default is the hand example and parses', () => {
    const r = parseArms(OWN_DEFAULT);
    expect(r).toEqual({ ok: true, arms: { conversionsA: 100, visitorsA: 1000, conversionsB: 130, visitorsB: 1000 } });
  });

  it('refuses each bad entry with a reason that names the field, and reports every bad field at once', () => {
    const cases: [Partial<ArmFields>, keyof ArmFields][] = [
      [{ conversionsA: '2000' }, 'conversionsA'],
      [{ conversionsB: '1001' }, 'conversionsB'],
      [{ conversionsA: '-3' }, 'conversionsA'],
      [{ visitorsA: '-10' }, 'visitorsA'],
      [{ visitorsB: '0' }, 'visitorsB'],
      [{ conversionsA: '10.5' }, 'conversionsA'],
      [{ visitorsA: '1e3' }, 'visitorsA'],
      [{ visitorsB: String(COUNT_MAX + 1) }, 'visitorsB'],
      [{ conversionsB: '' }, 'conversionsB'],
      [{ conversionsA: 'ten' }, 'conversionsA'],
      [{ visitorsA: '1,000' }, 'visitorsA'],
      [{ conversionsB: '+5' }, 'conversionsB'],
    ];
    for (const [patch, key] of cases) {
      const r = parseArms(fields(patch));
      expect(r.ok, JSON.stringify(patch)).toBe(false);
      if (!r.ok) expect(r.errors[key], JSON.stringify(patch)).toBeTruthy();
    }
    const both = parseArms(fields({ conversionsA: 'x', visitorsB: '1e3' }));
    expect(both.ok).toBe(false);
    if (!both.ok) expect(Object.keys(both.errors).sort()).toEqual(['conversionsA', 'visitorsB']);
    expect(Object.values(FIELD_NAMES).every((n) => n.length > 0)).toBe(true);
  });

  it('accepts the extremes: 0 conversions, all visitors converting, and a billion visitors', () => {
    expect(parseArms(fields({ conversionsA: '0', conversionsB: '0' })).ok).toBe(true);
    expect(parseArms(fields({ conversionsA: '1000', visitorsA: '1000' })).ok).toBe(true);
    expect(parseArms(fields({ visitorsA: String(COUNT_MAX), visitorsB: String(COUNT_MAX), conversionsA: '5', conversionsB: '6' })).ok).toBe(true);
  });

  it('nothing the parser accepts can make the z-test return NaN', () => {
    const rnd = mulberry32(8);
    for (let i = 0; i < 300; i++) {
      const vA = 1 + Math.floor(rnd() * 5000);
      const vB = 1 + Math.floor(rnd() * 5000);
      const t = zTest({ conversionsA: Math.floor(rnd() * (vA + 1)), visitorsA: vA, conversionsB: Math.floor(rnd() * (vB + 1)), visitorsB: vB });
      for (const v of [t.rateA, t.rateB, t.diff, t.pooled]) expect(Number.isNaN(v)).toBe(false);
      for (const v of [t.z, t.p, t.lo, t.hi, t.se]) expect(v === null || Number.isFinite(v)).toBe(true);
    }
  });
});
