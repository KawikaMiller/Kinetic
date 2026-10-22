import { afterEach, describe, expect, it, vi } from 'vitest';
import { erlangC } from '../../core/queueing';
import { SEED_MAX } from '../../core/seed';
import lesson from './index';
import {
  advance, CAP, clampRate, createWorld, DEFAULT_SEED, littleCheck, littleL, mm1Latency, MU, Pipeline, RATE_MAX, RATE_MIN, setRate, SHED_AT,
  startSpike, type Policy,
} from './sim';

afterEach(() => vi.restoreAllMocks());

const run = (rate: number, policy: Policy, seed: number, seconds: number) => {
  const w = createWorld(rate, policy, seed);
  advance(w, seconds);
  return w;
};

describe('the M/M/1 latency curve, from core/queueing', () => {
  it('equals the closed form 1 / (mu - lambda) on a grid of utilisations', () => {
    for (let rho = 0.05; rho < 0.99; rho += 0.05) expect(mm1Latency(MU, rho * MU)).toBeCloseTo(1 / (MU - rho * MU), 9);
    expect(erlangC(1, 0.3)).toBeCloseTo(0.3, 12);
  });

  it('gives the hand values: 0.2 s at 50%, 0.5 s at 80%, 1.0 s at 90%, and never ends at or past 100%', () => {
    expect(mm1Latency(10, 5)).toBeCloseTo(0.2, 12);
    expect(mm1Latency(10, 8)).toBeCloseTo(0.5, 12);
    expect(mm1Latency(10, 9)).toBeCloseTo(1, 12);
    expect(mm1Latency(10, 10)).toBe(Infinity);
    expect(mm1Latency(10, 25)).toBe(Infinity);
  });

  it('quiz: going from 50% to 90% utilisation multiplies the latency by 5; 200/s x 50 ms puts 10 requests in the system', () => {
    expect(mm1Latency(10, 9) / mm1Latency(10, 5)).toBeCloseTo(5, 12);
    expect(littleL(200, 0.05)).toBeCloseTo(10, 12);
  });
});

describe('the simulation is an M/M/1 queue and obeys Little\'s Law', () => {
  // Independent oracle: the closed forms W = 1 / (mu - lambda) and L = lambda x W, averaged over five seeds of 2,000 s.
  it.each([5, 8, 9])('at %i/s the mean time inside matches 1 / (mu - lambda) within 6%%', (rate) => {
    const totals = [1, 2, 3, 4, 5].map((seed) => run(rate, 'unbounded', seed, 2_000).p.totals());
    const w = totals.reduce((a, t) => a + t.W, 0) / totals.length;
    expect(Math.abs(w - 1 / (MU - rate)) / (1 / (MU - rate))).toBeLessThan(0.06);
    const l = totals.reduce((a, t) => a + t.L, 0) / totals.length;
    expect(Math.abs(l - rate / (MU - rate)) / (rate / (MU - rate))).toBeLessThan(0.08);
  });

  it.each<[number, Policy]>([[5, 'unbounded'], [8, 'unbounded'], [9, 'unbounded'], [15, 'bounded'], [12, 'shed']])(
    'L = lambda x W over a long run within 1%%, at %i/s under %s',
    (rate, policy) => {
      const t = run(rate, policy, 3, 3_000).p.totals();
      expect(Math.abs(t.L - littleL(t.lambda, t.W)) / t.L).toBeLessThan(0.01);
    },
  );

  it('the readout calls a settled 10 s window "steady" in at least 85% of readings, and a growing queue not steady', () => {
    let steady = 0;
    let readings = 0;
    for (const rate of [5, 8, 9]) {
      for (const seed of [7, 1, 2]) {
        const w = createWorld(rate, 'unbounded', seed);
        advance(w, 30);
        for (let t = 0; t < 600; t += 5) {
          advance(w, 5);
          readings += 1;
          if (littleCheck(w.p.stats()).steady) steady += 1;
        }
      }
    }
    expect(steady / readings).toBeGreaterThanOrEqual(0.85);
    expect(littleCheck({ L: 50, throughput: 10, W: 2 }).steady).toBe(false);
    expect(littleCheck({ L: 10, throughput: 10, W: 1.05 }).steady).toBe(true);
    expect(littleCheck({ L: 0.2, throughput: 0, W: 0 }).steady).toBe(true);
  });
});

describe('the seed makes the run reproducible', () => {
  it('never reads the global random source, and replays exactly for the same seed', () => {
    const spy = vi.spyOn(Math, 'random');
    const a = run(8, 'shed', 11, 120).p.stats();
    const b = run(8, 'shed', 11, 120).p.stats();
    expect(spy).not.toHaveBeenCalled();
    expect(a).toEqual(b);
    expect(run(8, 'shed', 12, 120).p.stats()).not.toEqual(a);
  });

  it('does not depend on how the run is sliced into frames', () => {
    const whole = run(9, 'unbounded', 4, 60);
    const sliced = createWorld(9, 'unbounded', 4);
    for (let i = 0; i < 600; i += 1) advance(sliced, 0.1);
    expect(sliced.p.stats().crashes).toBe(whole.p.stats().crashes);
    expect(sliced.p.totals().W).toBeCloseTo(whole.p.totals().W, 9);
    expect(sliced.p.completed).toBe(whole.p.completed);
  });
});

describe('unbounded, bounded and shedding at the arrival rates of the try-this entries', () => {
  it('unbounded at 15/s crashes within half a minute of the rate change', () => {
    const w = createWorld(8, 'unbounded', DEFAULT_SEED);
    advance(w, 5);
    setRate(w, 15);
    let crashedAt: number | null = null;
    for (let t = 0; t < 30 && crashedAt === null; t += 0.1) {
      advance(w, 0.1);
      if (w.p.crashes > 0) crashedAt = t;
    }
    expect(crashedAt).not.toBeNull();
    expect(w.p.lost).toBeGreaterThan(0);
  });

  it('bounded never holds more than the limit, never crashes, and keeps latency bounded at the highest rate', () => {
    const w = createWorld(8, 'bounded', DEFAULT_SEED);
    advance(w, 5);
    setRate(w, RATE_MAX);
    let maxQueue = 0;
    let maxP99 = 0;
    for (let i = 0; i < 6_000; i += 1) {
      advance(w, 0.1);
      maxQueue = Math.max(maxQueue, w.p.queue.length);
      if (i > 150) maxP99 = Math.max(maxP99, w.p.stats().p99);
    }
    expect(maxQueue).toBeLessThanOrEqual(CAP);
    expect(w.p.crashes).toBe(0);
    expect(maxP99).toBeLessThan(5);
    // A full bounded queue means each admitted item waits behind CAP - 1 others plus the one being served, then is served:
    // (CAP + 1) / MU = 2.1 s on average.
    expect(Math.abs(w.p.totals().W - (CAP + 1) / MU) / ((CAP + 1) / MU)).toBeLessThan(0.05);
    expect(w.p.stats().pending).toBeGreaterThan(0);
  });
});

describe('load shedding refuses the lowest priority first', () => {
  /** A pipeline whose next arrival is high or low priority as the test says (service draws do not matter: time never moves). */
  function shedPipeline() {
    let draw = 0.9; // >= 0.25 is low priority
    const p = new Pipeline(() => draw);
    p.setPolicy('shed');
    const arrive = (high: boolean) => {
      draw = high ? 0.1 : 0.9;
      p.arrive();
    };
    return { p, arrive };
  }

  it('accepts low priority up to the shedding line, refuses it past the line, and refuses high priority only when the queue is full', () => {
    const { p, arrive } = shedPipeline();
    for (let i = 0; i <= SHED_AT; i += 1) arrive(false); // the first goes straight to the worker
    expect(p.queue.length).toBe(SHED_AT);
    expect(p.rejectedLow).toBe(0);
    arrive(false);
    expect(p.rejectedLow).toBe(1);
    expect(p.queue.length).toBe(SHED_AT);
    for (let i = SHED_AT; i < CAP; i += 1) arrive(true);
    expect(p.queue.length).toBe(CAP);
    expect(p.rejectedHigh).toBe(0);
    arrive(true);
    expect(p.rejectedHigh).toBe(1);
    expect(p.queue.length).toBe(CAP);
    arrive(false);
    expect(p.rejectedLow).toBe(2);
  });

  it('under a spike on 200 seeds, never refuses a high-priority item while the queue is below the limit', () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const w = createWorld(8, 'shed', seed);
      advance(w, 10);
      startSpike(w);
      let high = w.p.rejectedHigh;
      for (let t = 0; t < 8; t += 0.05) {
        const before = w.p.queue.length;
        advance(w, 0.05);
        if (w.p.rejectedHigh > high) expect(before, `seed ${seed}`).toBeGreaterThanOrEqual(CAP - 2);
        high = w.p.rejectedHigh;
      }
      const st = w.p.stats();
      expect(st.rejectedLow, `seed ${seed}`).toBeGreaterThanOrEqual(st.rejectedHigh);
    }
  });
});

describe('every control, at its extremes and one step beyond', () => {
  it('clamps the arrival rate to the slider range and refuses nonsense', () => {
    expect([RATE_MIN - 1, RATE_MIN, RATE_MAX, RATE_MAX + 1, Number.NaN, Infinity].map(clampRate)).toEqual([RATE_MIN, RATE_MIN, RATE_MAX, RATE_MAX, RATE_MIN, RATE_MAX]);
  });

  it('runs every policy at the lowest and highest rate, with a spike, a policy change and awkward step sizes, without NaN', () => {
    const policies: Policy[] = ['unbounded', 'bounded', 'shed'];
    for (const policy of policies) {
      for (const rate of [RATE_MIN, RATE_MAX, RATE_MAX + 5]) {
        for (const seed of [0, DEFAULT_SEED, SEED_MAX]) {
          const w = createWorld(rate, policy, seed);
          advance(w, 0);
          advance(w, 1e-9);
          advance(w, 20);
          startSpike(w);
          advance(w, 7);
          w.p.setPolicy(policies[(policies.indexOf(policy) + 1) % 3]);
          advance(w, 100);
          const st = w.p.stats();
          for (const v of [st.p50, st.p99, st.L, st.W, st.throughput]) expect(Number.isFinite(v), `${policy} ${rate} ${seed}`).toBe(true);
          expect(w.rate).toBeLessThanOrEqual(RATE_MAX);
        }
      }
    }
  });
});

describe("try-this entries, from the default state, as written", () => {
  it('try-this 1: unbounded at 15/s crashes and the stats show crashes and lost requests', () => {
    const w = createWorld(8, 'unbounded', DEFAULT_SEED);
    advance(w, 5);
    setRate(w, 15);
    advance(w, 30);
    const st = w.p.stats();
    expect(st.crashes).toBeGreaterThanOrEqual(1);
    expect(st.lost).toBeGreaterThan(0);
  });

  it('try-this 2: switching to bounded at the same rate stops the queue at the limit, shows a waiting-upstream count and keeps p99 under 5 s', () => {
    const w = createWorld(8, 'unbounded', DEFAULT_SEED);
    advance(w, 5);
    setRate(w, 15);
    w.p.setPolicy('bounded');
    advance(w, 60);
    const st = w.p.stats();
    expect(st.queue).toBeLessThanOrEqual(CAP);
    expect(st.pending).toBeGreaterThan(0);
    expect(st.p99).toBeLessThan(5);
    expect(st.crashes).toBe(0);
  });

  it('try-this 3: on the default seed a spike under shedding refuses low-priority work and no high-priority work', () => {
    const w = createWorld(8, 'unbounded', DEFAULT_SEED);
    advance(w, 5);
    w.p.setPolicy('shed');
    advance(w, 5);
    startSpike(w);
    advance(w, 8);
    const st = w.p.stats();
    expect(st.rejectedLow).toBeGreaterThan(0);
    expect(st.rejectedHigh).toBe(0);
  });

  it('try-this 4: 5, 8 and 9 per second sit at 0.2, 0.5 and 1.0 s on the curve', () => {
    expect([5, 8, 9].map((r) => mm1Latency(MU, r))).toEqual([expect.closeTo(0.2, 12), expect.closeTo(0.5, 12), expect.closeTo(1, 12)]);
    expect([5, 8, 9].map((r) => Math.round((r / MU) * 100))).toEqual([50, 80, 90]);
  });
});

describe('the lesson text', () => {
  it('has four try-this entries and five questions, scopes the formula to M/M/1 and links the queueing lesson', () => {
    expect(lesson.tryThis).toHaveLength(4);
    expect(lesson.quiz).toHaveLength(5);
    expect(lesson.keyIdeas.join(' ')).toContain('M/M/1');
    expect(lesson.summary.what).toContain('queueing-theory');
  });
});

describe('switching policy measures the new policy on its own', () => {
  it('clears the crash, loss and shed counters, so Bounded never shows the Unbounded run\'s crash', () => {
    const w = createWorld(15, 'unbounded', DEFAULT_SEED);
    advance(w, 60);
    expect(w.p.stats().crashes, 'the unbounded run at 15/s crashed').toBeGreaterThan(0);
    expect(w.p.stats().lost).toBeGreaterThan(0);
    w.p.setPolicy('shed');
    expect(w.p.stats()).toMatchObject({ crashes: 0, lost: 0 });
    advance(w, 5);
    const after = w.p.stats();
    expect(after.crashes, 'shedding at 15/s never runs out of memory').toBe(0);
    expect(after.rejectedLow + after.rejectedHigh, 'only what shedding refused since the switch').toBeLessThanOrEqual(Math.ceil(15 * 5 * 2));
    w.p.setPolicy('bounded');
    expect(w.p.stats()).toMatchObject({ crashes: 0, lost: 0, rejectedLow: 0, rejectedHigh: 0 });
  });

  it('reads throughput over the time since the switch, not a full 10 s window that is mostly empty', () => {
    const w = createWorld(8, 'bounded', DEFAULT_SEED);
    advance(w, 30);
    w.p.setPolicy('bounded');
    advance(w, 4);
    const throughput = w.p.stats().throughput;
    // 4 s at 8 arrivals/s into a 10/s worker: about 8/s, and certainly not the ~3/s a 10 s divisor would print.
    expect(throughput).toBeGreaterThan(5);
    expect(throughput).toBeLessThan(11);
  });
});

describe('the latency-curve dot label', () => {
  it('says the queue is capped under bounded and shed, and only says it grows forever when it is unbounded', async () => {
    const { saturatedLabel } = await import('./draw');
    expect(saturatedLabel('unbounded')).toContain('grows forever');
    for (const p of ['bounded', 'shed'] as const) {
      expect(saturatedLabel(p)).not.toContain('grows forever');
      expect(saturatedLabel(p)).toContain(`capped at ${CAP}`);
    }
  });
});
