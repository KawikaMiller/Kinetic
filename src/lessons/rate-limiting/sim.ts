// Four rate-limiting algorithms, all fed the same request stream.
// Time is in seconds. `limit` is requests per second; `capacity` is the
// bucket size for token / leaky bucket.

export type AlgoId = 'fixed' | 'sliding' | 'token' | 'leaky';
export const ALGO_IDS: AlgoId[] = ['fixed', 'sliding', 'token', 'leaky'];
export const WINDOW = 1;
const KEEP = 12; // seconds of history kept for charts and stats

export interface Params {
  limit: number;
  capacity: number;
}

export type Outcome = 'ok' | 'reject' | 'queued';

export class Limiter {
  /** When each request was let through (for leaky bucket: when it left the queue). */
  accepted: number[] = [];
  rejected: number[] = [];

  // fixed window
  windowStart = 0;
  count = 0;
  // sliding window log
  log: number[] = [];
  // token bucket
  tokens: number;
  private lastRefill = 0;
  // leaky bucket (as a queue that drains at a constant rate)
  queue: number[] = [];
  private drain = 0;

  id: AlgoId;
  p: Params;

  constructor(id: AlgoId, p: Params) {
    this.id = id;
    this.p = p;
    this.tokens = p.capacity;
  }

  offer(t: number): Outcome {
    let out: Outcome;
    switch (this.id) {
      case 'fixed':
        this.rollWindow(t);
        out = this.count < this.p.limit ? 'ok' : 'reject';
        if (out === 'ok') this.count++;
        break;
      case 'sliding':
        this.trimLog(t);
        out = this.log.length < this.p.limit ? 'ok' : 'reject';
        if (out === 'ok') this.log.push(t);
        break;
      case 'token':
        this.refill(t);
        out = this.tokens >= 1 ? 'ok' : 'reject';
        if (out === 'ok') this.tokens -= 1;
        break;
      case 'leaky':
        out = this.queue.length < this.p.capacity ? 'queued' : 'reject';
        if (out === 'queued') this.queue.push(t);
        break;
    }
    if (out === 'ok') this.accepted.push(t);
    if (out === 'reject') this.rejected.push(t);
    return out;
  }

  /** Advance the clock. Returns how many queued requests the leaky bucket released. */
  step(t: number, dt: number): number {
    let released = 0;
    if (this.id === 'fixed') this.rollWindow(t);
    if (this.id === 'sliding') this.trimLog(t);
    if (this.id === 'token') this.refill(t);
    if (this.id === 'leaky') {
      this.drain += this.p.limit * dt;
      while (this.drain >= 1 && this.queue.length) {
        this.drain -= 1;
        this.queue.shift();
        this.accepted.push(t);
        released++;
      }
      // an empty bucket can't bank up drain capacity for a later burst
      if (!this.queue.length) this.drain = Math.min(this.drain, 1);
    }
    const cut = t - KEEP;
    while (this.accepted.length && this.accepted[0] < cut) this.accepted.shift();
    while (this.rejected.length && this.rejected[0] < cut) this.rejected.shift();
    return released;
  }

  setParams(p: Params) {
    this.p = p;
    this.tokens = Math.min(this.tokens, p.capacity);
    while (this.queue.length > p.capacity) {
      this.queue.pop();
    }
  }

  private rollWindow(t: number) {
    const ws = Math.floor(t / WINDOW) * WINDOW;
    if (ws !== this.windowStart) {
      this.windowStart = ws;
      this.count = 0;
    }
  }

  private trimLog(t: number) {
    while (this.log.length && this.log[0] <= t - WINDOW) this.log.shift();
  }

  private refill(t: number) {
    this.tokens = Math.min(this.p.capacity, this.tokens + (t - this.lastRefill) * this.p.limit);
    this.lastRefill = t;
  }

  /** Most requests let through in any 1-second span of the last `span` seconds. */
  peak(t: number, span = 10) {
    const a = this.accepted.filter((x) => x >= t - span);
    let best = 0;
    let lo = 0;
    for (let hi = 0; hi < a.length; hi++) {
      while (a[hi] - a[lo] >= WINDOW) lo++;
      best = Math.max(best, hi - lo + 1);
    }
    return best;
  }

  /** Accepted in [from, to). */
  acceptedBetween(from: number, to: number) {
    return this.accepted.filter((x) => x >= from && x < to).length;
  }

  totals(t: number, span = 10) {
    const ok = this.accepted.filter((x) => x >= t - span).length;
    const bad = this.rejected.filter((x) => x >= t - span).length;
    return { ok, bad, rejectPct: ok + bad ? (bad / (ok + bad)) * 100 : 0 };
  }
}

/* ─── The lesson's world: one request stream judged by every limiter ─── */

export const TRAVEL_IN = 0.7; // client → limiter (s)
export const TRAVEL_OUT = 0.5; // limiter → API / reject bin (s)
/** How long a decided request lingers after its trip (reject dots fade in the bin). */
export const LINGER = 0.6;
export const BURST_SIZE = 20;
const BURST_GAP = 0.012; // seconds between the burst's requests
const BURSTINESS = { min: 0.4, spread: 1.2 }; // arrivals jitter between 0.4× and 1.6× the rate
// Boundary attack: L requests in the ATTACK_SPAN before a window boundary and L after it,
// far enough ahead that requests already in flight land in the earlier window.
const ATTACK_LEAD = 1.1;
const ATTACK_SPAN = 0.2;
const ATTACK_SPREAD = 0.18;
const ATTACK_JUST_AFTER = 0.01; // the second half starts this long after the boundary
const ATTACK_CHECK_AFTER = 0.6;

export interface Particle {
  id: number;
  t0: number; // spawned at the client
  outcome: Outcome | null; // decided at the gate
  tGate: number;
  fromBucket?: boolean; // leaky bucket release: starts at the bucket
}

export interface World {
  now: number;
  acc: number;
  nextId: number;
  scheduled: number[]; // extra spawn times (bursts / boundary attack)
  particles: Particle[];
  limiters: Record<AlgoId, Limiter>;
  algo: AlgoId;
  rate: number;
  attackCheck: { at: number; from: number; to: number } | null;
  quietUntil: number; // background traffic paused so the attacker is the only client
}

export function createWorld(algo: AlgoId, rate: number, p: Params): World {
  return {
    now: 0,
    acc: 0,
    nextId: 1,
    scheduled: [],
    particles: [],
    limiters: Object.fromEntries(ALGO_IDS.map((id) => [id, new Limiter(id, { ...p })])) as Record<AlgoId, Limiter>,
    algo,
    rate,
    attackCheck: null,
    quietUntil: 0,
  };
}

/** How the boundary attack went, for the visible algorithm and for fixed window. */
export interface AttackResult {
  algo: AlgoId;
  passed: number;
  fixed: number;
  limit: number;
}

/** Advance by dt: spawn traffic, judge arrivals at every limiter, release the leaky queue. */
export function advance(w: World, dt: number): AttackResult | null {
  w.now += dt;
  const now = w.now;

  // background traffic (bursty-ish Poisson) plus anything scheduled
  if (now >= w.quietUntil) w.acc += w.rate * dt * (BURSTINESS.min + Math.random() * BURSTINESS.spread);
  while (w.acc >= 1) {
    w.acc -= 1;
    w.particles.push({ id: w.nextId++, t0: now, tGate: now + TRAVEL_IN, outcome: null });
  }
  while (w.scheduled.length && w.scheduled[0] <= now) {
    const t0 = w.scheduled.shift()!;
    w.particles.push({ id: w.nextId++, t0, tGate: t0 + TRAVEL_IN, outcome: null });
  }

  // requests reaching the gate get judged by every limiter (same traffic for all)
  for (const p of w.particles) {
    if (p.outcome === null && now >= p.tGate) {
      for (const id of ALGO_IDS) {
        const out = w.limiters[id].offer(p.tGate);
        if (id === w.algo) p.outcome = out;
      }
    }
  }
  for (const id of ALGO_IDS) {
    const released = w.limiters[id].step(now, dt);
    if (id === w.algo) {
      for (let i = 0; i < released; i++) {
        w.particles.push({ id: w.nextId++, t0: now, tGate: now, outcome: 'ok', fromBucket: true });
      }
    }
  }
  w.particles = w.particles.filter((p) => now - p.tGate < TRAVEL_OUT + LINGER || p.outcome === null);

  if (!w.attackCheck || now < w.attackCheck.at) return null;
  const { from, to } = w.attackCheck;
  w.attackCheck = null;
  const lim = w.limiters[w.algo];
  return { algo: w.algo, passed: lim.acceptedBetween(from, to), fixed: w.limiters.fixed.acceptedBetween(from, to), limit: lim.p.limit };
}

export function burst(w: World) {
  for (let i = 0; i < BURST_SIZE; i++) w.scheduled.push(w.now + i * BURST_GAP);
  w.scheduled.sort((a, b) => a - b);
}

/** Schedule the boundary attack. Returns the limit it's aimed at. */
export function boundaryAttack(w: World): number {
  const L = w.limiters.fixed.p.limit;
  const boundary = Math.ceil(w.now + TRAVEL_IN + ATTACK_LEAD);
  w.quietUntil = boundary + ATTACK_SPAN - TRAVEL_IN;
  for (let i = 0; i < L; i++) {
    w.scheduled.push(boundary - ATTACK_SPAN + (i / L) * ATTACK_SPREAD - TRAVEL_IN);
    w.scheduled.push(boundary + ATTACK_JUST_AFTER + (i / L) * ATTACK_SPREAD - TRAVEL_IN);
  }
  w.scheduled.sort((a, b) => a - b);
  w.attackCheck = { at: boundary + ATTACK_CHECK_AFTER, from: boundary - ATTACK_SPAN, to: boundary + ATTACK_SPAN };
  return L;
}

/** What React renders: every limiter's totals plus the two buckets' fill. */
export function snapshot(w: World) {
  const rows = Object.fromEntries(
    ALGO_IDS.map((id) => [id, { ...w.limiters[id].totals(w.now), peak: w.limiters[id].peak(w.now) }]),
  ) as Record<AlgoId, ReturnType<Limiter['totals']> & { peak: number }>;
  return { rows, tokens: w.limiters.token.tokens, queue: w.limiters.leaky.queue.length };
}

export type Snapshot = ReturnType<typeof snapshot>;
