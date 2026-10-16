/**
 * What Q-learning does across many seeds, not only on the seed the scenes show: the Monte Carlo statements the
 * lesson prints as measured. `pinned.ts` holds the results; `lesson.test.ts` recomputes them.
 */
import { greedyPolicy, reachableUnder, valueIteration } from './mdp';
import { greedyRoute } from './presets';
import { greedyReturn, train, type QSettings } from './qlearn';
import { LEARN_DEFAULT } from './settings';
import { DEFAULT_WORLD, START_STATE } from './world';

/** How close to the best return counts as "worth the same". */
export const NEAR_BEST = 0.02;

const settings = (over: Partial<QSettings>): QSettings => ({
  alpha: LEARN_DEFAULT.alpha, gamma: LEARN_DEFAULT.gamma, epsilon: LEARN_DEFAULT.epsilon, decay: LEARN_DEFAULT.decay, seed: LEARN_DEFAULT.seed, ...over,
});

export interface RlSeedStats {
  seeds: number;
  episodes: number;
  /** Seeds whose greedy policy is worth within NEAR_BEST of the best return from the start. */
  nearOptimal: number;
  /** Seeds whose greedy policy picks the best move in every cell the best route can visit. */
  sameOnRoute: number;
  /** Cells the best route can visit. */
  routeCells: number;
}

/** The default world, the Learn scene's settings, seeds 1 to `seeds`. */
export function measureRlSeeds(seeds: number, episodes: number): RlSeedStats {
  const solved = valueIteration(DEFAULT_WORLD, LEARN_DEFAULT.gamma);
  const best = solved.V[START_STATE];
  const policy = greedyPolicy(solved.Q);
  const route = reachableUnder(DEFAULT_WORLD, policy);
  const out: RlSeedStats = { seeds, episodes, nearOptimal: 0, sameOnRoute: 0, routeCells: route.length };
  for (let seed = 1; seed <= seeds; seed++) {
    const t = train(DEFAULT_WORLD, settings({ seed }), episodes);
    if (greedyReturn(DEFAULT_WORLD, LEARN_DEFAULT.gamma, t.Q) >= best - NEAR_BEST) out.nearOptimal++;
    const mine = greedyPolicy(t.Q);
    if (route.every((s) => mine[s] === policy[s])) out.sameOnRoute++;
  }
  return out;
}

export interface FixedEpsilonStats {
  epsilon: number;
  seeds: number;
  episodes: number;
  /** Seeds whose greedy route ends at the cookie / the goal. */
  cookie: number;
  goal: number;
}

/** A fixed epsilon (no decay) in the default world: where does the greedy route end? */
export function measureFixedEpsilon(epsilon: number, seeds: number, episodes: number): FixedEpsilonStats {
  const out: FixedEpsilonStats = { epsilon, seeds, episodes, cookie: 0, goal: 0 };
  for (let seed = 1; seed <= seeds; seed++) {
    const t = train(DEFAULT_WORLD, settings({ epsilon, decay: false, seed }), episodes);
    const destination = greedyRoute(DEFAULT_WORLD, t.Q).destination;
    if (destination === 'cookie') out.cookie++;
    if (destination === 'goal') out.goal++;
  }
  return out;
}
