import { describe, expect, it } from 'vitest';
import { FOLLOWER_STEPS, INSERT_MS, WORKERS, doneAt, makeDrain } from './drain';
import { fanoutMs } from './feed';

describe('the fan-out drain on the tick sim', () => {
  it('finishes exactly when the closed form says: every follower step, a spread of workers and insert times', () => {
    for (const f of FOLLOWER_STEPS) {
      for (const w of [1, 3, WORKERS.default, 50]) {
        for (const ms of [0.5, INSERT_MS.default, 4]) {
          const d = makeDrain(f, w, ms);
          expect(doneAt(d, d.totalMs), `${f} ${w} ${ms}`).toBe(f);
          expect(d.totalMs).toBe(fanoutMs(f, w, ms));
          if (d.totalMs > d.tickMs) expect(doneAt(d, d.totalMs - d.tickMs)).toBeLessThan(f);
        }
      }
    }
  });

  it('inserts land at an even pace: after t ms about t / insertMs rounds of one insert per worker have landed (an independent count)', () => {
    const d = makeDrain(100_000, 10, 1);
    for (const t of [100, 1_000, 5_000]) expect(doneAt(d, t)).toBeLessThanOrEqual(Math.ceil(t / 1) * 10);
    expect(doneAt(d, 5_000)).toBeGreaterThanOrEqual(4_900 * 10 * 0.95);
    expect(doneAt(d, 0)).toBe(0);
  });

  it('the 100,000-follower celebrity at the default workers takes 10 s, and 2,000 followers take 200 ms', () => {
    expect(makeDrain(100_000, WORKERS.default, INSERT_MS.default).totalMs).toBe(10_000);
    expect(makeDrain(2_000, WORKERS.default, INSERT_MS.default).totalMs).toBe(200);
  });

  it('a seeded replay is the same every time (same history)', () => {
    expect(makeDrain(5_000, 7, 1.5).sim.history).toEqual(makeDrain(5_000, 7, 1.5).sim.history);
  });
});
