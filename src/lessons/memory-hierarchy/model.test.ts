import { describe, expect, it } from 'vitest';
import { levelById } from '../../core/latencyLadder';
import { effectiveNs, ratio } from './model';

describe('the misconception', () => {
  it('RAM is about 100 times slower than L1', () => {
    expect(ratio(levelById('ram').ns, levelById('l1').ns)).toBeGreaterThanOrEqual(50);
    expect(ratio(levelById('ram').ns, levelById('l1').ns)).toBeLessThanOrEqual(200);
  });
});

describe('effective access time', () => {
  it('is hit·fast + (1 − hit)·slow', () => {
    expect(effectiveNs(1, 1, 100)).toBe(1);
    expect(effectiveNs(0, 1, 100)).toBe(100);
    expect(effectiveNs(0.95, 1, 100)).toBeCloseTo(5.95, 10);
    expect(effectiveNs(0.5, 10, 30)).toBe(20);
  });

  it('falls steadily as the hit rate rises', () => {
    let last = Infinity;
    for (let hit = 0; hit <= 1; hit += 0.05) {
      const t = effectiveNs(hit, 1, 100);
      expect(t).toBeLessThan(last);
      last = t;
    }
  });
});
