import { describe, expect, it } from 'vitest';
import { leastSquares, polyEval } from '../../core/fit';
import { inverse, matMul, transpose } from '../../core/vec';
import {
  DATA_SEED, LAMBDA_GRID, MAX_DEGREE, OVERFIT_N, PRESET_IDS, TEST_SEED, TEST_SET, bestBy, coefficientWarning, degreeCurve, fitPoly,
  lambdaCurve, makeSplit, presetSettings, samples, validationCount,
} from './model';

const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);

describe('data', () => {
  it('is deterministic per seed, and adding points never changes the earlier ones', () => {
    expect(samples(DATA_SEED, 50)).toEqual(samples(DATA_SEED, 50));
    expect(samples(DATA_SEED, 80).slice(0, 50)).toEqual(samples(DATA_SEED, 50));
  });

  it('a reshuffle re-splits the same pool: same points, different train/validation membership', () => {
    const a = makeSplit(30, 1);
    const b = makeSplit(30, 2);
    const key = (s: { x: number; y: number }) => `${s.x},${s.y}`;
    expect([...a.train, ...a.val].map(key).sort()).toEqual([...b.train, ...b.val].map(key).sort());
    expect(a.train.map(key)).not.toEqual(b.train.map(key));
    expect(a.train).toHaveLength(30);
    expect(a.val).toHaveLength(validationCount(30));
  });

  it('the test set is drawn from its own seed and shares no point with any pool', () => {
    expect(TEST_SEED).not.toBe(DATA_SEED);
    const pool = new Set(samples(DATA_SEED, 300).map((s) => s.x));
    expect(TEST_SET.some((s) => pool.has(s.x))).toBe(false);
  });
});

describe('fits', () => {
  it('training MSE never rises with degree (nested least squares), on 20 seeds × 4 sizes', () => {
    for (const n of [20, 30, 60, 200]) {
      for (const seed of SEEDS) {
        const c = degreeCurve(makeSplit(n, seed), 0);
        expect(c).toHaveLength(MAX_DEGREE + 1);
        c.forEach((p, i) => i === 0 || expect(p.train).toBeLessThanOrEqual(c[i - 1].train + 1e-12));
      }
    }
  });

  it('the ridge solution matches the normal equations (XᵀX + λI′)⁻¹Xᵀy, intercept unpenalised', () => {
    const { train } = makeSplit(30, 3);
    for (const degree of [2, 5, 9]) {
      for (const lambda of [1e-4, 0.1, 3]) {
        const X = train.map((s) => Array.from({ length: degree + 1 }, (_, p) => s.x ** p));
        const Xt = transpose(X);
        const A = matMul(Xt, X).map((row, i) => row.map((v, j) => (i === j && i > 0 ? v + lambda : v)));
        const Xty = matMul(Xt, train.map((s) => [s.y]));
        const explicit = matMul(inverse(A)!, Xty).map((r) => r[0]);
        const f = fitPoly(train, degree, lambda);
        if (!f.ok) throw new Error('fit');
        f.coeffs.forEach((c, i) => expect(c).toBeCloseTo(explicit[i], 6));
      }
    }
  });

  it('λ → 0 gives plain least squares', () => {
    const { train } = makeSplit(30, 4);
    const plain = leastSquares(train.map((s) => s.x), train.map((s) => s.y), 4)!;
    const tiny = fitPoly(train, 4, 1e-12);
    if (!tiny.ok) throw new Error('fit');
    tiny.coeffs.forEach((c, i) => expect(c).toBeCloseTo(plain.coeffs[i], 8));
  });

  it('warns at as many coefficients as points, and refuses more without λ instead of solving silently', () => {
    expect(coefficientWarning(20, 12, 0)).toBe('none');
    expect(coefficientWarning(13, 12, 0)).toBe('interpolates');
    expect(coefficientWarning(10, 12, 0)).toBe('singular');
    expect(coefficientWarning(10, 12, 0.1)).toBe('underdetermined');
    const { train } = makeSplit(10, 1);
    const refused = fitPoly(train, 12, 0);
    expect(refused.ok).toBe(false);
    expect(fitPoly(train, 12, 0.1).ok).toBe(true);
    // Degree 9 through 10 points: it really passes through every training point.
    const exact = fitPoly(train, 9, 0);
    if (!exact.ok) throw new Error('fit');
    train.forEach((s) => expect(polyEval(exact.coeffs, s.x)).toBeCloseTo(s.y, 4));
  });

  it('the overfit size solves at degree 12 on every one of 30 splits', () => {
    for (let seed = 1; seed <= 30; seed++) expect(fitPoly(makeSplit(OVERFIT_N, seed).train, MAX_DEGREE, 0).ok).toBe(true);
  });
});

describe('model selection', () => {
  it('the best degree is the argmin of validation MSE, recomputed by the independent normal-equations path (core/fit)', () => {
    for (const seed of SEEDS) {
      // 200 points keep degree 12's normal equations well enough conditioned to serve as a reference.
      const split = makeSplit(200, seed);
      const reference = Array.from({ length: MAX_DEGREE + 1 }, (_, d) => {
        const f = leastSquares(split.train.map((s) => s.x), split.train.map((s) => s.y), d)!;
        return split.val.reduce((sum, s) => sum + (polyEval(f.coeffs, s.x) - s.y) ** 2, 0) / split.val.length;
      });
      const want = reference.indexOf(Math.min(...reference));
      expect(bestBy(degreeCurve(split, 0))!.at).toBe(want);
    }
  });

  it('QR solves every split the normal equations refused: n = 10 at degree 9 and n = 15 at degree 12, 30 splits each', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const ten = makeSplit(10, seed).train;
      const nine = fitPoly(ten, 9, 0);
      expect(nine.ok).toBe(true);
      if (nine.ok) ten.forEach((s) => expect(polyEval(nine.coeffs, s.x)).toBeCloseTo(s.y, 4));
      expect(fitPoly(makeSplit(15, seed).train, 12, 0).ok).toBe(true);
    }
  });

  it('the lowest training error is not the best model: degree 12 wins on training and loses on validation', () => {
    for (const seed of SEEDS) {
      const c = degreeCurve(makeSplit(OVERFIT_N, seed), 0);
      const best = bestBy(c)!;
      const top = c.at(-1)!;
      expect(top.train).toBeLessThan(best.train);
      expect(top.val).toBeGreaterThan(best.val);
      expect(best.at).toBeLessThan(MAX_DEGREE);
    }
  });

  it('more data: the same degree-12 model overfits far less with 200 points than with 20', () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const small = degreeCurve(makeSplit(OVERFIT_N, seed), 0).at(-1)!;
      const big = degreeCurve(makeSplit(200, seed), 0).at(-1)!;
      expect(big.val).toBeLessThan(small.val);
      expect(big.val - big.train).toBeLessThan(small.val - small.train);
    }
  });

  it('a well-chosen λ brings degree 12’s validation error down, and the best λ is the argmin over the grid', () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const split = makeSplit(OVERFIT_N, seed);
      const lc = lambdaCurve(split, MAX_DEGREE);
      expect(lc).toHaveLength(LAMBDA_GRID.length);
      const best = bestBy(lc)!;
      expect(best.val).toBe(Math.min(...lc.map((p) => p.val)));
      expect(best.val).toBeLessThan(degreeCurve(split, 0).at(-1)!.val);
    }
  });

  it('presets pick their "best" from validation error on the current split', () => {
    const good = presetSettings('good', 1);
    expect(good.degree).toBe(bestBy(degreeCurve(makeSplit(good.nTrain, 1), 0))!.at);
    const lam = presetSettings('fixedByLambda', 1);
    expect(lam.lambda).toBe(bestBy(lambdaCurve(makeSplit(lam.nTrain, 1), MAX_DEGREE))!.at);
    expect(PRESET_IDS.map((id) => presetSettings(id, 1).degree)).toEqual([1, good.degree, 12, 12, 12]);
  });
});
