import { describe, expect, it } from 'vitest';
import { captionText as text } from '../../core/testing/captions';
import { pctText, sig } from '../distributions/fmt';
import { ownCaption, peekCaption, pText, pointsText, powerCaption, repeatCaption, runCaption, sliceCaption, verdictSays } from './frames';
import lesson from './index';
import {
  ALPHA, LIFT, OWN_DEFAULT, PEEK_DEFAULT, REPEAT_DEFAULT, REPLICATES, RUN_DEFAULT, SLICES, SLICE_DEFAULT, SLICE_REPLICATES, anySignificantRate, familyWiseRate,
  firstCrossing, lookAlpha, parseArms, peekRates, peekRun, replicate, runExperiment, runSeed, sampleSizePerArm, significantSlices, sliceAlpha, slicePValues,
  sliceRun, verdictKind, visitorsAt, zTest,
} from './model';

const SIMULATION_TIMEOUT_MS = 90_000;
const defaultVisitors = visitorsAt(RUN_DEFAULT.exponent);
const significantRuns = (visitors: number, runs: number) =>
  Array.from({ length: runs }, (_, i) => runExperiment({ baseline: RUN_DEFAULT.baseline, lift: RUN_DEFAULT.lift, visitors, seed: runSeed(RUN_DEFAULT.seed, i) }).test.p! < ALPHA).filter(Boolean).length;

describe('try-this entries, from the default state, as written', { timeout: SIMULATION_TIMEOUT_MS }, () => {
  it('try-this 1: at 1,000 visitors only a few of the first eleven runs (the load plus ten presses) are significant for a real +2 point lift; at 10,000 almost all are', () => {
    expect(defaultVisitors).toBe(1000);
    expect(RUN_DEFAULT.lift).toBe(2);
    expect(significantRuns(defaultVisitors, 11)).toBeLessThanOrEqual(5);
    expect(significantRuns(10_000, 11)).toBeGreaterThanOrEqual(10);
    const { arms, test } = runExperiment({ baseline: RUN_DEFAULT.baseline, lift: RUN_DEFAULT.lift, visitors: defaultVisitors, seed: runSeed(RUN_DEFAULT.seed, 0) });
    expect(arms.visitorsA).toBe(1000);
    expect(verdictKind(test, RUN_DEFAULT.lift), 'the first screen is a typical miss').toBe('miss');
  });

  it('try-this 2: with no lift about 5% of 1,000 experiments land below 0.05, and a +1 point lift raises that share', () => {
    const flat = replicate({ baseline: REPEAT_DEFAULT.baseline, lift: REPEAT_DEFAULT.lift, visitors: visitorsAt(REPEAT_DEFAULT.exponent), seed: REPEAT_DEFAULT.seed });
    expect(Math.abs(flat.below - ALPHA)).toBeLessThan(3 * Math.sqrt((ALPHA * (1 - ALPHA)) / REPLICATES));
    const real = replicate({ baseline: REPEAT_DEFAULT.baseline, lift: 1, visitors: visitorsAt(REPEAT_DEFAULT.exponent), seed: REPEAT_DEFAULT.seed });
    expect(real.below).toBeGreaterThan(flat.below + 0.03);
    expect(LIFT.min).toBeLessThanOrEqual(0);
    expect(LIFT.max).toBeGreaterThanOrEqual(1);
  });

  it('try-this 3: 10% → 11% needs 14,749 per arm and 10% → 10.5% needs about 57,800', () => {
    expect(sampleSizePerArm(REPEAT_DEFAULT.baseline / 100, REPEAT_DEFAULT.mde / 100)).toBe(14_749);
    expect(Math.abs(sampleSizePerArm(0.1, 0.005) - 57_800)).toBeLessThan(100);
    expect(text(powerCaption(REPEAT_DEFAULT.baseline, REPEAT_DEFAULT.mde, REPEAT_DEFAULT.power))).toContain('14,749');
    expect(REPEAT_DEFAULT.power).toBe(0.8);
  });

  it('try-this 4: A/A with 20 looks declares a false winner about a quarter of the time; looking once is 5%; Bonferroni is about 5%', () => {
    const spec = { baseline: PEEK_DEFAULT.baseline, lift: PEEK_DEFAULT.lift, looks: PEEK_DEFAULT.looks };
    const plain = peekRates(spec, PEEK_DEFAULT.seed, false);
    expect(plain.anyLook).toBeGreaterThan(0.18);
    expect(plain.anyLook).toBeLessThan(0.32);
    expect(Math.abs(plain.lastLook - ALPHA)).toBeLessThan(0.02);
    const bonferroni = peekRates(spec, PEEK_DEFAULT.seed, true);
    expect(bonferroni.anyLook).toBeLessThanOrEqual(0.06);
    expect(bonferroni.lastLook).toBe(plain.lastLook);
    const first = peekRun({ ...spec, seed: runSeed(PEEK_DEFAULT.seed, 0) });
    expect(firstCrossing(first, ALPHA), 'the opening A/A run dips below 0.05 at look 9').toBe(8);
    expect(first[first.length - 1].p!).toBeGreaterThan(ALPHA);
  });

  it('try-this 5: about two in three A/A experiments have a significant slice, and Bonferroni drops it to about 5%', () => {
    const p = slicePValues(SLICE_DEFAULT.seed);
    expect(Math.abs(anySignificantRate(p, ALPHA) - 2 / 3)).toBeLessThan(0.05);
    expect(anySignificantRate(p, sliceAlpha(true))).toBeLessThanOrEqual(0.07);
    expect(SLICE_DEFAULT.bonferroni).toBe(false);
  });
});

describe('captions are computed from the model', () => {
  it('the run caption quotes its own numbers and the verdict for the truth, over lifts, baselines, sizes and seeds', () => {
    const seen = new Set<string>();
    for (const baseline of [5, 10, 30]) {
      for (const lift of [LIFT.min, -1, 0, 1, LIFT.max]) {
        for (const visitors of [100, 1000, 100_000]) {
          for (const seed of [1, 2, 3]) {
            const spec = { baseline, lift, visitors, seed };
            const { arms, test } = runExperiment(spec);
            const c = text(runCaption(spec, arms, test));
            const kind = verdictKind(test, lift);
            expect(c, JSON.stringify(spec)).toContain(`A converted ${arms.conversionsA.toLocaleString('en-US')} of ${visitors.toLocaleString('en-US')}`);
            if (test.status === 'ok') {
              expect(c).toContain(`p = ${pText(test.p!)}`);
              expect(c).toContain(verdictSays(kind));
              expect(c).toContain(`${pointsText(test.lo!)} to ${pointsText(test.hi!)}`);
              expect(c).toContain(`the true lift in this simulation is ${pointsText(lift / 100)}`);
              expect(kind === 'false-positive').toBe(lift === 0 && test.p! < ALPHA);
              seen.add(kind);
            }
          }
        }
      }
    }
    for (const k of ['real-win', 'false-positive', 'miss', 'correct-null']) expect([...seen], k).toContain(k);
  });

  it('refusals are said, not NaN: zero conversions, tiny arms', () => {
    const none = { conversionsA: 0, visitorsA: 500, conversionsB: 0, visitorsB: 500 };
    expect(text(ownCaption(none, zTest(none)))).toContain('variance is zero and the p-value is undefined');
    const tiny = { conversionsA: 1, visitorsA: 20, conversionsB: 3, visitorsB: 20 };
    expect(text(ownCaption(tiny, zTest(tiny)))).toContain('too few for a z-test');
  });

  it('the own-numbers caption on the default is the worked example: p = 0.0355, significant, not "the chance B is better"', () => {
    const parsed = parseArms(OWN_DEFAULT);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const c = text(ownCaption(parsed.arms, zTest(parsed.arms)));
    expect(c).toContain('A converted 100 of 1,000 (10.00%), B 130 of 1,000 (13.00%)');
    expect(c).toContain('z = 2.10, p = 0.0355');
    expect(c).toContain('significant at 0.05');
    expect(c).toContain('is not the chance that B is better');
  });

  it('the repeat caption says "about the 5%" exactly when the share is within 3 standard errors, at 100, 1,000 and 100,000 visitors', () => {
    for (const visitors of [100, 1000, 100_000]) {
      const spec = { baseline: 10, lift: 0, visitors, seed: 1 };
      const r = replicate(spec);
      const c = text(repeatCaption(spec, r.below, REPLICATES));
      expect(c).toContain(`${pctText(r.below)} had p < 0.05`);
      const near = Math.abs(r.below - ALPHA) <= 3 * Math.sqrt((ALPHA * 0.95) / REPLICATES);
      expect(c.includes('about the 5% the threshold promises'), `n=${visitors}`).toBe(near);
    }
    const power = text(repeatCaption({ baseline: 10, lift: 1, visitors: 1000, seed: 1 }, 0.2, REPLICATES));
    expect(power).toContain('that share is the power');
  });

  it('the peek caption quotes the first crossing from the run and says false positive on A/A, real lift otherwise', () => {
    for (const lift of [0, 1]) {
      for (const looks of [5, 20]) {
        for (let seed = 1; seed <= 6; seed++) {
          const run = peekRun({ baseline: 10, lift, looks, seed });
          const rates = { runs: 1000, anyLook: 0.25, lastLook: 0.05 };
          const c = text(peekCaption(run, looks, false, lift, rates));
          const k = firstCrossing(run, lookAlpha(looks, false));
          if (k < 0) expect(c).toContain(`never fell below 0.05 across ${looks} looks`);
          else {
            expect(c).toContain(`first fell below 0.05 at look ${k + 1} of ${looks}`);
            if (lift === 0) expect(c).toContain('a false positive');
          }
          expect(c).toContain('25.0% would have been stopped');
        }
      }
    }
  });

  it('the slice caption counts the significant slices and quotes 1 − (1 − threshold)^20', () => {
    for (const bonferroni of [false, true]) {
      for (const seed of [1, 2, 3, 4]) {
        const run = sliceRun(seed);
        const threshold = sliceAlpha(bonferroni);
        const { significant, bWins } = significantSlices(run, threshold);
        const c = text(sliceCaption(run, significant, bWins, threshold, 0.64, SLICE_REPLICATES));
        if (significant.length) expect(c).toContain(`${significant.length} of ${SLICES} slices`);
        else expect(c).toContain('None of the 20 slices');
        expect(c).toContain(pctText(familyWiseRate(SLICES, threshold)));
      }
    }
  });
});

describe('quiz answers, from independent oracles', { timeout: SIMULATION_TIMEOUT_MS }, () => {
  it('Q1: with no difference, p ≤ 0.03 shows up in about 3% of experiments (and says nothing about B being better)', () => {
    const r = replicate({ baseline: 10, lift: 0, visitors: 1000, seed: 21 }, 5000);
    expect(Math.abs(r.pValues.filter((p) => p <= 0.03).length / r.pValues.length - 0.03)).toBeLessThan(0.01);
  });

  it('Q2: daily checks over 20 looks ship a false winner roughly one time in four; one look is 5%', () => {
    const rates = peekRates({ baseline: 10, lift: 0, looks: 20 }, 9, false, 4000);
    expect(rates.anyLook).toBeGreaterThan(0.2);
    expect(rates.anyLook).toBeLessThan(0.3);
    expect(Math.abs(rates.lastLook - 0.05)).toBeLessThan(0.015);
  });

  it('Q3: 14,750 per arm for 10% → 11%, and a ten times smaller lift needs about a hundred times as many', () => {
    expect(Math.abs(sampleSizePerArm(0.1, 0.01) - 14_750)).toBeLessThan(5);
    expect(Math.abs(sampleSizePerArm(0.1, 0.001) / sampleSizePerArm(0.1, 0.01) / 100 - 1)).toBeLessThan(0.1);
    expect(lesson.quiz[2].options[lesson.quiz[2].answer]).toBe('About 14,750');
  });

  it('Q4: 20 independent fair tests give 1 − 0.95^20 = 0.64 and the simulation agrees', () => {
    expect(familyWiseRate(20)).toBeCloseTo(0.6415, 4);
    expect(Math.abs(anySignificantRate(slicePValues(4), ALPHA) - familyWiseRate(20))).toBeLessThan(0.03);
  });
});

describe('hidden controls do not feed numbers', () => {
  it('the peeking policy and Bonferroni change the read-out and the any-look rate, never the final-look rate', () => {
    const spec = { baseline: 10, lift: 0, looks: 10 };
    const plain = peekRates(spec, 4, false, 500);
    const corrected = peekRates(spec, 4, true, 500);
    expect(corrected.lastLook).toBe(plain.lastLook);
    expect(corrected.anyLook).toBeLessThan(plain.anyLook);
  });

  it('the slice p-values depend only on the seed, not on the correction that is applied afterwards', () => {
    expect(slicePValues(3, 50)).toEqual(slicePValues(3, 50));
    const p = slicePValues(3, 300);
    expect(anySignificantRate(p, sliceAlpha(true))).toBeLessThan(anySignificantRate(p, sliceAlpha(false)));
  });

  it('visitors per arm in the scene-3 peeking experiment are 500 × looks regardless of the number of looks chosen', () => {
    for (const looks of [1, 5, 10, 20]) expect(peekRun({ baseline: 10, lift: 0, looks, seed: 1 }).at(-1)!.visitors).toBe(10_000);
    expect(sig(10_000)).toBe('10,000');
  });
});
