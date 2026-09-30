import { describe, expect, it } from 'vitest';
import { linearScale, logScale } from './scale';

describe('linearScale', () => {
  const s = linearScale(0, 100, 20, 520);

  it('maps the domain ends onto the range ends, and inverts back', () => {
    expect(s.map(0)).toBe(20);
    expect(s.map(100)).toBe(520);
    expect(s.map(50)).toBe(270);
    for (const v of [0, 12.5, 33, 99.9]) expect(s.invert(s.map(v))).toBeCloseTo(v, 10);
  });

  it('handles an inverted range (y axes grow downward)', () => {
    const y = linearScale(0, 10, 300, 0);
    expect(y.map(0)).toBe(300);
    expect(y.map(10)).toBe(0);
    expect(y.invert(150)).toBe(5);
  });

  it('picks 1-2-5 tick steps with no float noise', () => {
    expect(s.ticks(5)).toEqual([0, 20, 40, 60, 80, 100]);
    expect(linearScale(0, 1, 0, 1).ticks(10)).toEqual([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]);
    expect(linearScale(-7, 13, 0, 1).ticks(4)).toEqual([-5, 0, 5, 10]);
  });

  it('rejects an empty or non-finite domain', () => {
    expect(() => linearScale(3, 3, 0, 1)).toThrow(RangeError);
    expect(() => linearScale(0, Infinity, 0, 1)).toThrow(RangeError);
  });
});

describe('logScale', () => {
  const s = logScale(1, 1e6, 0, 600);

  it('spaces each power of ten evenly and inverts back', () => {
    expect(s.map(1)).toBeCloseTo(0, 10);
    expect(s.map(1e3)).toBeCloseTo(300, 10);
    expect(s.map(1e6)).toBeCloseTo(600, 10);
    for (const v of [1, 7, 1234, 999999]) expect(s.invert(s.map(v))).toBeCloseTo(v, 6);
  });

  it('returns NaN for values a log axis cannot show', () => {
    expect(s.map(0)).toBeNaN();
    expect(s.map(-5)).toBeNaN();
  });

  it('ticks on whole powers of the base, thinned to about `count`', () => {
    expect(s.ticks(10)).toEqual([1, 10, 100, 1e3, 1e4, 1e5, 1e6]);
    expect(s.ticks(3)).toEqual([1, 1e3, 1e6]);
    expect(logScale(1, 1024, 0, 1, 2).ticks(20)).toEqual([1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024]);
  });

  it('rejects non-positive domains and bases', () => {
    expect(() => logScale(0, 10, 0, 1)).toThrow(RangeError);
    expect(() => logScale(-1, 10, 0, 1)).toThrow(RangeError);
    expect(() => logScale(1, 10, 0, 1, 1)).toThrow(RangeError);
  });
});
