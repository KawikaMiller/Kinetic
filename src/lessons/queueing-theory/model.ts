import { exponential } from '../../core/distributions';
import { createTickSim, type TickSim } from '../../core/simTick';
import { mulberry32, type Rnd } from '../../core/random';
import { parseBoundedDecimal, type FieldParse } from '../../core/parse';

/* ---------- constants ---------- */

/** Service rate of one server, jobs per second (a named, illustrative constant). */
export const MU = 10;
/** Model seconds one tick covers: events are exact, so this only decides when the picture updates. */
export const TICK_SECONDS = 0.005;
/** Real seconds per tick and the most ticks a frame may run: about 4 model seconds per real second at the cap. */
export const LIVE_TICK_REAL_SECONDS = 1 / 800;
export const LIVE_MAX_TICKS_PER_FRAME = 14;
/** Queue icons drawn before "+n more": a wide stage and a phone. */
export const QUEUE_ICONS = { wide: 30, narrow: 12 } as const;
/** Completed jobs whose time in system is drawn. */
export const RECENT_JOBS = 20;

export type ServiceShape = 'det' | 'exp' | 'hyper';

export const SHAPES: readonly ServiceShape[] = ['det', 'exp', 'hyper'];

/** CV² (variance ÷ mean²) of each service-time shape. */
export const SHAPE_CV2: Record<ServiceShape, number> = { det: 0, exp: 1, hyper: 4 };

export const SHAPE_NAME: Record<ServiceShape, string> = {
  det: 'deterministic (CV² = 0)',
  exp: 'exponential (CV² = 1)',
  hyper: 'high variance (CV² = 4)',
};

/** The queue's own names for these systems. */
export const SHAPE_KENDALL: Record<ServiceShape, string> = { det: 'M/D/1', exp: 'M/M/1', hyper: 'M/H₂/1' };

/** The utilisation slider: up to 120%, on purpose (past 100% there is no steady state). */
export const RHO_RANGE = { min: 0.05, max: 1.2, step: 0.05 } as const;

/* ---------- service-time samplers ---------- */

/** Two-branch hyper-exponential with mean 1/μ and the given CV² (balanced means): returns (probability of branch 1, rate 1, rate 2). */
export function hyperBranches(mu: number, cv2: number): { p1: number; rate1: number; rate2: number } {
  const p1 = 0.5 * (1 + Math.sqrt((cv2 - 1) / (cv2 + 1)));
  return { p1, rate1: 2 * p1 * mu, rate2: 2 * (1 - p1) * mu };
}

/** One service time with mean 1/mu in the given shape. */
export function serviceTime(shape: ServiceShape, mu: number, rnd: Rnd): number {
  if (shape === 'det') return 1 / mu;
  if (shape === 'exp') return exponential(rnd, mu);
  const { p1, rate1, rate2 } = hyperBranches(mu, SHAPE_CV2.hyper);
  return exponential(rnd, rnd() < p1 ? rate1 : rate2);
}

/* ---------- theory: M/M/1 and Pollaczek-Khinchine ---------- */

export interface Theory {
  rho: number;
  /** Mean jobs in the system, in the queue, time in system and wait in the queue (seconds). */
  L: number;
  Lq: number;
  W: number;
  Wq: number;
  /** The Pollaczek-Khinchine factor (1 + CV²)/2: the M/G/1 wait is this times the M/M/1 wait. */
  factor: number;
}

/** Steady-state results for utilisation rho (λ = ρμ), or null when ρ ≥ 1 (there is no steady state). */
export function theory(rho: number, shape: ServiceShape, mu = MU): Theory | null {
  if (!(rho >= 0 && rho < 1)) return null;
  const factor = (1 + SHAPE_CV2[shape]) / 2;
  const lambda = rho * mu;
  const Wq = ((rho / (1 - rho)) * factor) / mu;
  const W = Wq + 1 / mu;
  return { rho, L: lambda * W, Lq: lambda * Wq, W, Wq, factor };
}

/** M/M/1 mean time in system in units of the service time: 1/(1 − ρ). */
export const mm1Multiple = (rho: number): number => 1 / (1 - rho);

/** The utilisations the curve marks. */
export const CURVE_MARKS = [0.5, 0.8, 0.9, 0.95, 0.99] as const;

/** Erlang C: the chance an arrival must wait in an M/M/c queue with c servers and offered load a = λ/μ (needs a < c). */
export function erlangC(c: number, a: number): number {
  if (!(a < c)) return 1;
  let term = 1;
  let sum = 1;
  for (let k = 1; k < c; k++) {
    term *= a / k;
    sum += term;
  }
  const top = ((term * a) / c) * (c / (c - a));
  return top / (sum + top);
}

export type Topology = 'split' | 'pool' | 'fast';

export const TOPOLOGIES: readonly Topology[] = ['split', 'pool', 'fast'];

export const TOPOLOGY_NAME: Record<Topology, string> = {
  split: 'four separate queues',
  pool: 'one shared queue, four servers',
  fast: 'one server, four times as fast',
};

/** Short names for table rows, where the full names would wrap on a phone. */
export const TOPOLOGY_SHORT: Record<Topology, string> = { split: '4 queues', pool: 'shared queue', fast: 'one fast server' };

/** Servers behind scene 3: total capacity is this many times μ for every topology. */
export const POOL_SERVERS = 4;
export const POOL_RHO = { min: 0.05, max: 0.95, step: 0.05 } as const;

export interface TopologyTheory {
  Wq: number;
  W: number;
  /** Chance an arrival waits at all (Erlang C for the pool, ρ for a single queue). */
  waits: number;
}

/** Analytic mean wait and time in system of each topology at per-server utilisation rho and the same total capacity. */
export function topologyTheory(topology: Topology, rho: number, mu = MU, c = POOL_SERVERS): TopologyTheory {
  if (topology === 'pool') {
    const a = c * rho;
    const waits = erlangC(c, a);
    const Wq = waits / (mu * (c - a));
    return { Wq, W: Wq + 1 / mu, waits };
  }
  const rate = topology === 'fast' ? c * mu : mu;
  const Wq = rho / (rate * (1 - rho));
  return { Wq, W: Wq + 1 / rate, waits: rho };
}

/* ---------- jobs: one exact event stream shared by the live view and the tests ---------- */

/**
 * The jobs of a single FIFO server, appended as they arrive. Every time is exact (continuous),
 * so a job's start and departure are known the moment it arrives. Arrays are append-only: a
 * state from an earlier tick only reads the prefix its own counters name, so history stays valid.
 */
export interface JobLog {
  arrival: number[];
  service: number[];
  start: number[];
  departure: number[];
  /** Cumulative sums with a leading 0: cumX[k] is the sum over jobs 0..k-1. */
  cumArrival: number[];
  cumWait: number[];
  cumSystem: number[];
  cumService: number[];
  /** The next arrival time, already drawn but not yet a job. */
  pending: number;
}

export interface QueueConfig {
  rho: number;
  shape: ServiceShape;
  mu?: number;
}

export const newLog = (firstArrival: number): JobLog => ({
  arrival: [], service: [], start: [], departure: [],
  cumArrival: [0], cumWait: [0], cumSystem: [0], cumService: [0], pending: firstArrival,
});

/** Turns every arrival up to time `t` into a job. Draws: the job's service time, then the next gap, in that order. */
export function generateUntil(log: JobLog, config: QueueConfig, t: number, rnd: Rnd): void {
  const mu = config.mu ?? MU;
  const lambda = config.rho * mu;
  while (log.pending <= t) {
    const i = log.arrival.length;
    const a = log.pending;
    const s = serviceTime(config.shape, mu, rnd);
    const start = i === 0 ? a : Math.max(a, log.departure[i - 1]);
    const departure = start + s;
    log.arrival.push(a);
    log.service.push(s);
    log.start.push(start);
    log.departure.push(departure);
    log.cumArrival.push(log.cumArrival[i] + a);
    log.cumWait.push(log.cumWait[i] + (start - a));
    log.cumSystem.push(log.cumSystem[i] + (departure - a));
    log.cumService.push(log.cumService[i] + s);
    log.pending = a + exponential(rnd, lambda);
  }
}

/** What the live view knows at one tick: the model time and how many jobs have arrived, started and departed by then. */
export interface QueueState {
  tick: number;
  t: number;
  generated: number;
  started: number;
  completed: number;
  log: JobLog;
}

export function createQueueSim(config: QueueConfig, seed: number, tickSeconds = TICK_SECONDS): TickSim<QueueState> {
  const lambda = config.rho * (config.mu ?? MU);
  return createTickSim<QueueState>({
    seed,
    init: (rnd) => ({ tick: 0, t: 0, generated: 0, started: 0, completed: 0, log: newLog(exponential(rnd, lambda)) }),
    step: (s, rnd, tick) => {
      const t = tick * tickSeconds;
      generateUntil(s.log, config, t, rnd);
      const generated = s.log.arrival.length;
      let started = s.started;
      while (started < generated && s.log.start[started] <= t) started++;
      let completed = s.completed;
      while (completed < generated && s.log.departure[completed] <= t) completed++;
      return { tick, t, generated, started, completed, log: s.log };
    },
    check: (s) => (s.completed <= s.started && s.started <= s.generated && s.started - s.completed <= 1 ? null : 'queue bookkeeping broke'),
  });
}

export interface Measured {
  /** Jobs that have arrived, and jobs done, by now. */
  arrived: number;
  done: number;
  /** Mean time in system and mean wait of the jobs done so far; null before the first one finishes. */
  W: number | null;
  Wq: number | null;
  /** Time-average number in the system and in the queue over [0, t]; null at t = 0. */
  L: number | null;
  Lq: number | null;
  /** Share of [0, t] the server was busy. */
  busy: number | null;
}

/** The statistics of the run so far, from the log and the counters (no per-job loops). */
export function measure(s: QueueState): Measured {
  const { log, t, generated: G, started: S, completed: C } = s;
  const inSystemArea = log.cumSystem[C] + (G - C) * t - (log.cumArrival[G] - log.cumArrival[C]);
  const queueArea = log.cumWait[S] + (G - S) * t - (log.cumArrival[G] - log.cumArrival[S]);
  const inService = S > C ? t - log.start[C] : 0;
  return {
    arrived: G,
    done: C,
    W: C ? log.cumSystem[C] / C : null,
    Wq: C ? log.cumWait[C] / C : null,
    L: t > 0 ? inSystemArea / t : null,
    Lq: t > 0 ? queueArea / t : null,
    busy: t > 0 ? (log.cumService[C] + inService) / t : null,
  };
}

/** Jobs waiting (arrived, not started) and the job in service (or null), by index. */
export function picture(s: QueueState): { waiting: number; serving: number | null; recent: number[] } {
  const recentFrom = Math.max(0, s.completed - RECENT_JOBS);
  const recent: number[] = [];
  for (let i = recentFrom; i < s.completed; i++) recent.push(s.log.departure[i] - s.log.arrival[i]);
  return { waiting: s.generated - s.started, serving: s.started > s.completed ? s.completed : null, recent };
}

/* ---------- batch runs: closed forms vs seeded simulation, Little's law, topologies ---------- */

export interface BatchOptions {
  /** Total arrival rate. */
  lambda: number;
  /** Service rate of ONE server. */
  mu: number;
  shape: ServiceShape;
  /** Servers behind the queue(s). */
  servers: number;
  /** One shared FIFO queue ('pool') or each job sent to a random server with its own queue ('split'). */
  layout: 'pool' | 'split';
  /** Jobs that arrive; the run then drains. */
  jobs: number;
  /** Leading jobs left out of meanWait and meanSystem, so a queue that starts empty does not bias them low. Default 0. */
  warmup?: number;
  seed: number;
}

export interface BatchResult {
  arrival: Float64Array;
  start: Float64Array;
  departure: Float64Array;
  meanWait: number;
  meanSystem: number;
}

/** XORed into the seed for the random routing of the 'split' layout, so routing never consumes the arrival and service draws that layouts share. */
const ROUTING_STREAM = 0x5bd1e995;

/** Simulates FIFO queueing exactly: arrivals are Poisson, each job starts when it has arrived and a server is free. */
export function simulateQueue(o: BatchOptions): BatchResult {
  const rnd = mulberry32(o.seed);
  const routing = mulberry32(o.seed ^ ROUTING_STREAM);
  const free = new Array<number>(o.servers).fill(0);
  const arrival = new Float64Array(o.jobs);
  const start = new Float64Array(o.jobs);
  const departure = new Float64Array(o.jobs);
  let t = 0;
  const warmup = o.warmup ?? 0;
  let waitSum = 0;
  let systemSum = 0;
  for (let i = 0; i < o.jobs; i++) {
    t += exponential(rnd, o.lambda);
    const s = serviceTime(o.shape, o.mu, rnd);
    let server: number;
    if (o.layout === 'split') {
      server = Math.floor(routing() * o.servers);
    } else {
      server = 0;
      for (let k = 1; k < o.servers; k++) if (free[k] < free[server]) server = k;
    }
    const begin = Math.max(t, free[server]);
    free[server] = begin + s;
    arrival[i] = t;
    start[i] = begin;
    departure[i] = begin + s;
    if (i >= warmup) {
      waitSum += begin - t;
      systemSum += begin + s - t;
    }
  }
  const counted = o.jobs - warmup;
  return { arrival, start, departure, meanWait: waitSum / counted, meanSystem: systemSum / counted };
}

/** M/M/1 mixing time in jobs: the queue forgets its start and its average settles on about 1 / (1 − ρ)² jobs. */
const mixingJobs = (rho: number): number => 1 / (1 - rho) ** 2;
/** Jobs averaged per mixing time, and warm-up jobs discarded per mixing time, in The curve's measured dot. */
const CURVE_JOBS_PER_MIXING = 100;
const CURVE_WARMUP_PER_MIXING = 5;
const CURVE_MIN_JOBS = 20_000;
const CURVE_MIN_WARMUP = 100;

/** How long The curve's measured run is at ρ: the discarded warm-up and the averaged jobs, both growing like 1 / (1 − ρ)². */
export function curveRunLength(rho: number): { warmup: number; jobs: number } {
  const mixing = mixingJobs(rho);
  return { warmup: Math.max(CURVE_MIN_WARMUP, Math.ceil(CURVE_WARMUP_PER_MIXING * mixing)), jobs: Math.max(CURVE_MIN_JOBS, Math.ceil(CURVE_JOBS_PER_MIXING * mixing)) };
}

/** Measured time in system ÷ service time for one seeded M/M/1 run at ρ, warm-up discarded. */
export function measureCurve(rho: number, seed: number): number {
  const { warmup, jobs } = curveRunLength(rho);
  return simulateQueue({ lambda: rho * MU, mu: MU, shape: 'exp', servers: 1, layout: 'pool', jobs: warmup + jobs, warmup, seed }).meanSystem * MU;
}

/** Jobs behind each measured number in the pool scene: steady at moderate ρ, one seeded run, still a little noisy near 95%. */
export const POOL_MEASURED_JOBS = 40_000;

/**
 * The three layouts under one seed. They share the arrival times and the service draws (common random numbers; the fast
 * server does each job in 1/c of the time), so the measured columns differ only by the layout and agree with the theory ordering.
 */
export function measurePool(rho: number, seed: number, jobs = POOL_MEASURED_JOBS): Record<Topology, { Wq: number; W: number }> {
  const lambda = POOL_SERVERS * rho * MU;
  const run = (servers: number, mu: number, layout: 'pool' | 'split') => simulateQueue({ lambda, mu, shape: 'exp', servers, layout, jobs, seed });
  const runs: Record<Topology, BatchResult> = {
    split: run(POOL_SERVERS, MU, 'split'),
    pool: run(POOL_SERVERS, MU, 'pool'),
    fast: run(1, POOL_SERVERS * MU, 'pool'),
  };
  return Object.fromEntries(TOPOLOGIES.map((t) => [t, { Wq: runs[t].meanWait, W: runs[t].meanSystem }])) as Record<Topology, { Wq: number; W: number }>;
}

/** ∫ N(t) dt where each job is present over [enter, leave): a sweep over the merged events (never a per-job sum). */
export function areaUnder(enter: ArrayLike<number>, leave: ArrayLike<number>): number {
  const ups = Float64Array.from(enter).sort();
  const downs = Float64Array.from(leave).sort();
  let area = 0;
  let n = 0;
  let last = 0;
  let i = 0;
  let j = 0;
  while (j < downs.length) {
    const next = i < ups.length && ups[i] <= downs[j] ? ups[i] : downs[j];
    area += n * (next - last);
    last = next;
    if (i < ups.length && ups[i] <= downs[j]) {
      n++;
      i++;
    } else {
      n--;
      j++;
    }
  }
  return area;
}

/** The per-job sum Σ (leave − enter): what Little's identity says the area must equal once the system has drained. */
export function sumOfTimes(enter: ArrayLike<number>, leave: ArrayLike<number>, skip = -1): number {
  let sum = 0;
  for (let i = 0; i < enter.length; i++) if (i !== skip) sum += leave[i] - enter[i];
  return sum;
}

export type Boundary = 'system' | 'queue' | 'server';

export const BOUNDARY_NAME: Record<Boundary, string> = { system: 'whole system', queue: 'queue only', server: 'server only' };

export interface LittleRun {
  boundary: Boundary;
  jobs: number;
  /** The observation window: from 0 until the system has drained. */
  window: number;
  /** ∫ N(t) dt by sweeping events, and Σ times by summing jobs. */
  area: number;
  sum: number;
  L: number;
  lambda: number;
  W: number;
}

/** Little's law on one run that has drained: the window is [0, last departure], so L = λ·W holds exactly. */
export function littleRun(run: BatchResult, boundary: Boundary): LittleRun {
  const enter = boundary === 'server' ? run.start : run.arrival;
  const leave = boundary === 'queue' ? run.start : run.departure;
  const window = run.departure.reduce((m, d) => Math.max(m, d), 0);
  const jobs = run.arrival.length;
  const area = areaUnder(enter, leave);
  const sum = sumOfTimes(enter, leave);
  return { boundary, jobs, window, area, sum, L: area / window, lambda: jobs / window, W: sum / jobs };
}

/** Scene 2's run: jobs arrive until the window closes, then the queue drains. */
export interface DrainOptions {
  rho: number;
  /** Seconds during which arrivals keep coming. */
  horizon: number;
  seed: number;
  shape?: ServiceShape;
}

export function drainedRun(o: DrainOptions): BatchResult {
  const lambda = o.rho * MU;
  const shape = o.shape ?? 'exp';
  const rnd = mulberry32(o.seed);
  const arrival: number[] = [];
  const start: number[] = [];
  const departure: number[] = [];
  let free = 0;
  for (let t = exponential(rnd, lambda); t < o.horizon; t += exponential(rnd, lambda)) {
    const s = serviceTime(shape, MU, rnd);
    const begin = Math.max(t, free);
    free = begin + s;
    arrival.push(t);
    start.push(begin);
    departure.push(free);
  }
  const n = arrival.length || 1;
  const wait = start.reduce((sum, b, i) => sum + b - arrival[i], 0) / n;
  const system = departure.reduce((sum, d, i) => sum + d - arrival[i], 0) / n;
  return { arrival: Float64Array.from(arrival), start: Float64Array.from(start), departure: Float64Array.from(departure), meanWait: wait, meanSystem: system };
}

/** The step vertices of N(t) for a drained run: [time, jobs present] at every change. */
export function populationSteps(enter: ArrayLike<number>, leave: ArrayLike<number>): [number, number][] {
  const events: [number, number][] = [];
  for (let i = 0; i < enter.length; i++) events.push([enter[i], 1], [leave[i], -1]);
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const steps: [number, number][] = [[0, 0]];
  let n = 0;
  for (const [time, delta] of events) {
    n += delta;
    steps.push([time, n]);
  }
  return steps;
}

/* ---------- the sizing calculator ---------- */

export const SIZING_BOUNDS = { rate: { max: 1_000_000 }, seconds: { max: 3_600 } } as const;

const positiveDecimal = (label: string, max: number, unit: string) => (text: string): FieldParse<number> => {
  const sentenceStart = label.charAt(0).toUpperCase() + label.slice(1);
  const parsed = parseBoundedDecimal(text, {
    min: 0,
    max,
    messages: {
      empty: `Type ${label}.`,
      invalid: (typed) => `"${typed}" isn't a plain number like 200 or 0.05 (no exponents or units).`,
      tooBig: () => `${sentenceStart} can't be more than ${max.toLocaleString('en-US')} ${unit}.`,
      tooSmall: () => `${sentenceStart} can't be negative.`,
    },
  });
  if (parsed.ok && parsed.value === 0) return { ok: false, error: `${sentenceStart} has to be above 0.` };
  return parsed;
};

export const parseRate = positiveDecimal('a request rate', SIZING_BOUNDS.rate.max, 'requests per second');
export const parseSeconds = positiveDecimal('a time per request', SIZING_BOUNDS.seconds.max, 'seconds');

/** Little's law as a sizing rule: requests in flight = rate × time each. */
export const concurrency = (ratePerSecond: number, secondsEach: number): number => ratePerSecond * secondsEach;

/* ---------- each scene's default state, named so a test can pin the real first screen ---------- */

export const LIVE_DEFAULT = { rho: 0.8, shape: 'exp' as ServiceShape, seed: 1 };
export const LITTLE_DEFAULT = { rho: 0.7, horizon: 30, boundary: 'system' as Boundary, seed: 1, rate: '200', seconds: '0.05' };
export const POOL_DEFAULT = { rho: 0.7, seed: 1 };
export const CURVE_DEFAULT = { rho: 0.8, seed: 1 };
