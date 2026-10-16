import { describe, expect, it } from 'vitest';
import { MIXES, OVERHEAD_DIV, POOL_CPU, POOL_RANGE, POOL_TASKS, bestPool, burstTicks, ruleOfThumb, simulatePool, sweepPool } from './pool';

/** The steady-state closed form without contention: P threads each finish one task per (c + w), but the cores cap it at C / c. */
const closedForm = (cores: number, ratio: number, pool: number) => Math.min(pool / (POOL_CPU * (1 + ratio)), cores / POOL_CPU) * 100;

describe('pool sizing against the closed form', () => {
  it('without the contention cost, throughput is min(P / (c + w), C / c) within 5% over a grid', () => {
    let cases = 0;
    for (const cores of [1, 2, 4, 8]) {
      for (const ratio of MIXES) {
        for (const pool of [1, 2, 3, 4, 6, 8, 12, 16, 24, 40, 64]) {
          const got = simulatePool({ cores, ratio, pool, overheadDiv: Infinity }).throughput;
          const want = closedForm(cores, ratio, pool);
          expect(Math.abs(got - want) / want, `C=${cores} r=${ratio} P=${pool}: ${got} vs ${want}`).toBeLessThan(0.05);
          cases++;
        }
      }
    }
    expect(cases).toBe(4 * 6 * 11);
  });

  it('one thread on a pure CPU-bound mix takes exactly tasks x burst ticks, by hand', () => {
    const r = simulatePool({ cores: 4, ratio: 0, pool: 1, overheadDiv: Infinity });
    expect(r.makespan).toBe(POOL_TASKS * POOL_CPU);
  });

  it('CPU-bound tasks peak at P = C: nothing below C comes near the best and C is within 1% of it', () => {
    for (const cores of [1, 2, 4, 8]) {
      const curve = sweepPool({ cores, ratio: 0 });
      expect(bestPool(curve), `C=${cores}`).toBe(cores);
      if (cores > 1) {
        const best = Math.max(...curve.map((c) => c.throughput));
        expect(curve[cores - 2].throughput).toBeLessThan(best * 0.9);
      }
    }
  });

  it('blocking tasks keep gaining until about C x (1 + w/c), then flatten and fall slowly under the contention cost', () => {
    for (const cores of [2, 4]) {
      for (const ratio of [4, 9, 19]) {
        const curve = sweepPool({ cores, ratio });
        const rule = ruleOfThumb(cores, ratio);
        const peak = bestPool(curve, 0.05);
        expect(peak, `C=${cores} r=${ratio}`).toBeGreaterThanOrEqual(Math.floor(rule * 0.6));
        expect(peak).toBeLessThanOrEqual(rule + 1);
        // past the peak the curve never gains more than a few percent and ends lower than its best
        const best = Math.max(...curve.map((c) => c.throughput));
        const last = curve[curve.length - 1].throughput;
        if (rule < POOL_RANGE.max / 2) expect(last).toBeLessThan(best);
        expect(last).toBeGreaterThan(best * 0.5);
      }
    }
  });

  it('the contention cost lengthens every burst by one tick per 16 threads', () => {
    expect(OVERHEAD_DIV).toBe(16);
    expect(burstTicks(15)).toBe(POOL_CPU);
    expect(burstTicks(16)).toBe(POOL_CPU + 1);
    expect(burstTicks(64)).toBe(POOL_CPU + 4);
    expect(simulatePool({ cores: 4, ratio: 0, pool: 64 }).burst).toBe(POOL_CPU + 4);
  });

  it('core use is a share, and a CPU-bound pool of C threads uses nearly all of them', () => {
    const r = simulatePool({ cores: 4, ratio: 0, pool: 4 });
    expect(r.coreUse).toBeGreaterThan(0.99);
    expect(r.coreUse).toBeLessThanOrEqual(1);
    expect(simulatePool({ cores: 4, ratio: 9, pool: 1 }).coreUse).toBeLessThan(0.1);
  });

  it('is deterministic', () => {
    expect(simulatePool({ cores: 4, ratio: 4, pool: 20 })).toEqual(simulatePool({ cores: 4, ratio: 4, pool: 20 }));
  });
});
