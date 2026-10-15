import { describe, expect, it } from 'vitest';
import { possibilities } from './model';

describe('possibilities', () => {
  it('12 uniform characters from 62 symbols are about 3.2e21 (hand check: 62^12 = 3.226e21), matching the doc comment', () => {
    expect(possibilities(12 * Math.log2(62))).toBe('3.2e21');
  });
});
