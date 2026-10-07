import { describe, expect, it } from 'vitest';
import { captionText as text } from '../../core/testing/captions';
import { NEAR_BEST, OVERFIT, fitCaption, lambdaText, mseText, peekCaption } from './frames';
import { LAMBDA_GRID, MAX_DEGREE, PRESET_IDS, bestBy, degreeCurve, fitPoly, makeSplit, mseOf, peekAtTest, presetSettings } from './model';

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
        if (degree < best) expect(c).toMatch(/Too simple|About as good as the best/);
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
    expect(text(fitCaption({ degree: 12, nTrain: 10, lambda: 0.1 }, ten))).toContain('13 coefficients for 10 points: more coefficients than points, so only λ makes the fit unique');
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

describe('review B8: caption sweeps', () => {
  const settings: { degree: number; nTrain: number; lambda: number }[] = [];
  for (const nTrain of [10, 15, 20, 30, 60, 200]) for (let degree = 0; degree <= MAX_DEGREE; degree++) for (const lambda of [0, LAMBDA_GRID[4], LAMBDA_GRID[16], LAMBDA_GRID[28]]) settings.push({ degree, nTrain, lambda });

  it('never compares two numbers that print the same ("0.122 vs 0.122"), and each verdict matches its band', () => {
    let checked = 0;
    for (const seed of [1, 2, 3, 4, 5]) {
      for (const st of settings) {
        const split = makeSplit(st.nTrain, seed);
        const c = text(fitCaption(st, split));
        for (const m of c.matchAll(/\(([^ ]+) vs ([^ )]+)\)/g)) expect(m[1]).not.toBe(m[2]);
        const f = fitPoly(split.train, st.degree, st.lambda);
        if (!f.ok) continue;
        checked++;
        const val = mseOf(f.coeffs, split.val);
        const best = bestBy(degreeCurve(split, st.lambda))!;
        if (c.includes("it's fitting the noise")) expect(val).toBeGreaterThan(best.val * (1 + OVERFIT));
        if (c.includes('a little overfitting')) expect(val).toBeLessThanOrEqual(best.val * (1 + OVERFIT));
        if (c.includes('About as good as the best')) expect(val).toBeLessThanOrEqual(best.val * (1 + NEAR_BEST));
        if (c.includes('Too simple')) expect(val).toBeGreaterThan(best.val * (1 + NEAR_BEST));
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });

  it('"Degree 12 + best λ" states the real improvement over no λ, on 20 splits', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const st = presetSettings('fixedByLambda', seed);
      const split = makeSplit(st.nTrain, seed);
      const plain = fitPoly(split.train, st.degree, 0);
      const ridge = fitPoly(split.train, st.degree, st.lambda);
      if (!plain.ok || !ridge.ok) throw new Error('fit');
      const before = mseOf(plain.coeffs, split.val);
      const after = mseOf(ridge.coeffs, split.val);
      expect(after).toBeLessThan(before);
      expect(text(fitCaption(st, split))).toContain(`validation error went down from ${mseText(before)} to ${mseText(after)}`);
    }
  });

  it('no caption says "no unique fit" unless there really are more coefficients than points', () => {
    for (const seed of [1, 2, 3]) {
      for (const st of settings) {
        const c = text(fitCaption(st, makeSplit(st.nTrain, seed)));
        if (c.includes('no unique fit')) expect(st.degree + 1).toBeGreaterThan(st.nTrain);
        expect(c).not.toContain('too ill-conditioned');
      }
    }
  });
});
