import { afterEach, describe, expect, it, vi } from 'vitest';
import { mulberry32, type Rnd } from '../../core/random';
import { advance, ALGO_IDS, boundaryAttack, burst, BURST_SIZE, createWorld, Limiter, WINDOW, type AlgoId, type AttackResult, type Outcome, type Params } from './sim';

const DT = 1 / 60; // the stage's frame step

/** Seeded arrivals: gaps jittered around 1/rate, sometimes clumped into bursts. */
function arrivals(rand: Rnd, rate: number, seconds: number): number[] {
  const out: number[] = [];
  for (let t = rand() * 0.1; t < seconds; ) {
    out.push(t);
    t += rand() < 0.08 ? 0.005 : (0.2 + rand() * 1.6) / rate;
  }
  return out;
}

/** Drive a Limiter the way the world does: each frame, offer what has arrived, then advance its clock. */
function drive(id: AlgoId, p: Params, times: number[], seconds: number) {
  const lim = new Limiter(id, { ...p });
  const outcomes: Outcome[] = [];
  const released: number[] = [];
  const queueAtOffer: number[] = [];
  let k = 0;
  for (let now = DT; now <= seconds + 2; now += DT) {
    while (k < times.length && times[k] <= now) {
      queueAtOffer.push(lim.queue.length);
      outcomes.push(lim.offer(times[k++]));
    }
    const n = lim.step(now, DT);
    for (let i = 0; i < n; i++) released.push(now);
  }
  return { outcomes, released, queueAtOffer, lim };
}

/** Textbook decisions, written independently of the Limiter class. */
function reference(id: 'fixed' | 'sliding' | 'token', p: Params, times: number[]): Outcome[] {
  const counts = new Map<number, number>();
  const accepted: number[] = [];
  let tokens = p.capacity;
  let last = 0;
  return times.map((t) => {
    let ok: boolean;
    if (id === 'fixed') {
      const w = Math.floor(t / WINDOW);
      ok = (counts.get(w) ?? 0) < p.limit;
      if (ok) counts.set(w, (counts.get(w) ?? 0) + 1);
    } else if (id === 'sliding') {
      ok = accepted.filter((a) => a > t - WINDOW).length < p.limit;
      if (ok) accepted.push(t);
    } else {
      tokens = Math.min(p.capacity, tokens + (t - last) * p.limit);
      last = t;
      ok = tokens >= 1;
      if (ok) tokens -= 1;
    }
    return ok ? 'ok' : 'reject';
  });
}

/** Most timestamps inside any span shorter than WINDOW. */
function peak(ts: number[]) {
  let best = 0;
  for (let lo = 0, hi = 0; hi < ts.length; hi++) {
    while (ts[hi] - ts[lo] >= WINDOW) lo++;
    best = Math.max(best, hi - lo + 1);
  }
  return best;
}

const CASES: Params[] = [{ limit: 10, capacity: 10 }, { limit: 4, capacity: 1 }, { limit: 20, capacity: 30 }, { limit: 7, capacity: 15 }];

describe('accept / reject against reference limiters over seeded arrivals', () => {
  it('fixed window, sliding window and token bucket decide every request exactly like the references', () => {
    for (const [seed, p] of CASES.entries()) {
      for (const rate of [3, 10, 30]) {
        const times = arrivals(mulberry32(seed * 100 + rate), rate, 20);
        for (const id of ['fixed', 'sliding', 'token'] as const) {
          expect(drive(id, p, times, 20).outcomes, `${id} ${JSON.stringify(p)} @${rate}/s`).toEqual(reference(id, p, times));
        }
      }
    }
  });

  it('leaky bucket: queues while there is room, rejects exactly when the queue is full', () => {
    for (const p of CASES) {
      const times = arrivals(mulberry32(p.limit), 25, 15);
      const { outcomes, queueAtOffer } = drive('leaky', p, times, 15);
      outcomes.forEach((o, i) => expect(o).toBe(queueAtOffer[i] < p.capacity ? 'queued' : 'reject'));
    }
  });

  it('leaky bucket: drains at a steady rate (never more than limit + 1 in any second) and loses nothing it queued', () => {
    for (const p of CASES) {
      const times = arrivals(mulberry32(p.limit + 7), 25, 15);
      const { outcomes, released, lim } = drive('leaky', p, times, 15);
      expect(peak(released)).toBeLessThanOrEqual(p.limit + 1);
      expect(released.length + lim.queue.length).toBe(outcomes.filter((o) => o === 'queued').length);
    }
  });
});

describe('the claims on screen', () => {
  it('sliding window never lets more than the limit through in any 1 s', () => {
    for (const p of CASES) {
      const times = arrivals(mulberry32(p.capacity), 30, 20);
      const { outcomes } = drive('sliding', p, times, 20);
      expect(peak(times.filter((_, i) => outcomes[i] === 'ok'))).toBeLessThanOrEqual(p.limit);
    }
  });

  it('token bucket: bursts up to the bucket size, and the long-run total stays within capacity + rate × time', () => {
    for (const p of CASES) {
      const burstAt = Array.from({ length: 40 }, (_, i) => 5 + i * 0.001); // idle for 5 s, then 40 at once
      expect(drive('token', p, burstAt, 6).outcomes.filter((o) => o === 'ok')).toHaveLength(p.capacity);
      const times = arrivals(mulberry32(p.limit * 3), 30, 20);
      const ok = drive('token', p, times, 20).outcomes.filter((o) => o === 'ok').length;
      expect(ok).toBeLessThanOrEqual(p.capacity + p.limit * 20);
    }
  });

  it('an idle token bucket holds only its capacity, however long it waited (the quiz)', () => {
    const p = { limit: 5, capacity: 10 };
    const late = Array.from({ length: 30 }, (_, i) => 60 + i * 0.001);
    expect(drive('token', p, late, 61).outcomes.filter((o) => o === 'ok')).toHaveLength(10);
  });

  it('fixed window lets up to twice the limit through around a reset', () => {
    const p = { limit: 10, capacity: 10 };
    const times = [...Array.from({ length: 10 }, (_, i) => 4.85 + i * 0.01), ...Array.from({ length: 10 }, (_, i) => 5.01 + i * 0.01)];
    const { outcomes } = drive('fixed', p, times, 6);
    expect(outcomes.every((o) => o === 'ok')).toBe(true);
    expect(peak(times)).toBe(20);
  });
});

describe('the stage\'s world', () => {
  afterEach(() => vi.restoreAllMocks());

  /** Run the world with Math.random pinned to a seed, returning the attack result if one lands. */
  function run(algo: AlgoId, seed: number, act: (w: ReturnType<typeof createWorld>) => void, seconds: number) {
    vi.spyOn(Math, 'random').mockImplementation(mulberry32(seed));
    const w = createWorld(algo, 8, { limit: 10, capacity: 10 });
    let result: AttackResult | null = null;
    for (let t = 0; t < 4; t += DT) advance(w, DT); // warm up with background traffic
    act(w);
    for (let t = 0; t < seconds; t += DT) result = advance(w, DT) ?? result;
    return { w, result };
  }

  it('boundary attack: fixed window passes exactly 2 × limit in ~0.4 s; sliding window at most the limit', () => {
    for (let seed = 1; seed <= 10; seed++) {
      for (const algo of ALGO_IDS) {
        const { result } = run(algo, seed, (w) => boundaryAttack(w), 4);
        expect(result!.fixed).toBe(2 * result!.limit);
        if (algo === 'sliding') expect(result!.passed).toBeLessThanOrEqual(result!.limit);
        if (algo === 'token') expect(result!.passed).toBeLessThanOrEqual(10 + 0.4 * 10); // the full bucket plus 0.4 s of refill
      }
    }
  });

  it(`a burst of ${BURST_SIZE} into a full token bucket lets about the bucket size through`, () => {
    // Background traffic is 8/s against a 10/s refill, so the bucket is full when the burst lands.
    const { w } = run('token', 3, (w) => {
      w.rate = 0.0001;
      for (let t = 0; t < 3; t += DT) advance(w, DT); // let it top up
      burst(w);
    }, 2);
    const lim = w.limiters.token;
    const end = w.now;
    expect(lim.acceptedBetween(end - 2, end)).toBeGreaterThanOrEqual(10);
    expect(lim.acceptedBetween(end - 2, end)).toBeLessThanOrEqual(10 + 2 * 10);
    expect(lim.rejected.filter((t) => t > end - 2).length).toBeGreaterThan(0);
  });

  it('every limiter judges the same requests', () => {
    const { w } = run('fixed', 5, () => {}, 6);
    const seen = ALGO_IDS.map((id) => w.limiters[id].accepted.length + w.limiters[id].rejected.length + w.limiters[id].queue.length);
    expect(new Set(seen.slice(0, 3)).size).toBe(1); // leaky's accepted are releases, so it's compared separately
  });
});
