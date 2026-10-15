import { exponential } from '../../core/distributions';
import { parseBoundedInt, type FieldParse } from '../../core/parse';
import { mulberry32 } from '../../core/random';
import { percentile } from '../../core/sim';
import { createTickSim, type TickSim } from '../../core/simTick';
import { erlangC } from '../queueing-theory/model';

const MS_PER_S = 1000;

/* ---------- the service: c workers, each with mean service time S, behind one queue (M/M/c) ---------- */

export interface Service {
  /** Identical workers behind one queue. */
  workers: number;
  /** Mean service time of one request, ms (exponential). */
  serviceMs: number;
}

export const WORKERS_RANGE = { min: 1, max: 64, step: 1 } as const;
export const SERVICE_MS_RANGE = { min: 1, max: 2000, step: 1 } as const;
/** The latency objective the knee is defined against: p99 within this many ms (illustrative). */
export const SLO_MS = 300;
/** Requests that wait longer than this for a worker count as errors (a client timeout, illustrative). */
export const TIMEOUT_MS = 1000;
export const SERVICE_DEFAULT: Service = { workers: 8, serviceMs: 50 };

const serviceRate = (s: Service): number => MS_PER_S / s.serviceMs;
/** Requests per second the workers can finish at 100% busy: c / S. */
export const capacity = (s: Service): number => s.workers * serviceRate(s);

/* ---------- exact M/M/c results ---------- */

/** P(time in system > t seconds): wait plus service, from Erlang C. Needs λ < cμ. */
export function mmcSurvival(c: number, mu: number, lambda: number, t: number): number {
  if (t <= 0) return 1;
  const waits = erlangC(c, lambda / mu);
  const theta = c * mu - lambda;
  // At θ = μ the formula's fraction is 0/0; its limit gives (1 + C·μt)e^(−μt). (The spec writes (1 + μt)e^(−μt), which is the C = 1 case only.)
  if (Math.abs(mu - theta) < 1e-9 * mu) return (1 + waits * mu * t) * Math.exp(-mu * t);
  return (1 - waits) * Math.exp(-mu * t) + (waits * (mu * Math.exp(-theta * t) - theta * Math.exp(-mu * t))) / (mu - theta);
}

const QUANTILE_STEPS = 200;

/** The q-quantile of the time in system, in ms, by bisection on the survival function; null at or past capacity. */
export function latencyQuantileMs(s: Service, lambda: number, q: number): number | null {
  const mu = serviceRate(s);
  if (!(lambda < s.workers * mu)) return null;
  const target = 1 - q;
  let hi = 1 / mu;
  while (mmcSurvival(s.workers, mu, lambda, hi) > target) hi *= 2;
  let lo = 0;
  for (let i = 0; i < QUANTILE_STEPS; i++) {
    const mid = (lo + hi) / 2;
    if (mmcSurvival(s.workers, mu, lambda, mid) > target) lo = mid;
    else hi = mid;
  }
  return ((lo + hi) / 2) * MS_PER_S;
}

/** Mean wait in the queue, ms: C(c, a) / (cμ − λ). */
export function meanWaitMs(s: Service, lambda: number): number | null {
  const mu = serviceRate(s);
  if (!(lambda < s.workers * mu)) return null;
  return (erlangC(s.workers, lambda / mu) / (s.workers * mu - lambda)) * MS_PER_S;
}

/** P(wait > T): the chance an arrival waits at all, times e^(−(cμ − λ)T). The error rate of the timeout. */
export function errorRate(s: Service, lambda: number, timeoutMs: number): number | null {
  const mu = serviceRate(s);
  if (!(lambda < s.workers * mu)) return null;
  return erlangC(s.workers, lambda / mu) * Math.exp(-(s.workers * mu - lambda) * (timeoutMs / MS_PER_S));
}

/** The p99 of the time in system with no queueing at all: the service time's own tail, ln(100) × S. */
export const serviceOnlyP99Ms = (s: Service): number => Math.log(100) * s.serviceMs;

/**
 * The knee: the highest offered load (requests/s) at which the p99 stays within `sloMs`, found by bisection on the
 * exact p99. Null when even an empty service misses the objective (the service time alone is too slow).
 * It is defined by the objective, not found as a corner of a curve.
 */
export function kneeLoad(s: Service, sloMs: number): number | null {
  if (serviceOnlyP99Ms(s) >= sloMs) return null;
  let lo = 0;
  let hi = capacity(s);
  for (let i = 0; i < QUANTILE_STEPS; i++) {
    const mid = (lo + hi) / 2;
    const p99 = latencyQuantileMs(s, mid, 0.99);
    if (p99 !== null && p99 <= sloMs) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** The knee as a share of capacity: how hot the workers can run and still meet the objective. */
export function safeUtilisation(s: Service, sloMs: number): number | null {
  const knee = kneeLoad(s, sloMs);
  return knee === null ? null : knee / capacity(s);
}

/* ---------- the seeded load test ---------- */

export const TEST_JOBS = 20_000;

export interface LoadResult {
  /** Offered load, requests/s. */
  offered: number;
  /** Completed per second over the time the generator was sending. */
  throughput: number;
  p50Ms: number;
  p99Ms: number;
  /** Share of requests that waited longer than the timeout. */
  errors: number;
  meanSystemMs: number;
}

/** An open-loop test: arrivals are Poisson and do not wait for replies; each request takes the earliest-free worker (FIFO). */
export function simulateLoad(s: Service, offered: number, timeoutMs: number, jobs: number, seed: number): LoadResult {
  const rnd = mulberry32(seed);
  const mu = serviceRate(s);
  const free = new Float64Array(s.workers);
  const times = new Float64Array(jobs);
  const departures = new Float64Array(jobs);
  let t = 0;
  let late = 0;
  let sum = 0;
  for (let i = 0; i < jobs; i++) {
    t += exponential(rnd, offered);
    let w = 0;
    for (let k = 1; k < s.workers; k++) if (free[k] < free[w]) w = k;
    const start = Math.max(t, free[w]);
    const done = start + exponential(rnd, mu);
    free[w] = done;
    times[i] = done - t;
    departures[i] = done;
    sum += done - t;
    if (start - t > timeoutMs / MS_PER_S) late++;
  }
  let finished = 0;
  for (let i = 0; i < jobs; i++) if (departures[i] <= t) finished++;
  const sorted = Array.from(times).sort((a, b) => a - b);
  return {
    offered,
    throughput: finished / t,
    p50Ms: percentile(sorted, 0.5) * MS_PER_S,
    p99Ms: percentile(sorted, 0.99) * MS_PER_S,
    errors: late / jobs,
    meanSystemMs: (sum / jobs) * MS_PER_S,
  };
}

/** The ramp: offered load as a fraction of capacity, one steady level per tick. */
export const RAMP_LEVELS: readonly number[] = Array.from({ length: 15 }, (_, i) => (i + 1) / 10);
export const LEVEL_RANGE = { min: 0.1, max: 1.5, step: 0.05 } as const;
export const LEVEL_DEFAULT = 0.9;

export interface RampState {
  tick: number;
  points: LoadResult[];
}

export function createRamp(s: Service, timeoutMs: number, seed: number): TickSim<RampState> {
  return createTickSim<RampState>({
    seed,
    init: () => ({ tick: 0, points: [] }),
    step: (state, _rnd, tick) =>
      tick > RAMP_LEVELS.length
        ? { tick, points: state.points }
        : { tick, points: [...state.points, simulateLoad(s, RAMP_LEVELS[tick - 1] * capacity(s), timeoutMs, TEST_JOBS, seed + tick)] },
    check: (state) => (state.points.every((p) => Number.isFinite(p.offered)) ? null : 'the ramp drew a level that does not exist'),
  });
}

/** The ideal response to offered load: everything is served up to capacity, and the rest is not. */
export const achievedLoad = (s: Service, offered: number): number => Math.min(offered, capacity(s));

/* ---------- scene 2: headroom and forecast ---------- */

export type Redundancy = 'none' | 'n+1' | 'zone';
export const REDUNDANCY: readonly Redundancy[] = ['none', 'n+1', 'zone'];
export const REDUNDANCY_NAME: Record<Redundancy, string> = { none: 'none', 'n+1': 'N + 1', zone: 'lose one of three zones' };
export type Growth = 'compound' | 'linear';

export interface Plan {
  /** Current peak requests per second. */
  peak: number;
  /** Monthly growth, as a fraction (0.05 is 5%). */
  growth: number;
  growthKind: Growth;
  /** A one-month spike: its month (1 and up) and the factor on that month's peak (1 is no spike). */
  spikeMonth: number;
  spikeFactor: number;
  /** Instances bought, and the knee of each (requests/s at the objective). */
  instances: number;
  kneePerInstance: number;
  /** Share of capacity kept free on purpose (0.2 is 20% headroom). */
  headroom: number;
  redundancy: Redundancy;
  /** Weeks from ordering capacity to having it. */
  leadWeeks: number;
}

export const PEAK_BOUNDS = { min: 1, max: 10_000_000 } as const;
export const GROWTH_RANGE = { min: -0.2, max: 0.5, step: 0.01 } as const;
export const SPIKE_MONTH_RANGE = { min: 1, max: 24, step: 1 } as const;
export const SPIKE_FACTOR_RANGE = { min: 1, max: 3, step: 0.1 } as const;
export const INSTANCES_RANGE = { min: 1, max: 60, step: 1 } as const;
export const HEADROOM_RANGE = { min: 0, max: 0.5, step: 0.05 } as const;
export const LEAD_WEEKS_RANGE = { min: 0, max: 26, step: 1 } as const;
export const FORECAST_MONTHS = 24;
const WEEKS_PER_MONTH = 52 / 12;

export const KNEE_PER_INSTANCE = kneeLoad(SERVICE_DEFAULT, SLO_MS)!;

export const PLAN_DEFAULT: Plan = {
  peak: 1000, growth: 0.05, growthKind: 'compound', spikeMonth: 11, spikeFactor: 1.5, instances: 17, kneePerInstance: KNEE_PER_INSTANCE,
  headroom: 0.2, redundancy: 'n+1', leadWeeks: 8,
};

export const parsePeak = (text: string): FieldParse<number> =>
  parseBoundedInt(text, {
    min: PEAK_BOUNDS.min,
    max: PEAK_BOUNDS.max,
    thousands: true,
    messages: {
      empty: 'Type a peak in requests per second.',
      invalid: (typed) => `"${typed}" isn't a whole number of requests per second.`,
      tooSmall: () => 'A peak has to be at least 1 request per second.',
      tooBig: () => `A peak goes up to ${PEAK_BOUNDS.max.toLocaleString('en-US')} requests per second.`,
    },
  });

/** Instances left after the redundancy rule: N + 1 keeps one spare, and losing one of three zones keeps two thirds. */
export function usableInstances(plan: Plan): number {
  if (plan.redundancy === 'n+1') return Math.max(0, plan.instances - 1);
  if (plan.redundancy === 'zone') return (plan.instances * 2) / 3;
  return plan.instances;
}

/** Requests per second the plan can take: the knees of the usable instances, less the headroom kept free. */
export const planCapacity = (plan: Plan): number => plan.kneePerInstance * usableInstances(plan) * (1 - plan.headroom);

/** The trend's peak in month m (0 is now): compound (1 + g)^m or linear 1 + g·m. */
export const trendPeak = (plan: Plan, month: number): number =>
  plan.peak * (plan.growthKind === 'compound' ? (1 + plan.growth) ** month : Math.max(0, 1 + plan.growth * month));

/** The forecast peak in a whole month, with the one-month spike on top. */
export const forecastPeak = (plan: Plan, month: number): number => trendPeak(plan, month) * (month === plan.spikeMonth ? plan.spikeFactor : 1);

/** The month the trend alone reaches capacity, as a real number: ln(cap ÷ peak) ÷ ln(1 + g), or (cap ÷ peak − 1) ÷ g when linear. */
export function trendCrossing(plan: Plan): number | null {
  const cap = planCapacity(plan);
  if (plan.peak >= cap) return 0;
  if (plan.growth <= 0) return null;
  return plan.growthKind === 'compound' ? Math.log(cap / plan.peak) / Math.log(1 + plan.growth) : (cap / plan.peak - 1) / plan.growth;
}

export interface Crossing {
  /** The first whole month the forecast peak is at or over capacity, or null when it never is within the forecast. */
  month: number | null;
  cause: 'now' | 'trend' | 'spike' | null;
}

/** The first month over capacity: the trend's own crossing (rounded up to a month), or an earlier spike. */
export function firstCrossing(plan: Plan): Crossing {
  const trend = trendCrossing(plan);
  const trendMonth = trend === null ? null : Math.ceil(trend);
  const spikeOver = plan.spikeFactor > 1 && forecastPeak(plan, plan.spikeMonth) >= planCapacity(plan);
  if (trendMonth === 0) return { month: 0, cause: 'now' };
  if (spikeOver && (trendMonth === null || plan.spikeMonth < trendMonth)) return { month: plan.spikeMonth, cause: 'spike' };
  return trendMonth === null ? { month: null, cause: null } : { month: trendMonth, cause: 'trend' };
}

/** When to order: the crossing month less the lead time in months. Negative means it is already late. */
export const orderByMonth = (crossing: Crossing, leadWeeks: number): number | null =>
  crossing.month === null ? null : crossing.month - leadWeeks / WEEKS_PER_MONTH;

/** What a year of growth at `g` a month does: compound (1 + g)^12 against the linear 1 + 12g. */
export const yearFactor = (growth: number, kind: Growth): number => (kind === 'compound' ? (1 + growth) ** 12 : 1 + 12 * growth);

/* ---------- scene 3: what moves the knee ---------- */

export const POOL_SIZES: readonly number[] = [1, 2, 4, 8, 16, 32];
export const OPTIMISE_RANGE = { min: 0, max: 0.5, step: 0.05 } as const;
/** Instances on the scene-3 chart, and the shared database's limit (requests/s; the top of the slider means no limit). */
export const SCALE_INSTANCES = 40;
export const DB_LIMIT_RANGE = { min: 500, max: 10_000, step: 500 } as const;
export const DB_NO_LIMIT = DB_LIMIT_RANGE.max;

/** The service after a profiling win: every request takes `cut` less time. */
export const optimised = (s: Service, cut: number): Service => ({ ...s, serviceMs: s.serviceMs * (1 - cut) });

/** Total requests/s at the objective with n instances behind a shared limit: linear in n until the limit caps it. */
export function scaledCapacity(s: Service, n: number, dbLimit: number): number {
  const knee = kneeLoad(s, SLO_MS) ?? 0;
  return Math.min(n * knee, dbLimit >= DB_NO_LIMIT ? Infinity : dbLimit);
}

export interface PoolRow {
  workers: number;
  /** Safe utilisation of one pool of `workers`, and of `workers` separate single-worker servers. */
  pooled: number | null;
  separate: number | null;
}

export function poolRows(serviceMs: number): PoolRow[] {
  const separate = safeUtilisation({ workers: 1, serviceMs }, SLO_MS);
  return POOL_SIZES.map((workers) => ({ workers, pooled: safeUtilisation({ workers, serviceMs }, SLO_MS), separate }));
}

export const LOAD_DEFAULT = { service: SERVICE_DEFAULT, level: LEVEL_DEFAULT, seed: 1 };
