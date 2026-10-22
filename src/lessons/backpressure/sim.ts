// A producer feeding a single worker through a queue: an M/M/1 system (Poisson arrivals, exponential service times),
// stepped event by event so it is exact, and seeded so a run replays. Three overload policies.
import { erlangC } from '../../core/queueing';
import { expSample, mulberry32, type Rnd } from '../../core/random';
import { createCooldown, createSampler, mean, percentile, trimWindow } from '../../core/sim';

export type Policy = 'unbounded' | 'bounded' | 'shed';
export const MU = 10; // worker capacity, items per second
export const MEM_LIMIT = 100; // items the process can hold before it's OOM-killed
export const CAP = 20; // bounded queue size
export const SHED_AT = 12; // load shedding starts dropping low-priority work here
export const RESTART = 2.5;
/** Done and rejected items stay on screen this long while they fade out. */
export const ITEM_FADE_S = 0.8;
/** The arrival-rate slider's range, items per second. */
export const RATE_MIN = 2;
export const RATE_MAX = 20;
export const clampRate = (rate: number) => (Number.isNaN(rate) ? RATE_MIN : Math.min(RATE_MAX, Math.max(RATE_MIN, rate)));

/** The seed the stage opens with. */
export const DEFAULT_SEED = 7;
export const HIGH_PRIORITY_SHARE = 0.25;
const L_WINDOW_S = 10; // Little's Law is measured over this window
const COMPLETIONS_KEEP_S = 30;
const SHED_RESUME_FRACTION = 0.6; // shedding stops once the queue drops below this share of SHED_AT
const MAX_DRAWN_ITEMS = 700; // past this, only the front of the queue keeps an on-screen item
const DRAWN_QUEUE_KEEP = 60;
/** The readout calls Little's Law "steady" when lambda x W is within this share of L. */
export const STEADY_TOLERANCE = 0.2;
/** Below this many items in the system on average, the readout does not judge steadiness. */
const STEADY_MIN_L = 0.5;

/**
 * Mean time in an M/M/1 system (waiting plus service), seconds: the Erlang C wait for one server, divided by
 * (mu - lambda), plus one service time. It equals 1 / (mu - lambda); the lesson draws the curve from this so the
 * formula is the shared one in core/queueing (the queueing-theory lesson owns the derivation).
 */
export function mm1Latency(mu: number, lambda: number): number {
  if (!(lambda < mu)) return Infinity;
  return erlangC(1, lambda / mu) / (mu - lambda) + 1 / mu;
}

/** Little's Law, L = lambda x W: items in a system from the arrival rate and the time each spends there. */
export const littleL = (lambda: number, w: number) => lambda * w;

export interface Item {
  id: number;
  high: boolean;
  born: number; // when it was admitted into this service
  state: 'queued' | 'serving' | 'done' | 'rejected';
  stateAt: number;
}

export class Pipeline {
  now = 0;
  policy: Policy = 'unbounded';
  queue: Item[] = [];
  serving: Item | null = null;
  serviceEnds = 0;
  items: Item[] = []; // everything still being drawn
  pendingUpstream = 0; // blocked by backpressure: not admitted yet
  crashedUntil = -1;
  crashes = 0;
  lost = 0;
  rejectedLow = 0;
  rejectedHigh = 0;
  failedWhileDown = 0;
  /** When the current policy took over: counters and the stats window start here, so one policy is never measured with another's history. */
  windowStart = 0;
  completions: { t: number; latency: number }[] = [];
  lSamples: { t: number; n: number; dt: number }[] = [];
  events: ('oom' | 'restart' | 'shedStart' | 'blocked')[] = [];
  /** Whole-run totals, for the long-run checks of Little's Law. */
  completed = 0;
  latencySum = 0;
  /** The integral of the number in the system over time, item-seconds. */
  area = 0;
  private nextId = 1;
  private shedding = false;
  private blocked = false;

  private readonly rnd: Rnd;

  constructor(rnd: Rnd) {
    this.rnd = rnd;
  }

  get down() {
    return this.now < this.crashedUntil;
  }

  get inSystem() {
    return this.queue.length + (this.serving ? 1 : 0);
  }

  /** One new unit of work shows up at the producer. */
  arrive() {
    if (this.down) {
      this.failedWhileDown++;
      return;
    }
    if (this.policy === 'bounded' && (this.queue.length >= CAP || this.pendingUpstream > 0)) {
      // backpressure: the producer is told to wait, nothing is dropped or stored here
      this.pendingUpstream++;
      if (!this.blocked) this.events.push('blocked');
      this.blocked = true;
      return;
    }
    const high = this.rnd() < HIGH_PRIORITY_SHARE;
    const item = this.makeItem(high);
    if (this.policy === 'shed') {
      const shed = this.queue.length >= CAP || (!high && this.queue.length >= SHED_AT);
      if (shed) {
        item.state = 'rejected';
        if (high) this.rejectedHigh++;
        else this.rejectedLow++;
        if (!this.shedding) this.events.push('shedStart');
        this.shedding = true;
        return;
      }
    }
    this.queue.push(item);
    this.startService();
  }

  /** An idle worker takes the next queued item and draws its service time. */
  private startService() {
    if (this.serving || !this.queue.length || this.down) return;
    const it = this.queue.shift()!;
    it.state = 'serving';
    it.stateAt = this.now;
    this.serving = it;
    this.serviceEnds = this.now + expSample(1 / MU, this.rnd);
  }

  private makeItem(high: boolean): Item {
    const item: Item = { id: this.nextId++, high, born: this.now, state: 'queued', stateAt: this.now };
    this.items.push(item);
    return item;
  }

  /** Move the clock forward by `dt` seconds. */
  step(dt: number) {
    this.advanceTo(this.now + dt);
  }

  /** Move the clock to `now` (not before the current time), doing what happens there. */
  advanceTo(now: number) {
    const dt = now - this.now;
    // the number in the system held for the whole interval that is ending
    this.lSamples.push({ t: now, n: this.inSystem, dt });
    this.area += this.inSystem * dt;
    this.now = now;

    if (this.crashedUntil > 0 && now >= this.crashedUntil && this.crashedUntil > now - dt) this.events.push('restart');

    if (!this.down) {
      if (this.serving && now >= this.serviceEnds) {
        const it = this.serving;
        it.state = 'done';
        it.stateAt = now;
        this.completions.push({ t: now, latency: now - it.born });
        this.completed++;
        this.latencySum += now - it.born;
        this.serving = null;
      }
      this.startService();
      // backpressure released: admit waiting work as space frees up
      while (this.policy === 'bounded' && this.pendingUpstream > 0 && this.queue.length < CAP) {
        this.pendingUpstream--;
        this.queue.push(this.makeItem(this.rnd() < HIGH_PRIORITY_SHARE));
      }
      if (this.pendingUpstream === 0) this.blocked = false;
      if (this.queue.length < SHED_AT * SHED_RESUME_FRACTION) this.shedding = false;

      if (this.policy === 'unbounded' && this.inSystem > MEM_LIMIT) this.oom();
    }

    trimWindow(this.lSamples, now, L_WINDOW_S, (s) => s.t);
    trimWindow(this.completions, now, COMPLETIONS_KEEP_S, (c) => c.t);
    this.items = this.items.filter((it) => !((it.state === 'done' || it.state === 'rejected') && now - it.stateAt > ITEM_FADE_S));
    if (this.items.length > MAX_DRAWN_ITEMS) {
      this.items = this.items.filter((it) => it.state !== 'queued' || this.queue.indexOf(it) < DRAWN_QUEUE_KEEP);
    }
  }

  private oom() {
    this.crashes++;
    this.lost += this.inSystem;
    for (const it of [...this.queue, ...(this.serving ? [this.serving] : [])]) {
      it.state = 'rejected';
      it.stateAt = this.now;
    }
    this.queue = [];
    this.serving = null;
    this.crashedUntil = this.now + RESTART;
    this.events.push('oom');
  }

  setPolicy(p: Policy) {
    this.policy = p;
    // switching away from backpressure releases whatever was waiting upstream
    if (p !== 'bounded') this.pendingUpstream = 0;
    // measure the new policy on its own, not mixed with the old one
    this.completions = [];
    this.lSamples = [];
    this.crashes = 0;
    this.lost = 0;
    this.rejectedLow = 0;
    this.rejectedHigh = 0;
    this.failedWhileDown = 0;
    this.windowStart = this.now;
  }

  stats() {
    const now = this.now;
    const win = Math.min(L_WINDOW_S, Math.max(1, now - this.windowStart));
    const recent = this.completions.filter((c) => c.t > now - win);
    const lats = recent.map((c) => c.latency).sort((a, b) => a - b);
    const total = this.lSamples.reduce((a, s) => a + s.dt, 0);
    const L = total ? this.lSamples.reduce((a, s) => a + s.n * s.dt, 0) / total : 0;
    return {
      queue: this.queue.length,
      pending: this.pendingUpstream,
      p50: percentile(lats, 0.5),
      p99: percentile(lats, 0.99),
      throughput: recent.length / win,
      L,
      W: mean(lats),
      crashes: this.crashes,
      lost: this.lost + this.failedWhileDown,
      rejectedLow: this.rejectedLow,
      rejectedHigh: this.rejectedHigh,
      down: this.down,
    };
  }

  /** Whole-run averages: time-average number in the system, completions per second and mean time inside. */
  totals() {
    const lambda = this.now ? this.completed / this.now : 0;
    const w = this.completed ? this.latencySum / this.completed : 0;
    return { L: this.now ? this.area / this.now : 0, lambda, W: w };
  }
}

export type Stats = ReturnType<Pipeline['stats']>;

/** lambda x W against L from a stats readout: the three numbers the stage prints and whether they agree. */
export function littleCheck(st: Pick<Stats, 'L' | 'throughput' | 'W'>) {
  const lw = littleL(st.throughput, st.W);
  const steady = st.L < STEADY_MIN_L || Math.abs(lw - st.L) / st.L < STEADY_TOLERANCE;
  return { lw, steady };
}

/* ─── The lesson's world: the pipeline plus Poisson arrivals and chart history ─── */

export const HISTORY = 60; // p99 chart samples
export const SPIKE_MULT = 3;
export const SPIKE_S = 5;
export const INSIGHT_COOLDOWN_S = 10;
const SAMPLE_EVERY_S = 0.5;
/** The arrival stream's own random stream is the seed run through this constant, so the worker's draws are independent of it. */
const ARRIVAL_SALT = 0x9e3779b9;

export interface World {
  p: Pipeline;
  rate: number;
  /** Time of the next arrival, drawn from an exponential gap at the rate in force when it was drawn. */
  nextArrival: number;
  spikeUntil: number;
  seed: number;
  arrivalRnd: Rnd;
  history: ReturnType<typeof createSampler<number>>;
  insight: ReturnType<typeof createCooldown>;
}

export const spiking = (w: World) => w.p.now < w.spikeUntil;

/** Current arrivals per second, including a spike. */
export const arrivalRate = (w: World) => w.rate * (spiking(w) ? SPIKE_MULT : 1);

/** Draw the next arrival from now, at the current rate (the exponential gap is memoryless, so redrawing is exact). */
function drawArrival(w: World) {
  w.nextArrival = w.p.now + expSample(1 / arrivalRate(w), w.arrivalRnd);
}

export function createWorld(rate: number, policy: Policy, seed: number): World {
  const p = new Pipeline(mulberry32(seed));
  p.setPolicy(policy);
  const w: World = {
    p,
    rate: clampRate(rate),
    nextArrival: 0,
    spikeUntil: -1,
    seed,
    arrivalRnd: mulberry32((seed ^ ARRIVAL_SALT) >>> 0),
    history: createSampler<number>({ every: SAMPLE_EVERY_S, cap: HISTORY }),
    insight: createCooldown(INSIGHT_COOLDOWN_S),
  };
  drawArrival(w);
  return w;
}

/** Change the arrival rate (clamped to the slider's range); the next arrival is redrawn at the new rate. */
export function setRate(w: World, rate: number) {
  const next = clampRate(rate);
  if (next === w.rate) return;
  w.rate = next;
  drawArrival(w);
}

export function startSpike(w: World) {
  w.spikeUntil = w.p.now + SPIKE_S;
  drawArrival(w);
}

/** Advance by `dt` seconds, handling each arrival, completion, restart and spike end at its own time. */
export function advance(w: World, dt: number) {
  const { p } = w;
  const end = p.now + dt;
  while (p.now < end) {
    const departure = p.serving && !p.down ? p.serviceEnds : Infinity;
    const restart = p.down ? p.crashedUntil : Infinity;
    const spikeEnd = spiking(w) ? w.spikeUntil : Infinity;
    const t = Math.min(w.nextArrival, departure, restart, spikeEnd, end);
    p.advanceTo(Math.max(t, p.now));
    if (t === w.nextArrival) {
      p.arrive();
      drawArrival(w);
    } else if (t === spikeEnd) drawArrival(w);
  }
  w.history.tick(p.now, () => p.stats().p99);
}
