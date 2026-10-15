import { lognormal, quantile } from '../../core/distributions';
import { mulberry32, type Rnd } from '../../core/random';
import { createTickSim, type TickSim } from '../../core/simTick';
import { nearestRank } from '../percentiles-statistics/model';

/* ---------- scene 1: warm-up ---------- */

export type ImplId = 'A' | 'B';
export const IMPL_IDS: readonly ImplId[] = ['A', 'B'];

/**
 * A made-up JIT-like warm-up (not V8): iteration i takes steady × (1 + boost × e^(−i/τ)) microseconds. A is slower in steady state
 * but warms up in about 20 iterations; B is faster in steady state and takes about 300.
 */
export const IMPLS: Record<ImplId, { steadyUs: number; boost: number; tau: number }> = {
  A: { steadyUs: 10, boost: 4, tau: 20 },
  B: { steadyUs: 8, boost: 19, tau: 300 },
};

/** Multiplicative noise on every iteration: log-normal with mean 1 and this sigma. */
export const NOISE_SIGMA = 0.03;
export const SERIES_LENGTH = 10_000;
const SERIES_TICKS = 10;
/** What an optimiser leaves when it removes work whose result nothing reads: only the loop itself (a simulated effect). */
export const LOOP_OVERHEAD_US = 0.05;

/** The noise-free time of iteration i. */
export const modelTime = (id: ImplId, i: number): number => IMPLS[id].steadyUs * (1 + IMPLS[id].boost * Math.exp(-i / IMPLS[id].tau));

export type WindowMode = 'first100' | 'discard' | 'steady';
export const WINDOW_MODES: readonly WindowMode[] = ['first100', 'discard', 'steady'];
export const WINDOW_NAME: Record<WindowMode, string> = { first100: 'the first 100 iterations', discard: 'discard the first k', steady: 'a steady-state window' };
/** The "discard the first k" window is this many iterations long, starting at k. */
export const DISCARD_WINDOW = 1000;
export const DISCARD_RANGE = { min: 0, max: 3000, step: 100 } as const;
export const STEADY_WINDOW: readonly [number, number] = [5000, 10_000];
/** The smallest k on the slider grid for which the discard window [k, k + DISCARD_WINDOW) reads B no slower than A in the noise-free model; null if none does. */
export function discardCrossover(): number | null {
  for (let k = DISCARD_RANGE.min; k <= DISCARD_RANGE.max; k += DISCARD_RANGE.step) {
    const w = windowOf('discard', k);
    if (exactWindowMean('B', w) <= exactWindowMean('A', w)) return k;
  }
  return null;
}

export const WARMUP_DEFAULT = { mode: 'first100' as WindowMode, discard: 500, useResult: true, seed: 1 };

/** The window of iterations [from, to) a mode measures. */
export function windowOf(mode: WindowMode, discard: number): readonly [number, number] {
  if (mode === 'first100') return [0, 100];
  if (mode === 'discard') return [discard, discard + DISCARD_WINDOW];
  return STEADY_WINDOW;
}

/** The exact (noise-free) mean over a window: the geometric sum of the warm-up term, so a test can check the series against it. */
export function exactWindowMean(id: ImplId, [from, to]: readonly [number, number]): number {
  const { steadyUs, boost, tau } = IMPLS[id];
  const n = to - from;
  const decay = (Math.exp(-from / tau) - Math.exp(-to / tau)) / (1 - Math.exp(-1 / tau));
  return steadyUs * (1 + (boost * decay) / n);
}

export interface WarmupState {
  tick: number;
  count: number;
  a: Float64Array;
  b: Float64Array;
}

/** The two series, SERIES_LENGTH iterations each, drawn a thousand iterations a tick. With the result unused, both collapse to the empty loop. */
export function createWarmupRun(seed: number, useResult: boolean): TickSim<WarmupState> {
  const perTick = SERIES_LENGTH / SERIES_TICKS;
  return createTickSim<WarmupState>({
    seed,
    init: () => ({ tick: 0, count: 0, a: new Float64Array(SERIES_LENGTH), b: new Float64Array(SERIES_LENGTH) }),
    step: (s, rnd, tick) => {
      for (let i = s.count; i < tick * perTick; i++) {
        const noiseA = lognormal(rnd, (-NOISE_SIGMA * NOISE_SIGMA) / 2, NOISE_SIGMA);
        const noiseB = lognormal(rnd, (-NOISE_SIGMA * NOISE_SIGMA) / 2, NOISE_SIGMA);
        s.a[i] = (useResult ? modelTime('A', i) : LOOP_OVERHEAD_US) * noiseA;
        s.b[i] = (useResult ? modelTime('B', i) : LOOP_OVERHEAD_US) * noiseB;
      }
      return { ...s, tick, count: tick * perTick };
    },
  });
}

export function warmupSeries(seed: number, useResult: boolean): WarmupState {
  const sim = createWarmupRun(seed, useResult);
  sim.run(SERIES_TICKS);
  return sim.state;
}

export function windowMean(series: Float64Array, [from, to]: readonly [number, number]): number {
  let sum = 0;
  for (let i = from; i < to; i++) sum += series[i];
  return sum / (to - from);
}

export interface WarmupReading {
  window: readonly [number, number];
  meanA: number;
  meanB: number;
  exactA: number;
  exactB: number;
  /** Which is faster in this window and by how many times, or null when both read the empty loop (the result was not used). */
  faster: ImplId | null;
  ratio: number;
}

export function readWindow(state: WarmupState, mode: WindowMode, discard: number, useResult: boolean): WarmupReading {
  const window = windowOf(mode, discard);
  const meanA = windowMean(state.a, window);
  const meanB = windowMean(state.b, window);
  const faster: ImplId = meanA <= meanB ? 'A' : 'B';
  return {
    window, meanA, meanB, exactA: exactWindowMean('A', window), exactB: exactWindowMean('B', window),
    faster: useResult ? faster : null, ratio: faster === 'A' ? meanB / meanA : meanA / meanB,
  };
}

/** The mean of each of `bins` log-spaced bins of an iteration series, as plot points: the warm-up curve on a log iteration axis. */
export function logBinnedMeans(series: Float64Array, bins: number): [number, number][] {
  const out: [number, number][] = [];
  for (let b = 0; b < bins; b++) {
    const from = Math.floor(SERIES_LENGTH ** (b / bins));
    const to = Math.max(from + 1, Math.floor(SERIES_LENGTH ** ((b + 1) / bins)));
    if (from >= SERIES_LENGTH) break;
    out.push([Math.sqrt(from * to) || 1, windowMean(series, [from, Math.min(to, SERIES_LENGTH)])]);
  }
  return out;
}

/* ---------- the opt-in real run (a clock is passed in; the default state never reads one) ---------- */

export interface Clock {
  now: () => number;
}

export const REAL = { callsPerBatch: 2000, maxBatches: 150, budgetMs: 800, size: 256, granularitySpins: 2000 } as const;

/** A small real function: the sum of a few hundred squares, folded into a result that the caller keeps. */
export function workload(size: number): number {
  let sum = 0;
  for (let i = 0; i < size; i++) sum = (sum + i * i) % 1_000_003;
  return sum;
}

export interface RealRun {
  startedAt: number;
  /** Nanoseconds per call for each batch, in order. */
  perCallNs: number[];
  /** The results of the calls, summed so that nothing is dead code. */
  sink: number;
  done: boolean;
}

export const startRealRun = (clock: Clock): RealRun => ({ startedAt: clock.now(), perCallNs: [], sink: 0, done: false });

/** One batch: time `callsPerBatch` calls with two clock reads and divide. Done when the budget or the batch cap is reached. */
export function stepRealRun(run: RealRun, clock: Clock): RealRun {
  if (run.done) return run;
  const before = clock.now();
  let sink = run.sink;
  for (let i = 0; i < REAL.callsPerBatch; i++) sink = (sink + workload(REAL.size)) % 1_000_003;
  const after = clock.now();
  const perCallNs = [...run.perCallNs, ((after - before) * 1e6) / REAL.callsPerBatch];
  return { ...run, perCallNs, sink, done: perCallNs.length >= REAL.maxBatches || after - run.startedAt >= REAL.budgetMs };
}

/** The smallest non-zero step the clock showed between two reads in a tight loop, in ms; null if it never moved. */
export function timerGranularityMs(clock: Clock, spins: number = REAL.granularitySpins): number | null {
  let smallest: number | null = null;
  let last = clock.now();
  for (let i = 0; i < spins; i++) {
    const t = clock.now();
    if (t > last && (smallest === null || t - last < smallest)) smallest = t - last;
    last = t;
  }
  return smallest;
}

/* ---------- scene 2: noise and confidence intervals ---------- */

/** The medians of the two implementations in steady state, µs. B is 3% faster: a real but small difference. */
export const NOISY_MEDIAN_US: Record<ImplId, number> = { A: 10, B: 9.7 };
export const RUN_NOISE = { sigma: 0.08, outlierProb: 0.02, outlierFactor: 3 } as const;
/** Another process on the machine: this share of runs is slowed by this factor, which makes the histogram two-humped. */
export const OTHER_PROCESS = { prob: 0.4, factor: 1.5 } as const;
/** Frequency scaling: the first run is this much slower, falling linearly to the nominal time by the last run. */
export const FREQUENCY_SCALING = { startSlowdown: 0.25 } as const;
export const RUNS_RANGE = { min: 5, max: 200, step: 5 } as const;
export const BOOTSTRAP_RESAMPLES = 1000;
/** Coverage experiments use fewer resamples per interval so that 1,000 of them stay quick. */
export const COVERAGE_RESAMPLES = 400;
export const NOISE_DEFAULT = { runs: 30, otherProcess: false, frequencyScaling: false, seed: 1 };

export interface NoiseSettings {
  runs: number;
  otherProcess: boolean;
  frequencyScaling: boolean;
}

export interface Run {
  us: number;
  /** True when another process was running during this run. */
  disturbed: boolean;
}

const STREAM_OFFSET: Record<ImplId, number> = { A: 0x9e3779b1, B: 0x85ebca6b };

/** K seeded runs of one implementation: log-normal noise, rare outliers, and whichever noise sources are switched on. */
export function drawRuns(id: ImplId, s: NoiseSettings, seed: number): Run[] {
  const rnd = mulberry32((seed ^ STREAM_OFFSET[id]) >>> 0);
  return Array.from({ length: s.runs }, (_, i) => {
    let us = lognormal(rnd, Math.log(NOISY_MEDIAN_US[id]), RUN_NOISE.sigma);
    if (rnd() < RUN_NOISE.outlierProb) us *= RUN_NOISE.outlierFactor;
    const disturbed = s.otherProcess && rnd() < OTHER_PROCESS.prob;
    if (disturbed) us *= OTHER_PROCESS.factor;
    if (s.frequencyScaling) us *= 1 + FREQUENCY_SCALING.startSlowdown * (1 - i / Math.max(1, s.runs - 1));
    return { us, disturbed };
  });
}

const sortedValues = (runs: readonly Run[]): number[] => runs.map((r) => r.us).sort((a, b) => a - b);

export const medianOf = (sorted: readonly number[]): number => quantile(sorted, 0.5);

/** The median of one bootstrap resample: n draws with replacement, sorted. */
function resampledMedian(sorted: readonly number[], rnd: Rnd, scratch: Float64Array): number {
  const n = sorted.length;
  for (let i = 0; i < n; i++) scratch[i] = sorted[Math.floor(rnd() * n)];
  const view = scratch.subarray(0, n).sort();
  return quantile(view as unknown as number[], 0.5);
}

const TAILS = [0.025, 0.975] as const;

export interface Interval {
  estimate: number;
  lo: number;
  hi: number;
}

/** A percentile-bootstrap 95% interval for the median. */
export function medianInterval(sorted: readonly number[], resamples: number, rnd: Rnd): Interval {
  const scratch = new Float64Array(sorted.length);
  const medians = Array.from({ length: resamples }, () => resampledMedian(sorted, rnd, scratch)).sort((a, b) => a - b);
  return { estimate: medianOf(sorted), lo: quantile(medians, TAILS[0]), hi: quantile(medians, TAILS[1]) };
}

/** A percentile-bootstrap 95% interval for median(B) − median(A), resampling each side on its own. */
export function differenceInterval(sortedA: readonly number[], sortedB: readonly number[], resamples: number, rnd: Rnd): Interval {
  const scratchA = new Float64Array(sortedA.length);
  const scratchB = new Float64Array(sortedB.length);
  const diffs = Array.from({ length: resamples }, () => resampledMedian(sortedB, rnd, scratchB) - resampledMedian(sortedA, rnd, scratchA)).sort((a, b) => a - b);
  return { estimate: medianOf(sortedB) - medianOf(sortedA), lo: quantile(diffs, TAILS[0]), hi: quantile(diffs, TAILS[1]) };
}

export type Verdict = 'distinguishable' | 'cannot tell';

export interface NoiseSummary {
  mean: number;
  median: number;
  min: number;
  interval: Interval;
}

export interface NoiseReading {
  A: NoiseSummary;
  B: NoiseSummary;
  difference: Interval;
  verdict: Verdict;
  /** Which is faster, only when the verdict is distinguishable. */
  faster: ImplId | null;
  /** Both modes hold at least a tenth of A's runs: a mean and an interval then describe a place where no run lies. */
  bimodal: boolean;
  runsA: Run[];
  runsB: Run[];
}

const MODE_SHARE = 0.1;

export function isBimodal(runs: readonly Run[]): boolean {
  const share = runs.filter((r) => r.disturbed).length / Math.max(1, runs.length);
  return share >= MODE_SHARE && share <= 1 - MODE_SHARE;
}

const mean = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Everything scene 2 shows, for one seed: the runs, the summaries, the bootstrap intervals and the verdict. */
export function readNoise(s: NoiseSettings, seed: number, resamples = BOOTSTRAP_RESAMPLES): NoiseReading {
  const runsA = drawRuns('A', s, seed);
  const runsB = drawRuns('B', s, seed);
  const sortedA = sortedValues(runsA);
  const sortedB = sortedValues(runsB);
  const rnd = mulberry32(seed + 7);
  const summarise = (sorted: number[]): NoiseSummary => ({ mean: mean(sorted), median: medianOf(sorted), min: sorted[0], interval: medianInterval(sorted, resamples, rnd) });
  const A = summarise(sortedA);
  const B = summarise(sortedB);
  const difference = differenceInterval(sortedA, sortedB, resamples, rnd);
  const distinguishable = difference.lo > 0 || difference.hi < 0;
  return {
    A, B, difference, verdict: distinguishable ? 'distinguishable' : 'cannot tell', faster: distinguishable ? (difference.hi < 0 ? 'B' : 'A') : null,
    bimodal: isBimodal(runsA), runsA, runsB,
  };
}

/* ---------- scene 3: coordinated omission ---------- */

export type Generator = 'open' | 'closed' | 'corrected';
export const GENERATORS: readonly Generator[] = ['open', 'closed', 'corrected'];
export const GENERATOR_NAME: Record<Generator, string> = { open: 'open-loop', closed: 'closed-loop', corrected: 'closed-loop, corrected' };

/** A made-up server: one request at a time, 1 ms each, except the one that stalls. */
export const SERVER_MS = 1;
export const RUN_SECONDS = 10;
export const SLO_P99_MS = 100;
export const RATE_RANGE = { min: 10, max: 500, step: 10 } as const;
export const STALL_MS_RANGE = { min: 0, max: 10_000, step: 100 } as const;
export const STALL_AT_RANGE = { min: 0, max: 9, step: 0.5 } as const;
export const GENERATOR_DEFAULT = { generator: 'closed' as Generator, rate: 100, stallMs: 1000, stallAt: 1, seed: 1 };
const MS_PER_S = 1000;

export interface GeneratorParams {
  rate: number;
  stallMs: number;
  /** When the stalled request is meant to go out, seconds into the run. */
  stallAt: number;
}

export interface Schedule {
  /** The index of the request that stalls, or null when there is no stall. */
  stalled: number | null;
  /** Per request, ms: when it was meant to go out, when it went out, when it replied. */
  intended: number[];
  sent: number[];
  done: number[];
  /** The expected interval between requests, ms. */
  interval: number;
}

/** Plays one generator against the server. Open-loop sends on schedule; closed-loop sends after the previous reply (or on schedule if later). */
export function playGenerator(kind: 'open' | 'closed', p: GeneratorParams): Schedule {
  const interval = MS_PER_S / p.rate;
  const n = p.rate * RUN_SECONDS;
  const stalled = p.stallMs > SERVER_MS ? Math.round(p.stallAt * p.rate) : null;
  const intended: number[] = [];
  const sent: number[] = [];
  const done: number[] = [];
  let serverFree = 0;
  for (let k = 0; k < n; k++) {
    const meant = k * interval;
    const service = k === stalled ? p.stallMs : SERVER_MS;
    const send = kind === 'open' ? meant : Math.max(meant, k === 0 ? 0 : done[k - 1]);
    const start = Math.max(send, serverFree);
    serverFree = start + service;
    intended.push(meant);
    sent.push(send);
    done.push(serverFree);
  }
  return { stalled, intended, sent, done, interval };
}

/** HdrHistogram-style backfill: for a value above the expected interval, also record value − interval, value − 2·interval, … while at least the interval. */
export function backfill(values: readonly number[], interval: number): number[] {
  const out: number[] = [];
  for (const v of values) {
    out.push(v);
    if (v > interval) for (let missing = v - interval; missing >= interval; missing -= interval) out.push(missing);
  }
  return out;
}

export interface GeneratorReading {
  kind: Generator;
  schedule: Schedule;
  /** What the tool records: latency from the actual send, plus the backfill when corrected. */
  recorded: number[];
  /** What users saw: latency from the intended send. */
  truth: number[];
  reportedP99: number;
  trueP99: number;
  /** Share of requests whose latency from the intended send was over the objective. */
  overSlo: number;
}

const sortedCopy = (xs: readonly number[]): number[] => [...xs].sort((a, b) => a - b);

export function readGenerator(kind: Generator, p: GeneratorParams): GeneratorReading {
  const schedule = playGenerator(kind === 'open' ? 'open' : 'closed', p);
  const fromSend = schedule.done.map((d, k) => d - schedule.sent[k]);
  const truth = schedule.done.map((d, k) => d - schedule.intended[k]);
  const recorded = kind === 'corrected' ? backfill(fromSend, schedule.interval) : fromSend;
  return {
    kind, schedule, recorded, truth,
    reportedP99: nearestRank(sortedCopy(recorded), 99)!,
    trueP99: nearestRank(sortedCopy(truth), 99)!,
    overSlo: truth.filter((v) => v > SLO_P99_MS).length / truth.length,
  };
}

/** Whether the tool's p99 hides the stall: it reads under half of what users saw. */
export const hidesStall = (r: GeneratorReading): boolean => r.reportedP99 < 0.5 * r.trueP99;

/** The requests the timeline draws around the stall: a couple before it and several after. */
export const TIMELINE_REQUESTS = { before: 2, after: 7 } as const;

export function timelineRange(schedule: Schedule): [number, number] {
  const at = schedule.stalled ?? Math.min(schedule.intended.length - 1, Math.round(((RUN_SECONDS / 2) * MS_PER_S) / schedule.interval));
  return [Math.max(0, at - TIMELINE_REQUESTS.before), Math.min(schedule.intended.length - 1, at + TIMELINE_REQUESTS.after)];
}
