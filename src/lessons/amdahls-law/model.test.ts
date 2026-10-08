import { describe, expect, it } from 'vitest';
import { CORE_STEPS, MAX_CORES, PRESETS, amdahl, bestWholeCores, ceiling, doublingCut, gustafson, peakCores, runTime, withOverhead } from './model';

const S_GRID = Array.from({ length: 21 }, (_, i) => i / 20);

/**
 * Independent reference: really schedule the work. The serial part is `serialTasks` unit tasks
 * that run one after another; the parallel part is `parallelTasks` unit tasks handed out
 * greedily to whichever of n cores is free first. Returns the finishing time.
 */
function makespan(serialTasks: number, parallelTasks: number, n: number): number {
  const free = Array<number>(n).fill(serialTasks);
  for (let k = 0; k < parallelTasks; k++) {
    const i = free.indexOf(Math.min(...free));
    free[i] += 1;
  }
  return Math.max(...free);
}

describe('Amdahl', () => {
  it('matches a real greedy schedule of unit tasks (work divisible by n, so the split is exact)', () => {
    const TOTAL = 2560; // divisible by every core count we try
    for (const serialTasks of [0, 128, 256, 1280, 2432])
      for (const n of [1, 2, 4, 8, 16, 32, 64, 128, 256].filter((k) => (TOTAL - serialTasks) % k === 0)) {
        const s = serialTasks / TOTAL;
        const measured = TOTAL / makespan(serialTasks, TOTAL - serialTasks, n);
        expect(amdahl(s, n)).toBeCloseTo(measured, 10);
      }
  });

  it('gives 1 on one core for every s, rises with n, and never passes 1/s', () => {
    for (const s of S_GRID) {
      expect(amdahl(s, 1)).toBeCloseTo(1, 12);
      let prev = 1;
      for (const n of CORE_STEPS.slice(1)) {
        const v = amdahl(s, n);
        expect(v).toBeGreaterThanOrEqual(prev - 1e-12);
        expect(v).toBeLessThanOrEqual(ceiling(s) + 1e-9);
        prev = v;
      }
    }
  });

  it('s = 5% approaches 20× within 0.1% at a million cores', () => {
    expect(Math.abs(amdahl(0.05, 1e6) - 20) / 20).toBeLessThan(0.001);
  });

  it('a build that is 20% serial can never be more than 5× faster', () => {
    expect(ceiling(0.2)).toBeCloseTo(5, 12);
    expect(amdahl(0.2, 1e9)).toBeLessThan(5);
    expect(amdahl(0.2, 1e9)).toBeGreaterThan(4.9999);
  });

  it('doubling the cores halves the time only when nothing is serial', () => {
    for (const n of CORE_STEPS) {
      expect(doublingCut(0, n)).toBeCloseTo(0.5, 12);
      for (const s of S_GRID.slice(1)) expect(doublingCut(s, n)).toBeLessThan(0.5);
    }
  });
});

describe('Gustafson', () => {
  it('is 1 on one core for every s', () => {
    for (const s of S_GRID) expect(gustafson(s, 1)).toBeCloseTo(1, 12);
  });

  it('matches scheduling n times the parallel work on n cores in the same time', () => {
    const UNIT = 100; // one core's run: serialTasks + parallelTasks = 100
    for (const serialTasks of [0, 5, 10, 50])
      for (const n of [1, 2, 4, 16, 64]) {
        const parallelTasks = (UNIT - serialTasks) * n;
        const time = makespan(serialTasks, parallelTasks, n);
        expect(time).toBe(UNIT);
        // Work done ÷ time, against one core doing the same work.
        expect(gustafson(serialTasks / UNIT, n)).toBeCloseTo((serialTasks + parallelTasks) / time, 10);
      }
  });

  it('climbs nearly linearly: within s·n of perfect', () => {
    for (const s of PRESETS) for (const n of CORE_STEPS) expect(n - gustafson(s, n)).toBeCloseTo(s * (n - 1), 10);
  });
});

describe('the overhead model', () => {
  /** Golden-section search for the minimum run time: an independent route to the peak. */
  function numericPeak(s: number, c: number): number {
    let [a, b] = [1, 1e6];
    const g = (Math.sqrt(5) - 1) / 2;
    for (let k = 0; k < 200; k++) {
      const x1 = b - g * (b - a);
      const x2 = a + g * (b - a);
      if (runTime(s, x1, c) < runTime(s, x2, c)) b = x2;
      else a = x1;
    }
    return (a + b) / 2;
  }

  it('peaks at n* = √((1 − s)/c)', () => {
    for (const s of [0.01, 0.05, 0.1, 0.3])
      for (const c of [1e-4, 5e-4, 1e-3, 2e-3]) {
        const star = peakCores(s, c);
        expect(star).toBeCloseTo(Math.sqrt((1 - s) / c), 12);
        expect(numericPeak(s, c) / star).toBeCloseTo(1, 5);
      }
  });

  it('bestWholeCores is the true best integer in 1..256 (brute force)', () => {
    for (const s of [0, 0.01, 0.05, 0.1, 0.5])
      for (const c of [1e-5, 1e-4, 5e-4, 2e-3, 0.05]) {
        let best = 1;
        for (let n = 2; n <= MAX_CORES; n++) if (withOverhead(s, n, c) > withOverhead(s, best, c)) best = n;
        expect(withOverhead(s, bestWholeCores(s, c, MAX_CORES), c)).toBeCloseTo(withOverhead(s, best, c), 12);
      }
  });

  it('with no overhead it is plain Amdahl', () => {
    for (const s of S_GRID) for (const n of CORE_STEPS) expect(withOverhead(s, n, 0)).toBeCloseTo(amdahl(s, n), 12);
  });
});
