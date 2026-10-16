import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import { DEFAULT_JOBS, DELAY_STEP_S, MAX_JOBS, TICK_S, WHEEL_SLOTS, heapOrder, inversions, place, runWheel, type WheelJob } from './wheel';

const randomJobs = (seed: number): WheelJob[] => {
  const rnd = mulberry32(seed);
  const n = 1 + Math.floor(rnd() * MAX_JOBS);
  return Array.from({ length: n }, (_, i) => ({ id: i + 1, delay: DELAY_STEP_S * (1 + Math.floor(rnd() * 120)) }));
};

describe('the timing wheel against the heap oracle', () => {
  it('fires every job at the tick ceil(due / tick): never early, and less than one tick late (300 seeded queues)', () => {
    for (let seed = 0; seed < 300; seed++) {
      const jobs = randomJobs(seed);
      const { firings } = runWheel(jobs);
      expect(firings).toHaveLength(jobs.length);
      for (const f of firings) {
        const due = jobs.find((j) => j.id === f.id)!.delay;
        expect(f.tick * TICK_S, `seed ${seed} job ${f.id}`).toBe(Math.ceil(due / TICK_S) * TICK_S);
        expect(f.tick * TICK_S).toBeGreaterThanOrEqual(due);
        expect(f.tick * TICK_S - due).toBeLessThan(TICK_S);
      }
    }
  });

  it('the wheel and the heap agree on the order of jobs due in different ticks and differ only inside one tick', () => {
    for (let seed = 0; seed < 300; seed++) {
      const jobs = randomJobs(seed);
      const delay = new Map(jobs.map((j) => [j.id, j.delay]));
      for (const [a, b] of inversions(jobs)) {
        expect(Math.ceil(delay.get(a)! / TICK_S), `seed ${seed}`).toBe(Math.ceil(delay.get(b)! / TICK_S));
        expect(delay.get(a)!).toBeLessThan(delay.get(b)!);
      }
      // and the heap order itself is sorted
      const sorted = heapOrder(jobs).map((id) => delay.get(id)!);
      expect(sorted).toEqual([...sorted].sort((x, y) => x - y));
    }
  });

  it('the default queue: jobs 3 (4.5 s) and 2 (5 s) fall in different ticks (5 and 5? no: 4.5 s is tick 5 and 5 s is tick 5) so the wheel fires 2 before 3, the heap 3 before 2', () => {
    expect(DEFAULT_JOBS.find((j) => j.id === 3)!.delay).toBe(4.5);
    const wheel = runWheel(DEFAULT_JOBS).firings;
    expect(wheel.map((f) => [f.id, f.tick])).toEqual([[1, 3], [2, 5], [3, 5], [4, 12]]);
    expect(heapOrder(DEFAULT_JOBS)).toEqual([1, 3, 2, 4]);
    expect(inversions(DEFAULT_JOBS)).toEqual([[3, 2]]);
  });

  it('placement is slot = tick mod 8 and rounds = laps still to go, hand-worked for delays of 3, 8, 9, 16 and 17 s', () => {
    const p = place([3, 8, 9, 16, 17].map((delay, i) => ({ id: i + 1, delay })));
    expect(p.map((x) => [x.dueTick, x.slot, x.rounds])).toEqual([[3, 3, 0], [8, 0, 0], [9, 1, 1], [16, 0, 1], [17, 1, 2]]);
    expect(WHEEL_SLOTS).toBe(8);
  });

  it('a wheel that forgot to count rounds down would fire laps early: the oracle rejects it (broken variant)', () => {
    const jobs: WheelJob[] = [{ id: 1, delay: 20 }];
    const forgetful = place(jobs)[0];
    // First visit of its slot is at tick `slot`, i.e. 4 s, not 20 s.
    expect(forgetful.slot).toBeLessThan(20);
    expect(runWheel(jobs).firings[0].tick).toBe(20);
  });
});
