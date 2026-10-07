import { describe, expect, it } from 'vitest';
import { parseBoundedInt } from '../../core/parse';
import { mulberry32, randInt } from '../../core/random';
import { classificationMetrics } from '../../core/stats';
import { captionText as text } from '../../core/testing/captions';
import { imbalanceCaption, metric, thresholdCaption } from './frames';
import lesson from './index';
import {
  COST_FIELD, COST_PRESETS, NEGATIVE_WEIGHTS, NONE, aucPairs, aucTrapezoid, candidates, cheapest, curve, dataset, positiveRate, prSteps,
  stepThreshold, weighted, type Example,
} from './model';

/** Independent reference: count the four outcomes one example at a time. */
function brute(examples: readonly Example[], t: number, k: number) {
  let tp = 0, fp = 0, fn = 0, tn = 0;
  for (const e of examples) {
    const yes = e.score >= t;
    if (yes && e.label === 1) tp++;
    else if (yes) fp += k;
    else if (e.label === 1) fn++;
    else tn += k;
  }
  return { tp, fp, fn, tn };
}

/** A seeded dataset with deliberate ties (scores rounded to 2 decimals) and uneven class sizes. */
function tied(seed: number): Example[] {
  const rnd = mulberry32(seed);
  const n = randInt(5, 40, rnd);
  return Array.from({ length: n }, (_, i) => ({
    score: Math.round(rnd() * 100) / 100,
    label: (i === 0 ? 1 : i === 1 ? 0 : rnd() < 0.4 ? 1 : 0) as 0 | 1,
  }));
}

describe('counts at a threshold', () => {
  it('equal a brute-force count at every candidate threshold, every class weight', () => {
    for (let s = 1; s <= 20; s++) {
      const ex = s % 2 ? dataset(s, 1.5) : tied(s);
      for (const k of NEGATIVE_WEIGHTS) {
        for (const t of [0, ...candidates(ex)]) expect(weighted(ex, t, k)).toEqual(brute(ex, t, k));
      }
    }
  });

  it('precision with nothing predicted positive is undefined and shows "–", never 0 or NaN', () => {
    const ex = dataset(1, 1.5);
    const m = classificationMetrics(weighted(ex, NONE, 1));
    expect(Number.isNaN(m.precision)).toBe(true);
    expect(metric(m.precision)).toBe('–');
    expect(text(thresholdCaption(ex, NONE, 1))).toContain('precision is undefined (–)');
  });

  it('the always-negative baseline scores exactly 1 − the positive rate', () => {
    const ex = dataset(2, 1);
    for (const k of NEGATIVE_WEIGHTS) {
      expect(classificationMetrics(weighted(ex, NONE, k)).accuracy).toBeCloseTo(1 - positiveRate(k), 15);
    }
    expect(positiveRate(99)).toBe(0.01);
    expect(text(imbalanceCaption(ex, 0.5, 99))).toContain('scores 99.0% accuracy with recall 0');
  });
});

describe('ROC, PR and AUC', () => {
  it('ROC points: one per distinct threshold, from (0,0) to (1,1), ties grouped into one step', () => {
    for (let s = 1; s <= 50; s++) {
      const ex = tied(s);
      const pts = curve(ex, 1);
      expect(pts.length).toBe(new Set(ex.map((e) => e.score)).size + 1);
      expect([pts[0].fpr, pts[0].tpr]).toEqual([0, 0]);
      expect([pts[pts.length - 1].fpr, pts[pts.length - 1].tpr]).toEqual([1, 1]);
      for (let i = 1; i < pts.length; i++) {
        expect(pts[i].fpr).toBeGreaterThanOrEqual(pts[i - 1].fpr);
        expect(pts[i].tpr).toBeGreaterThanOrEqual(pts[i - 1].tpr);
      }
    }
  });

  it('AUC by trapezoids equals the Mann-Whitney pairwise count (ties ½) on 200 seeded datasets', () => {
    for (let s = 1; s <= 200; s++) {
      const ex = s % 2 ? tied(s) : dataset(s, (s % 13) / 4);
      expect(aucTrapezoid(curve(ex, 1))).toBeCloseTo(aucPairs(ex), 12);
    }
  });

  it('class weights move precision but not one ROC point', () => {
    const ex = dataset(3, 1.5);
    const a = curve(ex, 1);
    const b = curve(ex, 99);
    expect(b.map((p) => [p.fpr, p.tpr])).toEqual(a.map((p) => [p.fpr, p.tpr]));
    const mid = Math.floor(a.length / 2);
    expect(b[mid].precision).toBeLessThan(a[mid].precision);
  });

  it('PR steps: each precision holds from the previous recall to its own; no point at undefined precision', () => {
    const pts = curve(dataset(4, 1.5), 1);
    const steps = prSteps(pts);
    expect(steps.length).toBe(2 * pts.filter((p) => !Number.isNaN(p.precision)).length);
    expect(steps[0][0]).toBe(0);
    for (let i = 0; i < steps.length; i += 2) expect(steps[i][1]).toBe(steps[i + 1][1]);
  });

  it('AUC 0.5 for identical score clouds is a coin flip; separation 3 is near 1', () => {
    expect(aucPairs([{ score: 0.5, label: 1 }, { score: 0.5, label: 0 }])).toBe(0.5);
    expect(aucPairs(dataset(1, 3))).toBeGreaterThan(0.9);
  });
});

describe('thresholds and costs', () => {
  it('arrow keys step to the neighbouring distinct score, and stop at the ends', () => {
    const ex = dataset(5, 1.5);
    const c = candidates(ex);
    expect(stepThreshold(ex, c[3], 1)).toBe(c[4]);
    expect(stepThreshold(ex, c[3], -1)).toBe(c[2]);
    expect(stepThreshold(ex, NONE, 1)).toBe(NONE);
    expect(stepThreshold(ex, c[0], -1)).toBe(c[0]);
  });

  it('the cheapest threshold equals brute-force minimisation over a fine sweep and every score', () => {
    const rnd = mulberry32(8);
    for (let s = 1; s <= 30; s++) {
      const ex = s % 2 ? dataset(s, 1.25) : tied(s);
      const k = NEGATIVE_WEIGHTS[s % NEGATIVE_WEIGHTS.length];
      const costs = { fp: randInt(0, 100, rnd), fn: randInt(0, 1000, rnd) };
      const sweep = [...Array.from({ length: 2002 }, (_, i) => i / 2000), ...ex.map((e) => e.score)];
      let min = Infinity;
      for (const t of sweep) {
        const c = brute(ex, t, k);
        min = Math.min(min, c.fp * costs.fp + c.fn * costs.fn);
      }
      expect(cheapest(ex, k, costs).cost).toBe(min);
    }
  });

  it('the Medical screen preset is a miss costing 50× a false alarm, as the tip says', () => {
    const medical = COST_PRESETS.find((p) => p.id === 'medical')!;
    expect(medical.costs.fn / medical.costs.fp).toBe(50);
  });

  it('captions are computed from the counts', () => {
    const ex = dataset(1, 1.5);
    const c = weighted(ex, 0.5, 1);
    const m = classificationMetrics(c);
    const s = text(thresholdCaption(ex, 0.5, 1));
    expect(s).toContain(`${c.tp} of ${c.tp + c.fn} real positives caught (recall ${metric(m.recall)})`);
    expect(s).toContain(`precision is ${metric(m.precision)}`);
  });

  it('quiz: the accuracy-paradox answer matches the model', () => {
    expect(lesson.quiz[0].options[lesson.quiz[0].answer]).toBe(`${Math.round((1 - positiveRate(99)) * 100)}% accuracy, recall 0`);
  });
});

describe('cost fields', () => {
  it('refuse hostile input with a message, and accept whole numbers 0..1,000,000', () => {
    for (const bad of ['', '   ', '12345678901234567890123', '-1', '1e400', '🙂', '<b>5</b>', '1,,2', '2.5', '1000001']) {
      const r = parseBoundedInt(bad, COST_FIELD);
      expect(r.ok, bad).toBe(false);
      if (!r.ok) expect(r.error.length).toBeGreaterThan(0);
    }
    expect(parseBoundedInt('-1', COST_FIELD)).toEqual({ ok: false, error: "Costs can't be negative." });
    expect(parseBoundedInt('1,000,000', COST_FIELD)).toEqual({ ok: true, value: 1_000_000 });
    expect(parseBoundedInt('0', COST_FIELD)).toEqual({ ok: true, value: 0 });
  });
});
