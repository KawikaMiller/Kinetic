import { describe, expect, it } from 'vitest';
import lesson from './index';
import { DEFAULT_MISTAKES, applyMistakes, bodyData, cloudPoints, mistakeCloud, pcaOf, type P2 } from './model';
import { classCaption, cloudCaption, mistakesCaption } from './text';

const mean = (pts: readonly P2[]): P2 => [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
const sd = (xs: readonly number[]) => {
  const m = xs.reduce((s, x) => s + x, 0) / xs.length;
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length);
};

describe('"the feature with the larger numbers dominates" is gone: the spread decides', () => {
  it('in centimetres the heights are the larger numbers yet the first axis sits between the features, so spread (not size) is what the caption must name', () => {
    const data = bodyData();
    const cm = applyMistakes(data, { ...DEFAULT_MISTAKES, units: 'cm' });
    const heightsCm = data.map((p) => p[0] * 100);
    const weights = data.map((p) => p[1]);
    // Independent oracle: sizes versus spreads.
    expect(mean(heightsCm.map((x): P2 => [x, 0]))[0]).toBeGreaterThan(mean(weights.map((y): P2 => [0, y]))[1]);
    expect(sd(heightsCm)).toBeLessThan(sd(weights));
    expect(cm.angle1).toBeGreaterThan(30);
    expect(cm.angle1).toBeLessThan(80);
    expect(cm.spreads[0]).toBeCloseTo(sd(heightsCm), 9);
    expect(cm.spreads[1]).toBeCloseTo(sd(weights), 9);
  });

  it('the caption and the quiz name the spread in both unit states and never "the larger numbers"', () => {
    const data = bodyData();
    for (const units of ['m', 'cm'] as const) {
      const o = { ...DEFAULT_MISTAKES, units };
      const text = mistakesCaption(applyMistakes(data, o), o);
      expect(text).toContain('larger spread in its own units');
      expect(text).not.toContain('larger numbers');
    }
    const q3 = lesson.quiz[2];
    expect(q3.options[q3.answer]).toContain('spread');
    expect(`${q3.options.join(' ')} ${q3.why}`).not.toContain('larger numbers dominate');
    expect(q3.why).toContain('not the size of the numbers');
  });
});

describe('centring is shown, and forgetting it is visible at the default units', () => {
  const data = bodyData();

  it('centred: the drawn cloud sits on the origin, the ringed mean is where the cloud was before it moved, and the move is long', () => {
    const c = mistakeCloud(data, DEFAULT_MISTAKES);
    const centre = mean(c.points);
    expect(Math.hypot(centre[0], centre[1])).toBeLessThan(1e-9);
    expect(c.before).not.toBeNull();
    const was = mean(c.before!);
    expect(c.mean[0]).toBeCloseTo(was[0], 9);
    expect(c.mean[1]).toBeCloseTo(was[1], 9);
    expect(Math.hypot(c.mean[0], c.mean[1])).toBeGreaterThan(0.5);
  });

  it('skipped in metres: the cloud stays out at its mean, far from the origin where the axes start, even though the axis angle hardly changes', () => {
    const o = { ...DEFAULT_MISTAKES, centre: false };
    const c = mistakeCloud(data, o);
    expect(c.before).toBeNull();
    const centre = mean(c.points);
    expect(centre[0]).toBeCloseTo(c.mean[0], 9);
    expect(Math.hypot(centre[0], centre[1])).toBeGreaterThan(0.5);
    expect(Math.abs(applyMistakes(data, o).angle1 - applyMistakes(data, DEFAULT_MISTAKES).angle1)).toBeLessThan(2);
    expect(mistakesCaption(applyMistakes(data, o), o)).toContain('stays out at its mean');
  });

  it('standardised: one unit-spread cloud on the origin at a common scale, with the mean at the origin', () => {
    const c = mistakeCloud(data, { ...DEFAULT_MISTAKES, standardise: true });
    expect(c.before).toBeNull();
    expect(c.mean).toEqual([0, 0]);
    const centre = mean(c.points);
    expect(Math.hypot(centre[0], centre[1])).toBeLessThan(1e-9);
    expect(sd(c.points.map((p) => p[0]))).toBeCloseTo(sd(c.points.map((p) => p[1])), 9);
  });

  it('every drawn point lies inside the compass domain, in every state', () => {
    for (const centre of [true, false]) for (const units of ['m', 'cm'] as const) for (const standardise of [false, true]) {
      const c = mistakeCloud(data, { centre, units, standardise });
      for (const p of [...c.points, ...(c.before ?? []), c.mean]) expect(Math.max(Math.abs(p[0]), Math.abs(p[1]))).toBeLessThanOrEqual(1 + 1e-12);
    }
  });

  it('the centred caption quotes the subtracted mean in the chosen units; the cloud caption quotes the mean it subtracts', () => {
    const r = applyMistakes(data, DEFAULT_MISTAKES);
    expect(mistakesCaption(r, DEFAULT_MISTAKES)).toContain(`Centring subtracted the mean (${Number(mean(data)[0].toPrecision(3))} m, ${Number(mean(data)[1].toPrecision(3))} kg`);
    const pts = cloudPoints();
    const [mx, my] = mean(pts);
    expect(cloudCaption(pcaOf(pts), pts.length, false, false, 0)).toContain(`subtracts the mean (${mx.toFixed(2)}, ${my.toFixed(2)})`);
  });

  it('try-this 3 is reachable as written: skip centring then centimetres gives the quoted 22.3-like numbers', () => {
    const skipCm = applyMistakes(data, { ...DEFAULT_MISTAKES, units: 'cm', centre: false });
    const cm = applyMistakes(data, { ...DEFAULT_MISTAKES, units: 'cm' });
    expect(lesson.tryThis[2]).toContain(`now reads ${skipCm.angle1.toFixed(1)}° where the centred axis is ${cm.angle1.toFixed(1)}°`);
    expect(skipCm.angle1).toBeLessThan(cm.angle1 - 10);
  });
});

describe('wording', () => {
  it('a single point is not "All 1 points", and the class caption says its cuts are in-sample', () => {
    expect(cloudCaption(pcaOf([[1, 1]]), 1, false, false, 0)).not.toContain('All 1');
    expect(classCaption(0.6, 0.97, 0.9)).toContain('chosen on these same points');
  });

  it('the correct quiz option is the longest (or tied) in at most half the questions', () => {
    const longest = lesson.quiz.filter((q) => q.options[q.answer].length >= Math.max(...q.options.map((o) => o.length))).length;
    expect(longest).toBeLessThanOrEqual(lesson.quiz.length / 2);
  });
});
