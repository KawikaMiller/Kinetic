import { exponential, normalCdf, lognormal } from '../../core/distributions';
import { mulberry32, type Rnd } from '../../core/random';
import { createTickSim, type TickSim } from '../../core/simTick';

/* ---------- the backend model: one call is fast, or (rarely) slow ---------- */

export type Family = 'lognormal' | 'exponential';
export const FAMILIES: readonly Family[] = ['lognormal', 'exponential'];
export const FAMILY_NAME: Record<Family, string> = { lognormal: 'log-normal', exponential: 'exponential' };

/** A backend call's latency: a fast draw from `family`, times `slowFactor` with probability `slowProb` (a mixture). All times in ms. */
export interface Backend {
  family: Family;
  slowProb: number;
  slowFactor: number;
}

/** Named, illustrative constants: the fast latency's shape. These are made up, not measured from any service. */
export const FAST_LOGNORMAL = { medianMs: 20, sigma: 0.5 } as const;
export const FAST_EXPONENTIAL_MEAN_MS = 20;

/** The latency target the request p99 is held against (illustrative). */
export const P99_TARGET_MS = 150;

/** The two percentiles the lesson reads: the one an SLO names, and the one a hedge delay is set from. */
export const P99 = 0.99;
export const HEDGE_DELAY_QUANTILE = 0.95;

export const BACKEND_DEFAULT: Backend = { family: 'lognormal', slowProb: 0.01, slowFactor: 10 };
export const SLOW_PROB_RANGE = { min: 0, max: 0.1, step: 0.005 } as const;
export const SLOW_FACTOR_RANGE = { min: 2, max: 50, step: 1 } as const;

/** Cause presets: each only changes the mixture. They are models of a cause, not measurements of one. */
export interface Cause {
  id: string;
  label: string;
  slowProb: number;
  slowFactor: number;
}
export const CAUSES: readonly Cause[] = [
  { id: 'gc', label: '1% GC pause (×20)', slowProb: 0.01, slowFactor: 20 },
  { id: 'neighbour', label: 'noisy neighbour (5%, ×4)', slowProb: 0.05, slowFactor: 4 },
  { id: 'retry', label: 'retry after timeout (2%, ×30)', slowProb: 0.02, slowFactor: 30 },
];

/** Fan-out widths on the slider: a log-ish ladder that includes the headline 69 and 100. */
export const FANOUT_STEPS: readonly number[] = [1, 2, 3, 5, 10, 20, 30, 50, 69, 100, 200, 300, 500, 1000];
export const FANOUT_DEFAULT = 100;
/** The widths of the computed row under the plot. */
export const ROW_WIDTHS: readonly number[] = [1, 10, 100, 1000];

/** P(X > x) for one fast draw. */
function fastSurvival(family: Family, x: number): number {
  if (x <= 0) return 1;
  if (family === 'lognormal') return normalCdf(-Math.log(x / FAST_LOGNORMAL.medianMs) / FAST_LOGNORMAL.sigma);
  return Math.exp(-x / FAST_EXPONENTIAL_MEAN_MS);
}

/** P(one call takes longer than x): the mixture's survival function. */
export const callSurvival = (b: Backend, x: number): number =>
  (1 - b.slowProb) * fastSurvival(b.family, x) + b.slowProb * fastSurvival(b.family, x / b.slowFactor);

const BISECTION_STEPS = 200;

/** The x where a non-increasing `survival(x)` crosses `target` (0 < target < 1), by bisection from a doubling bracket. */
function solveSurvival(survival: (x: number) => number, target: number): number {
  let hi = 1;
  while (survival(hi) > target && hi < 1e12) hi *= 2;
  let lo = 0;
  for (let i = 0; i < BISECTION_STEPS; i++) {
    const mid = (lo + hi) / 2;
    if (survival(mid) > target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** The q-quantile of one call (q = 0.99 is the single-backend p99). */
export const callQuantile = (b: Backend, q: number): number => solveSurvival((x) => callSurvival(b, x), 1 - q);

/** 1 − P^(1/N), without the cancellation that 1 − 0.99^(1/1000) would suffer. */
const tailOfRoot = (p: number, n: number): number => -Math.expm1(Math.log(p) / n);

/** The q-quantile of the slowest of N independent calls: F⁻¹(q^(1/N)), found on the survival side. */
export const slowestQuantile = (b: Backend, n: number, q: number): number => solveSurvival((x) => callSurvival(b, x), tailOfRoot(q, n));

/** P(at least one of N calls is slow) = 1 − (1 − p)^N, written so that 99.996% does not round to 1. */
export const touchesSlow = (slowProb: number, n: number): number => -Math.expm1(n * Math.log1p(-slowProb));

/** The smallest N where more than half the requests touch a slow backend: (1 − p)^N ≤ 1/2. Infinity when nothing is slow. */
export const medianSlowWidth = (slowProb: number): number => (slowProb <= 0 ? Infinity : Math.ceil(Math.log(0.5) / Math.log1p(-slowProb)));

/* ---------- sampling ---------- */

// Peter Acklam's rational approximation of the inverse normal cdf (relative error about 1e-9), which is plenty for sampling.
const ACKLAM_A = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
const ACKLAM_B = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
const ACKLAM_C = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
const ACKLAM_D = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
const ACKLAM_LOW = 0.02425;

const horner = (coef: readonly number[], x: number) => coef.reduce((acc, c) => acc * x + c, 0);

/** Φ⁻¹(p) for 0 < p < 1, fast: a rational approximation, not the bisection of the distributions lesson. */
export function fastNormalQuantile(p: number): number {
  if (p < ACKLAM_LOW) {
    const q = Math.sqrt(-2 * Math.log(p));
    return horner(ACKLAM_C, q) / (horner(ACKLAM_D, q) * q + 1);
  }
  if (p > 1 - ACKLAM_LOW) return -fastNormalQuantile(1 - p);
  const q = p - 0.5;
  const r = q * q;
  return (horner(ACKLAM_A, r) * q) / (horner(ACKLAM_B, r) * r + 1);
}

/** One fast latency. */
function fastDraw(family: Family, rnd: Rnd): number {
  return family === 'lognormal' ? lognormal(rnd, Math.log(FAST_LOGNORMAL.medianMs), FAST_LOGNORMAL.sigma) : exponential(rnd, 1 / FAST_EXPONENTIAL_MEAN_MS);
}

/** One backend call: a fast draw, then a coin for slow. */
export function sampleCall(b: Backend, rnd: Rnd): number {
  const fast = fastDraw(b.family, rnd);
  return rnd() < b.slowProb ? fast * b.slowFactor : fast;
}

/** The fast latency whose survival is `s`: where the slowest of m fast draws lands when s = 1 − U^(1/m). */
function fastFromTail(family: Family, s: number): number {
  if (family === 'lognormal') return FAST_LOGNORMAL.medianMs * Math.exp(-FAST_LOGNORMAL.sigma * fastNormalQuantile(s));
  return -FAST_EXPONENTIAL_MEAN_MS * Math.log(s);
}

/** The slowest of m fast draws, drawn directly: the max of m has cdf F^m, so U^(1/m) is its F-value. */
function slowestOfFast(family: Family, m: number, rnd: Rnd): number {
  const u = Math.max(rnd(), Number.MIN_VALUE);
  return fastFromTail(family, Math.min(1, Math.max(Number.MIN_VALUE, tailOfRoot(u, m))));
}

/** A Binomial(n, p) count by inversion of its cdf: about n·p steps, so it stays cheap at the widths the lesson offers. */
function binomialDraw(n: number, p: number, rnd: Rnd): number {
  if (p <= 0) return 0;
  const u = rnd();
  let pmf = (1 - p) ** n;
  let cdf = pmf;
  let k = 0;
  while (u > cdf && k < n) {
    pmf *= ((n - k) / (k + 1)) * (p / (1 - p));
    k++;
    cdf += pmf;
  }
  return k;
}

/**
 * The latency of a request that waits for the slowest of N calls, drawn in O(1) from the right distribution: how many
 * of the N calls are slow (a binomial), then the slowest fast call and the slowest slow call, each straight from the
 * distribution of a maximum. Equal in distribution to drawing N calls and taking the max (`slowestOfCalls`); a test checks that.
 */
export function sampleSlowest(b: Backend, n: number, rnd: Rnd): number {
  const slow = binomialDraw(n, b.slowProb, rnd);
  const fast = n - slow;
  const fastMax = fast > 0 ? slowestOfFast(b.family, fast, rnd) : 0;
  const slowMax = slow > 0 ? b.slowFactor * slowestOfFast(b.family, slow, rnd) : 0;
  return Math.max(fastMax, slowMax);
}

/** The literal version: draw N calls and take the largest. */
export function slowestOfCalls(b: Backend, n: number, rnd: Rnd): number {
  let worst = 0;
  for (let i = 0; i < n; i++) worst = Math.max(worst, sampleCall(b, rnd));
  return worst;
}

/** All N call latencies of one request, slowest first (what the one-request picture draws). */
export function requestCalls(b: Backend, n: number, seed: number): number[] {
  const rnd = mulberry32(seed);
  return Array.from({ length: n }, () => sampleCall(b, rnd)).sort((a, c) => c - a);
}

/* ---------- scene 1: the 100,000-request run ---------- */

export const REQUESTS = 100_000;
export const RUN_TICKS = 20;
const PER_TICK = REQUESTS / RUN_TICKS;

/** Append-only arrays: a state from tick k reads only the first `count` entries, so scrubbing back stays valid. */
export interface FanoutState {
  tick: number;
  count: number;
  single: Float64Array;
  slowest: Float64Array;
}

/** The seeded run of REQUESTS requests, RUN_TICKS ticks of PER_TICK each: same seed, same histogram. */
export function createFanoutRun(b: Backend, n: number, seed: number): TickSim<FanoutState> {
  return createTickSim<FanoutState>({
    seed,
    init: () => ({ tick: 0, count: 0, single: new Float64Array(REQUESTS), slowest: new Float64Array(REQUESTS) }),
    step: (s, rnd, tick) => {
      for (let i = s.count; i < tick * PER_TICK; i++) {
        s.single[i] = sampleCall(b, rnd);
        s.slowest[i] = sampleSlowest(b, n, rnd);
      }
      return { ...s, tick, count: tick * PER_TICK };
    },
    check: (s) => (s.count <= REQUESTS ? null : 'the run drew more requests than it holds'),
  });
}

/** The finished run, every request drawn. */
export function fanoutRun(b: Backend, n: number, seed: number): FanoutState {
  const sim = createFanoutRun(b, n, seed);
  sim.run(RUN_TICKS);
  return sim.state;
}

const sortedPrefix = (xs: Float64Array, count: number): number[] => Array.from(xs.subarray(0, count)).sort((a, c) => a - c);

/** The sample p-th quantile (element rule, as core/sim) of the first `count` values. */
export function sampleQuantile(xs: Float64Array, count: number, q: number): number {
  const sorted = sortedPrefix(xs, count);
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] : NaN;
}

export interface FanoutReport {
  n: number;
  /** Share of requests that touched a slow backend, exact. */
  touchSlow: number;
  /** p99 of one call and of the slowest of N, exact (analytic) and from the run. */
  singleP99: number;
  slowestP99: number;
  singleP99Sim: number;
  slowestP99Sim: number;
  medianSlowN: number;
}

export function fanoutReport(b: Backend, n: number, run: FanoutState): FanoutReport {
  return {
    n,
    touchSlow: touchesSlow(b.slowProb, n),
    singleP99: callQuantile(b, P99),
    slowestP99: slowestQuantile(b, n, P99),
    singleP99Sim: sampleQuantile(run.single, run.count, P99),
    slowestP99Sim: sampleQuantile(run.slowest, run.count, P99),
    medianSlowN: medianSlowWidth(b.slowProb),
  };
}

/** The histogram of a run as plot points (bin centre, count) over log-spaced bins, for a line. */
export const HISTOGRAM_BINS = 48;

/* ---------- scene 2: hedged requests ---------- */

/** Scene 2's backend is fixed (the scene-1 default), so no hidden control feeds its numbers. */
export const HEDGE_BACKEND: Backend = BACKEND_DEFAULT;

export interface Hedge {
  /** Wait this long for the first reply before sending the next copy (ms). */
  delay: number;
  /** Copies in all: 1 is no hedging. */
  replicas: 1 | 2 | 3;
  /** Chance that every copy shares the first one's fate (same latency): a shared rack or dependency. */
  correlation: number;
}

export const REPLICA_CHOICES: readonly Hedge['replicas'][] = [1, 2, 3];
export const HEDGE_DELAY_RANGE = { min: 0, max: 300, step: 1 } as const;
export const CORRELATION_RANGE = { min: 0, max: 1, step: 0.05 } as const;

/** The hedge delay that is the single-request p95: about 5% of requests wait that long. */
export const p95DelayMs = (b: Backend): number => Math.round(callQuantile(b, HEDGE_DELAY_QUANTILE));

export const HEDGE_DEFAULT: Hedge = { delay: p95DelayMs(HEDGE_BACKEND), replicas: 2, correlation: 0 };

/** P(request latency > t) with hedging: shared fate (the copies behave as one) or independent copies sent at delay, 2·delay, … */
export function hedgedSurvival(b: Backend, hedge: Hedge, t: number): number {
  if (t <= 0) return 1;
  let independent = 1;
  for (let j = 0; j < hedge.replicas && j * hedge.delay < t; j++) independent *= callSurvival(b, t - j * hedge.delay);
  return hedge.correlation * callSurvival(b, t) + (1 - hedge.correlation) * independent;
}

/** The q-quantile of a hedged request's latency, read from the survival formula. */
export const hedgedQuantile = (b: Backend, hedge: Hedge, q: number): number => solveSurvival((t) => hedgedSurvival(b, hedge, t), 1 - q);

/** Extra requests sent per request: copy j goes out only if no reply has come by j·delay, so Σ P(latency > j·delay). */
export function extraLoad(b: Backend, hedge: Hedge): number {
  let extra = 0;
  for (let j = 1; j < hedge.replicas; j++) extra += hedgedSurvival(b, hedge, j * hedge.delay);
  return extra;
}

export interface HedgedRequest {
  /** When each copy that was sent went out, and when it would reply (both ms from the request's start). */
  sentAt: number[];
  replyAt: number[];
  /** When the first reply arrived, and which copy it came from. */
  latency: number;
  winner: number;
}

/** One request: copy 0 at time 0; copy j at j·delay if nothing has replied; the first reply wins and the rest are cancelled. */
export function drawHedged(b: Backend, hedge: Hedge, rnd: Rnd): HedgedRequest {
  const first = sampleCall(b, rnd);
  const shared = rnd() < hedge.correlation;
  const sentAt = [0];
  const replyAt = [first];
  let latency = first;
  let winner = 0;
  for (let j = 1; j < hedge.replicas; j++) {
    if (latency <= j * hedge.delay) break;
    const own = shared ? first : sampleCall(b, rnd);
    sentAt.push(j * hedge.delay);
    replyAt.push(j * hedge.delay + own);
    if (j * hedge.delay + own < latency) {
      latency = j * hedge.delay + own;
      winner = j;
    }
  }
  return { sentAt, replyAt, latency, winner };
}

export const SAMPLE_REQUESTS = 6;

export interface HedgeState {
  tick: number;
  count: number;
  /** The latency each request would have had without hedging (its first copy), and with it. */
  plain: Float64Array;
  hedged: Float64Array;
  /** Copies sent per request. */
  sent: Uint8Array;
  /** Requests kept in full for the timeline: the first few that hedged, and the first few that did not. */
  hedgedPicks: IndexedRequest[];
  plainPicks: IndexedRequest[];
}

interface IndexedRequest {
  index: number;
  request: HedgedRequest;
}

/** How many hedged requests the timeline shows when the run has them; the rest of the six are requests that never hedged. */
export const SAMPLE_HEDGED = 3;

export function createHedgeRun(b: Backend, hedge: Hedge, seed: number): TickSim<HedgeState> {
  return createTickSim<HedgeState>({
    seed,
    init: () => ({ tick: 0, count: 0, plain: new Float64Array(REQUESTS), hedged: new Float64Array(REQUESTS), sent: new Uint8Array(REQUESTS), hedgedPicks: [], plainPicks: [] }),
    step: (s, rnd, tick) => {
      for (let i = s.count; i < tick * PER_TICK; i++) {
        const request = drawHedged(b, hedge, rnd);
        s.plain[i] = request.replyAt[0];
        s.hedged[i] = request.latency;
        s.sent[i] = request.sentAt.length;
        if (request.sentAt.length > 1) {
          if (s.hedgedPicks.length < SAMPLE_HEDGED) s.hedgedPicks.push({ index: i, request });
        } else if (s.plainPicks.length < SAMPLE_REQUESTS) {
          s.plainPicks.push({ index: i, request });
        }
      }
      return { ...s, tick, count: tick * PER_TICK };
    },
  });
}

/** The six requests the timeline draws, in the order they were made: up to three that hedged, the rest that did not. */
export function timelineSamples(s: HedgeState): HedgedRequest[] {
  const hedged = s.hedgedPicks.slice(0, SAMPLE_HEDGED);
  const plain = s.plainPicks.slice(0, SAMPLE_REQUESTS - hedged.length);
  return [...hedged, ...plain].sort((a, b) => a.index - b.index).map((p) => p.request);
}

export interface HedgeRun extends HedgeState {
  samples: HedgedRequest[];
}

export function hedgeRun(b: Backend, hedge: Hedge, seed: number): HedgeRun {
  const sim = createHedgeRun(b, hedge, seed);
  sim.run(RUN_TICKS);
  return { ...sim.state, samples: timelineSamples(sim.state) };
}

export interface HedgeReport {
  plainP99: number;
  hedgedP99: number;
  plainP99Sim: number;
  hedgedP99Sim: number;
  extra: number;
  extraSim: number;
}

export function hedgeReport(b: Backend, hedge: Hedge, run: HedgeState): HedgeReport {
  let sent = 0;
  for (let i = 0; i < run.count; i++) sent += run.sent[i];
  return {
    plainP99: callQuantile(b, P99),
    hedgedP99: hedgedQuantile(b, hedge, P99),
    plainP99Sim: sampleQuantile(run.plain, run.count, P99),
    hedgedP99Sim: sampleQuantile(run.hedged, run.count, P99),
    extra: extraLoad(b, hedge),
    extraSim: sent / run.count - 1,
  };
}

/* ---------- scene 3: when hedging hurts (an M/M/1 backend) ---------- */

/** The backend's service rate and the hedge delay: both made up. Hedges are not cancelled here (a stated simplification). */
export const MM1 = { mu: 100, hedgeAfterMs: 30 } as const;
export const MM1_RHO = { min: 0.1, max: 0.95, step: 0.05 } as const;
export const MM1_DEFAULT_RHO = 0.3;
export const MM1_SWEEP_STEP = 0.01;
const MAX_FIXED_POINT_ITERATIONS = 100;
const FIXED_POINT_TOLERANCE = 1e-12;
const MS_PER_S = 1000;

/** The plain p99 of an M/M/1 time in system, which is exponential with rate μ(1 − ρ): ln(100)/(μ(1 − ρ)), in ms. */
export const mm1PlainP99 = (rho: number): number => (Math.log(100) / (MM1.mu * (1 - rho))) * MS_PER_S;

export interface Mm1Hedging {
  rho: number;
  /** The utilisation once the hedges' extra requests are counted, or null when no steady state exists. */
  loadedRho: number | null;
  /** Extra requests per request, P(T > h) at the loaded utilisation. */
  extra: number | null;
  plainP99: number;
  /** The hedged p99 in ms, or null when the hedges overload the backend. */
  hedgedP99: number | null;
}

/** ρ′ = ρ(1 + P(T > h)), with P(T > h) = e^(−μ(1 − ρ′)h): monotone iteration from ρ. Null when it passes 1 or has not settled in 100 steps. */
export function loadedUtilisation(rho: number): number | null {
  const h = MM1.hedgeAfterMs / MS_PER_S;
  let x = rho;
  for (let i = 0; i < MAX_FIXED_POINT_ITERATIONS; i++) {
    const next = rho * (1 + Math.exp(-MM1.mu * (1 - x) * h));
    if (next >= 1) return null;
    if (Math.abs(next - x) < FIXED_POINT_TOLERANCE) return next;
    x = next;
  }
  return null;
}

export function mm1Hedging(rho: number): Mm1Hedging {
  const plainP99 = mm1PlainP99(rho);
  const loaded = loadedUtilisation(rho);
  if (loaded === null) return { rho, loadedRho: null, extra: null, plainP99, hedgedP99: null };
  const theta = MM1.mu * (1 - loaded);
  const h = MM1.hedgeAfterMs / MS_PER_S;
  const ln100 = Math.log(100);
  const seconds = Math.exp(-theta * h) <= 0.01 ? ln100 / theta : (ln100 + theta * h) / (2 * theta);
  return { rho, loadedRho: loaded, extra: loaded / rho - 1, plainP99, hedgedP99: seconds * MS_PER_S };
}

/** True when hedging leaves the p99 no better, or breaks the backend. */
export const hedgingHurts = (r: Mm1Hedging): boolean => r.hedgedP99 === null || r.hedgedP99 > r.plainP99;

/** The first ρ on a 1% grid, from the slider's minimum, where hedging hurts; null if it never does up to the slider's maximum. */
export function crossoverRho(): number | null {
  const steps = Math.round((MM1_RHO.max - MM1_RHO.min) / MM1_SWEEP_STEP);
  for (let i = 0; i <= steps; i++) {
    const rho = Math.round((MM1_RHO.min + i * MM1_SWEEP_STEP) * 100) / 100;
    if (hedgingHurts(mm1Hedging(rho))) return rho;
  }
  return null;
}

/** Each scene's default state, named so a test can pin the real first screen. */
export const FANOUT_SCENE_DEFAULT = { backend: BACKEND_DEFAULT, n: FANOUT_DEFAULT, seed: 1 };
export const HEDGE_SCENE_DEFAULT = { hedge: HEDGE_DEFAULT, seed: 1 };
export const MM1_SCENE_DEFAULT = { rho: MM1_DEFAULT_RHO };
