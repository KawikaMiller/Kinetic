import { describe, expect, it } from 'vitest';
import { twoClassScores } from './fixtures/datasets';
import { mulberry32, randInt } from './random';
import { aucPairs, aucTrapezoid, rocPoints, type ScoredExample } from './rocAuc';

/** A seeded dataset with deliberate ties (scores rounded to 2 decimals) and uneven class sizes. */
function tied(seed: number): ScoredExample[] {
  const rnd = mulberry32(seed);
  const n = randInt(5, 40, rnd);
  return Array.from({ length: n }, (_, i) => ({
    score: Math.round(rnd() * 100) / 100,
    label: (i === 0 ? 1 : i === 1 ? 0 : rnd() < 0.4 ? 1 : 0) as 0 | 1,
  }));
}

describe('rocAuc', () => {
  it('hand-worked vector: scores 0.9(+) 0.8(-) 0.7(+) 0.2(-): 3 of the 4 pairs are won, AUC 0.75', () => {
    const ex: ScoredExample[] = [{ score: 0.9, label: 1 }, { score: 0.8, label: 0 }, { score: 0.7, label: 1 }, { score: 0.2, label: 0 }];
    expect(aucPairs(ex)).toBe(0.75);
    // ROC points (0,0) (0,.5) (.5,.5) (.5,1) (1,1): area = 0.5 * 0.5 + 0.5 * 1 = 0.75
    expect(rocPoints(ex)).toEqual([{ fpr: 0, tpr: 0 }, { fpr: 0, tpr: 0.5 }, { fpr: 0.5, tpr: 0.5 }, { fpr: 0.5, tpr: 1 }, { fpr: 1, tpr: 1 }]);
    expect(aucTrapezoid(rocPoints(ex))).toBe(0.75);
  });

  it('the two methods agree on 200 seeded datasets, ties included', () => {
    for (let s = 1; s <= 200; s++) {
      const ex = s % 2 ? tied(s) : twoClassScores({ seed: s, positives: 30, negatives: 30, separation: (s % 13) / 4 });
      expect(aucTrapezoid(rocPoints(ex))).toBeCloseTo(aucPairs(ex), 12);
    }
  });

  it('a tie between a positive and a negative counts one half; separation 3 is near 1', () => {
    expect(aucPairs([{ score: 0.5, label: 1 }, { score: 0.5, label: 0 }])).toBe(0.5);
    expect(aucTrapezoid(rocPoints([{ score: 0.5, label: 1 }, { score: 0.5, label: 0 }]))).toBe(0.5);
    expect(aucPairs(twoClassScores({ seed: 1, positives: 30, negatives: 30, separation: 3 }))).toBeGreaterThan(0.9);
  });

  it('ROC points run from (0, 0) to (1, 1) and never go backwards', () => {
    const pts = rocPoints(tied(7));
    expect(pts[0]).toEqual({ fpr: 0, tpr: 0 });
    expect(pts[pts.length - 1]).toEqual({ fpr: 1, tpr: 1 });
    for (let i = 1; i < pts.length; i++) {
      expect(pts[i].fpr).toBeGreaterThanOrEqual(pts[i - 1].fpr);
      expect(pts[i].tpr).toBeGreaterThanOrEqual(pts[i - 1].tpr);
    }
  });
});
