/**
 * One hot cache key and one database, as a fixed-tick seeded simulation (core/simTick). When the
 * key expires, requests miss and recompute; the database slows every query down once more of them
 * run at once than it has capacity for, so a herd can feed itself through timeouts and retries.
 * Every capacity and time here is a named constant and illustrative.
 *
 * The per-tick states are plain numbers. The requests, queries and events live in one ledger per
 * sim that only ever grows: a state records how far into it the sim is, and `init` builds a fresh
 * ledger, so the same seed replays the same run.
 */
import { poisson } from '../../core/distributions';
import { mulberry32, type Rnd } from '../../core/random';
import { percentile } from '../../core/sim';
import { createTickSim, type TickSim } from '../../core/simTick';

export const TICK_MS = 5;
export const SIM_MS = 8000;
export const SIM_TICKS = SIM_MS / TICK_MS;
/** The hot key's value expires this far into the run. */
export const EXPIRE_MS = 2000;
/** A recomputed value lives this long: past the end of the run, so one run holds one expiry. */
export const TTL_MS = 10_000;
/** Queries the database runs at full speed at once; past this each one slows in proportion. */
export const DB_CAPACITY = 100;
export const HIT_MS = 1;
/** Between a recompute finishing in the database and its value landing in the cache. */
export const WRITE_GAP_MS = 10;
export const CLIENT_TIMEOUT_MS = 1000;
export const LOCK_TIMEOUT_MS = 200;
export const LOAD_RANGE = { min: 50, max: 2000, step: 50 } as const;
export const RECOMPUTE_RANGE = { min: 50, max: 2000, step: 50 } as const;
export const DEFAULT_LAMBDA = 500;
export const DEFAULT_RECOMPUTE_MS = 500;
/** The seed a run opens on, and the one the broken singleflight is shown on (pinned by a test). */
export const BROKEN_SEED = 0;

const toTicks = (ms: number) => Math.round(ms / TICK_MS);
const EXPIRE_TICK = toTicks(EXPIRE_MS);
const TTL_TICKS = toTicks(TTL_MS);
const GAP_TICKS = toTicks(WRITE_GAP_MS);
const TIMEOUT_TICKS = toTicks(CLIENT_TIMEOUT_MS);
const LOCK_TICKS = toTicks(LOCK_TIMEOUT_MS);

export interface Mitigations {
  /** Request coalescing (singleflight): one recompute in flight, the rest wait for it. */
  coalesce: boolean;
  /** Serve the expired value while one request revalidates in the background. */
  stale: boolean;
  /** A lock with a timeout: one worker recomputes, the others return a default after the timeout. */
  lock: boolean;
  /** Probabilistic early refresh with this β (0 = off). */
  beta: number;
  /** The bug: the in-flight marker is released when the query finishes, before the value is written. */
  releaseEarly: boolean;
}

export const NO_MITIGATION: Mitigations = { coalesce: false, stale: false, lock: false, beta: 0, releaseEarly: false };

export interface StampedeConfig {
  seed: number;
  lambda: number;
  recomputeMs: number;
  mitigations: Mitigations;
}

export type Outcome = 'hit' | 'recomputed' | 'coalesced' | 'stale' | 'default' | 'timeout';
type WaitKind = 'own' | 'coalesced' | 'lock';
type QueryKind = 'miss' | 'winner' | 'early';

interface Ledger {
  qStartW: number[];
  qStartTick: number[];
  qDoneTick: number[];
  qWriteTick: number[];
  qKind: QueryKind[];
  waiters: number[][];
  rArrive: number[];
  rOutcome: (Outcome | null)[];
  rLatencyTicks: number[];
  rWaitKind: (WaitKind | null)[];
  rRetried: boolean[];
  deadlines: Map<number, number[]>;
  cache: { expiry: number };
  /** The query that holds the in-flight marker, or -1. */
  marker: number;
  retries: number;
}

export interface StampedeState {
  tick: number;
  /** Progress every running query has made, in ms of full-speed work: a query is done when this has grown by the recompute time since it started. */
  work: number;
  started: number;
  done: number;
  written: number;
  /** Recomputes started whose value has not landed in the cache yet. */
  inFlight: number;
  peakInFlight: number;
  peakDb: number;
  ledger: Ledger;
}

const freshLedger = (): Ledger => ({
  qStartW: [], qStartTick: [], qDoneTick: [], qWriteTick: [], qKind: [], waiters: [],
  rArrive: [], rOutcome: [], rLatencyTicks: [], rWaitKind: [], rRetried: [],
  deadlines: new Map(), cache: { expiry: EXPIRE_TICK }, marker: -1, retries: 0,
});

/** True when the mitigations keep one recompute in flight per key, so the lesson's invariant applies. */
export const guardsSingleFlight = (m: Mitigations): boolean => m.coalesce || m.lock || m.stale;

export function createStampedeSim(c: StampedeConfig): TickSim<StampedeState> {
  const m = c.mitigations;
  const guarded = guardsSingleFlight(m);
  const arrivalsPerTick = (c.lambda * TICK_MS) / 1000;

  const init = (): StampedeState => ({ tick: 0, work: 0, started: 0, done: 0, written: 0, inFlight: 0, peakInFlight: 0, peakDb: 0, ledger: freshLedger() });

  return createTickSim<StampedeState>({
    seed: c.seed,
    init,
    step: (s, rnd, tick) => stepStampede(s, rnd, tick, c, m, guarded, arrivalsPerTick),
    check: guarded ? (s) => (s.inFlight > 1 ? `${s.inFlight} recomputes in flight for one key` : null) : undefined,
  });
}

function stepStampede(s: StampedeState, rnd: Rnd, tick: number, c: StampedeConfig, m: Mitigations, guarded: boolean, arrivalsPerTick: number): StampedeState {
  const L = s.ledger;
  let work = s.work;
  let done = s.done;
  let written = s.written;
  let started = s.started;

  const runningNow = started - done;
  if (runningNow > 0) work += TICK_MS * Math.min(1, DB_CAPACITY / runningNow);
  while (done < started && work - L.qStartW[done] >= c.recomputeMs) {
    L.qDoneTick[done] = tick;
    L.qWriteTick[done] = tick + GAP_TICKS;
    if (m.releaseEarly && L.marker === done) L.marker = -1;
    done++;
  }

  while (written < done && L.qWriteTick[written] <= tick) {
    L.cache.expiry = tick + TTL_TICKS;
    if (L.marker === written) L.marker = -1;
    for (const r of L.waiters[written]) {
      if (L.rOutcome[r] !== null) continue;
      L.rOutcome[r] = L.rWaitKind[r] === 'own' ? 'recomputed' : 'coalesced';
      L.rLatencyTicks[r] = tick - L.rArrive[r];
    }
    L.waiters[written] = [];
    written++;
  }

  const retries: boolean[] = [];
  for (const r of L.deadlines.get(tick) ?? []) {
    if (L.rOutcome[r] !== null) continue;
    if (L.rWaitKind[r] === 'lock') {
      L.rOutcome[r] = 'default';
      L.rLatencyTicks[r] = LOCK_TICKS;
    } else {
      L.rOutcome[r] = 'timeout';
      L.rLatencyTicks[r] = TIMEOUT_TICKS;
      if (!L.rRetried[r]) {
        retries.push(true);
        L.retries++;
      }
    }
  }
  L.deadlines.delete(tick);

  const startQuery = (kind: QueryKind, owner: number): number => {
    L.qStartW.push(work);
    L.qStartTick.push(tick);
    L.qDoneTick.push(-1);
    L.qWriteTick.push(-1);
    L.qKind.push(kind);
    L.waiters.push(owner >= 0 ? [owner] : []);
    started++;
    return started - 1;
  };

  const arrive = (retried: boolean) => {
    const r = L.rArrive.length;
    L.rArrive.push(tick);
    L.rOutcome.push(null);
    L.rLatencyTicks.push(0);
    L.rWaitKind.push(null);
    L.rRetried.push(retried);
    const resolve = (o: Outcome, ticks = 0) => {
      L.rOutcome[r] = o;
      L.rLatencyTicks[r] = ticks;
    };
    const waitOn = (q: number, kind: WaitKind, ticks: number) => {
      L.rWaitKind[r] = kind;
      if (!L.waiters[q].includes(r) && !(kind === 'own')) L.waiters[q].push(r);
      const due = tick + ticks;
      const list = L.deadlines.get(due);
      if (list) list.push(r);
      else L.deadlines.set(due, [r]);
    };

    if (tick < L.cache.expiry) {
      resolve('hit');
      if (m.beta > 0 && L.marker < 0 && tick * TICK_MS - c.recomputeMs * m.beta * Math.log(rnd()) >= L.cache.expiry * TICK_MS) {
        L.marker = startQuery('early', -1);
      }
      return;
    }
    if (!guarded) {
      const q = startQuery('miss', r);
      waitOn(q, 'own', TIMEOUT_TICKS);
      return;
    }
    if (L.marker >= 0) {
      if (m.stale) resolve('stale');
      else if (m.lock) waitOn(L.marker, 'lock', LOCK_TICKS);
      else waitOn(L.marker, 'coalesced', TIMEOUT_TICKS);
      return;
    }
    const q = startQuery('winner', m.stale ? -1 : r);
    L.marker = q;
    if (m.stale) resolve('stale');
    else waitOn(q, 'own', TIMEOUT_TICKS);
  };

  for (let i = poisson(rnd, arrivalsPerTick); i > 0; i--) arrive(false);
  for (let i = 0; i < retries.length; i++) arrive(true);

  const inFlight = started - written;
  return {
    tick, work, started, done, written, inFlight, peakInFlight: Math.max(s.peakInFlight, inFlight), peakDb: Math.max(s.peakDb, started - done), ledger: L,
  };
}

// ── Reading a run ─────────────────────────────────────────────────────────────

export interface QueryBar {
  id: string;
  index: number;
  kind: QueryKind;
  startMs: number;
  /** When its value landed in the cache; the end of the run if it has not. */
  endMs: number;
  finished: boolean;
}

export interface LogEntry {
  id: number;
  atMs: number;
  kind: 'start' | 'done' | 'released' | 'written' | 'second';
  query: number;
}

export interface Summary {
  requests: number;
  outcomes: Record<Outcome, number>;
  retries: number;
  queries: number;
  /** Queries started before the first one finished: the herd. */
  herd: number;
  /** When the first recompute's value landed, or null if none did in the run. */
  firstWriteMs: number | null;
  peakInFlight: number;
  peakDb: number;
  p99Ms: number;
  /** Requests that did not get a plain hit or an immediately served stale value. */
  waited: number;
  /** When the first client gave up waiting, or null. */
  firstTimeoutMs: number | null;
}

export interface StampedeRun {
  config: StampedeConfig;
  state: StampedeState;
  violation: { tick: number; message: string } | null;
  summary: Summary;
  /** Database queries started per second, in 100 ms buckets: [seconds, per second]. */
  qps: [number, number][];
  /** 99th-percentile latency of the requests that arrived in each 250 ms bucket: [seconds, ms]. */
  p99Series: [number, number][];
  /** The first recomputes, for a Gantt chart. */
  bars: QueryBar[];
  log: LogEntry[];
}

const QPS_BUCKET_MS = 100;
const P99_BUCKET_MS = 250;
export const MAX_BARS = 10;
const MAX_LOG = 40;

const OUTCOMES: Outcome[] = ['hit', 'recomputed', 'coalesced', 'stale', 'default', 'timeout'];

export function runStampede(c: StampedeConfig, ticks = SIM_TICKS): StampedeRun {
  const sim = createStampedeSim(c);
  sim.run(ticks);
  return readRun(c, sim);
}

export function readRun(c: StampedeConfig, sim: TickSim<StampedeState>): StampedeRun {
  const s = sim.state;
  const L = s.ledger;
  const now = s.tick;
  const outcomes = Object.fromEntries(OUTCOMES.map((o) => [o, 0])) as Record<Outcome, number>;
  const latencies: number[] = [];
  const buckets = new Map<number, number[]>();
  L.rOutcome.forEach((o, r) => {
    if (o !== null) outcomes[o]++;
    const ms = (o !== null ? L.rLatencyTicks[r] : Math.min(TIMEOUT_TICKS, now - L.rArrive[r])) * TICK_MS;
    const lat = o === 'hit' || o === 'stale' ? HIT_MS : ms;
    latencies.push(lat);
    const b = Math.floor((L.rArrive[r] * TICK_MS) / P99_BUCKET_MS);
    const list = buckets.get(b);
    if (list) list.push(lat);
    else buckets.set(b, [lat]);
  });
  const firstDone = L.qDoneTick.findIndex((t) => t >= 0);
  const herd = firstDone < 0 ? s.started : L.qStartTick.filter((t) => t < L.qDoneTick[firstDone]).length;
  const firstWrite = L.qWriteTick.findIndex((t) => t >= 0 && t <= now);

  const qpsCounts = new Map<number, number>();
  for (const t of L.qStartTick) {
    const b = Math.floor((t * TICK_MS) / QPS_BUCKET_MS);
    qpsCounts.set(b, (qpsCounts.get(b) ?? 0) + 1);
  }
  const qps: [number, number][] = [];
  for (let b = 0; b < SIM_MS / QPS_BUCKET_MS; b++) qps.push([(b * QPS_BUCKET_MS) / 1000, ((qpsCounts.get(b) ?? 0) * 1000) / QPS_BUCKET_MS]);
  const p99Series: [number, number][] = [];
  for (let b = 0; b < SIM_MS / P99_BUCKET_MS; b++) {
    const list = buckets.get(b);
    p99Series.push([(b * P99_BUCKET_MS) / 1000, list ? percentile([...list].sort((x, y) => x - y), 0.99) : 0]);
  }

  const bars: QueryBar[] = [];
  for (let q = 0; q < Math.min(MAX_BARS, s.started); q++) {
    const written = L.qWriteTick[q] >= 0 && L.qWriteTick[q] <= now;
    bars.push({ id: `q${q + 1}`, index: q, kind: L.qKind[q], startMs: L.qStartTick[q] * TICK_MS, endMs: written ? L.qWriteTick[q] * TICK_MS : now * TICK_MS, finished: written });
  }

  const log: LogEntry[] = [];
  const push = (atTick: number, kind: LogEntry['kind'], query: number) => {
    if (log.length < MAX_LOG) log.push({ id: log.length, atMs: atTick * TICK_MS, kind, query });
  };
  const events: { tick: number; kind: LogEntry['kind']; query: number; order: number }[] = [];
  for (let q = 0; q < Math.min(s.started, MAX_LOG); q++) {
    const earlierPending = q > 0 && L.qWriteTick[q - 1] > L.qStartTick[q] && L.qWriteTick[q - 1] >= 0;
    events.push({ tick: L.qStartTick[q], kind: earlierPending ? 'second' : 'start', query: q, order: 3 });
    if (L.qDoneTick[q] >= 0) events.push({ tick: L.qDoneTick[q], kind: 'done', query: q, order: 0 });
    if (c.mitigations.releaseEarly && L.qDoneTick[q] >= 0) events.push({ tick: L.qDoneTick[q], kind: 'released', query: q, order: 1 });
    if (L.qWriteTick[q] >= 0 && L.qWriteTick[q] <= now) events.push({ tick: L.qWriteTick[q], kind: 'written', query: q, order: 2 });
  }
  events.sort((a, b) => a.tick - b.tick || a.order - b.order || a.query - b.query).forEach((e) => push(e.tick, e.kind, e.query));

  return {
    config: c,
    state: s,
    violation: sim.violation,
    summary: {
      requests: L.rArrive.length,
      outcomes,
      retries: L.retries,
      queries: s.started,
      herd,
      firstWriteMs: firstWrite < 0 ? null : L.qWriteTick[firstWrite] * TICK_MS,
      peakInFlight: s.peakInFlight,
      peakDb: s.peakDb,
      p99Ms: percentile([...latencies].sort((x, y) => x - y), 0.99),
      waited: outcomes.recomputed + outcomes.coalesced + outcomes.default + outcomes.timeout,
      firstTimeoutMs: firstTimeoutMs(L),
    },
    qps,
    p99Series,
    bars,
    log,
  };
}

function firstTimeoutMs(L: Ledger): number | null {
  let first: number | null = null;
  L.rOutcome.forEach((o, r) => {
    if (o !== 'timeout') return;
    const at = (L.rArrive[r] + TIMEOUT_TICKS) * TICK_MS;
    if (first === null || at < first) first = at;
  });
  return first;
}

/** The first recompute's start, finish and cache write, and the second recompute's start if it began before that write, for a zoomed picture of the write gap. */
export interface GapView {
  startMs: number;
  /** When the first query finished, ms. */
  doneMs: number;
  /** When its value was due to land in the cache, ms. */
  writeMs: number;
  /** When a second recompute started inside the gap, ms; null when none did. */
  secondMs: number | null;
}

/** Null until the first recompute has finished. */
export function gapView(run: StampedeRun): GapView | null {
  const L = run.state.ledger;
  if (L.qDoneTick.length < 1 || L.qDoneTick[0] < 0) return null;
  const second = L.qDoneTick.length > 1 && L.qStartTick[1] < L.qWriteTick[0] ? L.qStartTick[1] * TICK_MS : null;
  return { startMs: L.qStartTick[0] * TICK_MS, doneMs: L.qDoneTick[0] * TICK_MS, writeMs: L.qWriteTick[0] * TICK_MS, secondMs: second };
}

/** A scan for broken seeds only needs the run to reach the first expiry and its recompute, which is shorter than a full run. */
export const SCAN_TICKS = toTicks(EXPIRE_MS + 3000);

/** Every seed in [0, upTo) on which the config breaks the single-flight invariant within `ticks`. */
export function violatingSeeds(c: Omit<StampedeConfig, 'seed'>, upTo: number, ticks = SIM_TICKS): number[] {
  const out: number[] = [];
  for (let seed = 0; seed < upTo; seed++) if (runStampede({ ...c, seed }, ticks).violation) out.push(seed);
  return out;
}

/** Concurrent recomputes about to pile up when the key expires, by Little's law: arrivals per second times the recompute time. Holds while the database keeps up. */
export const littleEstimate = (lambda: number, recomputeMs: number): number => (lambda * recomputeMs) / 1000;

export const dbKeepsUp = (lambda: number, recomputeMs: number): boolean => littleEstimate(lambda, recomputeMs) <= DB_CAPACITY;

/** The lowest seed in [0, upTo) on which the config breaks the single-flight invariant, with its run; null if none does. */
export function lowestViolatingSeed(c: Omit<StampedeConfig, 'seed'>, upTo: number): { seed: number; run: StampedeRun } | null {
  for (let seed = 0; seed < upTo; seed++) {
    const run = runStampede({ ...c, seed });
    if (run.violation) return { seed, run };
  }
  return null;
}

// ── TTL jitter on many keys ───────────────────────────────────────────────────

export const KEYS = 1000;
export const KEY_TTL_S = 60;
export const JITTER_RANGE = { min: 0, max: 40, step: 5 } as const;

/** Expiries per one-second bucket for KEYS keys that all got the same TTL at deploy time, spread by ±`jitterPct`%. */
export function expiryCounts(seed: number, jitterPct: number, keys = KEYS, ttlS = KEY_TTL_S): number[] {
  const rnd = mulberry32(seed);
  const spread = jitterPct / 100;
  const buckets = new Array<number>(Math.ceil(ttlS * (1 + spread)) + 1).fill(0);
  for (let k = 0; k < keys; k++) {
    const expiry = ttlS * (1 + spread * (2 * rnd() - 1));
    buckets[Math.min(buckets.length - 1, Math.floor(expiry))]++;
  }
  return buckets;
}

export const busiestSecond = (counts: readonly number[]): number => Math.max(...counts);

// ── Early refresh: how often anyone waits ─────────────────────────────────────

export const BETAS = [0, 0.5, 1, 2, 4] as const;
export const EARLY_STUDY_SEEDS = 30;

/** Share of seeds on which at least one request waited at the expiry, with only early refresh at this β (0 is no protection). */
export function waitShare(beta: number, lambda: number, recomputeMs: number, seeds = EARLY_STUDY_SEEDS): number {
  let waited = 0;
  for (let seed = 0; seed < seeds; seed++) {
    const run = runStampede({ seed, lambda, recomputeMs, mitigations: { ...NO_MITIGATION, beta } }, toTicks(EXPIRE_MS + 2 * CLIENT_TIMEOUT_MS));
    if (run.summary.waited > 0) waited++;
  }
  return waited / seeds;
}
