import { describe, expect, it } from 'vitest';
import { equalMix } from './paint';

describe('equalMix', () => {
  it('is the colour itself for one paint', () => {
    expect(equalMix(['var(--amber)'])).toBe('var(--amber)');
  });
  it('folds with weights that give every paint an equal share', () => {
    expect(equalMix(['var(--amber)', 'var(--sky)'])).toBe('color-mix(in oklab, var(--amber) 50%, var(--sky))');
    expect(equalMix(['a', 'b', 'c', 'd'])).toBe('color-mix(in oklab, color-mix(in oklab, color-mix(in oklab, a 50%, b) 67%, c) 75%, d)');
  });
  it('the k-th paint joins at 1/(k+1), so after n paints each holds 1/n (to rounding)', () => {
    const weights = [1];
    for (let k = 1; k < 6; k++) {
      const keep = Math.round((k / (k + 1)) * 100) / 100;
      for (let i = 0; i < weights.length; i++) weights[i] *= keep;
      weights.push(1 - keep);
    }
    for (const w of weights) expect(w).toBeCloseTo(1 / 6, 2);
  });
  it('refuses an empty list', () => {
    expect(() => equalMix([])).toThrow(RangeError);
  });
});
