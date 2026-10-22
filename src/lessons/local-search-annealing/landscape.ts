import { mulberry32, type Rnd } from '../../core/random';

/** A 20-cell teaching landscape: lower is better. Local minimum at cell 4 (both neighbours 3), global minimum at cell 11. */
export const LANDSCAPE: readonly number[] = [6, 5, 4, 3, 2, 3, 5, 4, 3, 2, 1, 0, 1, 2, 3, 4, 5, 6, 7, 8];
export const CELLS = LANDSCAPE.length;
export const GLOBAL_CELL = 11;
export const LOCAL_CELL = 4;
export const RIDGE_CELL = 6;

export type Mode = 'hill' | 'anneal';

export interface Schedule {
  /** Starting temperature. */
  t0: number;
  /** Cooling factor applied once per step. */
  alpha: number;
  steps: number;
}

export const DEFAULT_SCHEDULE: Schedule = { t0: 4, alpha: 0.998, steps: 2000 };
/** Quench: annealing with no temperature to speak of. */
export const QUENCH_T0 = 0.05;
export const QUENCH_SCHEDULE: Schedule = { ...DEFAULT_SCHEDULE, t0: QUENCH_T0 };
export const LIMITS = {
  start: { min: 0, max: CELLS - 1 },
  t0: { min: 0.05, max: 8, step: 0.05 },
  alpha: { min: 0.95, max: 0.999, step: 0.001 },
  steps: { min: 100, max: 4000, step: 100 },
} as const;

/** The first draw of the lesson's pinned seeds: scene 1 starts here. */
export const DEFAULT_START = 2;
/** The seed at which the default annealing run from cell 2 climbs the ridge and ends at cell 11. */
export const DEFAULT_SEED = 1;

/** From `start`, repeatedly move to the better neighbour (the lower index on a tie) until neither neighbour is better. */
export function steepestDescent(start: number): number {
  let cell = start;
  for (;;) {
    const options = [cell - 1, cell + 1].filter((c) => c >= 0 && c < CELLS);
    const best = options.reduce((a, b) => (LANDSCAPE[b] < LANDSCAPE[a] ? b : a));
    if (LANDSCAPE[best] < LANDSCAPE[cell]) cell = best;
    else return cell;
  }
}

/** Hill climbing from each of the 20 starts: how many reach the global minimum (exact, no randomness). */
export function exactHillClimbing(): { successes: number; total: number; ends: number[] } {
  const ends = Array.from({ length: CELLS }, (_, start) => steepestDescent(start));
  return { successes: ends.filter((e) => e === GLOBAL_CELL).length, total: CELLS, ends };
}

/** Probability of accepting a move that changes the score by `delta` (positive = worse) at temperature `t`. */
export const acceptProbability = (delta: number, t: number): number => (delta <= 0 ? 1 : Math.exp(-delta / t));

export function formatProbability(p: number): string {
  if (p >= 0.001) return `${(p * 100).toFixed(1)}%`;
  return p.toExponential(1);
}

export interface Chain {
  /** `cells[k]` is the position after k steps (`cells[0]` is the start). */
  cells: number[];
  /** The temperature used at each step (0 for hill climbing). */
  temps: number[];
  /** Steps on which a worse cell was accepted. */
  uphill: number;
  start: number;
}

/** One Metropolis chain from `start` with the seeded stream `rnd`: propose left or right, accept if not worse, else with probability e^(-delta/T). */
export function runChainWith(rnd: Rnd, start: number, mode: Mode, schedule: Schedule): Chain {
  const cells = [start];
  const temps: number[] = [];
  let cell = start;
  let uphill = 0;
  let t = schedule.t0;
  for (let k = 0; k < schedule.steps; k++) {
    const proposal = cell + (rnd() < 0.5 ? -1 : 1);
    temps.push(mode === 'hill' ? 0 : t);
    if (proposal >= 0 && proposal < CELLS) {
      const delta = LANDSCAPE[proposal] - LANDSCAPE[cell];
      if (delta <= 0) {
        cell = proposal;
      } else if (mode === 'anneal' && rnd() < Math.exp(-delta / t)) {
        cell = proposal;
        uphill++;
      }
    }
    cells.push(cell);
    t *= schedule.alpha;
  }
  return { cells, temps, uphill, start };
}

export const runChain = (seed: number, start: number, mode: Mode, schedule: Schedule): Chain => runChainWith(mulberry32(seed), start, mode, schedule);

/** A run for the 1,000-seed scene: the seed picks the start cell (first draw) and then drives the chain. */
export function runFromRandomStart(seed: number, mode: Mode, schedule: Schedule): Chain {
  const rnd = mulberry32(seed);
  const start = Math.floor(rnd() * CELLS);
  return runChainWith(rnd, start, mode, schedule);
}

export const finalCell = (c: Chain): number => c.cells[c.cells.length - 1];
/** The first lowest cell the chain visited. */
export const bestCell = (c: Chain, upTo = c.cells.length - 1): number =>
  c.cells.slice(0, upTo + 1).reduce((best, cell) => (LANDSCAPE[cell] < LANDSCAPE[best] ? cell : best));

export const SEED_WINDOW = 1000;

export interface Batch {
  runs: number;
  successes: number;
  /** Histogram of end cells, indexed by cell. */
  ends: number[];
  /** The lowest seed whose run did not end at the global minimum, with where it started and ended. */
  firstFailure: { seed: number; start: number; end: number } | null;
}

/** Run `count` seeded runs (seeds `first` to `first + count - 1`) from random starts and count how many end at the global minimum. */
export function runBatch(first: number, count: number, mode: Mode, schedule: Schedule): Batch {
  const ends = new Array<number>(CELLS).fill(0);
  let successes = 0;
  let firstFailure: Batch['firstFailure'] = null;
  for (let i = 0; i < count; i++) {
    const seed = first + i;
    const chain = runFromRandomStart(seed, mode, schedule);
    const end = finalCell(chain);
    ends[end]++;
    if (end === GLOBAL_CELL) successes++;
    else firstFailure ??= { seed, start: chain.start, end };
  }
  return { runs: count, successes, ends, firstFailure };
}

const Z95 = 1.96;

/** The Wilson 95% interval for `successes` of `n`. */
export function wilsonInterval(successes: number, n: number): { low: number; high: number } {
  if (n === 0) return { low: 0, high: 1 };
  const p = successes / n;
  const z2 = Z95 * Z95;
  const centre = (p + z2 / (2 * n)) / (1 + z2 / n);
  const half = (Z95 * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / (1 + z2 / n);
  return { low: Math.max(0, centre - half), high: Math.min(1, centre + half) };
}

// Scene 3: the exact stationary distribution

/** The exact Boltzmann distribution over the cells at temperature `t`. */
export function boltzmann(t: number): number[] {
  const w = LANDSCAPE.map((f) => Math.exp(-f / t));
  const z = w.reduce((a, b) => a + b, 0);
  return w.map((x) => x / z);
}

/** The Metropolis transition matrix: left or right with probability 1/2, an out-of-range proposal stays put, worse moves accepted with e^(-delta/t). */
export function transitionMatrix(t: number): number[][] {
  const p = Array.from({ length: CELLS }, () => new Array<number>(CELLS).fill(0));
  for (let c = 0; c < CELLS; c++) {
    for (const n of [c - 1, c + 1]) {
      if (n < 0 || n >= CELLS) {
        p[c][c] += 0.5;
        continue;
      }
      const a = acceptProbability(LANDSCAPE[n] - LANDSCAPE[c], t);
      p[c][n] += 0.5 * a;
      p[c][c] += 0.5 * (1 - a);
    }
  }
  return p;
}

const multiply = (a: number[][], b: number[][]): number[][] => a.map((row) => b[0].map((_, j) => row.reduce((s, v, k) => s + v * b[k][j], 0)));

/** Where the chain is after `2^squarings` steps from the uniform start: repeated squaring of the transition matrix. */
export function distributionAfter(t: number, squarings: number): number[] {
  let m = transitionMatrix(t);
  for (let i = 0; i < squarings; i++) m = multiply(m, m);
  const start = new Array<number>(CELLS).fill(1 / CELLS);
  return start.map((_, j) => start.reduce((s, v, k) => s + v * m[k][j], 0));
}

/** Squarings that carry the chain to its stationary distribution at the temperatures the lesson offers (2^24 steps; more squarings only add rounding error). */
export const CONVERGE_SQUARINGS = 24;

/** Share of a long seeded run spent in each cell. */
export function occupancy(seed: number, t: number, steps: number, start = GLOBAL_CELL): number[] {
  const rnd = mulberry32(seed);
  const counts = new Array<number>(CELLS).fill(0);
  let cell = start;
  for (let k = 0; k < steps; k++) {
    const proposal = cell + (rnd() < 0.5 ? -1 : 1);
    if (proposal >= 0 && proposal < CELLS) {
      const delta = LANDSCAPE[proposal] - LANDSCAPE[cell];
      if (delta <= 0 || rnd() < Math.exp(-delta / t)) cell = proposal;
    }
    counts[cell]++;
  }
  return counts.map((c) => c / steps);
}
