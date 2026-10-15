/**
 * Markov chains, pure: a row-stochastic transition matrix and its editing rules, the stationary
 * distribution (two ways), how fast a start distribution forgets (the second eigenvalue of a 3-state
 * chain), the seeded walk, and the structure that decides whether a chain settles (communicating
 * classes, closed classes, period).
 */
import { clamp01 } from '../../core/math';
import { eigen2x2, powerIteration, transpose } from '../../core/linalg';
import { mulberry32 } from '../../core/random';
import type { Result } from '../../core/result';
import { stronglyConnectedComponents } from '../../core/scc';
import { solve, type Mat } from '../../core/vec';

export type Matrix = number[][];

export const WEATHER_STATES = ['Sunny', 'Cloudy', 'Rainy'] as const;
/** The default chain: Sunny stays sunny, Cloudy and Rainy lean toward Cloudy and Rainy. Invented numbers. */
export const WEATHER: Matrix = [
  [0.8, 0.15, 0.05],
  [0.3, 0.5, 0.2],
  [0.2, 0.3, 0.5],
];

/** A row sums to 1 within this much. */
export const ROW_TOLERANCE = 1e-12;

export const rowSum = (row: readonly number[]): number => row.reduce((s, x) => s + x, 0);
export const isRowStochastic = (P: Mat): boolean => P.every((row) => row.every((x) => x >= 0) && Math.abs(rowSum(row) - 1) <= ROW_TOLERANCE);

// ── Editing a row ────────────────────────────────────────────────────

/**
 * Sets P[row][col] to `value` (clamped to 0-1) and rescales the rest of that row so it still sums to 1,
 * keeping their ratios (shared out equally when the rest were all zero). Nothing is rounded.
 */
export function setEntry(P: Mat, row: number, col: number, value: number): Matrix {
  const v = clamp01(value);
  const r = P[row];
  const rest = r.reduce((s, x, j) => (j === col ? s : s + x), 0);
  const next = r.map((x, j) => {
    if (j === col) return v;
    return rest > 0 ? (x / rest) * (1 - v) : (1 - v) / (r.length - 1);
  });
  return P.map((old, i) => (i === row ? next : [...old]));
}

/** A typed row: every entry clamped to 0-1, then scaled to sum 1. A row of zeros is refused. */
export function normaliseRow(raw: readonly number[]): Result<number[]> {
  const clamped = raw.map((x) => (Number.isFinite(x) ? clamp01(x) : 0));
  const total = rowSum(clamped);
  if (total <= 0) return { ok: false, error: 'A row must sum to 1: give the state somewhere to go.' };
  return { ok: true, value: clamped.map((x) => x / total) };
}

/** Numbers typed for one row ("0.8, 0.15, 0.05"), one per state, read as plain decimals, then normalised. */
export function parseRow(text: string, states: number): Result<number[]> {
  const parts = text.split(/[\s,;]+/).filter(Boolean);
  if (parts.length !== states) return { ok: false, error: `Type ${states} numbers, one for each state.` };
  const nums = parts.map((p) => (/^\d*\.?\d+$|^\d+\.$/.test(p) ? Number(p) : NaN));
  if (nums.some(Number.isNaN)) return { ok: false, error: 'Use plain numbers from 0 to 1, like 0.25.' };
  return normaliseRow(nums);
}

export const withRow = (P: Mat, row: number, values: readonly number[]): Matrix => P.map((old, i) => (i === row ? [...values] : [...old]));

// ── The stationary distribution ──────────────────────────────────────

/** One step of the distribution: mu P. */
export const stepDistribution = (P: Mat, mu: readonly number[]): number[] => mu.map((_, j) => mu.reduce((s, m, i) => s + m * P[i][j], 0));

/** The distribution after t steps from mu0. */
export function distributionAt(P: Mat, mu0: readonly number[], t: number): number[] {
  let mu = [...mu0];
  for (let k = 0; k < t; k++) mu = stepDistribution(P, mu);
  return mu;
}

/** pi from power iteration on P transposed with the sum-to-1 norm, from the uniform start. It settles only for an aperiodic chain with one closed class. */
export function stationaryPower(P: Mat, iters = 500): number[] {
  const n = P.length;
  const steps = powerIteration(transpose(P), { iters, norm: 'l1', start: new Array<number>(n).fill(1 / n) });
  return steps[steps.length - 1].v;
}

/**
 * pi by a direct solve: (P^T - I) pi = 0 with its last equation replaced by "pi sums to 1". Null when
 * that system is singular, which happens when the stationary distribution is not unique.
 */
export function stationarySolve(P: Mat): number[] | null {
  const n = P.length;
  const A = transpose(P).map((row, i) => row.map((x, j) => (i === n - 1 ? 1 : x - (i === j ? 1 : 0))));
  const b = Array.from({ length: n }, (_, i) => (i === n - 1 ? 1 : 0));
  const pi = solve(A, b);
  return pi && pi.every((x) => x >= -1e-9) ? pi.map((x) => Math.max(0, x)) : null;
}

export const totalVariation = (a: readonly number[], b: readonly number[]): number => a.reduce((s, x, i) => s + Math.abs(x - b[i]), 0) / 2;

/** pi P - pi, the largest absolute entry: how far a vector is from stationary. */
export const stationaryResidual = (P: Mat, pi: readonly number[]): number => Math.max(...stepDistribution(P, pi).map((x, i) => Math.abs(x - pi[i])));

// ── How fast it forgets: the second eigenvalue of a 3-state chain ────

export type Lambdas =
  | { kind: 'real'; l2: number; l3: number; tr: number; det: number; slem: number }
  | { kind: 'complex'; re: number; im: number; modulus: number; tr: number; det: number; slem: number };

const det3 = (P: Mat): number =>
  P[0][0] * (P[1][1] * P[2][2] - P[1][2] * P[2][1]) - P[0][1] * (P[1][0] * P[2][2] - P[1][2] * P[2][0]) + P[0][2] * (P[1][0] * P[2][1] - P[1][1] * P[2][0]);

/**
 * The eigenvalues of a 3-state stochastic matrix: 1, and the two roots of x^2 - (tr - 1) x + det = 0
 * (they sum to tr - 1 and multiply to det because the third root is 1). A negative discriminant gives
 * a complex pair, whose modulus is sqrt(det). `slem` is the larger modulus: the decay rate.
 */
export function secondEigenvalues(P: Mat): Lambdas {
  if (P.length !== 3) throw new RangeError('secondEigenvalues is for a 3-state chain');
  const tr = P[0][0] + P[1][1] + P[2][2];
  const det = det3(P);
  const e = eigen2x2([[tr - 1, -det], [1, 0]]);
  if (e && e.kind === 'complex') {
    const modulus = Math.hypot(e.values[0].re, e.values[0].im);
    return { kind: 'complex', re: e.values[0].re, im: e.values[0].im, modulus, tr, det, slem: modulus };
  }
  // A repeated root (disc = 0) comes back null (a defective companion matrix): both roots are (tr - 1) / 2.
  const [l2, l3] = e && e.kind === 'real' ? e.values : [(tr - 1) / 2, (tr - 1) / 2];
  return { kind: 'real', l2, l3, tr, det, slem: Math.max(Math.abs(l2), Math.abs(l3)) };
}

/** The distance to pi is followed for this many steps. */
export const FORGET_STEPS = 40;
/** The |lambda|^t guide is drawn through the measured distance at this step. */
export const GUIDE_ANCHOR = 5;
/** A log axis has no zero: distances below this are drawn at it. */
export const DISTANCE_FLOOR = 1e-12;
/** The guide is only drawn when the measured distance it passes through is above this. */
export const GUIDE_MIN_ANCHOR = 1e-9;

/** Total variation distance from pi at each step 0..steps, starting from mu0. */
export function tvSeries(P: Mat, mu0: readonly number[], pi: readonly number[], steps: number): number[] {
  const out: number[] = [];
  let mu = [...mu0];
  for (let k = 0; k <= steps; k++) {
    out.push(totalVariation(mu, pi));
    mu = stepDistribution(P, mu);
  }
  return out;
}

/** The guide anchor * slem^(t - anchorStep) at each step, or null when the measured point it passes through is too small to mean anything. */
export function guideSeries(series: readonly number[], slem: number, anchorStep = GUIDE_ANCHOR): number[] | null {
  const anchor = series[anchorStep];
  if (anchor === undefined || anchor <= GUIDE_MIN_ANCHOR) return null;
  return series.map((_, k) => Math.max(DISTANCE_FLOOR, anchor * slem ** (k - anchorStep)));
}

// ── The seeded walk ──────────────────────────────────────────────────

export const WALK_MAX = 100_000;
export const WALK_SEED = 7;

/** The state at each of `steps` steps (index 0 is the start), drawn by mulberry32(seed). */
export function walk(P: Mat, start: number, seed: number, steps: number): Uint8Array {
  const rnd = mulberry32(seed);
  const path = new Uint8Array(steps + 1);
  path[0] = start;
  let at = start;
  for (let k = 1; k <= steps; k++) {
    const u = rnd();
    let acc = 0;
    let next = P[at].length - 1;
    for (let j = 0; j < P[at].length; j++) {
      acc += P[at][j];
      if (u < acc) {
        next = j;
        break;
      }
    }
    path[k] = next;
    at = next;
  }
  return path;
}

/** The fraction of steps 1..t spent in each state (all zeros before any step). */
export function visitFractions(path: Uint8Array, t: number, states: number): number[] {
  const counts = new Array<number>(states).fill(0);
  for (let k = 1; k <= t; k++) counts[path[k]]++;
  return counts.map((c) => (t > 0 ? c / t : 0));
}

// ── Structure: does it settle? ───────────────────────────────────────

const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));

export interface Analysis {
  /** Communicating classes, as sorted state lists. */
  classes: number[][];
  /** For each class: nothing leaves it. */
  closed: boolean[];
  /** The classes nothing leaves, with the period of each (1 is aperiodic). */
  closedClasses: { states: number[]; period: number }[];
  /** States that lead out of their class, with positive chance of never returning. */
  transient: number[];
  /** States with P[i][i] = 1. */
  absorbing: number[];
  irreducible: boolean;
  /** Period of the whole chain when irreducible, else null. */
  period: number | null;
  /** Irreducible and aperiodic (and finite, as every chain here is): one distribution, from any start. */
  ergodic: boolean;
  /** A single closed class, so exactly one stationary distribution. */
  uniqueStationary: boolean;
  /** Every closed class is aperiodic, so the distribution settles from any start (to a limit that may depend on the start). */
  settles: boolean;
}

/** The period of a set of states closed under reachability: the gcd of (level[u] + 1 - level[v]) over the edges inside it. */
function classPeriod(P: Mat, states: readonly number[]): number {
  const level = new Map<number, number>([[states[0], 0]]);
  const queue = [states[0]];
  for (let head = 0; head < queue.length; head++) {
    const u = queue[head];
    for (const v of states) {
      if (P[u][v] > 0 && !level.has(v)) {
        level.set(v, level.get(u)! + 1);
        queue.push(v);
      }
    }
  }
  let g = 0;
  for (const u of states) for (const v of states) if (P[u][v] > 0) g = gcd(g, level.get(u)! + 1 - level.get(v)!);
  return g === 0 ? 1 : g;
}

export function analyse(P: Mat): Analysis {
  const n = P.length;
  const edges: [number, number][] = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (P[i][j] > 0) edges.push([i, j]);
  const { components, comp } = stronglyConnectedComponents(n, edges);
  const classes = components.map((c) => [...c].sort((a, b) => a - b));
  const closed = classes.map((_, k) => !edges.some(([a, b]) => comp[a] === k && comp[b] !== k));
  const closedClasses = classes.flatMap((states, k) => (closed[k] ? [{ states, period: classPeriod(P, states) }] : []));
  const absorbing = P.flatMap((row, i) => (row[i] === 1 ? [i] : []));
  const irreducible = classes.length === 1;
  const period = irreducible ? classPeriod(P, classes[0]) : null;
  return {
    classes,
    closed,
    closedClasses,
    transient: classes.flatMap((states, k) => (closed[k] ? [] : states)),
    absorbing,
    irreducible,
    period,
    ergodic: irreducible && period === 1,
    uniqueStationary: closedClasses.length === 1,
    settles: closedClasses.every((c) => c.period === 1),
  };
}

// ── The failure presets (scene 3) ────────────────────────────────────

export interface Preset {
  id: 'weather' | 'periodic' | 'absorbing' | 'reducible';
  label: string;
  states: string[];
  P: Matrix;
}

export const PRESETS: readonly Preset[] = [
  { id: 'weather', label: 'Weather (settles)', states: [...WEATHER_STATES], P: WEATHER },
  { id: 'periodic', label: 'Periodic', states: ['A', 'B'], P: [[0, 1], [1, 0]] },
  { id: 'absorbing', label: 'Absorbing state', states: ['A', 'B', 'C'], P: [[0.5, 0.5, 0], [0.3, 0.2, 0.5], [0, 0, 1]] },
  { id: 'reducible', label: 'Two closed classes', states: ['A', 'B', 'C', 'D'], P: [[0.7, 0.3, 0, 0], [0.4, 0.6, 0, 0], [0, 0, 0.5, 0.5], [0, 0, 0.2, 0.8]] },
];

/** The states reachable from `start` in zero or more steps (a state with no way to get there from the start is never visited). */
export function reachableFrom(P: Mat, start: number): Set<number> {
  const seen = new Set([start]);
  const queue = [start];
  for (let head = 0; head < queue.length; head++) {
    P[queue[head]].forEach((p, j) => {
      if (p > 0 && !seen.has(j)) {
        seen.add(j);
        queue.push(j);
      }
    });
  }
  return seen;
}

/** The distribution that puts all its mass on one state. */
export const pointMass = (n: number, state: number): number[] => Array.from({ length: n }, (_, i) => (i === state ? 1 : 0));

/** Start distributions the forgetting scene offers: each state, and an even mix. */
export function startDistribution(n: number, start: number | 'even'): number[] {
  return start === 'even' ? new Array<number>(n).fill(1 / n) : pointMass(n, start);
}
