import { describe, expect, it } from 'vitest';
import { scientific } from './spectrum';

describe('scientific', () => {
  it('writes small numbers with a real superscript, never as e-notation', () => {
    expect(scientific(4.1e-16)).toBe('4.1 × 10⁻¹⁶');
    expect(scientific(2.5e-3)).toBe('2.5 × 10⁻³');
    expect(scientific(3.2e5)).toBe('3.2 × 10⁵');
    for (const x of [4.1e-16, 2.5e-3, 3.2e5, 1e-20]) expect(scientific(x)).not.toMatch(/e[-+]?\d/);
  });
  it('writes zero as 0', () => {
    expect(scientific(0)).toBe('0');
  });
});
