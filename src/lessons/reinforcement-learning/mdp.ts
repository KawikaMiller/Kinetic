/**
 * The model the lesson knows and the learner's agent does not: transition probabilities and rewards, with
 * value iteration (exact optimal values) and policy evaluation (exact value of a given policy).
 */
import { BONUS_CELL, CELL_REWARD, COLS, ROWS, START_STATE, STATES, cellAt, colOf, isLive, isTerminal, isWall, rowOf, stateOf, type World } from './world';

/** Actions in drawing order: up, right, down, left. */
export const ACTIONS = ['up', 'right', 'down', 'left'] as const;
export const ACTION_COUNT = ACTIONS.length;
export const ARROW = ['↑', '→', '↓', '←'] as const;
const DELTA: readonly (readonly [number, number])[] = [[-1, 0], [0, 1], [1, 0], [0, -1]];

/** Where a move in direction `dir` from s ends: a wall or the edge keeps the agent where it is. */
export function move(w: World, s: number, dir: number): number {
  const r = rowOf(s) + DELTA[dir][0];
  const c = colOf(s) + DELTA[dir][1];
  if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return s;
  const n = stateOf(r, c);
  return isWall(w, n) ? s : n;
}

export interface Outcome {
  to: number;
  p: number;
}

/** The intended direction with probability 1 - slip, each perpendicular one with slip / 2. */
export function outcomes(w: World, s: number, action: number): Outcome[] {
  const dirs: [number, number][] = [[action, 1 - w.slip], [(action + 1) % 4, w.slip / 2], [(action + 3) % 4, w.slip / 2]];
  const merged = new Map<number, number>();
  for (const [dir, p] of dirs) {
    if (p === 0) continue;
    const to = move(w, s, dir);
    merged.set(to, (merged.get(to) ?? 0) + p);
  }
  return [...merged].map(([to, p]) => ({ to, p }));
}

/** Reward for arriving at `to` from `from`: the step cost, the arrival cell's reward, and the bonus for stepping onto the bonus tile. */
export function reward(w: World, from: number, to: number): number {
  const bonus = w.bonus > 0 && to !== from && to === stateOf(BONUS_CELL[0], BONUS_CELL[1]) ? w.bonus : 0;
  return -w.stepCost + (to !== from ? CELL_REWARD[cellAt(w, to)] : 0) + bonus;
}

export const liveStates = (w: World): number[] => Array.from({ length: STATES }, (_, s) => s).filter((s) => isLive(w, s));

/** Expected one-step reward plus gamma times the next value, for taking `action` in `s`. */
export const backup = (w: World, V: readonly number[], gamma: number, s: number, action: number): number =>
  outcomes(w, s, action).reduce((sum, { to, p }) => sum + p * (reward(w, s, to) + (isTerminal(w, to) ? 0 : gamma * V[to])), 0);

export interface Solved {
  V: number[];
  Q: number[][];
  iterations: number;
  /** max over live states of |V(s) - max_a backup|, after the last sweep. */
  residual: number;
}

export function valueIteration(w: World, gamma: number, tolerance = 1e-13, maxIterations = 20000): Solved {
  const live = liveStates(w);
  const V = new Array<number>(STATES).fill(0);
  let iterations = 0;
  let change = Infinity;
  while (change > tolerance && iterations < maxIterations) {
    change = 0;
    for (const s of live) {
      const best = Math.max(...ACTIONS.map((_, a) => backup(w, V, gamma, s, a)));
      change = Math.max(change, Math.abs(best - V[s]));
      V[s] = best;
    }
    iterations++;
  }
  const Q = Array.from({ length: STATES }, (_, s) => (isLive(w, s) ? ACTIONS.map((_, a) => backup(w, V, gamma, s, a)) : new Array<number>(ACTION_COUNT).fill(0)));
  const residual = Math.max(0, ...live.map((s) => Math.abs(V[s] - Math.max(...Q[s]))));
  return { V, Q, iterations, residual };
}

/** The action with the largest value in a state (the lowest index on a tie), for every state. */
export const greedyPolicy = (Q: readonly (readonly number[])[]): number[] => Q.map((row) => row.reduce((best, v, a) => (v > row[best] ? a : best), 0));

/**
 * Exact value of following `policy` (state to action) from every state: iterative policy evaluation. A policy that
 * never reaches an end at gamma 1 has value minus infinity from the states that still change at the iteration cap
 * (with gamma below 1 the sweeps always converge), so those states report -Infinity instead of a cap artefact.
 */
export function policyValue(w: World, gamma: number, policy: readonly number[], tolerance = 1e-13, maxIterations = 20000): number[] {
  const live = liveStates(w);
  const V = new Array<number>(STATES).fill(0);
  const moved = new Array<number>(STATES).fill(Infinity);
  for (let i = 0; i < maxIterations && Math.max(0, ...live.map((s) => moved[s])) > tolerance; i++) {
    for (const s of live) {
      const v = backup(w, V, gamma, s, policy[s]);
      moved[s] = Math.abs(v - V[s]);
      V[s] = v;
    }
  }
  for (const s of live) if (moved[s] > tolerance) V[s] = -Infinity;
  return V;
}

/** States the policy can reach from the start, following any outcome that has positive probability. */
export function reachableUnder(w: World, policy: readonly number[]): number[] {
  const seen = new Set<number>([START_STATE]);
  const queue = [START_STATE];
  while (queue.length) {
    const s = queue.shift()!;
    if (!isLive(w, s)) continue;
    for (const { to } of outcomes(w, s, policy[s])) {
      if (!seen.has(to)) {
        seen.add(to);
        queue.push(to);
      }
    }
  }
  return [...seen].filter((s) => isLive(w, s)).sort((a, b) => a - b);
}

export const startValue = (V: readonly number[]): number => V[START_STATE];
