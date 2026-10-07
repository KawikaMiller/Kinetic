import { describe, expect, it } from 'vitest';
import { blobs, lineWithNoise } from './fixtures/datasets';
import { gradientStep, leastSquares, linearPredict, logLoss, logLossGradient, mse, mseGradient, numericGradient, polyEval, sigmoid } from './fit';
import { mulberry32 } from './random';
import { apply, inverse, matMul, transpose } from './vec';

describe('leastSquares', () => {
  it('matches a hand-computed 3-point line', () => {
    // (0,1) (1,3) (2,4): x̄ = 1, ȳ = 8/3, Sxy = 3, Sxx = 2, so slope 1.5 and intercept 8/3 − 1.5 = 7/6
    const fit = leastSquares([0, 1, 2], [1, 3, 4], 1)!;
    expect(fit.coeffs[0]).toBeCloseTo(7 / 6, 12);
    expect(fit.coeffs[1]).toBeCloseTo(1.5, 12);
    expect(fit.illConditioned).toBe(false);
  });

  it('matches the closed-form simple regression on seeded noisy data', () => {
    const pts = lineWithNoise({ seed: 7, n: 60, slope: 2, intercept: -1, noise: 1.5 });
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const mx = xs.reduce((a, b) => a + b) / xs.length;
    const my = ys.reduce((a, b) => a + b) / ys.length;
    const slope = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / xs.reduce((s, x) => s + (x - mx) ** 2, 0);
    const fit = leastSquares(xs, ys, 1)!;
    expect(fit.coeffs[1]).toBeCloseTo(slope, 9);
    expect(fit.coeffs[0]).toBeCloseTo(my - slope * mx, 9);
    expect(fit.coeffs[1]).toBeCloseTo(2, 0);
  });

  it('interpolates exactly when degree + 1 equals the number of points', () => {
    const fit = leastSquares([0, 1, 2], [1, 3, 4], 2)!;
    [0, 1, 2].forEach((x, i) => expect(polyEval(fit.coeffs, x)).toBeCloseTo([1, 3, 4][i], 9));
  });

  it('ridge matches (XᵀX + λI′)⁻¹Xᵀy and shrinks the slope; the intercept is not penalised', () => {
    const xs = [0, 1, 2, 3];
    const ys = [1, 2.5, 2.9, 4.2];
    const lambda = 2;
    const X = xs.map((x) => [1, x]);
    const A = matMul(transpose(X), X);
    A[1][1] += lambda;
    const Xty = transpose(X).map((row) => row.reduce((s, v, k) => s + v * ys[k], 0));
    const expected = apply(inverse(A)!, Xty);
    const fit = leastSquares(xs, ys, 1, { lambda })!;
    fit.coeffs.forEach((c, i) => expect(c).toBeCloseTo(expected[i], 10));
    expect(Math.abs(fit.coeffs[1])).toBeLessThan(Math.abs(leastSquares(xs, ys, 1)!.coeffs[1]));
  });

  it('returns null for a singular system and flags an ill-conditioned one', () => {
    expect(leastSquares([1, 1, 1], [1, 2, 3], 1)).toBeNull();
    const xs = Array.from({ length: 30 }, (_, i) => 100 + i);
    const fit = leastSquares(
      xs,
      xs.map((x) => Math.sin(x)),
      6,
    );
    expect(fit === null || fit.illConditioned).toBe(true);
  });
});

describe('losses', () => {
  it('computes mse, log loss and the sigmoid', () => {
    expect(mse([1, 2, 3], [1, 2, 5])).toBeCloseTo(4 / 3, 12);
    expect(logLoss([0.5, 0.5], [1, 0])).toBeCloseTo(Math.LN2, 12);
    expect(logLoss([0.9], [1])).toBeCloseTo(-Math.log(0.9), 12);
    expect(Number.isFinite(logLoss([0], [1]))).toBe(true);
    expect(sigmoid(0)).toBe(0.5);
    expect(sigmoid(4) + sigmoid(-4)).toBeCloseTo(1, 12);
  });
});

describe('gradients', () => {
  const rnd = mulberry32(3);
  const randomParams = (n: number) => Array.from({ length: n }, () => rnd() * 4 - 2);

  it('mseGradient matches finite differences', () => {
    const pts = lineWithNoise({ seed: 11, n: 25, slope: 0.7, intercept: 3, noise: 1 });
    const xs = pts.map((p) => [p.x]);
    const ys = pts.map((p) => p.y);
    const f = (p: number[]) =>
      mse(
        xs.map((x) => linearPredict(p, x)),
        ys,
      );
    for (let t = 0; t < 10; t++) {
      const params = randomParams(2);
      const numeric = numericGradient(f, params);
      mseGradient(params, xs, ys).forEach((g, i) => expect(g).toBeCloseTo(numeric[i], 4));
    }
  });

  it('logLossGradient matches finite differences', () => {
    const pts = blobs({
      seed: 5,
      centers: [
        [-1, 0],
        [1, 1],
      ],
      n: 20,
      spread: 0.8,
    });
    const xs = pts.map((p) => [p.x, p.y]);
    const labels = pts.map((p) => p.label);
    const f = (p: number[]) =>
      logLoss(
        xs.map((x) => sigmoid(linearPredict(p, x))),
        labels,
      );
    for (let t = 0; t < 10; t++) {
      const params = randomParams(3);
      const numeric = numericGradient(f, params);
      logLossGradient(params, xs, labels).forEach((g, i) => expect(g).toBeCloseTo(numeric[i], 5));
    }
  });

  it('gradient descent converges to the least-squares answer', () => {
    const pts = lineWithNoise({ seed: 2, n: 40, slope: 1.2, intercept: 0.5, noise: 0.5, xRange: [0, 2] });
    const xs = pts.map((p) => [p.x]);
    const ys = pts.map((p) => p.y);
    let params = [0, 0];
    for (let i = 0; i < 5000; i++) params = gradientStep(params, mseGradient(params, xs, ys), 0.1);
    const exact = leastSquares(
      pts.map((p) => p.x),
      ys,
      1,
    )!.coeffs;
    params.forEach((p, i) => expect(p).toBeCloseTo(exact[i], 6));
    expect(gradientStep([1, 2], [0.5, -1], 0.1)).toEqual([0.95, 2.1]);
  });
});
