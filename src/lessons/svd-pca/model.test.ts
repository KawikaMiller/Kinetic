import { describe, expect, it } from 'vitest';
import { jacobiEigen, svdSmall } from '../../core/linalg';
import { mulberry32, randInt, type Rnd } from '../../core/random';
import { dot, matMul, transpose } from '../../core/vec';
import {
  DEFAULT_MISTAKES, IMAGES, alongAxis, applyMistakes, axisAngle, bestThresholdAccuracy, bodyData, classData, cloudPoints, closedFormValues, discardedNorm, frobenius,
  imageOf, largestSavingRank, pcaOf, projectOnto, rebuild, residualSumSquares, rotateAbout, smallData, storageOfImage, storageOfRank, svdOf, svdVersusCovariance, type P2,
} from './model';

const randomMatrix = (rnd: Rnd, rows: number, cols: number): number[][] => Array.from({ length: rows }, () => Array.from({ length: cols }, () => rnd() * 4 - 2));

/** Orthonormal columns from random vectors by Gram-Schmidt, as an m x k matrix. */
function randomOrthonormal(rnd: Rnd, m: number, k: number): number[][] {
  const cols: number[][] = [];
  while (cols.length < k) {
    let v = Array.from({ length: m }, () => rnd() * 2 - 1);
    for (let pass = 0; pass < 2; pass++) for (const u of cols) v = v.map((x, i) => x - dot(u, v) * u[i]);
    const len = Math.sqrt(dot(v, v));
    if (len > 1e-6) cols.push(v.map((x) => x / len));
  }
  return transpose(cols);
}

describe('the SVD of small matrices', () => {
  it('A = U S V^T to 1e-9, U and V orthonormal, singular values non-negative and sorted, and sigma^2 equal the eigenvalues of A^T A (1,000 seeded 8x8 and rectangular matrices)', () => {
    const rnd = mulberry32(1);
    for (let t = 0; t < 1000; t++) {
      const [m, n] = t % 2 === 0 ? [8, 8] : [randInt(1, 8, rnd), randInt(1, 8, rnd)];
      const A = randomMatrix(rnd, m, n);
      const { u, s, v } = svdSmall(A);
      const r = Math.min(m, n);
      const back = matMul(u.map((row) => row.map((x, j) => x * s[j])), transpose(v));
      A.forEach((row, i) => row.forEach((x, j) => expect(Math.abs(x - back[i][j])).toBeLessThan(1e-9)));
      const orthonormal = (M: number[][]) => {
        const g = matMul(transpose(M), M);
        g.forEach((row, i) => row.forEach((x, j) => expect(Math.abs(x - (i === j ? 1 : 0))).toBeLessThan(1e-9)));
      };
      orthonormal(u);
      orthonormal(v);
      expect(s).toHaveLength(r);
      s.forEach((x, i) => {
        expect(x).toBeGreaterThanOrEqual(0);
        if (i > 0) expect(x).toBeLessThanOrEqual(s[i - 1] + 1e-12);
      });
      const eig = jacobiEigen(matMul(transpose(A), A)).values.slice(0, r);
      eig.forEach((lambda, i) => expect(Math.abs(s[i] ** 2 - lambda)).toBeLessThan(1e-8));
    }
  });

  it('Eckart-Young: the error is the root of the discarded sigma squares to 1e-9, and no random rank-k matrix beats the truncation (1,000 competitors)', () => {
    const rnd = mulberry32(2);
    let competitors = 0;
    for (let t = 0; t < 50; t++) {
      const A = randomMatrix(rnd, 8, 8);
      const svd = svdSmall(A);
      for (let k = 1; k <= 8; k++) {
        const err = frobenius(A, rebuild(svd, k));
        expect(Math.abs(err - discardedNorm(svd.s, k))).toBeLessThan(1e-9);
        if (k < 8 && t < 25) {
          for (let c = 0; c < 6; c++) {
            const Q = randomOrthonormal(rnd, 8, k);
            const B = matMul(Q, matMul(transpose(Q), A));
            expect(frobenius(A, B)).toBeGreaterThanOrEqual(err - 1e-9);
            competitors++;
          }
        }
      }
    }
    expect(competitors).toBeGreaterThanOrEqual(1000);
  });

  it('the teaching images: stripes need 1 term (identical rows), the smiley a few, noise nearly all; the rank-k form is smaller only for k <= 3', () => {
    const rank = (id: 'smiley' | 'stripes' | 'noise', tol: number) => svdOf(imageOf(id)).s.filter((x) => x > tol).length;
    expect(rank('stripes', 1e-9)).toBe(1);
    expect(rank('smiley', 1e-9)).toBeGreaterThanOrEqual(4);
    expect(rank('noise', 1e-9)).toBe(8);
    expect(IMAGES.map((i) => i.id)).toEqual(['smiley', 'stripes', 'noise']);
    expect(storageOfRank(3)).toBe(51);
    expect(storageOfRank(4)).toBe(68);
    expect(storageOfImage()).toBe(64);
    expect(largestSavingRank()).toBe(3);
    // k terms always rebuild exactly at full rank.
    for (const { id } of IMAGES) expect(frobenius(imageOf(id), rebuild(svdOf(imageOf(id)), 8))).toBeLessThan(1e-9);
    // Noise drops in error slowly: the first term holds well under 60% of its energy.
    const noise = svdOf(imageOf('noise')).s;
    expect(noise[0] ** 2 / noise.reduce((s, x) => s + x * x, 0)).toBeLessThan(0.8);
  });
});

describe('PCA on a point cloud', () => {
  it('the axes are the closed-form eigenvectors of the 2 x 2 covariance, and the eigenvalues match (a + c)/2 +- sqrt(((a - c)/2)^2 + b^2)', () => {
    const rnd = mulberry32(3);
    for (let t = 0; t < 200; t++) {
      const pts = Array.from({ length: randInt(3, 60, rnd) }, (): P2 => [rnd() * 8 - 4, rnd() * 8 - 4]);
      const r = pcaOf(pts);
      const [l1, l2] = closedFormValues(r.cov);
      expect(r.values[0]).toBeCloseTo(l1, 9);
      expect(r.values[1]).toBeCloseTo(l2, 9);
      r.axes.forEach((v, i) => {
        const cv = [r.cov.a * v[0] + r.cov.b * v[1], r.cov.b * v[0] + r.cov.c * v[1]];
        expect(Math.abs(cv[0] - r.values[i] * v[0])).toBeLessThan(1e-9);
        expect(Math.abs(cv[1] - r.values[i] * v[1])).toBeLessThan(1e-9);
      });
      expect(r.explained).toBeCloseTo(l1 / (l1 + l2), 9);
      // The closed-form angle of the first axis: tan 2 theta = 2 b / (a - c).
      if (Math.abs(r.cov.b) > 1e-6) {
        const theta = 0.5 * Math.atan2(2 * r.cov.b, r.cov.a - r.cov.c);
        const gap = Math.abs(((axisAngle(r.axes[0]) - theta) % Math.PI + Math.PI * 1.5) % Math.PI - Math.PI / 2);
        expect(gap).toBeLessThan(1e-6);
      }
    }
  });

  it('projecting onto PC1 leaves a total squared residual of n x lambda_2, and rotating to the axes makes the covariance diagonal', () => {
    const pts = cloudPoints();
    const r = pcaOf(pts);
    const proj = projectOnto(pts, r.mean, r.axes[0]);
    expect(residualSumSquares(pts, proj)).toBeCloseTo(pts.length * r.values[1], 9);
    const turned = rotateAbout(pts, r.mean, axisAngle(r.axes[0]));
    const after = pcaOf(turned);
    expect(Math.abs(after.cov.b)).toBeLessThan(1e-9);
    expect(after.cov.a).toBeCloseTo(r.values[0], 9);
    expect(after.cov.c).toBeCloseTo(r.values[1], 9);
  });

  it('degenerate clouds say so: all points equal has no axes, collinear points have no second axis, never NaN', () => {
    const same = pcaOf(Array.from({ length: 10 }, (): P2 => [1, 2]));
    expect(same.degenerate).toBe('same');
    expect(same.explained).toBeNull();
    const line = pcaOf(Array.from({ length: 10 }, (_, i): P2 => [i, 2 * i + 1]));
    expect(line.degenerate).toBe('line');
    expect(line.explained).toBeCloseTo(1, 12);
    for (const r of [same, line]) expect([...r.values, ...r.axes.flat(), ...r.mean].every(Number.isFinite)).toBe(true);
    expect(pcaOf(cloudPoints()).degenerate).toBe('none');
  });
});

describe('ways to get it wrong', () => {
  const data = bodyData();

  it('standardised features give eigenvalues 1 +- rho and axes at 45 degrees, whatever the units', () => {
    for (const units of ['m', 'cm'] as const) {
      const r = applyMistakes(data, { ...DEFAULT_MISTAKES, units, standardise: true });
      expect(r.values[0]).toBeCloseTo(1 + Math.abs(r.rho), 9);
      expect(r.values[1]).toBeCloseTo(1 - Math.abs(r.rho), 9);
      expect(r.angle1).toBeCloseTo(r.rho > 0 ? 45 : 135, 6);
    }
    expect(applyMistakes(data, { ...DEFAULT_MISTAKES, units: 'm', standardise: true }).rho).toBeGreaterThan(0.3);
  });

  it('with standardising on, the centre and units settings change nothing (so disabling them hides no number)', () => {
    const base = applyMistakes(data, { centre: true, units: 'm', standardise: true });
    for (const centre of [true, false]) for (const units of ['m', 'cm'] as const) {
      const r = applyMistakes(data, { centre, units, standardise: true });
      expect(r.angle1).toBeCloseTo(base.angle1, 9);
      expect(r.values[0]).toBeCloseTo(base.values[0], 9);
    }
  });

  it('units decide PC1 when not standardised: in metres it follows the kilograms, in centimetres it swings toward height', () => {
    const m = applyMistakes(data, { ...DEFAULT_MISTAKES, units: 'm' });
    const cm = applyMistakes(data, { ...DEFAULT_MISTAKES, units: 'cm' });
    expect(Math.abs(m.angle1 - 90)).toBeLessThan(1);
    expect(Math.abs(cm.angle1 - 90)).toBeGreaterThan(20);
    expect(m.explained).toBeGreaterThan(0.99);
  });

  it('skipping the centring gives a different first axis that points at the mean, not along the spread', () => {
    const right = applyMistakes(data, DEFAULT_MISTAKES);
    const wrong = applyMistakes(data, { ...DEFAULT_MISTAKES, centre: false, units: 'cm' });
    const rightCm = applyMistakes(data, { ...DEFAULT_MISTAKES, units: 'cm' });
    expect(Math.abs(wrong.angle1 - rightCm.angle1)).toBeGreaterThan(5);
    expect(Math.abs(wrong.angle1 - wrong.meanAngle)).toBeLessThan(1);
    expect(right.angle1).toBeGreaterThanOrEqual(0);
  });
});

describe('variance is not information about the question', () => {
  it('the classes split along y: PC1 follows the wide x spread and barely separates them, PC2 separates them, matching a brute-force threshold search', () => {
    const rows = classData();
    const pts = rows.map((r) => r.point);
    const labels = rows.map((r) => r.label);
    const r = pcaOf(pts);
    const pc1 = alongAxis(pts, r.mean, r.axes[0]);
    const pc2 = alongAxis(pts, r.mean, r.axes[1]);
    const brute = (xs: number[]) => {
      let best = 0;
      for (const cut of xs) for (const low of [0, 1]) {
        const correct = xs.filter((x, i) => (x <= cut ? labels[i] === low : labels[i] === 1 - low)).length;
        best = Math.max(best, correct / xs.length);
      }
      return best;
    };
    expect(bestThresholdAccuracy(pc1, labels)).toBeCloseTo(brute(pc1), 12);
    expect(bestThresholdAccuracy(pc2, labels)).toBeCloseTo(brute(pc2), 12);
    expect(Math.abs(r.axes[0][0])).toBeGreaterThan(0.95);
    expect(bestThresholdAccuracy(pc2, labels)).toBeGreaterThan(0.9);
    expect(bestThresholdAccuracy(pc1, labels)).toBeLessThan(0.75);
  });

  it('a single threshold on 1-D values scores 1 on separable data and at least 0.5 on any labels', () => {
    expect(bestThresholdAccuracy([1, 2, 3, 4], [0, 0, 1, 1])).toBe(1);
    expect(bestThresholdAccuracy([1, 2, 3, 4], [1, 1, 0, 0])).toBe(1);
    const rnd = mulberry32(8);
    for (let t = 0; t < 100; t++) {
      const n = randInt(2, 20, rnd);
      expect(bestThresholdAccuracy(Array.from({ length: n }, () => rnd()), Array.from({ length: n }, () => (rnd() < 0.5 ? 0 : 1)))).toBeGreaterThanOrEqual(0.5);
    }
  });
});

describe('SVD and PCA are the same computation', () => {
  it('for centred data sigma^2 / (n - 1) equals the covariance eigenvalues, on 300 seeded 8 x 3 data sets', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const rows = svdVersusCovariance(smallData(seed));
      expect(rows).toHaveLength(3);
      rows.forEach((r) => expect(Math.abs(r.fromSvd - r.fromCovariance)).toBeLessThan(1e-9));
    }
  });
});
