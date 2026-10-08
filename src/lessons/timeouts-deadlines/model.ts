// A request fans through A -> B -> C -> database. Pure model, no React: every number the
// lesson draws or says comes from here, and model.test.ts checks it against brute force.
//
// Time is in seconds from the moment the user sends the request. All costs are illustrative.
import { gaussian } from '../../core/fixtures/datasets';
import { mulberry32 } from '../../core/random';
import { histogram } from '../../core/stats';
import { percentile } from '../../core/sim';

/** One-way network hop between two services. */
export const NET = 0.05;
/** Each service's own work before it calls the next one. */
export const OWN_WORK = 0.05;
/** The smallest budget a hop will bother starting with when a deadline is propagated. */
export const MIN_BUDGET = 0.1;
/** The database's latency on a normal request, and during a slow spike. */
export const NORMAL_DB = 0.15;
export const SLOW_DB = 4;

/** Times are kept to the microsecond so sums like 0.1 + 0.05 compare exactly. */
export const round = (x: number) => Math.round(x * 1e6) / 1e6;

export type HopId = 'A' | 'B' | 'C' | 'DB';
export const HOPS: readonly HopId[] = ['A', 'B', 'C', 'DB'];
/** The hops that call a downstream hop, and so own a timeout. */
export type CallerId = 'A' | 'B' | 'C';
export const CALLERS: readonly CallerId[] = ['A', 'B', 'C'];
export const HOP_NAME: Record<HopId, string> = { A: 'A', B: 'B', C: 'C', DB: 'database' };

export interface ChainParams {
  /** How long the user waits before giving up. With propagation this is also the deadline. */
  patience: number;
  /** Each caller's timeout on the call it makes downstream: A waits for B, B for C, C for the database. */
  timeouts: Record<CallerId, number>;
  /** How long the database takes to answer. */
  dbLatency: number;
  /** How long B's request sits in a queue before B starts on it. */
  queueB: number;
  /** Pass the deadline downstream, tightened by each caller's own timeout, and stop at it (cancel), or not. */
  propagate: boolean;
}

/**
 * ok: it answered. error: its downstream failed and it passed that on. timeout: it stopped
 * waiting on its own timeout. deadline: it ran out of the propagated budget (stopped waiting,
 * or refused to start).
 */
export type Outcome = 'ok' | 'error' | 'timeout' | 'deadline' | 'idle';

export interface HopRun {
  id: HopId;
  /** The call got as far as this hop. */
  reached: boolean;
  /** The call reached this hop. */
  arrive: number;
  /** It began work (after any queue wait). */
  start: number;
  /** It stopped working: answered, gave up waiting, or refused. */
  finish: number;
  outcome: Outcome;
  /** It refused to start because the remaining budget was under MIN_BUDGET. */
  refused: boolean;
  /** Budget left on arrival at work start (propagation only). */
  budget: number | null;
  /** When it called downstream (callers only). */
  callAt: number | null;
  /** When its caller stops waiting for it. */
  expiry: number;
  /** Until when its work is still wanted by the user and by every caller above it. */
  usefulUntil: number;
  /** Seconds of work done after nobody wanted it: max(0, finish - max(start, usefulUntil)). */
  wasted: number;
  /** It answered ok, but its caller had already stopped waiting. */
  lateSuccess: boolean;
}

export interface ChainRun {
  params: ChainParams;
  hops: HopRun[];
  /** The user's give-up time (equal to patience). */
  gaveUp: number;
  /** What the user sees: A's answer if it arrives in time, otherwise they give up. */
  userSees: 'ok' | 'error' | 'gave-up';
  /** When A's answer reaches the user. */
  answerAt: number;
  /** The last moment any hop is still working. */
  end: number;
  totalWasted: number;
}

export const hopOf = (run: ChainRun, id: HopId) => run.hops.find((h) => h.id === id)!;

/** What a hop reports when its downstream answered in time: success, a deadline error, or a plain error. */
const passedUp = (down: Outcome): Outcome => (down === 'ok' ? 'ok' : down === 'deadline' ? 'deadline' : 'error');

/** The budget left when work starts at `start` under an absolute `deadline`: deadline minus elapsed. */
export const remainingBudget = (deadline: number, start: number) => round(deadline - start);

export function runChain(params: ChainParams): ChainRun {
  const { patience, timeouts, dbLatency, queueB, propagate } = params;
  const runs: HopRun[] = [];

  // Callee first: each hop is run given when it is reached; its downstream is run recursively.
  const visit = (index: number, arrive: number, expiry: number): HopRun => {
    const id = HOPS[index];
    const queue = id === 'B' ? queueB : 0;
    const start = round(arrive + queue);
    const budget = propagate ? remainingBudget(expiry, start) : null;
    const base = { id, reached: true, arrive, start, budget, expiry };
    if (propagate && budget! < MIN_BUDGET) {
      const refused: HopRun = { ...base, finish: start, outcome: 'deadline', refused: true, callAt: null, usefulUntil: 0, wasted: 0, lateSuccess: false };
      runs[index] = refused;
      return refused;
    }
    if (id === 'DB') {
      const natural = round(start + dbLatency);
      const cut = propagate && natural > expiry;
      const db: HopRun = {
        ...base, finish: cut ? expiry : natural, outcome: cut ? 'deadline' : 'ok', refused: false, callAt: null, usefulUntil: 0, wasted: 0, lateSuccess: false,
      };
      runs[index] = db;
      return db;
    }
    const caller = id as CallerId;
    const callAt = round(start + OWN_WORK);
    const effective = propagate ? Math.min(timeouts[caller], remainingBudget(expiry, callAt)) : timeouts[caller];
    const myExpiry = round(callAt + effective);
    const down = visit(index + 1, round(callAt + NET), myExpiry);
    const answerAt = round(down.finish + NET);
    let hop: HopRun;
    if (answerAt <= myExpiry) {
      hop = { ...base, finish: answerAt, outcome: passedUp(down.outcome), refused: false, callAt, usefulUntil: 0, wasted: 0, lateSuccess: false };
    } else {
      const budgetLimited = propagate && effective < timeouts[caller];
      hop = { ...base, finish: myExpiry, outcome: budgetLimited ? 'deadline' : 'timeout', refused: false, callAt, usefulUntil: 0, wasted: 0, lateSuccess: false };
    }
    runs[index] = hop;
    return hop;
  };
  visit(0, NET, patience);

  // usefulUntil: the earliest moment any caller above (the user included) stops waiting.
  let wanted = patience;
  let lastFinish = NET;
  const hops = HOPS.map((id, i) => {
    const h: HopRun = runs[i] ?? {
      id, reached: false, arrive: lastFinish, start: lastFinish, finish: lastFinish, outcome: 'idle', refused: false, budget: null,
      callAt: null, expiry: lastFinish, usefulUntil: 0, wasted: 0, lateSuccess: false,
    };
    lastFinish = h.finish;
    const usefulUntil = Math.min(wanted, h.expiry);
    wanted = usefulUntil;
    const wasted = round(Math.max(0, h.finish - Math.max(h.start, usefulUntil)));
    const lateSuccess = h.outcome === 'ok' && round(h.finish + NET) > h.expiry;
    return { ...h, usefulUntil, wasted, lateSuccess };
  });

  const a = hops[0];
  const answerAt = round(a.finish + NET);
  const userSees = answerAt <= patience ? (a.outcome === 'ok' ? 'ok' : 'error') : 'gave-up';
  return {
    params, hops, gaveUp: patience, userSees, answerAt,
    end: Math.max(...hops.map((h) => h.finish)),
    totalWasted: round(hops.reduce((s, h) => s + h.wasted, 0)),
  };
}

// ── Retries inside the budget ────────────────────────────────────────────

/** Attempts A makes at most, naive or budgeted. */
export const MAX_ATTEMPTS = 3;
/** In the retry scene every attempt hits a replica that is too slow to answer in any sensible timeout. */
export const SLOW_ATTEMPT = 2.5;
/** What a healthy attempt typically costs (the p50 used to decide whether a retry fits). */
export const TYPICAL_ATTEMPT = 0.3;

export interface Attempt {
  n: number;
  start: number;
  /** When the attempt stopped: answered or timed out. */
  end: number;
  outcome: 'ok' | 'timeout';
}

export interface RetryRun {
  strategy: 'naive' | 'budgeted';
  attempts: Attempt[];
  /** The retry the budget refused, with the budget that was left. */
  refused: { n: number; remaining: number } | null;
  /** When A stopped (answered or gave up). */
  finish: number;
  /** Seconds of attempt time after the caller's deadline. */
  afterDeadline: number;
}

/** A retry is only worth starting if its expected cost fits in what is left. */
export const retryFits = (remaining: number, expectedCost: number) => expectedCost <= remaining;

/**
 * A makes up to MAX_ATTEMPTS attempts, each cut off at the attempt timeout. `latencies[i]` is how
 * long attempt i would take. Naive retries whenever one fails; budgeted ones also check the
 * deadline: a retry starts only if its expected cost fits in what is left, and an attempt's
 * timeout never runs past the deadline.
 */
export function runRetries(
  strategy: RetryRun['strategy'],
  o: { deadline: number; attemptTimeout: number; latencies: readonly number[]; expectedCost?: number },
): RetryRun {
  const expected = o.expectedCost ?? TYPICAL_ATTEMPT;
  const attempts: Attempt[] = [];
  let now = 0;
  let refused: RetryRun['refused'] = null;
  for (let n = 1; n <= MAX_ATTEMPTS; n++) {
    const remaining = round(o.deadline - now);
    if (strategy === 'budgeted' && !retryFits(remaining, expected)) {
      refused = { n, remaining: Math.max(0, remaining) };
      break;
    }
    const limit = strategy === 'budgeted' ? Math.min(o.attemptTimeout, remaining) : o.attemptTimeout;
    const latency = o.latencies[Math.min(n - 1, o.latencies.length - 1)];
    const ok = latency <= limit;
    const end = round(now + (ok ? latency : limit));
    attempts.push({ n, start: now, end, outcome: ok ? 'ok' : 'timeout' });
    now = end;
    if (ok) break;
  }
  const afterDeadline = round(attempts.reduce((s, a) => s + Math.max(0, a.end - Math.max(a.start, o.deadline)), 0));
  return { strategy, attempts, refused, finish: now, afterDeadline };
}

/** Calls the busiest hop sees for one user request when every one of `hops` layers makes `attempts` tries. */
export const amplification = (attempts: number, hops: number) => attempts ** hops;

// ── Picking a timeout ─────────────────────────────────────────────────────

export interface LatencySample {
  seconds: number;
  /** A request that never finishes in a sensible time (a stuck connection, a lost reply). */
  stuck: boolean;
}

export const SAMPLE_COUNT = 4000;
export const LATENCY_SEED = 11;
const MEDIAN = 0.15;
const SPREAD = 0.5;
const STUCK_SHARE = 0.005;
const STUCK_RANGE: readonly [number, number] = [3, 6];

/** Seeded latencies of one call: a log-normal bulk plus a thin tail of stuck requests. */
export function latencySamples(seed = LATENCY_SEED, count = SAMPLE_COUNT): LatencySample[] {
  const rnd = mulberry32(seed);
  return Array.from({ length: count }, () => {
    if (rnd() < STUCK_SHARE) return { seconds: STUCK_RANGE[0] + rnd() * (STUCK_RANGE[1] - STUCK_RANGE[0]), stuck: true };
    return { seconds: MEDIAN * Math.exp(SPREAD * gaussian(rnd)), stuck: false };
  });
}

export interface TimeoutStats {
  p50: number;
  p99: number;
  /** Share of healthy requests that were cut off by this timeout. */
  healthyCut: number;
  /** Seconds a stuck request holds its caller (and a thread), averaged over the stuck ones. */
  stuckHold: number;
}

export function timeoutStats(samples: readonly LatencySample[], timeout: number): TimeoutStats {
  const sorted = samples.map((s) => s.seconds).sort((a, b) => a - b);
  const healthy = samples.filter((s) => !s.stuck);
  const stuck = samples.filter((s) => s.stuck);
  return {
    p50: percentile(sorted, 0.5),
    p99: percentile(sorted, 0.99),
    healthyCut: healthy.length ? healthy.filter((s) => s.seconds > timeout).length / healthy.length : 0,
    stuckHold: stuck.length ? stuck.reduce((sum, s) => sum + Math.min(s.seconds, timeout), 0) / stuck.length : 0,
  };
}

export const LOG_BINS = { min: 0.01, max: 10, bins: 40 } as const;

/** Latency histogram with log-spaced bins (so the bell and the stuck tail share a chart). */
export function logHistogram(samples: readonly LatencySample[]) {
  const lo = Math.log10(LOG_BINS.min);
  const hi = Math.log10(LOG_BINS.max);
  const h = histogram(samples.map((s) => Math.log10(s.seconds)), { bins: LOG_BINS.bins, min: lo, max: hi });
  return { edges: h.edges.map((e) => 10 ** e), counts: h.counts, outside: h.outside };
}

/** Timeout slider position (0..100) to seconds: log-spaced from 50 ms to 8 s. */
export const TIMEOUT_RANGE = { min: 0.05, max: 8 } as const;
export const timeoutAt = (position: number) =>
  Math.round(TIMEOUT_RANGE.min * (TIMEOUT_RANGE.max / TIMEOUT_RANGE.min) ** (position / 100) * 100) / 100;
