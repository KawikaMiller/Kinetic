import { describe, expect, it } from 'vitest';
import { shuffleOptions } from './quiz';
import { mulberry32 } from './random';

const question = { q: 'Pick C', options: ['A', 'B', 'C', 'D'], answer: 2, why: 'C is right' };

describe('shuffleOptions', () => {
  it('keeps the answer pointing at the same option for any order', () => {
    const rnd = mulberry32(7);
    for (let n = 0; n < 500; n++) {
      const s = shuffleOptions(question, rnd);
      expect(s.options[s.answer]).toBe('C');
      expect([...s.options].sort()).toEqual(question.options);
    }
  });

  it('puts the right answer in every position, roughly evenly', () => {
    const rnd = mulberry32(11);
    const counts = [0, 0, 0, 0];
    const runs = 4000;
    for (let n = 0; n < runs; n++) counts[shuffleOptions(question, rnd).answer]++;
    for (const c of counts) expect(Math.abs(c / runs - 0.25)).toBeLessThan(0.03);
  });

  it('copies the question and leaves the original untouched', () => {
    const s = shuffleOptions(question, mulberry32(3));
    expect(s).not.toBe(question);
    expect(question.options).toEqual(['A', 'B', 'C', 'D']);
    expect(question.answer).toBe(2);
    expect(s.q).toBe(question.q);
    expect(s.why).toBe(question.why);
  });

  it('handles two-option questions', () => {
    const rnd = mulberry32(5);
    const seen = new Set<number>();
    for (let n = 0; n < 100; n++) {
      const s = shuffleOptions({ q: '', options: ['yes', 'no'], answer: 0, why: '' }, rnd);
      expect(s.options[s.answer]).toBe('yes');
      seen.add(s.answer);
    }
    expect(seen).toEqual(new Set([0, 1]));
  });
});
