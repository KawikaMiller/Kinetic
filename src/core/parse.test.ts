import { describe, expect, it } from 'vitest';
import { parseInteger, parseIntegers } from './parse';

/** Strings Number() turns into an integer that a learner never typed as one. */
const NOT_PLAIN_DECIMAL = ['0x10', '0b11', '0o7', '1e1', '1E2', '+5', '5.', '.5', '3.5', 'Infinity', 'ten', '1_000', '٣'];

describe('parseIntegers', () => {
  it('accepts commas and/or whitespace as separators', () => {
    expect(parseIntegers('1, 3 ,4  8')).toEqual([1, 3, 4, 8]);
    expect(parseIntegers('4,2,12')).toEqual([4, 2, 12]);
    expect(parseIntegers('-3 0 7')).toEqual([-3, 0, 7]);
    expect(parseIntegers(' 007, -0 ')).toEqual([7, -0]);
  });

  it('rejects empty input and anything that is not an integer', () => {
    expect(parseIntegers('')).toBeNull();
    expect(parseIntegers('  ')).toBeNull();
    expect(parseIntegers('1, x')).toBeNull();
    expect(parseIntegers('1.5, 2')).toBeNull();
  });

  it('accepts only plain decimal integers, not what Number() also understands', () => {
    for (const bad of NOT_PLAIN_DECIMAL) expect(parseIntegers(`1, ${bad}`), bad).toBeNull();
  });
});

describe('parseInteger', () => {
  it('reads one plain decimal integer, ignoring surrounding space', () => {
    expect(parseInteger('42')).toBe(42);
    expect(parseInteger(' -7 ')).toBe(-7);
    expect(parseInteger('0')).toBe(0);
  });

  it('is null for empty input, lists and anything Number() would stretch to an integer', () => {
    for (const bad of ['', '   ', '1 2', '1,2', ...NOT_PLAIN_DECIMAL]) expect(parseInteger(bad), bad).toBeNull();
  });
});
