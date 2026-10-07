import { describe, expect, it } from 'vitest';
import { numericGradient } from '../../core/fit';
import { mulberry32 } from '../../core/random';
import {
  L2, LINEAR_DATA, NEED_TWO_X, OUTLIER, accuracyAt, biggestResidual, descendLine, featureScale, features, linearFit, logisticData, penalisedGradient,
  penalisedLoss, probability, separates, stillGrowing, toRawParams, trainLogistic, weightNorm, type ClassSet, type Dims, type Pt,
} from './model';

const rnd = mulberry32(77);

/** Independent reference: the slope and intercept from the textbook sums, no matrices. */
function textbookLine(pts: readonly Pt[]) {
  const n = pts.length;
  const mx = pts.reduce((s, p) => s + p.x, 0) / n;
  const my = pts.reduce((s, p) => s + p.y, 0) / n;
  const sxy = pts.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0);
  const sxx = pts.reduce((s, p) => s + (p.x - mx) ** 2, 0);
  const m = sxy / sxx;
  return { m, b: my - m * mx };
}

describe('linearFit', () => {
  it('matches a hand-computed 3-point example: (0, 1), (1, 3), (2, 4) gives y = 7/6 + 1.5x', () => {
    const f = linearFit([{ x: 0, y: 1 }, { x: 1, y: 3 }, { x: 2, y: 4 }]);
    expect(f.ok).toBe(true);
    if (!f.ok) return;
    expect(f.m).toBeCloseTo(1.5, 12);
    expect(f.b).toBeCloseTo(7 / 6, 12);
    // Residuals −1/6, 1/3, −1/6: MSE = (1/36 + 1/9 + 1/36) / 3 = 1/18.
    expect(f.mse).toBeCloseTo(1 / 18, 12);
  });

  it('matches the textbook covariance formula on the lesson data and 100 random datasets', () => {
    const sets: Pt[][] = [[...LINEAR_DATA], [...LINEAR_DATA, OUTLIER]];
    for (let k = 0; k < 100; k++) sets.push(Array.from({ length: 3 + Math.floor(rnd() * 15) }, () => ({ x: rnd() * 10, y: rnd() * 10 })));
    for (const pts of sets) {
      const f = linearFit(pts);
      const ref = textbookLine(pts);
      expect(f.ok).toBe(true);
      if (!f.ok) continue;
      expect(f.m).toBeCloseTo(ref.m, 9);
      expect(f.b).toBeCloseTo(ref.b, 9);
      // MSE is the mean area of the residual squares drawn on screen.
      expect(f.mse).toBeCloseTo(f.residuals.reduce((s, r) => s + r * r, 0) / pts.length, 12);
    }
  });

  it('least squares is the lowest MSE: nudging the line any way makes it worse', () => {
    const f = linearFit(LINEAR_DATA);
    if (!f.ok) throw new Error('fit');
    const mseOf = (b: number, m: number) => LINEAR_DATA.reduce((s, p) => s + (p.y - b - m * p.x) ** 2, 0) / LINEAR_DATA.length;
    for (const [db, dm] of [[0.01, 0], [-0.01, 0], [0, 0.01], [0, -0.01], [0.01, -0.01]]) expect(mseOf(f.b + db, f.m + dm)).toBeGreaterThan(f.mse);
  });

  it('refuses with the sentence when there are fewer than two different x values', () => {
    expect(linearFit([])).toEqual({ ok: false, reason: NEED_TWO_X });
    expect(linearFit([{ x: 3, y: 1 }])).toEqual({ ok: false, reason: NEED_TWO_X });
    expect(linearFit([{ x: 3, y: 1 }, { x: 3, y: 5 }, { x: 3, y: 2 }])).toEqual({ ok: false, reason: NEED_TWO_X });
    expect(linearFit([{ x: 3, y: 1 }, { x: 4, y: 1 }]).ok).toBe(true);
    expect(descendLine([{ x: 3, y: 1 }])).toBeNull();
  });

  it('the outlier pulls the line toward it, and is the biggest residual', () => {
    const before = linearFit(LINEAR_DATA);
    const after = linearFit([...LINEAR_DATA, OUTLIER]);
    if (!before.ok || !after.ok) throw new Error('fit');
    expect(after.m).toBeLessThan(before.m - 0.1);
    expect(biggestResidual([...LINEAR_DATA, OUTLIER])).toBe(LINEAR_DATA.length);
  });
});

describe('descendLine', () => {
  it('lands on the closed-form line within 1e-4, from the flat line, on the lesson data and random datasets', () => {
    const sets: Pt[][] = [[...LINEAR_DATA], [...LINEAR_DATA, OUTLIER]];
    for (let k = 0; k < 20; k++) sets.push(Array.from({ length: 4 + Math.floor(rnd() * 12) }, () => ({ x: 1 + rnd() * 8, y: rnd() * 10 })));
    for (const pts of sets) {
      const run = descendLine(pts)!;
      const f = linearFit(pts);
      if (!f.ok) throw new Error('fit');
      const last = run.snapshots.at(-1)!;
      expect(run.converged).toBe(true);
      expect(run.snapshots[0]).toMatchObject({ step: 0, b: 0, m: 0 });
      expect(Math.abs(last.b - f.b)).toBeLessThan(1e-4);
      expect(Math.abs(last.m - f.m)).toBeLessThan(1e-4);
    }
  });

  it('never raises the MSE between snapshots (rate 1/L is safe)', () => {
    const run = descendLine([...LINEAR_DATA, OUTLIER])!;
    run.snapshots.forEach((s, i) => i === 0 || expect(s.mse).toBeLessThanOrEqual(run.snapshots[i - 1].mse + 1e-12));
  });
});

const COMBOS: [Dims, ClassSet, boolean][] = [];
for (const d of [1, 2] as Dims[]) for (const set of ['overlapping', 'separable'] as ClassSet[]) for (const l2 of [false, true]) COMBOS.push([d, set, l2]);

describe('logistic regression', () => {
  it('training on standardised features and converting back gives the same probabilities on raw x', () => {
    for (const dims of [1, 2] as Dims[]) {
      const pts = logisticData(dims, 'overlapping');
      const raw = features(pts, dims);
      const { mean, sd } = featureScale(raw);
      const z = [0.3, ...Array.from({ length: dims }, (_, j) => -0.7 + j)];
      const rawParams = toRawParams(z, mean, sd);
      raw.forEach((x) => {
        const zx = x.map((v, j) => (v - mean[j]) / sd[j]);
        expect(probability(rawParams, x)).toBeCloseTo(probability(z, zx), 12);
      });
    }
  });

  it('the penalised gradient matches central finite differences at random params, with and without L2', () => {
    for (const [dims, set, on] of COMBOS) {
      const pts = logisticData(dims, set);
      const xs = features(pts, dims);
      const labels = pts.map((p) => p.label);
      const l2 = on ? L2 : 0;
      for (let k = 0; k < 20; k++) {
        // Small enough that no probability reaches log loss's 1e-12 clamp, where the loss has a deliberate kink.
        const params = Array.from({ length: dims + 1 }, () => (rnd() - 0.5) * 0.8);
        const numeric = numericGradient((p) => penalisedLoss(p, xs, labels, l2), params);
        penalisedGradient(params, xs, labels, l2).forEach((g, i) => expect(Math.abs(g - numeric[i])).toBeLessThan(1e-6));
      }
    }
  });

  it('log loss never goes up from one step to the next, for every features × data × L2 combination', () => {
    for (const [dims, set, on] of COMBOS) {
      const run = trainLogistic(logisticData(dims, set), dims, on ? L2 : 0);
      run.losses.forEach((l, i) => i === 0 || expect(l).toBeLessThanOrEqual(run.losses[i - 1] + 1e-12));
    }
  });

  it('every class point sits inside the plot, for every data set', () => {
    for (const [dims, set] of COMBOS) {
      for (const p of logisticData(dims, set)) {
        expect(p.x).toBeGreaterThan(0);
        expect(p.x).toBeLessThan(10);
        if (dims === 2) expect(p.y).toBeGreaterThan(0);
        if (dims === 2) expect(p.y).toBeLessThan(10);
      }
    }
    for (const p of [...LINEAR_DATA, OUTLIER]) expect(Math.min(p.x, p.y) > 0 && Math.max(p.x, p.y) < 10).toBe(true);
  });

  it('the "separable" sets really are separable, and the overlapping ones are not', () => {
    for (const dims of [1, 2] as Dims[]) {
      const sep = logisticData(dims, 'separable');
      expect(separates(trainLogistic(sep, dims, 0).snapshots.at(-1)!.params, sep, dims)).toBe(true);
      const over = logisticData(dims, 'overlapping');
      expect(separates(trainLogistic(over, dims, 0).snapshots.at(-1)!.params, over, dims)).toBe(false);
    }
    // 1-D: every class-0 x sits below every class-1 x.
    const one = logisticData(1, 'separable');
    expect(Math.max(...one.filter((p) => p.label === 0).map((p) => p.x))).toBeLessThan(Math.min(...one.filter((p) => p.label === 1).map((p) => p.x)));
  });

  it('on separable data the weights keep growing without L2 and stay bounded with it', () => {
    for (const dims of [1, 2] as Dims[]) {
      const pts = logisticData(dims, 'separable');
      const free = trainLogistic(pts, dims, 0);
      const norms = [500, 1000, 2000, 4000].map((s) => weightNorm(free.snapshots.find((x) => x.step >= s)!.params));
      norms.forEach((n, i) => i === 0 || expect(n).toBeGreaterThan(norms[i - 1] * 1.05));
      expect(stillGrowing(free)).toBe(true);
      expect(free.losses.at(-1)!).toBeLessThan(free.losses[1000]);

      const reg = trainLogistic(pts, dims, L2);
      expect(stillGrowing(reg)).toBe(false);
      // Twice the training changes ‖w‖ by almost nothing: it has settled.
      const longer = trainLogistic(pts, dims, L2, 8000);
      expect(Math.abs(weightNorm(longer.snapshots.at(-1)!.params) - weightNorm(reg.snapshots.at(-1)!.params))).toBeLessThan(0.01);
    }
  });

  it('on overlapping data the weights settle even without L2', () => {
    for (const dims of [1, 2] as Dims[]) expect(stillGrowing(trainLogistic(logisticData(dims, 'overlapping'), dims, 0))).toBe(false);
  });

  it('predicts a probability, and the threshold makes the class: moving it changes which points count as class 1', () => {
    const pts = logisticData(1, 'overlapping');
    const params = trainLogistic(pts, 1, 0).snapshots.at(-1)!.params;
    const ps = features(pts, 1).map((x) => probability(params, x));
    expect(ps.every((p) => p > 0 && p < 1)).toBe(true);
    const counts = [0.05, 0.2, 0.5, 0.8, 0.95].map((t) => ps.filter((p) => p >= t).length);
    counts.forEach((c, i) => i === 0 || expect(c).toBeLessThanOrEqual(counts[i - 1]));
    expect(counts[0]).toBeGreaterThan(counts[4]);
    expect(accuracyAt(params, pts, 1, 0.5)).toBeGreaterThan(pts.length / 2);
  });
});
