// Service A handles user requests by calling a flaky Service B.
// B gets slower and flakier as it gets overloaded, and keeps working on
// requests A has already given up on (timeouts don't cancel remote work).
// That's what turns retries into a storm.

export type Mode = 'naive' | 'backoff' | 'breaker';
export type BreakerState = 'closed' | 'open' | 'half';

export const THREADS = 40;
export const TIMEOUT = 1.0;
export const B_CAP = 15; // concurrent calls B handles before degrading
export const MAX_RETRIES = 3;
export const BASE_BACKOFF = 0.2;
export const OPEN_FOR = 3;
const WINDOW = 20;
const MIN_CALLS = 8;
const TRIP_RATIO = 0.5;
const PROBES = 3;
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
  bArrivals: number[] = [];
  retryDelays: { t: number; delay: number }[] = [];
  sparks: Spark[] = [];
  threads: (Req | null)[] = Array(THREADS).fill(null);
  breaker: BreakerState = 'closed';
  openedAt = 0;
  window: boolean[] = [];
  probesSent = 0;
  probeOk = 0;
  transitions: { t: number; to: BreakerState }[] = [];
  private nextId = 1;

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
    const delay = this.mode === 'naive' ? 0 : Math.random() * BASE_BACKOFF * 2 ** (req.attempt - 1);
    this.retryDelays.push({ t: this.now, delay });
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
        this.bArrivals.push(now);
        const { mult, extraFail } = this.bLoad(this.bConcurrency);
        c.bDoneAt = c.arriveB + this.latency * mult * (0.7 + Math.random() * 0.6);
        c.respAt = c.bDoneAt + NET;
        c.ok = Math.random() >= Math.min(0.98, this.failRate + extraFail);
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
    this.bArrivals = this.bArrivals.filter((t) => t > now - 5);
    this.retryDelays = this.retryDelays.filter((r) => r.t > now - 4);
    this.sparks = this.sparks.filter((s) => now - s.t < 0.8);
    this.transitions = this.transitions.filter((t) => t.t > cut);
  }

  stats() {
    const now = this.now;
    const recent = this.done.filter((d) => d.t > now - 5);
    const errors = recent.filter((d) => d.result === 'error').length;
    const fallbacks = recent.filter((d) => d.result === 'fallback').length;
    const lats = recent.map((d) => d.latency).sort((a, b) => a - b);
    const p99 = lats.length ? lats[Math.min(lats.length - 1, Math.floor(lats.length * 0.99))] : 0;
    return {
      bLoad: this.bArrivals.filter((t) => t > now - 2).length / 2,
      bConc: this.bConcurrency,
      errorPct: recent.length ? (errors / recent.length) * 100 : 0,
      fallbackPct: recent.length ? (fallbacks / recent.length) * 100 : 0,
      p99,
      busyThreads: this.threads.filter(Boolean).length,
      breaker: this.breaker,
    };
  }
}
