import { describe, expect, it } from 'vitest';
import lesson from './index';
import {
  DEFAULT_MISTAKES, IMAGES, RANK_BOUNDS, alongAxis, applyMistakes, bestThresholdAccuracy, bodyData, classData, cloudPoints, discardedNorm, frobenius, imageOf, largestSavingRank,
  pcaOf, projectOnto, rebuild, residualSumSquares, rotateAbout, smallData, storageOfImage, storageOfRank, svdOf, svdVersusCovariance, type Mistakes, type P2,
} from './model';
import { classCaption, cloudCaption, imageCaption, linkCaption, mistakesCaption } from './text';

const NO_JUNK = /NaN|undefined|null|Infinity|\[object/;

describe('try-this entries, from the default state, as written', () => {
  it('try-this 1: stripes are exact at k = 1; noise at k = 4 still has error and needs 68 numbers against 64', () => {
    const stripes = imageOf('stripes');
    expect(frobenius(stripes, rebuild(svdOf(stripes), 1))).toBeLessThan(1e-9);
    const noise = imageOf('noise');
    const svd = svdOf(noise);
    const err = frobenius(noise, rebuild(svd, 4));
    expect(err).toBeGreaterThan(0.5);
    expect(err).toBeCloseTo(discardedNorm(svd.s, 4), 9);
    expect(storageOfRank(4)).toBe(68);
    expect(storageOfImage()).toBe(64);
    expect(lesson.tryThis[0]).toContain(`error is still ${err.toFixed(3)}`);
    expect(lesson.tryThis[0]).toContain('68 numbers against 64');
  });

  it('try-this 2: the squared residual of the default cloud is n x lambda_2', () => {
    const pts = cloudPoints();
    const p = pcaOf(pts);
    const r = residualSumSquares(pts, projectOnto(pts, p.mean, p.axes[0]));
    expect(r).toBeCloseTo(pts.length * p.values[1], 9);
    // Independent: the sum of squared components along the second axis.
    const second = alongAxis(pts, p.mean, p.axes[1]).reduce((s, x) => s + x * x, 0);
    expect(r).toBeCloseTo(second, 9);
    expect(lesson.tryThis[1]).toContain(`reads ${r.toFixed(3)}`);
  });

  it('try-this 3: skipping the centring points the first axis at the mean; standardising gives 45 degrees', () => {
    const data = bodyData();
    const skip = applyMistakes(data, { ...DEFAULT_MISTAKES, centre: false });
    const right = applyMistakes(data, DEFAULT_MISTAKES);
    const std = applyMistakes(data, { ...DEFAULT_MISTAKES, standardise: true });
    expect(Math.abs(skip.angle1 - skip.meanAngle)).toBeLessThan(1);
    expect(skip.angle1).not.toBeCloseTo(right.angle1, 0);
    expect(std.angle1).toBeCloseTo(45, 6);
    expect(lesson.tryThis[2]).toContain(`${skip.angle1.toFixed(1)}°`);
    expect(lesson.tryThis[2]).toContain('45.0°');
    expect(mistakesCaption(skip, { ...DEFAULT_MISTAKES, centre: false })).toContain('the wrong answer');
  });

  it('try-this 4: a cut on PC2 sorts far more of the classes than a cut on PC1, and the sentence quotes both', () => {
    const rows = classData();
    const pts = rows.map((r) => r.point);
    const labels = rows.map((r) => r.label);
    const p = pcaOf(pts);
    const [a1, a2] = p.axes.map((ax) => bestThresholdAccuracy(alongAxis(pts, p.mean, ax), labels));
    expect(a2).toBeGreaterThan(a1 + 0.2);
    expect(lesson.tryThis[3]).toContain(`${(a1 * 100).toFixed(1)}% of them on PC1`);
    expect(lesson.tryThis[3]).toContain(`${(a2 * 100).toFixed(1)}% on PC2`);
  });

  it('try-this 5: the two columns match for the default seed and for others', () => {
    for (const seed of [4, 5, 6, 99]) {
      const rows = svdVersusCovariance(smallData(seed));
      rows.forEach((r) => expect(r.fromSvd).toBeCloseTo(r.fromCovariance, 9));
    }
    const first = svdVersusCovariance(smallData(4))[0];
    expect(lesson.tryThis[4]).toContain(first.fromSvd.toFixed(3));
    expect(lesson.tryThis[4]).toContain(first.fromCovariance.toFixed(3));
  });
});

describe('every caption reads cleanly across the control space', () => {
  it('walks every image x k: the captions say smaller exactly for k <= 3 and the error matches the identity', () => {
    for (const { id } of IMAGES) {
      const A = imageOf(id);
      const svd = svdOf(A);
      const total = svd.s.reduce((s, x) => s + x * x, 0);
      for (let k = RANK_BOUNDS.min; k <= RANK_BOUNDS.max; k++) {
        const error = frobenius(A, rebuild(svd, k));
        const kept = svd.s.slice(0, k).reduce((s, x) => s + x * x, 0) / total;
        const text = imageCaption({ k, error, discarded: discardedNorm(svd.s, k), kept });
        expect(text).not.toMatch(NO_JUNK);
        expect(text.includes(': smaller.')).toBe(k <= largestSavingRank());
        expect(text.includes('not smaller')).toBe(k > largestSavingRank());
        expect(text.includes('rebuild is exact')).toBe(error < 1e-9);
      }
    }
  });

  it('walks all eight combinations of the three mistakes: no junk, and each caption states the matching situation', () => {
    const data = bodyData();
    for (const centre of [true, false]) for (const units of ['m', 'cm'] as const) for (const standardise of [false, true]) {
      const o: Mistakes = { centre, units, standardise };
      const r = applyMistakes(data, o);
      const text = mistakesCaption(r, o);
      expect(text).not.toMatch(NO_JUNK);
      expect(text.includes('Standardised')).toBe(standardise);
      expect(text.includes('the wrong answer')).toBe(!centre && !standardise);
    }
  });

  it('the cloud caption covers same, collinear and ordinary clouds, turned and projected', () => {
    const same = pcaOf(Array.from({ length: 5 }, (): P2 => [1, 1]));
    const line = pcaOf(Array.from({ length: 5 }, (_, i): P2 => [i, i]));
    const ok = pcaOf(cloudPoints());
    expect(cloudCaption(same, 5, false, false, 0)).toContain('no principal axis');
    expect(cloudCaption(line, 5, false, true, 0)).toContain('no second axis');
    for (const turned of [false, true]) for (const projected of [false, true]) {
      const text = cloudCaption(ok, 40, turned, projected, 1.234);
      expect(text).not.toMatch(NO_JUNK);
      expect(text.includes('turned')).toBe(turned);
      expect(text.includes('total squared residual')).toBe(projected);
    }
  });

  it('the class and link captions quote the model', () => {
    expect(classCaption(0.6, 0.97, 0.9)).toContain('60.0%');
    expect(classCaption(0.6, 0.97, null)).not.toMatch(NO_JUNK);
    expect(linkCaption(svdVersusCovariance(smallData(4)), 8)).not.toMatch(NO_JUNK);
  });
});

describe('hidden controls feed nothing', () => {
  it('the rotation slider changes only the drawing: the residual after projecting the turned cloud onto the turned PC1 is the same at every turn', () => {
    const pts = cloudPoints();
    const p = pcaOf(pts);
    const angle = Math.atan2(p.axes[0][1], p.axes[0][0]);
    const base = residualSumSquares(pts, projectOnto(pts, p.mean, p.axes[0]));
    for (let turn = 0; turn <= 100; turn += 10) {
      const t = turn / 100;
      const shown = rotateAbout(pts, p.mean, angle * t);
      const axis = [Math.cos(angle - angle * t), Math.sin(angle - angle * t)];
      expect(residualSumSquares(shown, projectOnto(shown, p.mean, axis))).toBeCloseTo(base, 9);
    }
  });
});
