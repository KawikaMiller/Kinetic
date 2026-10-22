import { describe, expect, it } from 'vitest';
import { numericGradient } from '../../core/fit';
import { runOptions } from './options';
import {
  BINS, DEFAULT, HOLD_TOLERANCE, MIN_GROUP, N_TOTAL, RANGES, equaliseBExact, fitModel, gapsOf, generate, groupStats, holds, predict, reliability, reweighingWeights,
  smallestWorstGap, thresholdGrid, weightedGradient, weightedLoss, type Row,
} from './model';
import { feedbackLoop, labelBias, representation, ROUNDS } from './sources';

const SEEDS = Array.from({ length: 50 }, (_, i) => i + 1);

const defaults = () => {
  const rows = generate(DEFAULT);
  return { rows, probs: predict(fitModel(rows, 'aware'), rows) };
};

describe('the data set', () => {
  it('has 2,000 applicants in two groups, each at least 100 at both ends of the size slider, and the same seed gives the same rows', () => {
    for (const nB of [RANGES.nB.min, DEFAULT.nB, RANGES.nB.max]) {
      const rows = generate({ ...DEFAULT, nB });
      expect(rows).toHaveLength(N_TOTAL);
      expect(rows.filter((r) => r.group === 1)).toHaveLength(nB);
      expect(rows.filter((r) => r.group === 0).length).toBeGreaterThanOrEqual(MIN_GROUP);
    }
    expect(generate(DEFAULT)).toEqual(generate(DEFAULT));
  });

  it('the proxy slider changes only the proxy column: the score, group and outcome columns are identical for every proxy value', () => {
    const base = generate({ ...DEFAULT, proxy: 0 });
    const strong = generate({ ...DEFAULT, proxy: 3 });
    expect(strong.map((r) => [r.group, r.repaid, r.score])).toEqual(base.map((r) => [r.group, r.repaid, r.score]));
    expect(strong.map((r) => r.proxy)).not.toEqual(base.map((r) => r.proxy));
  });
});

describe('every count and rate equals a brute-force count over the rows', () => {
  it('at several thresholds, for both groups', () => {
    const { rows, probs } = defaults();
    for (const t of [0, 0.2, 0.5, 0.8, 1.01]) {
      for (const g of [0, 1] as const) {
        let tp = 0, fp = 0, fn = 0, tn = 0;
        rows.forEach((r, i) => {
          if (r.group !== g) return;
          const approved = probs[i] >= t;
          if (approved && r.repaid) tp++;
          else if (approved) fp++;
          else if (r.repaid) fn++;
          else tn++;
        });
        const s = groupStats(rows, probs, t, g);
        expect(s.confusion).toEqual({ tp, fp, fn, tn });
        expect(s.n).toBe(tp + fp + fn + tn);
        expect(s.selection).toBe((tp + fp) / (tp + fp + fn + tn));
        expect(s.tpr).toBe(tp + fn === 0 ? NaN : tp / (tp + fn));
        expect(s.positives).toBe(tp + fn);
      }
    }
  });

  it('an undefined rate is NaN, never a made-up 0: nobody approved leaves precision undefined, and holds() refuses NaN', () => {
    const { rows, probs } = defaults();
    const none = groupStats(rows, probs, 1.01, 0);
    expect(none.selection).toBe(0);
    expect(Number.isNaN(none.precision)).toBe(true);
    const all = groupStats(rows, probs, 0, 1);
    expect(all.selection).toBe(1);
    expect(Number.isNaN(all.fpr) || all.fpr === 1).toBe(true);
    expect(holds(NaN)).toBe(false);
    expect(holds(HOLD_TOLERANCE)).toBe(true);
    expect(holds(HOLD_TOLERANCE + 0.001)).toBe(false);
  });
});

describe('the criteria conflict', () => {
  it('with equal base rates and no score shift, all criteria hold together at one threshold (40,000 rows, within tolerance)', () => {
    const rows = generate({ ...DEFAULT, gap: 0, shift: 0, nB: N_TOTAL / 2 }, 40_000);
    const probs = predict(fitModel(rows, 'aware'), rows);
    const g = gapsOf(groupStats(rows, probs, 0.5, 0), groupStats(rows, probs, 0.5, 1));
    expect(Object.values(g).every(holds), JSON.stringify(g)).toBe(true);
  });

  it('with different base rates and an imperfect scorer, no meaningful pair of group thresholds equalises TPR, FPR and precision: the smallest worst gap stays above 0.05 (recorded from the build: 0.091)', () => {
    const { rows, probs } = defaults();
    const worst = smallestWorstGap(thresholdGrid(rows, probs));
    expect(worst).toBeGreaterThan(0.05);
    expect(worst).toBeGreaterThan(HOLD_TOLERANCE);
  });

  it('with a perfect scorer TPR, FPR and precision are equal in both groups although the base rates differ, and the approval rates are not', () => {
    const rows = generate({ ...DEFAULT, separation: 20 });
    const probs = predict(fitModel(rows, 'aware'), rows);
    const g = gapsOf(groupStats(rows, probs, 0.5, 0), groupStats(rows, probs, 0.5, 1));
    expect([g.tpr, g.fpr, g.precision]).toEqual([0, 0, 0]);
    expect(g.selection).toBeGreaterThan(0.1);
    expect(smallestWorstGap(thresholdGrid(rows, probs))).toBe(0);
  });

  it('thresholds chosen for equal opportunity leave the true-positive rates within 1 / min(positives), and for equal selection within 1 / group size', () => {
    const { rows, probs } = defaults();
    const a = groupStats(rows, probs, 0.5, 0);
    const tB = equaliseBExact(rows, probs, 0.5, 'tpr');
    const b = groupStats(rows, probs, tB, 1);
    expect(Math.abs(a.tpr - b.tpr)).toBeLessThanOrEqual(1 / Math.min(a.positives, b.positives));
    const tS = equaliseBExact(rows, probs, 0.5, 'selection');
    expect(Math.abs(a.selection - groupStats(rows, probs, tS, 1).selection)).toBeLessThanOrEqual(1 / b.n);
  });
});

describe('the scorer and reweighing', () => {
  it('after reweighing, the weighted repay rate is equal across groups and equal to the overall rate (exact identity)', () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const rows: Row[] = generate({ ...DEFAULT, seed });
      const w = reweighingWeights(rows);
      const rate = (g: 0 | 1) => {
        const idx = rows.map((_, i) => i).filter((i) => rows[i].group === g);
        return idx.reduce((s, i) => s + w[i] * rows[i].repaid, 0) / idx.reduce((s, i) => s + w[i], 0);
      };
      const overall = rows.reduce((s, r) => s + r.repaid, 0) / rows.length;
      expect(rate(0)).toBeCloseTo(overall, 9);
      expect(rate(1)).toBeCloseTo(overall, 9);
    }
  });

  it('the weighted gradient equals a numeric gradient of the weighted loss', () => {
    const rows = generate(DEFAULT, 200);
    const xs = rows.map((r) => [r.score, r.group]);
    const ys = rows.map((r) => r.repaid);
    const ws = reweighingWeights(rows);
    for (const params of [[0, 0, 0], [0.3, -0.5, 0.8]]) {
      const analytic = weightedGradient(params, xs, ys, ws);
      const numeric = numericGradient((p) => weightedLoss(p, xs, ys, ws), params);
      analytic.forEach((v, i) => expect(v).toBeCloseTo(numeric[i], 6));
    }
  });

  it('calibration bins: counts sum to the group size and each point equals a direct binning', () => {
    const { rows, probs } = defaults();
    for (const g of [0, 1] as const) {
      const bins = reliability(rows, probs, g);
      expect(bins.reduce((s, b) => s + b.n, 0)).toBe(rows.filter((r) => r.group === g).length);
      bins.forEach((b, k) => {
        const inBin = rows.filter((r, i) => r.group === g && Math.min(Math.floor(probs[i] * BINS), BINS - 1) === k);
        expect(b.n).toBe(inBin.length);
        if (inBin.length) expect(b.observed).toBeCloseTo(inBin.reduce((s, r) => s + r.repaid, 0) / inBin.length, 12);
      });
    }
  });

  it('the fitted scorer is calibrated overall: mean predicted equals the mean outcome', () => {
    const { rows, probs } = defaults();
    expect(probs.reduce((s, p) => s + p, 0) / probs.length).toBeCloseTo(rows.reduce((s, r) => s + r.repaid, 0) / rows.length, 2);
  });
});

describe('the five options', () => {
  const at = (proxy: number) => runOptions({ ...DEFAULT, proxy });

  it('post-processing closes the gap it targets, and reweighing narrows the approval gap, at a cost the table shows', () => {
    const o = at(0).options;
    const [one, tpr, selection, reweigh] = o;
    expect(one.gaps.selection).toBeGreaterThan(0.2);
    expect(tpr.gaps.tpr).toBeLessThan(0.01);
    expect(selection.gaps.selection).toBeLessThan(0.005);
    expect(reweigh.gaps.selection).toBeLessThan(one.gaps.selection);
    expect(selection.accuracy).toBeLessThan(one.accuracy);
    expect(tpr.gaps.precision).toBeGreaterThan(one.gaps.precision);
  });

  it('dropping the group column does not remove the gap when a strong proxy is present: its approval gap matches the model that sees the group, within 0.02, while with no proxy it is further away', () => {
    const strong = at(3).options;
    const none = at(0).options;
    expect(Math.abs(strong[4].gaps.selection - strong[0].gaps.selection)).toBeLessThan(0.02);
    expect(strong[4].gaps.selection).toBeGreaterThan(0.2);
    expect(Math.abs(none[4].gaps.selection - none[0].gaps.selection)).toBeGreaterThan(0.03);
  });
});

describe('where bias comes from (three toys)', () => {
  it('representation: group B\'s error falls as its training share grows and group A\'s rises, on 50 seeds', () => {
    for (const seed of SEEDS) {
      const small = representation(0.05, seed);
      const large = representation(0.5, seed);
      expect(small.b - large.b, `seed ${seed}`).toBeGreaterThan(0.05);
      expect(large.a).toBeGreaterThan(small.a);
    }
  });

  it('label bias: against the biased labels group B looks much worse than it is against what really happened, on 20 seeds', () => {
    for (const seed of SEEDS.slice(0, 20)) {
      const r = labelBias(0.25, seed);
      expect(r.actual.b - r.apparent.b, `seed ${seed}`).toBeGreaterThan(0.03);
      expect(Math.abs(r.actual.a - r.apparent.a)).toBeLessThan(0.08);
    }
  });

  it('feedback loop: group B\'s share of the training data drifts down over 10 rounds in at least 10 of 12 seeded runs', () => {
    let down = 0;
    for (const seed of SEEDS.slice(0, 12)) {
      const sim = feedbackLoop(seed);
      sim.run(ROUNDS);
      expect(sim.history).toHaveLength(ROUNDS + 1);
      if (sim.history[ROUNDS].shareB < sim.history[0].shareB) down++;
    }
    expect(down).toBeGreaterThanOrEqual(10);
  });
});
