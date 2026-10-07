import { describe, expect, it } from 'vitest';
import { captionText as text } from '../../core/testing/captions';
import { fitFormula, fittsCaption, hickCaption } from './frames';
import { choiceBits, fitTrials, type Trial } from './model';
import lesson from './index';

const t = (bits: number, ms: number | null, input: Trial['input'] = 'mouse'): Trial => ({ bits, ms, input, miss: ms === null });

describe('fittsCaption', () => {
  it('before any trial, explains the game and names the synthetic participant', () => {
    expect(text(fittsCaption([], fitTrials([])))).toContain('the grey points are a synthetic participant');
  });

  it('with fewer than 3 valid trials says "need at least 3 trials" and counts the misses', () => {
    const trials = [t(1, 400), t(2, null), t(3, 600)];
    const c = text(fittsCaption(trials, fitTrials(trials)));
    expect(c).toContain('2 valid so far: need at least 3 trials');
    expect(c).toContain('1 mis-click was counted and left out of the fit.');
  });

  it('with a fit, states the fitted formula and R² it computed, and calls the timing rough', () => {
    const trials = [t(1, 400), t(2, 520), t(3, 690), t(4, null)];
    const fit = fitTrials(trials);
    if (!fit.ok) throw new Error();
    const c = text(fittsCaption(trials, fit));
    expect(c).toContain(`MT ≈ ${fitFormula(fit, 'ID')}`);
    expect(c).toContain(`R² = ${fit.r2!.toFixed(2)}`);
    expect(c).toContain('Rough');
    expect(c).not.toContain('keyboard, touch or pen');
  });

  it('warns about keyboard or touch trials, and about a slope that is not positive', () => {
    const trials = [t(1, 700, 'keyboard'), t(2, 520), t(3, 400)];
    const c = text(fittsCaption(trials, fitTrials(trials)));
    expect(c).toContain('keyboard, touch or pen');
    expect(c).toContain("slope isn't positive");
  });

  it('writes a negative coefficient with a real minus', () => {
    expect(fitFormula({ ok: true, a: 300, b: -20, r2: 0.5, n: 3, misses: 0 }, 'ID')).toBe('300 − 20 · ID ms');
  });
});

describe('hickCaption', () => {
  it('names the menu order\'s effect in both orders', () => {
    expect(text(hickCaption([], fitTrials([]), false))).toContain('shuffled each round');
    expect(text(hickCaption([], fitTrials([]), true))).toContain('alphabetical');
  });

  it('fits on log₂(n + 1) and leaves wrong picks out', () => {
    const trials = [t(choiceBits(2), 500), t(choiceBits(8), 700), t(choiceBits(32), 900), t(choiceBits(4), null)];
    const fit = fitTrials(trials);
    expect(fit.ok && fit.n).toBe(3);
    expect(text(hickCaption(trials, fit, false))).toContain('1 wrong pick was counted');
  });
});

describe('quiz numbers come from the model', () => {
  it('going from 4 to 15 options adds about 1.7 bits', () => {
    const q = lesson.quiz.find((x) => x.q.includes('4 options to 15'))!;
    const bits = choiceBits(15) - choiceBits(4);
    expect(bits.toFixed(1)).toBe('1.7');
    expect(q.why).toContain('about 1.7 bits');
  });
});
