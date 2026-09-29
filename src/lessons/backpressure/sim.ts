// A producer feeding a single worker through a queue (roughly M/M/1:
// random arrivals, random service times). Three overload policies.

export type Policy = 'unbounded' | 'bounded' | 'shed';
export const MU = 10; // worker capacity, items per second
export const MEM_LIMIT = 100; // items the process can hold before it's OOM-killed
export const CAP = 20; // bounded queue size
export const SHED_AT = 12; // load shedding starts dropping low-priority work here
export const RESTART = 2.5;

export interface Item {
  id: number;
  high: boolean;
  born: number; // when it was admitted into this service
  state: 'queued' | 'serving' | 'done' | 'rejected';
  stateAt: number;
  x: number;
  y: number;
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
  arrive(from: { x: number; y: number }) {
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
    const high = Math.random() < 0.25;
    const item = this.makeItem(high, from);
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

  private makeItem(high: boolean, from: { x: number; y: number }): Item {
    const item: Item = { id: this.nextId++, high, born: this.now, state: 'queued', stateAt: this.now, x: from.x, y: from.y };
    this.items.push(item);
    return item;
  }

  step(dt: number, from: { x: number; y: number }) {
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
        this.queue.push(this.makeItem(Math.random() < 0.25, from));
      }
      if (this.pendingUpstream === 0) this.blocked = false;
      if (this.queue.length < SHED_AT * 0.6) this.shedding = false;

      if (this.policy === 'unbounded' && this.inSystem > MEM_LIMIT) this.oom();
    }

    this.lSamples.push({ t: now, n: this.inSystem, dt });
    const cut = now - 10;
    while (this.lSamples.length && this.lSamples[0].t < cut) this.lSamples.shift();
    while (this.completions.length && this.completions[0].t < now - 30) this.completions.shift();
    this.items = this.items.filter((it) => !((it.state === 'done' || it.state === 'rejected') && now - it.stateAt > 0.8));
    if (this.items.length > 700) this.items = this.items.filter((it) => it.state !== 'queued' || this.queue.indexOf(it) < 60);
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
    const win = Math.min(10, Math.max(1, now));
    const recent = this.completions.filter((c) => c.t > now - win);
    const lats = recent.map((c) => c.latency).sort((a, b) => a - b);
    const pct = (p: number) => (lats.length ? lats[Math.min(lats.length - 1, Math.floor(lats.length * p))] : 0);
    const total = this.lSamples.reduce((a, s) => a + s.dt, 0);
    const L = total ? this.lSamples.reduce((a, s) => a + s.n * s.dt, 0) / total : 0;
    const lambda = recent.length / win;
    const W = lats.length ? lats.reduce((a, b) => a + b, 0) / lats.length : 0;
    return {
      queue: this.queue.length,
      pending: this.pendingUpstream,
      p50: pct(0.5),
      p99: pct(0.99),
      throughput: lambda,
      L,
      W,
      crashes: this.crashes,
      lost: this.lost + this.failedWhileDown,
      rejectedLow: this.rejectedLow,
      rejectedHigh: this.rejectedHigh,
      down: this.down,
    };
  }
}
