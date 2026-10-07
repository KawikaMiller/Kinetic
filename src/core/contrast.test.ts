import { describe, expect, it } from 'vitest';
import { contrastRatio, formatRatio, grade, luminance, parseHex } from './contrast';

describe('contrast (WCAG 2.x)', () => {
  it('#777 on #fff is 4.48:1, which fails AA for normal text', () => { // allow-color: test name quotes the example
    const r = contrastRatio('#777', '#fff'); // allow-color: the WCAG worked example
    expect(r).toBeCloseTo(4.48, 2);
    expect(formatRatio(r)).toBe('4.48:1');
    expect(grade(r).aaNormal).toBe(false);
    expect(grade(r).aaLarge).toBe(true);
  });
  it('black on white is the maximum, 21:1; a colour on itself is 1:1', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5); // allow-color: extremes
    expect(contrastRatio('#123456', '#123456')).toBe(1); // allow-color: same colour
  });
  it('order of the two colours does not matter', () => {
    expect(contrastRatio('#fff', '#767676')).toBeCloseTo(contrastRatio('#767676', '#fff'), 10); // allow-color: example pair
  });
  it('uses the thresholds 4.5 / 3 for AA and 7 / 4.5 for AAA', () => {
    expect(grade(4.5)).toEqual({ aaNormal: true, aaLarge: true, aaaNormal: false, aaaLarge: true });
    expect(grade(7)).toEqual({ aaNormal: true, aaLarge: true, aaaNormal: true, aaaLarge: true });
    expect(grade(2.99).aaLarge).toBe(false);
  });
  it('never displays a failing ratio as if it reached a threshold', () => {
    expect(formatRatio(4.496)).toBe('4.49:1');
    expect(formatRatio(6.999)).toBe('6.99:1');
    expect(formatRatio(2.996)).toBe('2.99:1');
    expect(formatRatio(4.504)).toBe('4.50:1');
  });
  it('parses 3- and 6-digit hex', () => {
    expect(parseHex('#abc')).toEqual([0xaa, 0xbb, 0xcc]); // allow-color: parser input
    expect(parseHex('#0a0b0c')).toEqual([10, 11, 12]); // allow-color: parser input
  });
});

describe('WCAG 2.x published examples', () => {
  it('relative luminance: white 1, black 0, and each primary is its own coefficient', () => {
    expect(luminance([255, 255, 255])).toBeCloseTo(1, 12);
    expect(luminance([0, 0, 0])).toBe(0);
    expect(luminance([255, 0, 0])).toBeCloseTo(0.2126, 12);
    expect(luminance([0, 255, 0])).toBeCloseTo(0.7152, 12);
    expect(luminance([0, 0, 255])).toBeCloseTo(0.0722, 12);
  });
  it('the 0.03928 knee: channel 10 is on the linear segment, 11 on the curve (no 8-bit value lies between 0.03928 and 0.04045)', () => {
    expect(luminance([10, 10, 10])).toBeCloseTo(10 / 255 / 12.92, 12);
    expect(luminance([11, 11, 11])).toBeCloseTo(((11 / 255 + 0.055) / 1.055) ** 2.4, 12);
  });
  it('the usual published ratios against white', () => {
    const cases: [string, string][] = [
      ['#767676', '4.54:1'], // allow-color: the darkest grey that passes AA on white
      ['#595959', '7.00:1'], // allow-color: the AAA grey on white
      ['#0000ff', '8.59:1'], // allow-color: pure blue
      ['#ff0000', '4.00:1'], // allow-color: pure red
    ];
    for (const [fg, text] of cases) expect(formatRatio(contrastRatio(fg, '#ffffff'))).toBe(text); // allow-color: white background
    expect(grade(contrastRatio('#767676', '#fff')).aaNormal).toBe(true); // allow-color: example pair
    expect(grade(contrastRatio('#595959', '#fff')).aaaNormal).toBe(true); // allow-color: example pair
  });
});
