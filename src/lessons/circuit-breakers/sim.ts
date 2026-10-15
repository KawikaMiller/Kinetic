// Service A handles user requests by calling a flaky Service B.
// B gets slower and flakier as it gets overloaded, and keeps working on
// requests A has already given up on (timeouts don't cancel remote work).
// That's what turns retries into a storm.
import { mulberry32, type Rnd } from '../../core/random';
import { createSampler, percentile } from '../../core/sim';

export type Mode = 'naive' | 'backoff' | 'breaker';
export type BreakerState = 'closed' | 'open' | 'half';

export const THREADS = 40;
export const TIMEOUT = 1.0;
export const B_CAP = 15; // concurrent calls B handles before degrading
export const MAX_RETRIES = 3;
export const BASE_BACKOFF = 0.2;
export const OPEN_FOR = 3;
/** The breaker looks at the last WINDOW calls, and trips once at least MIN_CALLS are in it and TRIP_RATIO of them failed. */
export const WINDOW = 20;
export const MIN_CALLS = 8;
export const TRIP_RATIO = 0.5;
/** Probe calls the half-open breaker lets through; all of them must succeed to close it. */
export const PROBES = 3;
/** B's load, as a multiple of the user traffic, that counts as a retry storm. */
export const STORM_RATIO = 1.8;
/** The seed the lesson loads with: the lowest seed whose fault schedule breaks naive retries (see sim.test.ts). */
export const BROKEN_SEED = 0;
/** Seconds over which "load on B" is measured. */
export const LOAD_WINDOW = 2;
export const NET = 0.12; // one-way network hop, seconds (slowed down to watch)

export interface Req {
  id: number;
  born: number;
  attempt: number;
  thread: number;
  retryAt: number | null;
  done: boolean;
}

export interface Call {
  id: number;
  req: Req;
  attempt: number;
  probe: boolean;
  sentAt: number;
  arriveB: number;
  bDoneAt: number;
  respAt: number;
  ok: boolean;
  resolved: boolean; // A has seen a result (response or timeout)
  timedOut: boolean;
  scheduled: boolean; // B has picked it up and fixed its service time
}

export interface Done {
  t: number;
  latency: number;
  result: 'ok' | 'error' | 'fallback';
}

export interface Spark {
  id: number;
  t: number;
  kind: 'error' | 'fallback';
}

export class Sim {
  now = 0;
  mode: Mode = 'naive';
  failRate = 0.03;
  latency = 0.12;
  reqs: Req[] = [];
  calls: Call[] = [];
  done: Done[] = [];
  /** Calls arriving at B, newest last; `retry` is true for every attempt after a request's first. */
  bArrivals: { t: number; retry: boolean }[] = [];
  retryDelays: { t: number; delay: number; attempt: number }[] = [];
  sparks: Spark[] = [];
  threads: (Req | null)[] = Array(THREADS).fill(null);
  breaker: BreakerState = 'closed';
  openedAt = 0;
  window: boolean[] = [];
  probesSent = 0;
  probeOk = 0;
  transitions: { t: number; to: BreakerState }[] = [];
  /** Calls sent to B, and requests that got a thread, since the start (never pruned). */
  callsSent = 0;
  admitted = 0;
  private nextId = 1;
  private readonly rnd: Rnd;

  constructor(seed: number) {
    this.rnd = mulberry32(seed);
  }

  get bConcurrency() {
    return this.calls.filter((c) => c.scheduled && this.now < c.bDoneAt).length;
  }

  /** B's latency multiplier and extra failure chance at a given concurrency. */
  bLoad(conc: number) {
    const over = Math.max(0, conc - B_CAP) / B_CAP;
    return { mult: Math.min(8, 1 + over * 4), extraFail: Math.min(0.6, over * 0.8) };
  }

  arrive() {
    const now = this.now;
    if (this.mode === 'breaker' && this.breaker === 'open') {
      this.finish(null, 'fallback', 0.01);
      return;
    }
    const free = this.threads.indexOf(null);
    if (free < 0) {
      // thread pool exhausted: A itself is now failing its users
      this.finish(null, 'error', 0.005);
      return;
    }
    const req: Req = { id: this.nextId++, born: now, attempt: 0, thread: free, retryAt: null, done: false };
    this.threads[free] = req;
    this.admitted++;
    this.reqs.push(req);
    this.send(req);
  }

  private send(req: Req) {
    const now = this.now;
    let probe = false;
    if (this.mode === 'breaker') {
      if (this.breaker === 'open') return this.release(req, 'fallback');
      if (this.breaker === 'half') {
        if (this.probesSent >= PROBES) return this.release(req, 'fallback');
        this.probesSent++;
        probe = true;
      }
    }
    this.callsSent++;
    this.calls.push({
      id: this.nextId++, req, attempt: req.attempt, probe, sentAt: now, arriveB: now + NET,
      bDoneAt: Infinity, respAt: Infinity, ok: false, resolved: false, timedOut: false, scheduled: false,
    });
  }

  private release(req: Req, result: Done['result']) {
    req.done = true;
    this.threads[req.thread] = null;
    this.finish(req, result, this.now - req.born);
  }

  private finish(req: Req | null, result: Done['result'], latency: number) {
    this.done.push({ t: this.now, latency, result });
    if (result !== 'ok') this.sparks.push({ id: req?.id ?? this.nextId++, t: this.now, kind: result === 'fallback' ? 'fallback' : 'error' });
  }

  private record(ok: boolean, probe: boolean) {
    if (this.mode !== 'breaker') return;
    if (this.breaker === 'half' && probe) {
      if (!ok) return this.setBreaker('open');
      this.probeOk++;
      if (this.probeOk >= PROBES) this.setBreaker('closed');
      return;
    }
    if (this.breaker !== 'closed') return;
    this.window.push(ok);
    if (this.window.length > WINDOW) this.window.shift();
    const fails = this.window.filter((x) => !x).length;
    if (this.window.length >= MIN_CALLS && fails / this.window.length >= TRIP_RATIO) this.setBreaker('open');
  }

  setBreaker(to: BreakerState) {
    this.breaker = to;
    this.transitions.push({ t: this.now, to });
    if (to === 'open') this.openedAt = this.now;
    if (to === 'half') {
      this.probesSent = 0;
      this.probeOk = 0;
    }
    if (to === 'closed') this.window = [];
  }

  setMode(m: Mode) {
    this.mode = m;
    if (m !== 'breaker' && this.breaker !== 'closed') this.setBreaker('closed');
  }

  private onFailure(call: Call) {
    const req = call.req;
    this.record(false, call.probe);
    if (req.done) return;
    if (req.attempt >= MAX_RETRIES) return this.release(req, 'error');
    req.attempt++;
    const delay = this.mode === 'naive' ? 0 : this.rnd() * BASE_BACKOFF * 2 ** (req.attempt - 1);
    this.retryDelays.push({ t: this.now, delay, attempt: req.attempt });
    req.retryAt = this.now + delay;
  }

  step(dt: number) {
    this.now += dt;
    const now = this.now;

    if (this.mode === 'breaker' && this.breaker === 'open' && now - this.openedAt >= OPEN_FOR) this.setBreaker('half');

    for (const c of this.calls) {
      // B picks the call up and decides how long it will take and whether it fails
      if (!c.scheduled && now >= c.arriveB) {
        c.scheduled = true;
        this.bArrivals.push({ t: now, retry: c.attempt > 0 });
        const { mult, extraFail } = this.bLoad(this.bConcurrency);
        c.bDoneAt = c.arriveB + this.latency * mult * (0.7 + this.rnd() * 0.6);
        c.respAt = c.bDoneAt + NET;
        c.ok = this.rnd() >= Math.min(0.98, this.failRate + extraFail);
      }
      if (c.resolved) continue;
      if (now >= c.sentAt + TIMEOUT && c.respAt > c.sentAt + TIMEOUT) {
        c.resolved = true;
        c.timedOut = true;
        this.onFailure(c);
      } else if (now >= c.respAt) {
        c.resolved = true;
        if (c.ok) {
          this.record(true, c.probe);
          if (!c.req.done) this.release(c.req, 'ok');
        } else {
          this.onFailure(c);
        }
      }
    }

    for (const r of this.reqs) {
      if (!r.done && r.retryAt !== null && now >= r.retryAt) {
        r.retryAt = null;
        this.send(r);
      }
    }

    this.calls = this.calls.filter((c) => !(c.resolved && now > c.respAt + 0.2) && !(c.resolved && c.timedOut && now > c.bDoneAt + NET + 0.2));
    this.reqs = this.reqs.filter((r) => !r.done);
    const cut = now - 30;
    this.done = this.done.filter((d) => d.t > cut);
    this.bArrivals = this.bArrivals.filter((a) => a.t > now - 5);
    this.retryDelays = this.retryDelays.filter((r) => r.t > now - 4);
    this.sparks = this.sparks.filter((s) => now - s.t < 0.8);
    this.transitions = this.transitions.filter((t) => t.t > cut);
  }

  stats() {
    const now = this.now;
    const recent = this.done.filter((d) => d.t > now - 5);
    const errors = recent.filter((d) => d.result === 'error').length;
    const fallbacks = recent.filter((d) => d.result === 'fallback').length;
    const lastTwo = this.bArrivals.filter((a) => a.t > now - LOAD_WINDOW);
    const lats = recent.map((d) => d.latency).sort((a, b) => a - b);
    return {
      bLoad: lastTwo.length / LOAD_WINDOW,
      bRetryLoad: lastTwo.filter((a) => a.retry).length / LOAD_WINDOW,
      bConc: this.bConcurrency,
      errorPct: recent.length ? (errors / recent.length) * 100 : 0,
      fallbackPct: recent.length ? (fallbacks / recent.length) * 100 : 0,
      p99: percentile(lats, 0.99),
      bOrphans: this.calls.filter((c) => c.scheduled && this.now < c.bDoneAt && c.timedOut).length,
      busyThreads: this.threads.filter(Boolean).length,
      breaker: this.breaker,
    };
  }
}

export type Stats = ReturnType<Sim['stats']>;

/* ─── The lesson's world: the sim plus bursty user traffic and chart history ─── */

/** Keeps the arrival stream's draws apart from the sim's, so changing one doesn't reshuffle the other. */
const ARRIVAL_SEED_OFFSET = 1000;

export const HISTORY = 60; // chart samples
const SAMPLE_EVERY = 0.5; // seconds between chart samples

export interface HistoryPoint {
  bLoad: number;
  err: number;
  breaker: BreakerState;
}

export interface World {
  sim: Sim;
  /** Users per second. */
  rate: number;
  /** Draws the burstiness of user arrivals (separate from the sim's own draws). */
  rnd: Rnd;
  /** Fractional arrivals carried between frames. */
  acc: number;
  history: ReturnType<typeof createSampler<HistoryPoint>>;
}

export function createWorld(rate: number, seed = BROKEN_SEED): World {
  const rnd = mulberry32(seed + ARRIVAL_SEED_OFFSET);
  return { sim: new Sim(seed), rnd, rate, acc: 0, history: createSampler<HistoryPoint>({ every: SAMPLE_EVERY, cap: HISTORY }) };
}

/** Advance by dt: bursty arrivals at `rate`, the sim itself, then the chart sample. */
export function advance(w: World, dt: number) {
  w.acc += w.rate * dt * (0.5 + w.rnd());
  while (w.acc >= 1) {
    w.acc -= 1;
    w.sim.arrive();
  }
  w.sim.step(dt);
  w.history.tick(w.sim.now, () => {
    const st = w.sim.stats();
    return { bLoad: st.bLoad, err: st.errorPct, breaker: st.breaker };
  });
}

/* ─── What the lesson narrates when the numbers cross a line ─── */

export type Insight =
  | { kind: 'cascade' }
  | { kind: 'storm'; ratio: number }
  | { kind: 'backlog'; conc: number; orphans: number };

/** A's error rate above this, with every thread busy, is a cascade. */
export const CASCADE_ERROR_PCT = 50;
/** B is "healthy again" when its failure rate is below this (a fraction). */
const HEALTHY_FAIL_BELOW = 0.1;
/** B holds a backlog once it has this many times its capacity in flight. */
const BACKLOG_FACTOR = 2;

/** The one thing worth saying about these numbers, or null. Pure: the narrator rate-limits it. */
export function insightFor(st: Stats, o: { rate: number; mode: Mode; failRate: number }): Insight | null {
  if (st.busyThreads >= THREADS && st.errorPct > CASCADE_ERROR_PCT) return { kind: 'cascade' };
  if (st.bLoad > o.rate * STORM_RATIO && o.mode !== 'breaker') return { kind: 'storm', ratio: st.bLoad / o.rate };
  if (st.bConc > B_CAP * BACKLOG_FACTOR && o.failRate < HEALTHY_FAIL_BELOW) return { kind: 'backlog', conc: st.bConc, orphans: st.bOrphans };
  return null;
}
