/** etl-orchestration: seeded operation schedules (scene 3's replay, and the tests' chaos), and the pinned seed that breaks append loads. */
import { mulberry32, randInt } from '../../core/random';
import { DAYS, HORIZON_HOURS, MAX_RETRIES, TASKS, triggerHour, type Config, type Fail, type Mode, type Op, keyOf } from './engine';

export const MAX_OPS = 12;

/** Up to MAX_OPS reruns and late arrivals, each after its day's run could have finished. Seeded: the same seed gives the same list. */
export function opsForSeed(seed: number): Op[] {
  const rnd = mulberry32(seed);
  const n = randInt(1, MAX_OPS, rnd);
  return Array.from({ length: n }, () => {
    const day = randInt(0, DAYS - 1, rnd);
    const at = randInt(triggerHour(day) + 6, HORIZON_HOURS - 6, rnd);
    return rnd() < 0.6 ? { at, kind: 'rerun' as const, day } : { at, kind: 'late' as const, day };
  }).sort((a, b) => a.at - b.at);
}

/** A rougher schedule for the invariant tests: injected failures of both kinds, retries, reruns, late data, clears and flaky workers. */
export function chaos(seed: number, mode: Mode): Config {
  const rnd = mulberry32(seed + 10_000);
  const failures: Record<string, Fail> = {};
  for (let i = randInt(0, 4, rnd); i > 0; i--) failures[keyOf(randInt(0, DAYS - 1, rnd), TASKS[randInt(0, TASKS.length - 1, rnd)])] = { kind: rnd() < 0.5 ? 'transient' : 'permanent' };
  const ops: Op[] = Array.from({ length: randInt(0, MAX_OPS, rnd) }, () => {
    const day = randInt(0, DAYS - 1, rnd);
    const at = randInt(0, HORIZON_HOURS - 2, rnd);
    const r = rnd();
    if (r < 0.4) return { at, kind: 'rerun' as const, day };
    if (r < 0.7) return { at, kind: 'late' as const, day };
    return { at, kind: 'clear' as const, day, task: TASKS[randInt(0, TASKS.length - 1, rnd)] };
  });
  return { retries: randInt(0, MAX_RETRIES, rnd), mode, failures, ops: ops.sort((a, b) => a.at - b.at), flaky: rnd() < 0.5 };
}

/** The lowest seed whose schedule (opsForSeed) makes append loads leave more rows than the source holds. A test pins it. */
export const BROKEN_SEED = 0;
