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
