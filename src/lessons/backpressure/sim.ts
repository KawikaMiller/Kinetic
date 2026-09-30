// A producer feeding a single worker through a queue (roughly M/M/1:
// random arrivals, random service times). Three overload policies.
import { createCooldown, createSampler, mean, percentile, trimWindow } from '../../core/sim';

export type Policy = 'unbounded' | 'bounded' | 'shed';
export const MU = 10; // worker capacity, items per second
export const MEM_LIMIT = 100; // items the process can hold before it's OOM-killed
export const CAP = 20; // bounded queue size
export const SHED_AT = 12; // load shedding starts dropping low-priority work here
export const RESTART = 2.5;
/** Done and rejected items stay on screen this long while they fade out. */
export const ITEM_FADE_S = 0.8;

const HIGH_PRIORITY_SHARE = 0.25;
const L_WINDOW_S = 10; // Little's Law is measured over this window
const COMPLETIONS_KEEP_S = 30;
const SHED_RESUME_FRACTION = 0.6; // shedding stops once the queue drops below this share of SHED_AT
const MAX_DRAWN_ITEMS = 700; // past this, only the front of the queue keeps an on-screen item
const DRAWN_QUEUE_KEEP = 60;

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
  completions: { t: number; latency: number }[] = [];
  lSamples: { t: number; n: number; dt: number }[] = [];
  events: ('oom' | 'restart' | 'shedStart' | 'blocked')[] = [];
  private nextId = 1;
  private shedding = false;
  private blocked = false;

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
    const high = Math.random() < HIGH_PRIORITY_SHARE;
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
  }

  private makeItem(high: boolean): Item {
    const item: Item = { id: this.nextId++, high, born: this.now, state: 'queued', stateAt: this.now };
    this.items.push(item);
    return item;
  }

  step(dt: number) {
    this.now += dt;
    const now = this.now;

    if (this.crashedUntil > 0 && now >= this.crashedUntil && this.crashedUntil > now - dt) this.events.push('restart');

    if (!this.down) {
      if (this.serving && now >= this.serviceEnds) {
        const it = this.serving;
        it.state = 'done';
        it.stateAt = now;
        this.completions.push({ t: now, latency: now - it.born });
        this.serving = null;
      }
      if (!this.serving && this.queue.length) {
        const it = this.queue.shift()!;
        it.state = 'serving';
        it.stateAt = now;
        this.serving = it;
        this.serviceEnds = now - Math.log(1 - Math.random()) / MU;
      }
      // backpressure released: admit waiting work as space frees up
      while (this.policy === 'bounded' && this.pendingUpstream > 0 && this.queue.length < CAP) {
        this.pendingUpstream--;
        this.queue.push(this.makeItem(Math.random() < HIGH_PRIORITY_SHARE));
      }
      if (this.pendingUpstream === 0) this.blocked = false;
      if (this.queue.length < SHED_AT * SHED_RESUME_FRACTION) this.shedding = false;

      if (this.policy === 'unbounded' && this.inSystem > MEM_LIMIT) this.oom();
    }

    this.lSamples.push({ t: now, n: this.inSystem, dt });
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
  }

  stats() {
    const now = this.now;
    const win = Math.min(L_WINDOW_S, Math.max(1, now));
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
}

export type Stats = ReturnType<Pipeline['stats']>;

/* ─── The lesson's world: the pipeline plus bursty arrivals and chart history ─── */

export const HISTORY = 60; // p99 chart samples
export const SPIKE_MULT = 3;
export const SPIKE_S = 5;
export const INSIGHT_COOLDOWN_S = 10;
const SAMPLE_EVERY_S = 0.5;
// Each step's arrivals are the rate times a random factor in [0.4, 1.6): bursty, mean 1.
const JITTER_MIN = 0.4;
const JITTER_SPAN = 1.2;

export interface World {
  p: Pipeline;
  rate: number;
  acc: number; // fractional arrivals carried to the next step
  spikeUntil: number;
  history: ReturnType<typeof createSampler<number>>;
  insight: ReturnType<typeof createCooldown>;
}

export function createWorld(rate: number, policy: Policy): World {
  const p = new Pipeline();
  p.setPolicy(policy);
  return {
    p,
    rate,
    acc: 0,
    spikeUntil: -1,
    history: createSampler<number>({ every: SAMPLE_EVERY_S, cap: HISTORY }),
    insight: createCooldown(INSIGHT_COOLDOWN_S),
  };
}

export const spiking = (w: World) => w.p.now < w.spikeUntil;

/** Current arrivals per second, including a spike. */
export const arrivalRate = (w: World) => w.rate * (spiking(w) ? SPIKE_MULT : 1);

export function advance(w: World, dt: number) {
  const { p } = w;
  w.acc += arrivalRate(w) * dt * (JITTER_MIN + Math.random() * JITTER_SPAN);
  while (w.acc >= 1) {
    w.acc -= 1;
    p.arrive();
  }
  p.step(dt);
  w.history.tick(p.now, () => p.stats().p99);
}
