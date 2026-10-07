import { describe, expect, it } from 'vitest';
import { captionText as text } from '../../core/testing/captions';
import { cellCaption, clockFrames, equation, tableCaption, type Op } from './frames';
import { MAX_MOD, MIN_MOD, gcdN, modN, productTable } from './model';

describe('clockFrames', () => {
  it('opens with a caption and closes on the true result, for every op, start and a on small clocks', () => {
    for (const op of ['plus', 'times'] as Op[]) {
      for (let n = MIN_MOD; n <= 7; n++) {
        for (let from = 0; from < n; from++) {
          for (const a of [-9, -1, 0, 1, 3, n, 2 * n, 2 * n + 1, 1_000_000]) {
            const { frames } = clockFrames(op, from, a, n);
            const total = op === 'plus' ? from + a : from * a;
            expect(frames[0].say).toBeTruthy();
            const last = frames.at(-1)!;
            expect(last.pos).toBe(modN(total, n));
            expect(text(last.say)).toContain(`mod ${n} = ${modN(total, n)}.`);
            // The step before the summary is where the hand stops: close() adds a frame, it doesn't overwrite.
            expect(frames.at(-2)!.pos).toBe(last.pos);
          }
        }
      }
    }
  });

  it('says it wraps on the step that reaches 0, and says when a was reduced', () => {
    const plus = clockFrames('plus', 10, 5, 12).frames;
    const wrap = plus.find((f) => f.pos === 0 && f.trail.length > 0)!;
    expect(text(wrap.say)).toContain('wraps round to 0');
    const reduced = clockFrames('plus', 0, 30, 12).frames;
    expect(text(reduced[1].say)).toContain('30 mod 12 = 6');
    expect(text(clockFrames('plus', 0, 17, 12).frames.at(-1)!.say)).toContain('17 mod 12 = 5');
  });

  it('writes the equation from the numbers', () => {
    expect(equation('plus', 0, 17, 12)).toBe('17 mod 12 = 5');
    expect(equation('times', 5, 7, 12)).toBe('35 mod 12 = 11');
    expect(equation('plus', 5, -7, 12)).toBe('−2 mod 12 = 10');
  });
});

describe('table captions', () => {
  it('lists exactly the rows with no 1, or says n is prime, for every modulus', () => {
    expect(text(tableCaption(productTable(12), 12))).toContain('Rows 2, 3, 4, 6, 8, 9, 10 have no 1');
    expect(text(tableCaption(productTable(13), 13))).toContain('because 13 is prime');
    for (let n = MIN_MOD; n <= MAX_MOD; n++) {
      const caption = text(tableCaption(productTable(n), n));
      const missing = Array.from({ length: n - 1 }, (_, i) => i + 1).filter((a) => gcdN(a, n) > 1);
      if (missing.length) expect(caption).toContain(`Rows ${missing.join(', ')} have no 1`);
      else expect(caption).toContain('is prime');
    }
  });

  it('names the inverse, or the gcd that blocks it, for every cell of n = 12', () => {
    const table = productTable(12);
    expect(text(cellCaption(table, 12, 5, 5))).toContain('5 is the inverse of 5 mod 12');
    expect(text(cellCaption(table, 12, 7, 2))).toContain('7⁻¹ mod 12 = 7');
    expect(text(cellCaption(table, 12, 4, 3))).toContain('gcd(4, 12) = 4');
    for (let a = 1; a < 12; a++) {
      for (let b = 1; b < 12; b++) {
        const c = text(cellCaption(table, 12, a, b));
        expect(c).toContain(`mod 12 = ${(a * b) % 12}.`);
        if (gcdN(a, 12) > 1) expect(c).toContain('can never be 1');
      }
    }
  });
});
