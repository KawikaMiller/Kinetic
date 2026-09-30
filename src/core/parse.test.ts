import { describe, expect, it } from 'vitest';
import { parseIntegers } from './parse';

describe('parseIntegers', () => {
  it('accepts commas and/or whitespace as separators', () => {
    expect(parseIntegers('1, 3 ,4  8')).toEqual([1, 3, 4, 8]);
    expect(parseIntegers('4,2,12')).toEqual([4, 2, 12]);
    expect(parseIntegers('-3 0 7')).toEqual([-3, 0, 7]);
  });

  it('rejects empty input and anything that is not an integer', () => {
    expect(parseIntegers('')).toBeNull();
    expect(parseIntegers('  ')).toBeNull();
    expect(parseIntegers('1, x')).toBeNull();
    expect(parseIntegers('1.5, 2')).toBeNull();
  });
});
