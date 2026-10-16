/**
 * Tabular Q-learning with epsilon-greedy exploration. The whole run is a pure function of (world, settings,
 * episodes), recomputed from scratch, so a slider never leaves hidden training state behind.
 */
import { mulberry32, type Rnd } from '../../core/random';
import { ACTION_COUNT, greedyPolicy, move, policyValue, reachableUnder, reward, type Solved } from './mdp';
import { MAX_STEPS, START_STATE, STATES, cellAt, isTerminal, type World } from './world';

export interface QSettings {
  alpha: number;
  gamma: number;
  epsilon: number;
  /** epsilon is multiplied by DECAY_RATE each episode, down to EPSILON_FLOOR. */
  decay: boolean;
  seed: number;
}

export const DECAY_RATE = 0.999;
export const EPSILON_FLOOR = 0.05;

export const epsilonAt = (s: QSettings, episode: number): number => (s.decay ? Math.max(EPSILON_FLOOR, s.epsilon * DECAY_RATE ** episode) : s.epsilon);

export interface StepRecord {
  from: number;
  to: number;
  action: number;
  /** The action came from the epsilon branch (a random move), not from the best known value. */
  explore: boolean;
}

export interface Training {
  Q: number[][];
  /** Undiscounted return of each episode. */
  returns: number[];
  steps: number[];
  /** Episode ended on a goal. */
  reachedGoal: boolean[];
  lastEpisode: StepRecord[];
  /** Gap to the exact values after each episode, when a target was given. */
  gap: number[];
  epsilonNow: number;
}

function pickAction(Q: readonly number[], eps: number, rnd: Rnd): { action: number; explore: boolean } {
  if (rnd() < eps) return { action: Math.floor(rnd() * ACTION_COUNT), explore: true };
  const best = Math.max(...Q);
  const ties = Q.map((v, a) => (v === best ? a : -1)).filter((a) => a >= 0);
  return { action: ties[Math.floor(rnd() * ties.length)], explore: false };
}

/** Sample where a move actually goes: intended with 1 - slip, each side with slip / 2. */
export function sampleNext(w: World, s: number, action: number, rnd: Rnd): number {
  const u = rnd();
  const dir = u < 1 - w.slip ? action : u < 1 - w.slip / 2 ? (action + 1) % 4 : (action + 3) % 4;
  return move(w, s, dir);
}

/** The exact values to measure against, and the states to measure on. */
export interface GapTarget {
  V: readonly number[];
  states: readonly number[];
}

/** Measure against the exact values on the states the optimal policy can reach (Q-learning only learns where it goes). */
export const gapTarget = (w: World, solved: Solved): GapTarget => ({ V: solved.V, states: reachableUnder(w, greedyPolicy(solved.Q)) });

/** max over `states` of |V*(s) - max_a Q(s, a)|. */
export const maxGap = (Q: readonly (readonly number[])[], V: readonly number[], states: readonly number[]): number =>
  Math.max(0, ...states.map((s) => Math.abs(V[s] - Math.max(...Q[s]))));

export function train(w: World, set: QSettings, episodes: number, target?: GapTarget): Training {
  const rnd = mulberry32(set.seed * 2654435 + 17);
  const Q = Array.from({ length: STATES }, () => new Array<number>(ACTION_COUNT).fill(0));
  const returns: number[] = [];
  const steps: number[] = [];
  const reachedGoal: boolean[] = [];
  const gap: number[] = [];
  let lastEpisode: StepRecord[] = [];
  for (let e = 0; e < episodes; e++) {
    const eps = epsilonAt(set, e);
    let s = START_STATE;
    let total = 0;
    const path: StepRecord[] = [];
    let n = 0;
    while (n < MAX_STEPS && !isTerminal(w, s)) {
      const { action, explore } = pickAction(Q[s], eps, rnd);
      const to = sampleNext(w, s, action, rnd);
      const r = reward(w, s, to);
      Q[s][action] += set.alpha * (r + (isTerminal(w, to) ? 0 : set.gamma * Math.max(...Q[to])) - Q[s][action]);
      total += r;
      path.push({ from: s, to, action, explore });
      s = to;
      n++;
    }
    returns.push(total);
    steps.push(n);
    reachedGoal.push(cellAt(w, s) === 'G');
    lastEpisode = path;
    if (target) gap.push(maxGap(Q, target.V, target.states));
  }
  return { Q, returns, steps, reachedGoal, lastEpisode, gap, epsilonNow: epsilonAt(set, episodes) };
}

/** Expected return from the start of the greedy policy of Q, evaluated exactly on the true model. */
export function greedyReturn(w: World, gamma: number, Q: readonly (readonly number[])[]): number {
  return policyValue(w, gamma, greedyPolicy(Q))[START_STATE];
}

/** Share of the last `window` episodes that ended on a goal. */
export function recentGoalShare(t: Training, window = 100): number {
  const tail = t.reachedGoal.slice(-window);
  return tail.length === 0 ? 0 : tail.filter(Boolean).length / tail.length;
}
