/**
 * Measured figures the lesson text quotes, pinned so that opening the lesson does not run hundreds of training
 * runs. `lesson.test.ts` recomputes every one from the model and fails when they drift.
 */
import type { FixedEpsilonStats, RlSeedStats } from './seeds';

export const PINNED_RL_SEEDS: RlSeedStats = { seeds: 200, episodes: 3000, nearOptimal: 188, sameOnRoute: 160, routeCells: 16 };

const FIXED = { seeds: 40, episodes: 3000 } as const;
export const PINNED_FIXED_EPSILON: readonly FixedEpsilonStats[] = [
  { epsilon: 0.1, ...FIXED, cookie: 40, goal: 0 },
  { epsilon: 0.3, ...FIXED, cookie: 40, goal: 0 },
  { epsilon: 0.5, ...FIXED, cookie: 39, goal: 0 },
  { epsilon: 0.7, ...FIXED, cookie: 0, goal: 40 },
];
