/**
 * Estimation: the cone, summed task estimates under a log-normal model, three-point estimates and a calibration
 * game. Pure and seeded. Every duration here is invented ("illustrative"): the log-normal shape is an assumption,
 * not a measurement of real work.
 */
import { lognormalCdf, normal, normalQuantile, quantile } from '../../core/distributions';
import { choose } from '../../core/stats';
import { mulberry32 } from '../../core/random';
import { parseBoundedInt, type FieldParse } from '../../core/parse';

// ---------------------------------------------------------------- scene 1: the cone

export interface ConePhase {
  id: string;
  label: string;
  short: string;
  /** Estimate as a multiple of the final outcome: the low and high edge of the band. */
  low: number;
  high: number;
}

/** Boehm's cone as popularised by McConnell (research finding, from memory): the band at each phase. */
export const CONE_PHASES: readonly ConePhase[] = [
  { id: 'concept', label: 'Initial concept', short: 'Concept', low: 0.25, high: 4 },
  { id: 'product', label: 'Approved product definition', short: 'Product def.', low: 0.5, high: 2 },
  { id: 'requirements', label: 'Requirements complete', short: 'Requirements', low: 0.67, high: 1.5 },
  { id: 'ui', label: 'UI design complete', short: 'UI design', low: 0.8, high: 1.25 },
  { id: 'detailed', label: 'Detailed design complete', short: 'Detailed design', low: 0.9, high: 1.1 },
];

/** The band at a phase position (0 = first phase), straight lines between phases. */
export function coneAt(x: number): { low: number; high: number } {
  const last = CONE_PHASES.length - 1;
  const t = Math.min(Math.max(x, 0), last);
  const i = Math.min(Math.floor(t), last - 1);
  const f = t - i;
  const a = CONE_PHASES[i];
  const b = CONE_PHASES[i + 1];
  return { low: a.low + f * (b.low - a.low), high: a.high + f * (b.high - a.high) };
}

/** Width of the band at a phase: how many times larger the high edge is than the low edge. */
export const bandRatio = (p: ConePhase): number => p.high / p.low;

export type OutcomeModel = 'cone' | 'flat';

export const OUTCOME_MODELS: { value: OutcomeModel; label: string }[] = [
  { value: 'cone', label: 'If the cone is followed' },
  { value: 'flat', label: 'If nothing narrows' },
];

export const POINTS_PER_PHASE = 12;
export const CONE_SEED = 11;
const JITTER = 0.3;

export interface OutcomePoint {
  /** Phase position with a little horizontal jitter, so the points do not sit in a line. */
  x: number;
  phase: number;
  /** Estimate as a multiple of the final outcome. */
  ratio: number;
}

/**
 * Toy outcomes: at each phase a project's estimate-to-actual ratio is drawn log-uniformly from a range. "cone":
 * the range is that phase's own band. "flat": the first phase's band at every phase (nothing learned narrows it).
 */
export function outcomePoints(model: OutcomeModel, seed = CONE_SEED): OutcomePoint[] {
  const rnd = mulberry32(seed);
  const out: OutcomePoint[] = [];
  CONE_PHASES.forEach((p, phase) => {
    const band = model === 'cone' ? p : CONE_PHASES[0];
    for (let k = 0; k < POINTS_PER_PHASE; k++) {
      const ratio = Math.exp(Math.log(band.low) + rnd() * (Math.log(band.high) - Math.log(band.low)));
      out.push({ x: phase + (rnd() * 2 - 1) * JITTER, phase, ratio });
    }
  });
  return out;
}

/** How many points sit outside the cone's band at their own phase. */
export const outsideCone = (points: readonly OutcomePoint[]): number =>
  points.filter((pt) => pt.ratio < CONE_PHASES[pt.phase].low || pt.ratio > CONE_PHASES[pt.phase].high).length;

// ---------------------------------------------------------------- scene 2: summed tasks

export const RUNS = 10_000;
export const MAX_TASKS = 12;
export const MIN_TASKS = 2;
/** Invented task medians in days, in the order tasks are added. */
export const TASK_MEDIANS: readonly number[] = [3, 5, 2, 8, 4, 6, 3, 5, 7, 2, 4, 6];
export const SPREAD = { min: 0.2, max: 1, step: 0.1 };
export const CORRELATION = { min: 0, max: 0.9, step: 0.1 };
/** The deadline opens on the sum of the first eight medians, so the first thing it reads is the chance that adding medians is enough. */
export const SUM_DEFAULT = { n: 8, sigma: 0.6, rho: 0, seed: 7, deadline: TASK_MEDIANS.slice(0, 8).reduce((a, b) => a + b, 0) };
export const DEADLINE = { min: 10, max: 150, step: 1 };

export type Statistic = 'mode' | 'median' | 'mean';
export const STATISTICS: { value: Statistic; label: string }[] = [
  { value: 'mode', label: 'Most likely (mode)' },
  { value: 'median', label: 'Median (50/50)' },
  { value: 'mean', label: 'Mean' },
];

/** Log-normal closed forms for a task with median m and log-spread sigma. */
export const modeOf = (m: number, sigma: number) => m * Math.exp(-sigma * sigma);
export const meanOf = (m: number, sigma: number) => m * Math.exp((sigma * sigma) / 2);
export const statisticOf = (s: Statistic, m: number, sigma: number) => (s === 'mode' ? modeOf(m, sigma) : s === 'median' ? m : meanOf(m, sigma));

export interface SumSpec {
  /** One task median per task: the first `n` of TASK_MEDIANS by default. */
  medians: readonly number[];
  sigma: number;
  rho: number;
  seed: number;
}

export const sumSpec = (n: number, sigma: number, rho: number, seed: number): SumSpec => ({ medians: TASK_MEDIANS.slice(0, n), sigma, rho, seed });

interface Normals {
  shared: Float64Array;
  each: Float64Array;
}

let cached: { seed: number; normals: Normals } | null = null;

/** The standard normals behind every run for a seed: one shared factor per run and one per task per run. Kept for the last seed. */
function normalsFor(seed: number): Normals {
  if (cached?.seed === seed) return cached.normals;
  const rnd = mulberry32(seed);
  const shared = new Float64Array(RUNS);
  const each = new Float64Array(RUNS * MAX_TASKS);
  for (let r = 0; r < RUNS; r++) {
    shared[r] = normal(rnd);
    for (let i = 0; i < MAX_TASKS; i++) each[r * MAX_TASKS + i] = normal(rnd);
  }
  cached = { seed, normals: { shared, each } };
  return cached.normals;
}

export interface SumRun {
  /** The project total in days, sorted, one per run. */
  sorted: number[];
  mean: number;
  sd: number;
}

/** log d_i = ln m_i + sigma (sqrt(rho) Z + sqrt(1 - rho) e_i); the total is the sum of the d_i. */
export function simulateTotal(spec: SumSpec): SumRun {
  const { shared, each } = normalsFor(spec.seed);
  const a = Math.sqrt(spec.rho);
  const b = Math.sqrt(1 - spec.rho);
  const logs = spec.medians.map(Math.log);
  const totals = new Array<number>(RUNS);
  for (let r = 0; r < RUNS; r++) {
    let t = 0;
    for (let i = 0; i < logs.length; i++) t += Math.exp(logs[i] + spec.sigma * (a * shared[r] + b * each[r * MAX_TASKS + i]));
    totals[r] = t;
  }
  const mean = totals.reduce((s, x) => s + x, 0) / RUNS;
  const sd = Math.sqrt(totals.reduce((s, x) => s + (x - mean) ** 2, 0) / (RUNS - 1));
  return { sorted: totals.sort((x, y) => x - y), mean, sd };
}

/** Share of runs that finish by `days`. */
export function chanceBy(run: SumRun, days: number): number {
  let lo = 0;
  let hi = run.sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (run.sorted[mid] <= days) lo = mid + 1;
    else hi = mid;
  }
  return lo / run.sorted.length;
}

export const percentileOf = (run: SumRun, p: number): number => quantile(run.sorted, p);

export interface SumFacts {
  sumModes: number;
  sumMedians: number;
  sumMeans: number;
  p50: number;
  p80: number;
  p90: number;
}

export function sumFacts(spec: SumSpec, run: SumRun): SumFacts {
  const total = (s: Statistic) => spec.medians.reduce((acc, m) => acc + statisticOf(s, m, spec.sigma), 0);
  return { sumModes: total('mode'), sumMedians: total('median'), sumMeans: total('mean'), p50: percentileOf(run, 0.5), p80: percentileOf(run, 0.8), p90: percentileOf(run, 0.9) };
}

/** Standard deviation of a sum of independent log-normal tasks, closed form: var = m^2 e^(s^2) (e^(s^2) - 1) per task. */
export const independentSd = (medians: readonly number[], sigma: number): number =>
  Math.sqrt(medians.reduce((acc, m) => acc + m * m * Math.exp(sigma * sigma) * (Math.exp(sigma * sigma) - 1), 0));

/** Relative spread (sd over mean) of one log-normal task, closed form. */
export const taskRelativeSpread = (sigma: number) => Math.sqrt(Math.exp(sigma * sigma) - 1);

// ---------------------------------------------------------------- scene 3: three-point estimates

export const THREE_POINT_DEFAULT = { optimistic: 3, likely: 5, pessimistic: 13 };
export const DAYS = { min: 1, max: 60 };
export const THREE_POINT_SEED = 3;
/** The assumption behind the fit: optimistic is read as the 5th percentile and pessimistic as the 95th. */
export const FIT_LOW = 0.05;
export const FIT_HIGH = 0.95;

export interface ThreePoint {
  optimistic: number;
  likely: number;
  pessimistic: number;
}

const FIELD_NAMES = { optimistic: 'Optimistic', likely: 'Most likely', pessimistic: 'Pessimistic' } as const;

export const parseDays = (text: string, field: keyof ThreePoint): FieldParse<number> =>
  parseBoundedInt(text, {
    min: DAYS.min,
    max: DAYS.max,
    messages: {
      empty: `${FIELD_NAMES[field]}: type a whole number of days.`,
      invalid: () => `${FIELD_NAMES[field]}: type a whole number of days, like 5.`,
      tooSmall: () => `${FIELD_NAMES[field]}: use at least ${DAYS.min} day.`,
      tooBig: () => `${FIELD_NAMES[field]}: use at most ${DAYS.max} days.`,
    },
  });

/** Optimistic <= most likely <= pessimistic, and a real range; the refusal names the value that is out of order. */
export function checkOrder(t: ThreePoint): string | null {
  if (t.optimistic > t.likely) return `Optimistic (${t.optimistic}) is larger than most likely (${t.likely}): optimistic should be the smallest.`;
  if (t.likely > t.pessimistic) return `Most likely (${t.likely}) is larger than pessimistic (${t.pessimistic}): pessimistic should be the largest.`;
  if (t.optimistic === t.pessimistic) return `Optimistic and pessimistic are both ${t.optimistic}: there is no range to fit.`;
  return null;
}

/** The PERT convention: mean (O + 4M + P) / 6 and spread (P - O) / 6. */
export const pert = (t: ThreePoint) => ({ mean: (t.optimistic + 4 * t.likely + t.pessimistic) / 6, sd: (t.pessimistic - t.optimistic) / 6 });

/** The log-normal whose 5th and 95th percentiles are the optimistic and pessimistic values. */
export function fitLogNormal(t: ThreePoint): { mu: number; sigma: number } {
  const zHigh = normalQuantile(FIT_HIGH);
  const mu = (Math.log(t.optimistic) + Math.log(t.pessimistic)) / 2;
  return { mu, sigma: (Math.log(t.pessimistic) - Math.log(t.optimistic)) / (2 * zHigh) };
}

export interface ThreePointResult {
  pert: { mean: number; sd: number; p80: number };
  fit: { mu: number; sigma: number; mean: number; median: number; mode: number; p80: number };
  /** Seeded draws from the fitted log-normal. */
  draws: number[];
  drawMean: number;
  drawP80: number;
}

export function threePointResult(t: ThreePoint, seed = THREE_POINT_SEED): ThreePointResult {
  const p = pert(t);
  const { mu, sigma } = fitLogNormal(t);
  const rnd = mulberry32(seed);
  const draws = Array.from({ length: RUNS }, () => Math.exp(mu + sigma * normal(rnd))).sort((a, b) => a - b);
  return {
    pert: { ...p, p80: p.mean + p.sd * normalQuantile(0.8) },
    fit: { mu, sigma, mean: Math.exp(mu + (sigma * sigma) / 2), median: Math.exp(mu), mode: Math.exp(mu - sigma * sigma), p80: Math.exp(mu + sigma * normalQuantile(0.8)) },
    draws,
    drawMean: draws.reduce((s, x) => s + x, 0) / RUNS,
    drawP80: quantile(draws, 0.8),
  };
}

/** Share of the fitted log-normal below a value (closed form). */
export const fitCdf = (t: ThreePoint, x: number): number => {
  const { mu, sigma } = fitLogNormal(t);
  return lognormalCdf(x, mu, sigma);
};

// ---------------------------------------------------------------- scene 4: calibration

export interface Quantity {
  id: string;
  label: string;
  /** Computed from an expression when the module loads, never typed. */
  value: number;
}

const primesBelow = (n: number): number => {
  const composite = new Array<boolean>(n).fill(false);
  let count = 0;
  for (let i = 2; i < n; i++) {
    if (composite[i]) continue;
    count++;
    for (let j = i * i; j < n; j += i) composite[j] = true;
  }
  return count;
};

const factorialNumber = (n: number): number => (n <= 1 ? 1 : n * factorialNumber(n - 1));

export const QUANTITIES: readonly Quantity[] = [
  { id: 'mib', label: 'Bytes in one mebibyte (MiB)', value: 2 ** 20 },
  { id: 'day-ms', label: 'Milliseconds in a day', value: 24 * 60 * 60 * 1000 },
  { id: 'hands', label: 'Different 5-card hands from a 52-card deck', value: Number(choose(52, 5)) },
  { id: 'u32', label: 'Different values a 32-bit unsigned integer can hold', value: 2 ** 32 },
  { id: 'leap', label: 'Seconds in a leap year', value: 366 * 24 * 60 * 60 },
  { id: 'orderings', label: 'Ways to put 8 different items in a row', value: factorialNumber(8) },
  { id: 'primes', label: 'Prime numbers below 1,000', value: primesBelow(1000) },
  { id: 'weeks', label: 'Weeks in one 400-year Gregorian cycle (146,097 days)', value: 146_097 / 7 },
];

export const CALIBRATION_LEVEL = 0.9;
export const GUESS_MAX = 1e12;

export const parseGuess = (text: string): FieldParse<number> =>
  parseBoundedInt(text, { min: 0, max: GUESS_MAX, thousands: true, messages: { empty: 'Type a whole number.', invalid: () => 'Type a whole number, with commas only between groups of three.' } });

export interface Guess {
  low: string;
  high: string;
}

export type RowState =
  | { kind: 'blank' }
  | { kind: 'refused'; reason: string }
  | { kind: 'answered'; low: number; high: number; hit: boolean };

/** One row, read from the two typed fields: a pair needs low <= high, and a half-typed pair is refused. */
export function readGuess(g: Guess, truth: number): RowState {
  if (g.low.trim() === '' && g.high.trim() === '') return { kind: 'blank' };
  const low = parseGuess(g.low);
  if (!low.ok) return { kind: 'refused', reason: `Low: ${low.error}` };
  const high = parseGuess(g.high);
  if (!high.ok) return { kind: 'refused', reason: `High: ${high.error}` };
  if (low.value > high.value) return { kind: 'refused', reason: `Low (${low.value.toLocaleString('en-US')}) is above high (${high.value.toLocaleString('en-US')}).` };
  return { kind: 'answered', low: low.value, high: high.value, hit: low.value <= truth && truth <= high.value };
}

export interface CalibrationScore {
  answered: number;
  hits: number;
  refused: number;
  /** Hits expected if the stated 90% ranges were calibrated, for the answered rows. */
  expected: number;
}

export function scoreCalibration(rows: readonly RowState[]): CalibrationScore {
  const answered = rows.filter((r) => r.kind === 'answered');
  return {
    answered: answered.length,
    hits: answered.filter((r) => r.hit).length,
    refused: rows.filter((r) => r.kind === 'refused').length,
    expected: answered.length * CALIBRATION_LEVEL,
  };
}

/** Chance of `held` or fewer of `rows` ranges holding the truth when each holds it with probability `p` (binomial lower tail). */
export function lowScoreChance(rows: number, held: number, p: number): number {
  let total = 0;
  let coefficient = 1;
  for (let k = 0; k <= Math.min(held, rows); k++) {
    total += coefficient * p ** k * (1 - p) ** (rows - k);
    coefficient = (coefficient * (rows - k)) / (k + 1);
  }
  return total;
}
