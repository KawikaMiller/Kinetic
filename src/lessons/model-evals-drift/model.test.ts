import { describe, expect, it } from 'vitest';
import { gaussian } from '../../core/fixtures/datasets';
import { mulberry32 } from '../../core/random';
import { CLEAN_STREAMS, cleanReadings, falseAlarmRate, ksFivePercent } from './falseAlarm';
import { SEGMENT_B_BIAS, VERSIONS, evaluate, gate, meanOf, testPool, trainVersion, correct } from './gate';
import { leakExperiment } from './leak';
import { ksTwoSample } from '../../core/distributions';
import { bootstrapMeanInterval } from '../../core/stats';
import { BINS, binShares, decileEdges, psi } from './monitors';
import { alarms, simulate } from './stream';
import { accuracy, dayBatch, predict, trainModel, TRAIN_SEED, type Example } from './world';

describe('PSI', () => {
  it('equals a hand-worked 3-bin example', () => {
    // expected shares (0.5, 0.3, 0.2), actual (0.4, 0.4, 0.2):
    // (0.4 - 0.5) ln(0.4 / 0.5) + (0.4 - 0.3) ln(0.4 / 0.3) + 0 = 0.1 ln 1.25 + 0.1 ln (4/3)
    const worked = 0.1 * Math.log(1.25) + 0.1 * Math.log(4 / 3);
    expect(psi([0.5, 0.3, 0.2], [0.4, 0.4, 0.2])).toBeCloseTo(worked, 9);
    expect(worked).toBeCloseTo(0.0510825624, 9);
  });

  it('is 0 for identical shares, symmetric, and never negative', () => {
    expect(psi([0.25, 0.75], [0.25, 0.75])).toBe(0);
    const rnd = mulberry32(3);
    for (let i = 0; i < 200; i++) {
      const raw = Array.from({ length: 5 }, () => 0.05 + rnd());
      const raw2 = Array.from({ length: 5 }, () => 0.05 + rnd());
      const norm = (xs: number[]) => xs.map((x) => x / xs.reduce((a, b) => a + b, 0));
      const a = norm(raw);
      const b = norm(raw2);
      expect(psi(a, b)).toBeGreaterThanOrEqual(0);
      expect(psi(a, b)).toBeCloseTo(psi(b, a), 12);
    }
  });

  it('decile bins of the baseline hold a tenth each', () => {
    const rnd = mulberry32(4);
    const sample = Array.from({ length: 1000 }, () => gaussian(rnd));
    const shares = binShares(sample, decileEdges(sample));
    expect(shares).toHaveLength(BINS);
    for (const s of shares) expect(s).toBeCloseTo(0.1, 2);
  });
});

describe('KS', () => {
  it('equals a brute-force max |F1 - F2| over the pooled sample on 200 seeded pairs', () => {
    const rnd = mulberry32(9);
    for (let t = 0; t < 200; t++) {
      const a = Array.from({ length: 5 + Math.floor(rnd() * 60) }, () => Math.round(gaussian(rnd) * 4) / 4);
      const b = Array.from({ length: 5 + Math.floor(rnd() * 60) }, () => Math.round(gaussian(rnd) * 4) / 4 + rnd());
      let brute = 0;
      for (const z of [...a, ...b]) {
        const f1 = a.filter((v) => v <= z).length / a.length;
        const f2 = b.filter((v) => v <= z).length / b.length;
        brute = Math.max(brute, Math.abs(f1 - f2));
      }
      expect(ksTwoSample(a, b), `pair ${t}`).toBeCloseTo(brute, 12);
    }
  });
});

describe('the model and the shifts', () => {
  it('is about 90% accurate on the unshifted world', () => {
    const { model } = trainModel(TRAIN_SEED);
    const acc = meanOf(Array.from({ length: 20 }, (_, d) => accuracy(model, dayBatch(3, d + 1, null))));
    expect(acc).toBeGreaterThan(0.87);
    expect(acc).toBeLessThan(0.93);
  });

  it('under pure covariate shift the boundary is unchanged and the accuracy drop equals a direct recomputation', () => {
    const { model } = trainModel(TRAIN_SEED);
    const batch = dayBatch(5, 25, { kind: 'covariate', sizePct: 80 });
    let right = 0;
    for (const e of batch) {
      const z = model.params[0] + model.params[1] * e.x[0] + model.params[2] * e.x[1];
      if ((z >= 0 ? 1 : 0) === e.y) right++;
    }
    expect(accuracy(model, batch)).toBe(right / batch.length);
    const s = simulate({ kind: 'covariate', day: 20, sizePct: 80, seed: 5, labelDelay: 0 });
    expect(s.days[24].accuracy).toBe(right / batch.length);
    expect(s.days[24].accuracy).toBeLessThan(s.days[5].accuracy);
  });

  it('concept drift leaves the inputs identical and only the labels move', () => {
    const base = dayBatch(5, 25, null);
    const drifted = dayBatch(5, 25, { kind: 'concept', sizePct: 60 });
    expect(drifted.map((e) => e.x)).toEqual(base.map((e) => e.x));
    expect(drifted.some((e, i) => e.y !== base[i].y)).toBe(true);
    const s = simulate({ kind: 'concept', day: 20, sizePct: 60, seed: 5, labelDelay: 7 });
    expect(alarms(s, 7, 20).input).toBeNull();
    expect(alarms(s, 7, 20).accuracy).toBe(27);
    expect(alarms(s, 0, 20).accuracy).toBe(20);
  });

  it('covariate shift trips the input monitors on the shift day and before it they stay quiet', () => {
    const s = simulate({ kind: 'covariate', day: 20, sizePct: 80, seed: 5, labelDelay: 0 });
    const a = alarms(s, 0, 20);
    expect(a.input).toBe(20);
    expect(a.falseInputDays).toBe(0);
    expect(s.days.slice(0, 19).every((d) => d.ks <= s.ksCritical && d.psi <= 0.25)).toBe(true);
  });

  it('broken variant: a detector that sets its baseline from post-shift data alarms only at chance level after the shift', () => {
    const setting = { kind: 'covariate' as const, day: 20, sizePct: 80, seed: 5, labelDelay: 0 };
    expect(alarms(simulate(setting), 0, 20).input).not.toBeNull();
    const broken = simulate(setting, 'post-shift');
    // from the shift day on its readings are those of a clean stream: alerts only at chance level (at most 1 of the 21 days here)
    const alerts = (st: ReturnType<typeof simulate>) => st.days.filter((d) => d.day >= setting.day && (d.psi > 0.25 || d.ks > st.ksCritical)).length;
    expect(alerts(broken)).toBeLessThanOrEqual(1);
    expect(alerts(simulate(setting))).toBeGreaterThanOrEqual(14);
    // the damage is still real: accuracy fell, the broken detector just cannot see it
    expect(meanOf(broken.days.slice(19).map((d) => d.accuracy))).toBeLessThan(0.86);
  });

  it('a day batch depends only on (seed, day) and the shift', () => {
    expect(dayBatch(5, 3, null)).toEqual(dayBatch(5, 3, null));
    expect(dayBatch(5, 3, null)).not.toEqual(dayBatch(6, 3, null));
    expect(dayBatch(5, 3, { kind: 'covariate', sizePct: 0 })).toEqual(dayBatch(5, 3, null));
  });
});

describe('false alarms on clean streams', () => {
  it('a 5% KS test alerts on about 5% of 1,000 clean streams x 40 days (measured, within 4% to 6.2%)', () => {
    const c = cleanReadings(1000);
    const rate = falseAlarmRate(c, 'ks', ksFivePercent(c.baselineSize));
    expect(c.readings).toHaveLength(1000 * 40);
    expect(rate).toBeGreaterThan(0.04);
    expect(rate).toBeLessThan(0.062);
  });

  it('the false-alarm rate never rises with the threshold, for both monitors', () => {
    const c = cleanReadings(CLEAN_STREAMS);
    for (const m of ['ks', 'psi'] as const) {
      let last = 1;
      for (let t = 0; t <= 0.5; t += 0.01) {
        const r = falseAlarmRate(c, m, t);
        expect(r).toBeLessThanOrEqual(last);
        last = r;
      }
    }
  });
});

describe('the eval gate', () => {
  it('the bootstrap interval for a known difference covers it about 95% of 1,000 seeded trials', () => {
    // Paired outcomes with known means: v1 right with probability 0.80, v2 with 0.85, independently, so the true difference is 0.05.
    const rnd = mulberry32(31);
    const n = 300;
    let covered = 0;
    const trials = 1000;
    for (let t = 0; t < trials; t++) {
      const diffs = Array.from({ length: n }, () => (rnd() < 0.85 ? 1 : 0) - (rnd() < 0.8 ? 1 : 0));
      const { lo, hi } = bootstrapMeanInterval(diffs, 1000, t);
      if (lo <= 0.05 && 0.05 <= hi) covered++;
    }
    expect(covered / trials).toBeGreaterThan(0.93);
    expect(covered / trials).toBeLessThan(0.97);
  });

  it('accuracy and slices equal a direct count, and a larger n only adds test examples', () => {
    const pool = testPool();
    const models = { v1: trainVersion(VERSIONS[0]), v2: trainVersion(VERSIONS[1]) };
    for (const n of [100, 800, 5000]) {
      const e = evaluate(n);
      const test = pool.slice(0, n);
      expect(e.accuracy.v1).toBe(test.filter((x) => predict(models.v1, x.x) === x.y).length / n);
      const b = test.filter((x) => x.segment === 'B');
      expect(e.slice.B.n).toBe(b.length);
      expect(e.slice.B.accuracy.v2).toBe(b.filter((x) => correct(models.v2, x)).length / b.length);
      expect(e.slice.A.n + e.slice.B.n).toBe(n);
    }
    expect(SEGMENT_B_BIAS).toBeGreaterThan(0);
  });

  it('v2 wins on average and loses on segment B, so the two gates disagree, at the default size and at 5,000', () => {
    for (const n of [300, 5000]) {
      const e = evaluate(n);
      expect(e.difference).toBeGreaterThan(0);
      expect(e.slice.B.accuracy.v2).toBeLessThan(e.slice.B.accuracy.v1);
      expect(gate(e, 'overall').ship).toBe(true);
      expect(gate(e, 'slices').ship).toBe(false);
    }
  });

  it('the interval includes 0 at 300 examples and excludes it at 5,000', () => {
    const small = evaluate(300);
    const big = evaluate(5000);
    expect(small.interval.lo).toBeLessThan(0);
    expect(small.interval.hi).toBeGreaterThan(0);
    expect(big.interval.lo).toBeGreaterThan(0);
  });

  it('a worse v2 is blocked by both gates', () => {
    const e = { ...evaluate(300), difference: -1 };
    expect(gate(e, 'overall').ship).toBe(false);
    expect(gate(e, 'slices').ship).toBe(false);
  });
});

describe('leakage', () => {
  it('a memoriser scores 100% on leaked test items and less on fresh data; a held-out set scores lower', () => {
    const off = leakExperiment(false);
    const on = leakExperiment(true);
    expect(on.memoriser.test).toBe(1);
    expect(off.memoriser.test).toBeLessThan(1);
    expect(on.memoriser.fresh).toBeLessThan(0.9);
    expect(Math.abs(on.logistic.test - on.logistic.fresh)).toBeLessThan(0.05);
  });

  it('a memoriser on its own training points is right whenever they are unique', () => {
    const train: Example[] = dayBatch(1, 1, null, 50);
    const score = train.filter((e) => train.find((t) => t.x[0] === e.x[0] && t.x[1] === e.x[1])!.y === e.y).length;
    expect(score).toBe(50);
  });
});
