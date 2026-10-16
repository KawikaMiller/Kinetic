/** The loop across many seeds: what feedback changes is which films win, and how much exposure concentrates. */
import type { Matrix } from './data';
import { gini } from '../../core/stats';
import { EXPLORATION, mostShown, simulateLoop } from './loop';

export const LOOP_SEED_STREAMS = 200;

export interface LoopSeedStats {
  streams: number;
  /** With no exploration, the most-shown film differs between the loop and the no-feedback run. */
  winnerDiffers: number;
  /** With no exploration, the loop's final exposure Gini is above the no-feedback run's. */
  giniHigher: number;
  /** The loop with 10% exploration ends with a lower exposure Gini than the loop without. */
  exploreLowers: number;
}

/** Seeds 1 to `streams`. */
export function measureLoopSeeds(truth: Matrix, streams = LOOP_SEED_STREAMS): LoopSeedStats {
  const out: LoopSeedStats = { streams, winnerDiffers: 0, giniHigher: 0, exploreLowers: 0 };
  for (let seed = 1; seed <= streams; seed++) {
    const loop = simulateLoop(truth, seed, 0);
    const free = simulateLoop(truth, seed, 0, 'everyone');
    const explore = simulateLoop(truth, seed, EXPLORATION);
    if (mostShown(loop.exposure) !== mostShown(free.exposure)) out.winnerDiffers++;
    if (gini(loop.exposure) > gini(free.exposure)) out.giniHigher++;
    if (gini(explore.exposure) < gini(loop.exposure)) out.exploreLowers++;
  }
  return out;
}

/** Measured once with `measureLoopSeeds`; `lesson.test.ts` recomputes it, so the lesson need not run 600 simulations on load. */
export const PINNED_LOOP_SEEDS: LoopSeedStats = { streams: 200, winnerDiffers: 106, giniHigher: 200, exploreLowers: 195 };
