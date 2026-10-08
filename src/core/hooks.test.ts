import { describe, expect, it } from 'vitest';
import { DEFAULT_MAX_DT, frameDt } from './hooks';

describe('frameDt (useLoop)', () => {
  it('is the gap in seconds, capped at 50 ms by default', () => {
    expect(frameDt(1000, 1016)).toBeCloseTo(0.016);
    expect(frameDt(1000, 1500)).toBe(DEFAULT_MAX_DT);
    expect(DEFAULT_MAX_DT).toBe(0.05);
  });

  it('takes another cap, or none', () => {
    expect(frameDt(1000, 1500, 0.1)).toBe(0.1);
    expect(frameDt(1000, 1500, Infinity)).toBe(0.5);
  });

  it('is never negative (a first frame stamped before the loop started)', () => {
    expect(frameDt(1000, 995)).toBe(0);
  });
});
