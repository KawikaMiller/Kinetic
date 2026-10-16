/**
 * Scene 1's fan-out drain on the fixed-tick sim: one fan-out task per follower waits in a queue, `workers` workers each
 * finish one inbox insert every `insertMs`. A tick is a whole number of inserts long, so the sim and the closed form
 * `ceil(F / W) * insertMs` agree to the millisecond.
 */
import { createTickSim, type TickSim } from '../../core/simTick';
import { fanoutMs } from './feed';

export const FOLLOWER_STEPS: readonly number[] = [10, 100, 1_000, 5_000, 20_000, 100_000];
export const WORKERS = { min: 1, max: 50, step: 1, default: 10 } as const;
export const INSERT_MS = { min: 0.5, max: 4, step: 0.5, default: 1 } as const;
/** Above this many followers the inbox grid shows a sample and the rest is counted, not drawn. */
export const SAMPLE_CELLS = 300;
export const SAMPLE_COLS = 20;
const TARGET_TICKS = 200;

export interface Drain {
  followers: number;
  workers: number;
  insertMs: number;
  /** Milliseconds one tick covers. */
  tickMs: number;
  sim: TickSim<{ done: number }>;
  /** Milliseconds until the last follower can see the post. */
  totalMs: number;
  ticks: number;
}

export function makeDrain(followers: number, workers: number, insertMs: number): Drain {
  const totalMs = fanoutMs(followers, workers, insertMs);
  const rounds = Math.ceil(followers / workers);
  const insertsPerTick = Math.max(1, Math.ceil(rounds / TARGET_TICKS));
  const tickMs = insertsPerTick * insertMs;
  const sim = createTickSim({
    seed: 1,
    init: () => ({ done: 0 }),
    step: (s) => ({ done: Math.min(followers, s.done + workers * insertsPerTick) }),
  });
  const ticks = Math.ceil(rounds / insertsPerTick);
  sim.run(ticks);
  return { followers, workers, insertMs, tickMs, sim, totalMs, ticks };
}

/** Inbox writes landed after `ms` of draining, read from the sim. */
export function doneAt(d: Drain, ms: number): number {
  if (ms >= d.totalMs) return d.followers;
  const k = Math.min(d.ticks, Math.floor(ms / d.tickMs + 1e-9));
  return d.sim.at(k)?.done ?? 0;
}
