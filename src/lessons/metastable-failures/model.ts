/**
 * A single queue with timeouts and retries on core/simTick, the model behind "retry storms and metastable failures".
 * Pure logic, no React. One tick is an abstract unit (the lesson says "tick", never milliseconds).
 *
 * The rules, as the lesson prints them:
 * - The server spends one unit of capacity per item at the head of one FIFO queue, whether the client still waits for it
 *   (live: goodput) or gave up (abandoned: wasted work). Capacity is CAPACITY per tick, TRIGGER_CAPACITY during the trigger.
 * - New requests arrive Poisson(lambda) per tick. A request whose client has waited `timeout` ticks gives up; if it has made
 *   fewer than 1 + retries attempts, the client sends a retry that joins the tail of the queue the next tick.
 * - State is cohorts (items enqueued on one tick as one attempt are interchangeable), so a tick's history copy stays small.
 */
import { poisson } from '../../core/distributions';
import { fmix32 } from '../../core/hash';
import { createTickSim, type TickSim } from '../../core/simTick';
import type { Rnd } from '../../core/random';

export const CAPACITY = 100;
export const TRIGGER_CAPACITY = 20;
export const TRIGGER_START = 20;
export const RUN_TICKS = 200;
/** The second scene runs longer, so a long outage's drain (about 130 ticks after a 60-tick trigger) fits in the picture. */
export const FIX_RUN_TICKS = 300;
export const RECOVERY_HORIZON = 60;
/** Ticks over which recovery is judged: goodput against new arrivals in the window ending at the horizon. */
export const RECOVERY_WINDOW = 10;
export const RECOVERED_SHARE = 0.9;
/** The collapsed label: goodput below this share of the load over the last COLLAPSE_WINDOW ticks. */
export const COLLAPSED_SHARE = 0.1;
export const COLLAPSE_WINDOW = 100;
export const SWEEP_SEEDS = 200;
/** The lowest seed (from 1) that stays collapsed with no mitigation under its own seed-drawn trigger: pinned by the test. */
export const BROKEN_SEED = 1;
export const TOKEN_CAP = 10;

export const LOAD = { min: 10, max: 95, default: 70 } as const;
export const TIMEOUT = { min: 2, max: 10, default: 4 } as const;
export const RETRIES = { min: 0, max: 5, default: 3 } as const;
export const TRIGGER = { min: 0, max: 30, default: 10 } as const;
export const RATIO = { min: 0, max: 0.7, step: 0.05, default: 0.1 } as const;
export const JITTER = { min: 0, max: 8, default: 4 } as const;
export const QMAX = { min: 100, max: 1000, step: 50, default: 300 } as const;
export const LONG_OUTAGE = 60;

export interface MetaParams {
  lambda: number;
  timeout: number;
  retries: number;
  /** Trigger length in ticks; 0 means no trigger. */
  trigger: number;
  /** The server skips an abandoned item for free. */
  cancel: boolean;
  /** Retry budget ratio (a token bucket refilled by ratio x new requests), or null for none. */
  budget: number | null;
  /** The bucket holds at most this many tokens, so at most this many retries leave in a tick. */
  tokenCap: number;
  /** A retry waits a seeded 0 to this many extra ticks, or null for none. */
  jitter: number | null;
  /** Reject arrivals while the queue holds this many items or more, or null for no shedding. */
  shed: number | null;
  seed: number;
}

export const defaultParams = (): MetaParams => ({
  lambda: LOAD.default, timeout: TIMEOUT.default, retries: RETRIES.default, trigger: TRIGGER.default,
  cancel: false, budget: null, tokenCap: TOKEN_CAP, jitter: null, shed: null, seed: 0,
});

interface Cohort {
  enq: number;
  att: number;
  count: number;
  dead: boolean;
}
interface Retry {
  at: number;
  att: number;
  count: number;
}

/** What happened on one tick. */
export interface TickStats {
  newArrivals: number;
  retryArrivals: number;
  rejected: number;
  goodput: number;
  wasted: number;
  cancelled: number;
  capacity: number;
  queue: number;
}
export interface Totals {
  offered: number;
  accepted: number;
  rejected: number;
  goodput: number;
  wasted: number;
  cancelled: number;
}
export interface MetaState {
  queue: Cohort[];
  retries: Retry[];
  tokens: number;
  tick: TickStats;
  total: Totals;
}

const EMPTY_TICK: TickStats = { newArrivals: 0, retryArrivals: 0, rejected: 0, goodput: 0, wasted: 0, cancelled: 0, capacity: CAPACITY, queue: 0 };
const EMPTY_TOTAL: Totals = { offered: 0, accepted: 0, rejected: 0, goodput: 0, wasted: 0, cancelled: 0 };

export const initialState = (tokens = TOKEN_CAP): MetaState => ({ queue: [], retries: [], tokens, tick: { ...EMPTY_TICK }, total: { ...EMPTY_TOTAL } });

const cloneState = (s: MetaState): MetaState => ({
  queue: s.queue.map((c) => ({ ...c })),
  retries: s.retries.map((r) => ({ ...r })),
  tokens: s.tokens,
  tick: s.tick,
  total: s.total,
});

export const queueLength = (s: MetaState): number => s.queue.reduce((n, c) => n + c.count, 0);
export const capacityAt = (tick: number, trigger: number): number => (trigger > 0 && tick >= TRIGGER_START && tick < TRIGGER_START + trigger ? TRIGGER_CAPACITY : CAPACITY);

/** A deterministic unit number for (seed, tick, attempt, item): the retry delays need no random stream of their own. */
const unit = (seed: number, tick: number, att: number, i: number): number => fmix32(Math.imul(seed, 0x9e3779b1) ^ fmix32(tick * 0x85ebca6b + att * 0xc2b2ae35 + i)) / 2 ** 32;

/** Advance `s` by one tick, in place. The one implementation: `createTickSim` copies first, sweeps run it directly. */
function advance(s: MetaState, p: MetaParams, rnd: Rnd, tick: number): void {
  const give = (att: number, count: number) => {
    if (count <= 0 || att > p.retries + 1) return;
    let allowed = count;
    if (p.budget !== null) {
      allowed = Math.min(count, Math.floor(s.tokens));
      s.tokens -= allowed;
    }
    if (allowed <= 0) return;
    if (p.jitter === null || p.jitter === 0) {
      s.retries.push({ at: tick + 1, att, count: allowed });
      return;
    }
    const buckets = Array.from({ length: p.jitter + 1 }, () => 0);
    for (let i = 0; i < allowed; i++) buckets[Math.floor(unit(p.seed, tick, att, i) * (p.jitter + 1))] += 1;
    buckets.forEach((c, wait) => {
      if (c > 0) s.retries.push({ at: tick + 1 + wait, att, count: c });
    });
  };

  // 1. Clients that have waited the timeout give up; each may send a retry.
  for (const c of s.queue) {
    if (c.enq > tick - p.timeout) break;
    if (!c.dead) {
      c.dead = true;
      give(c.att + 1, c.count);
    }
  }

  // 2. Arrivals: new requests, then retries that are due, subject to shedding.
  const newCount = p.lambda > 0 ? poisson(rnd, p.lambda) : 0;
  if (p.budget !== null) s.tokens = Math.min(p.tokenCap, s.tokens + p.budget * newCount);
  let held = s.queue.reduce((n, c) => n + c.count, 0);
  let accepted = 0;
  let rejected = 0;
  const admit = (att: number, count: number): number => {
    const room = p.shed === null ? count : Math.max(0, Math.min(count, p.shed - held));
    if (room > 0) {
      s.queue.push({ enq: tick, att, count: room, dead: false });
      held += room;
    }
    rejected += count - room;
    accepted += room;
    return room;
  };
  admit(1, newCount);
  const due = s.retries.filter((r) => r.at <= tick).sort((a, b) => a.att - b.att);
  s.retries = s.retries.filter((r) => r.at > tick);
  let retryArrivals = 0;
  for (const r of due) retryArrivals += r.count;
  for (const r of due) admit(r.att, r.count);

  // 3. Service: one unit per item at the head, an abandoned item skipped for free when the server cancels.
  const capacity = capacityAt(tick, p.trigger);
  let left = capacity;
  let goodput = 0;
  let wasted = 0;
  let cancelled = 0;
  while (s.queue.length > 0) {
    const head = s.queue[0];
    if (head.dead && p.cancel) {
      cancelled += head.count;
      s.queue.shift();
      continue;
    }
    if (left <= 0) break;
    const k = Math.min(head.count, left);
    left -= k;
    if (head.dead) wasted += k;
    else goodput += k;
    head.count -= k;
    if (head.count === 0) s.queue.shift();
  }
  held = s.queue.reduce((n, c) => n + c.count, 0);
  s.tick = { newArrivals: newCount, retryArrivals, rejected, goodput, wasted, cancelled, capacity, queue: held };
  const t = s.total;
  s.total = {
    offered: t.offered + newCount + retryArrivals, accepted: t.accepted + accepted, rejected: t.rejected + rejected,
    goodput: t.goodput + goodput, wasted: t.wasted + wasted, cancelled: t.cancelled + cancelled,
  };
}

/** Conservation, every tick: offered = accepted + rejected, and accepted = served live + served abandoned + skipped + still queued. */
export function conservation(s: MetaState): string | null {
  for (const c of s.queue) if (!Number.isInteger(c.count) || c.count <= 0) return 'a cohort holds a non-positive or fractional count';
  const t = s.total;
  const q = queueLength(s);
  if (t.offered !== t.accepted + t.rejected) return `offered ${t.offered} is not accepted ${t.accepted} plus rejected ${t.rejected}`;
  if (t.accepted !== t.goodput + t.wasted + t.cancelled + q) return `accepted ${t.accepted} is not served ${t.goodput + t.wasted}, skipped ${t.cancelled} and queued ${q}`;
  if (s.tick.goodput + s.tick.wasted > s.tick.capacity) return `spent ${s.tick.goodput + s.tick.wasted} units of ${s.tick.capacity}`;
  return null;
}

/** One tick from `state` without the sim wrapper (for hand-worked vectors): returns a new state. */
export function stepOnce(state: MetaState, p: MetaParams, rnd: Rnd, tick: number): MetaState {
  const next = cloneState(state);
  advance(next, p, rnd, tick);
  return next;
}

export function createMetaSim(p: MetaParams): TickSim<MetaState> {
  return createTickSim<MetaState>({
    seed: p.seed,
    init: () => initialState(p.tokenCap),
    step: (state, rnd, tick) => stepOnce(state, p, rnd, tick),
    check: conservation,
  });
}

/* ---------- reading a run ---------- */

export interface MetaRun {
  params: MetaParams;
  /** stats[t] is what happened on tick t (index 0 is the empty start). */
  stats: TickStats[];
}

export function runMeta(p: MetaParams, ticks = RUN_TICKS): MetaRun {
  const sim = createMetaSim(p);
  sim.run(ticks);
  return { params: p, stats: sim.history.map((s) => s.tick) };
}

const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);
const window = (stats: TickStats[], from: number, to: number): TickStats[] => stats.slice(Math.max(1, from), to + 1);

/** The first tick from which goodput is back to RECOVERED_SHARE of the new arrivals over a RECOVERY_WINDOW, or null. */
export function recoveryTick(run: MetaRun): number | null {
  const { trigger } = run.params;
  const end = TRIGGER_START + trigger;
  for (let t = end + RECOVERY_WINDOW; t < run.stats.length; t++) {
    const w = window(run.stats, t - RECOVERY_WINDOW + 1, t);
    if (sum(w.map((x) => x.goodput)) >= RECOVERED_SHARE * sum(w.map((x) => x.newArrivals))) return t - RECOVERY_WINDOW + 1;
  }
  return null;
}

/** Collapsed: goodput below COLLAPSED_SHARE of the load over the last COLLAPSE_WINDOW ticks of the run. */
export function isCollapsed(run: MetaRun): boolean {
  const w = run.stats.slice(-COLLAPSE_WINDOW);
  return sum(w.map((x) => x.goodput)) / w.length < COLLAPSED_SHARE * run.params.lambda;
}

export type Phase = 'no trigger' | 'recovered' | 'collapsed' | 'recovering';
export function phaseOf(run: MetaRun): { phase: Phase; recoveredAt: number | null } {
  if (run.params.trigger === 0) return { phase: 'no trigger', recoveredAt: null };
  const recoveredAt = recoveryTick(run);
  if (recoveredAt !== null) return { phase: 'recovered', recoveredAt };
  return { phase: isCollapsed(run) ? 'collapsed' : 'recovering', recoveredAt: null };
}

/** Rule 0, recovery: goodput is back to 90% of the new arrivals in the window ending RECOVERY_HORIZON ticks after the trigger ends. */
export function recoversByHorizon(p: MetaParams): boolean {
  const end = TRIGGER_START + p.trigger;
  const horizon = end + RECOVERY_HORIZON;
  const run = runMeta(p, horizon);
  const w = window(run.stats, horizon - RECOVERY_WINDOW + 1, horizon);
  return sum(w.map((x) => x.goodput)) >= RECOVERED_SHARE * sum(w.map((x) => x.newArrivals));
}

/** The trigger length the seeded sweep gives a seed: 2 to 14 ticks, a different one per seed. */
export const triggerForSeed = (seed: number): number => 2 + ((seed * 7) % 13);

/** Seeds in [from, to) whose own trigger leaves the system collapsed at the horizon (each with its seed-drawn trigger length). */
export function collapsedSeeds(base: MetaParams, from = 1, to = SWEEP_SEEDS + 1): number[] {
  const bad: number[] = [];
  for (let seed = from; seed < to; seed++) if (!recoversByHorizon({ ...base, seed, trigger: triggerForSeed(seed) })) bad.push(seed);
  return bad;
}

/** Share of `seeds` seeds that do not recover when the trigger is `trigger` ticks long for all of them. */
export function collapseShare(base: MetaParams, trigger: number, seeds = SWEEP_SEEDS): number {
  let bad = 0;
  for (let seed = 1; seed <= seeds; seed++) if (!recoversByHorizon({ ...base, seed, trigger })) bad += 1;
  return bad / seeds;
}

/** The mechanism of a collapse, read from the tail of a run: arrivals per tick and the share of capacity spent on abandoned work. */
export function collapseMechanism(run: MetaRun, tail = COLLAPSE_WINDOW): { arrivals: number; wastedShare: number } {
  const w = run.stats.slice(-tail);
  return { arrivals: sum(w.map((x) => x.newArrivals + x.retryArrivals)) / w.length, wastedShare: sum(w.map((x) => x.wasted)) / sum(w.map((x) => x.capacity)) };
}

/* ---------- closed forms ---------- */

/** Every attempt times out, so a request offers 1 + retries arrivals: the load the queue sees while collapsed. */
export const effectiveLoad = (lambda: number, retries: number): number => lambda * (1 + retries);

/** The loop can sustain itself iff lambda (1 + R) >= mu. */
export const canSustain = (lambda: number, retries: number): boolean => effectiveLoad(lambda, retries) >= CAPACITY;

/** The load at which that flips: mu / (1 + R). */
export const crossoverLoad = (retries: number): number => CAPACITY / (1 + retries);

/** First-order tipping point: the trigger length at which the backlog reaches mu x Tc, the wait that exceeds the timeout. Ignores the retries sent during the trigger. */
export const firstOrderTipping = (lambda: number, timeout: number): number => (CAPACITY * timeout) / (lambda - TRIGGER_CAPACITY);

/** Backlog at the end of a trigger of length d, to first order. */
export const backlogAfter = (lambda: number, trigger: number): number => trigger * (lambda - TRIGGER_CAPACITY);

/** The effective load with a retry budget while collapsed: new requests plus the retries the bucket lets through, at most the bucket's cap per tick. */
export const budgetedLoad = (lambda: number, ratio: number, tokenCap: number = TOKEN_CAP): number => lambda + Math.min(ratio * lambda, tokenCap);

/** Ticks a backlog takes to drain once the effective load is below capacity. */
export const drainTime = (backlog: number, lambdaEff: number): number | null => (lambdaEff < CAPACITY ? backlog / (CAPACITY - lambdaEff) : null);
