/**
 * When a table cannot scale: a linear value function over the features (1, x, y) trained by semi-gradient TD(0)
 * on core/nn's SGD. It evaluates a fixed policy (the optimal one), so the true values are known to compare with.
 */
import { createSgd, type Trainable } from '../../core/nn';
import { mulberry32 } from '../../core/random';
import { sampleNext } from './qlearn';
import { greedyPolicy, liveStates, reward, valueIteration } from './mdp';
import { COLS, MAX_STEPS, ROWS, STATES, colOf, isTerminal, rowOf, type World } from './world';

export interface TdExample {
  x: readonly number[];
  /** The bootstrapped target r + gamma V(s'), held fixed for this update. */
  y: number;
}

export const features = (s: number): number[] => [1, colOf(s) / (COLS - 1), rowOf(s) / (ROWS - 1)];

/** V(s) = w . phi(s), loss half the mean squared TD error with the target held constant. */
export function createLinearValue(): Trainable<readonly TdExample[]> & { value: (s: number) => number } {
  const params = [0, 0, 0];
  const dotWith = (x: readonly number[]) => params.reduce((sum, w, i) => sum + w * x[i], 0);
  return {
    params,
    value: (s) => dotWith(features(s)),
    loss: (batch) => batch.reduce((sum, e) => sum + 0.5 * (dotWith(e.x) - e.y) ** 2, 0) / batch.length,
    gradient: (batch) => params.map((_, i) => batch.reduce((sum, e) => sum + (dotWith(e.x) - e.y) * e.x[i], 0) / batch.length),
  };
}

/** Two small worlds with no slip: an open grid, and a serpentine maze whose long path breaks any linear picture. */
export const OPEN_ROWS: readonly string[] = ['.....G', '......', '......', '......', '......'];
export const MAZE_ROWS: readonly string[] = ['.....G', '.#####', '......', '#####.', '......'];
export const APPROX_GAMMA = 0.97;
export const TD_RATE = 0.02;
export const TD_UPDATES_MAX = 40000;
export const approxWorld = (rows: readonly string[]): World => ({ rows, slip: 0, stepCost: 0.04, bonus: 0 });

/**
 * The best a plane over (x, y) can do on these values: the least-squares weights (normal equations, solved by
 * Gaussian elimination with partial pivoting) and the RMS error they leave over the live cells.
 */
export function bestPlane(w: World, truth: readonly number[]): { weights: number[]; rmse: number } {
  const live = liveStates(w);
  const k = features(live[0]).length;
  const a = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => live.reduce((sum, s) => sum + features(s)[i] * features(s)[j], 0)));
  const b = Array.from({ length: k }, (_, i) => live.reduce((sum, s) => sum + features(s)[i] * truth[s], 0));
  for (let col = 0; col < k; col++) {
    const pivot = Array.from({ length: k - col }, (_, i) => col + i).reduce((best, r) => (Math.abs(a[r][col]) > Math.abs(a[best][col]) ? r : best), col);
    [a[col], a[pivot]] = [a[pivot], a[col]];
    [b[col], b[pivot]] = [b[pivot], b[col]];
    for (let r = col + 1; r < k; r++) {
      const f = a[r][col] / a[col][col];
      for (let c = col; c < k; c++) a[r][c] -= f * a[col][c];
      b[r] -= f * b[col];
    }
  }
  const weights = new Array<number>(k).fill(0);
  for (let r = k - 1; r >= 0; r--) weights[r] = (b[r] - a[r].slice(r + 1).reduce((sum, v, i) => sum + v * weights[r + 1 + i], 0)) / a[r][r];
  const rmse = Math.sqrt(live.reduce((sum, s) => sum + (features(s).reduce((acc, f, i) => acc + f * weights[i], 0) - truth[s]) ** 2, 0) / live.length);
  return { weights, rmse };
}

export interface TdResult {
  weights: number[];
  /** Estimated value of each state (0 for walls and terminals). */
  estimate: number[];
  /** True value of the optimal policy. */
  truth: number[];
  /** Root-mean-square error over the live states. */
  rmse: number;
  /** The RMS error of the best possible plane on this world: what no amount of training can beat. */
  planeRmse: number;
}

export function trainTd(w: World, updates: number, seed = 1): TdResult {
  const solved = valueIteration(w, APPROX_GAMMA);
  const policy = greedyPolicy(solved.Q);
  const live = liveStates(w);
  const model = createLinearValue();
  const sgd = createSgd({ learningRate: TD_RATE });
  const rnd = mulberry32(seed * 40503 + 9);
  let done = 0;
  while (done < updates) {
    let s = live[Math.floor(rnd() * live.length)];
    for (let n = 0; n < MAX_STEPS && !isTerminal(w, s) && done < updates; n++) {
      const to = sampleNext(w, s, policy[s], rnd);
      const target = reward(w, s, to) + (isTerminal(w, to) ? 0 : APPROX_GAMMA * model.value(to));
      sgd.step(model, [{ x: features(s), y: target }]);
      done++;
      s = to;
    }
  }
  const estimate = Array.from({ length: STATES }, (_, s) => (live.includes(s) ? model.value(s) : 0));
  const rmse = Math.sqrt(live.reduce((sum, s) => sum + (estimate[s] - solved.V[s]) ** 2, 0) / live.length);
  return { weights: [...model.params], estimate, truth: solved.V, rmse, planeRmse: bestPlane(w, solved.V).rmse };
}

/** Table sizes: one entry per state, and a state is the cell times two for every yes/no flag the world carries. */
export const stateCount = (cells: number, flags: number): number => cells * 2 ** flags;
export const TABLE_ROWS: readonly { label: string; cells: number; flags: number }[] = [
  { label: 'This 6 x 5 grid', cells: 30, flags: 0 },
  { label: '6 x 5 grid with a key to carry', cells: 30, flags: 1 },
  { label: '20 x 20 grid', cells: 400, flags: 0 },
  { label: '20 x 20 grid, a key and 3 doors', cells: 400, flags: 4 },
];
