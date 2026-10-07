import { describe, expect, it } from 'vitest';
import { captionText as text } from '../../core/testing/captions';
import { fitCaption, lambdaText, mseText, peekCaption } from './frames';
import { MAX_DEGREE, PRESET_IDS, bestBy, degreeCurve, fitPoly, makeSplit, mseOf, peekAtTest, presetSettings } from './model';

describe('fitCaption', () => {
  it('states the real errors, and calls a degree best only when validation says so, for every degree on several splits', () => {
    for (const seed of [1, 2, 3]) {
      const split = makeSplit(30, seed);
      const best = bestBy(degreeCurve(split, 0))!.at;
      for (let degree = 0; degree <= MAX_DEGREE; degree++) {
        const f = fitPoly(split.train, degree, 0);
        if (!f.ok) throw new Error('fit');
        const c = text(fitCaption({ degree, nTrain: 30, lambda: 0 }, split));
        expect(c).toContain(`training MSE ${mseText(mseOf(f.coeffs, split.train))}, validation MSE ${mseText(mseOf(f.coeffs, split.val))}`);
        expect(c.includes('lowest validation error')).toBe(degree === best);
        if (degree < best) expect(c).toContain('Too simple');
        expect(c.includes('ill-conditioned')).toBe(f.illConditioned);
      }
    }
  });

  it('every preset gets a true caption', () => {
    for (const id of PRESET_IDS) {
      const s = presetSettings(id, 1);
      const c = text(fitCaption(s, makeSplit(s.nTrain, 1)));
      expect(c).toContain(`Degree ${s.degree}, ${lambdaText(s.lambda)}, ${s.nTrain} training points`);
      if (id === 'good') expect(c).toContain('lowest validation error');
      if (id === 'overfit') expect(c).toContain("it's fitting the noise");
    }
  });

  it('warns at as many coefficients as points, and shows the refusal beyond that', () => {
    const ten = makeSplit(10, 1);
    expect(text(fitCaption({ degree: 9, nTrain: 10, lambda: 0 }, ten))).toContain('as many coefficients as points, so it can pass through every one');
    expect(text(fitCaption({ degree: 12, nTrain: 10, lambda: 0 }, ten))).toContain('13 coefficients but only 10 training points');
    expect(text(fitCaption({ degree: 12, nTrain: 10, lambda: 0.1 }, ten))).toContain('13 coefficients for 10 points');
  });
});

describe('peekCaption', () => {
  it('reports the real test error and explains why tuning on it would make it lie', () => {
    const split = makeSplit(30, 1);
    const p = peekAtTest(split, 4, 0)!;
    const c = text(peekCaption(p));
    expect(c).toContain(`Test MSE ${mseText(p.test)} for degree 4, no λ (validation said ${mseText(p.val)})`);
    expect(c).toContain('stops being one');
  });
});

describe('mseText', () => {
  it('keeps three significant figures and switches to exponents for wild values', () => {
    expect(mseText(0.10834)).toBe('0.108');
    expect(mseText(582215.47)).toBe('5.8e+5');
    expect(mseText(0.00002)).toBe('2.0e−5');
  });
});
