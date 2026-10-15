import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import { captionText } from '../../core/testing/captions';
import {
  BAD_DAY, badDayCaption, HEALTHY, healCaption, insightCaption, introCaption, MODE_LABEL, modeCaption, transitionCaption,
} from './captions';
import lesson from './index';
import {
  advance, BASE_BACKOFF, BROKEN_SEED, B_CAP, CASCADE_ERROR_PCT, createWorld, insightFor, isStorm, MAX_FAIL_CHANCE, MAX_RETRIES, MIN_CALLS, OPEN_FOR, PROBES,
  Sim, STORM_RATIO, THREADS, TIMEOUT, TRIP_RATIO, type BreakerState, type Mode, type Stats, type World,
} from './sim';

const DT = 0.05;
const SEEDS = Array.from({ length: 200 }, (_, i) => i);
const RUN_SECONDS = 45;
/** How far above STORM_RATIO the pinned seed's naive peak must sit, in multiples of the user traffic. */
const BROKEN_SEED_MARGIN = 0.5;
const DEFAULT_RATE = 15;

interface Schedule {
  /** When the bad day starts and when B is healed, in seconds. */
  at: number;
  heal: number;
  /** B's failure rate (percent) and latency (ms) during the bad day. */
  fail: number;
  latency: number;
  /** User traffic, per second. */
  rate: number;
}

/** A fault schedule drawn from the seed: when B goes bad, how bad, how long, and how busy the users are. */
function scheduleFor(seed: number): Schedule {
  const r = mulberry32(seed * 7919 + 3);
  const at = 3 + Math.floor(r() * 6);
  return {
    at,
    heal: at + 10 + Math.floor(r() * 11),
    fail: Math.floor(r() * 91),
    latency: 50 + Math.floor(r() * 146) * 10,
    rate: 5 + Math.floor(r() * 21),
  };
}

const near = (a: number, b: number) => Math.abs(a - b) < DT / 2;

interface Observer {
  /** Called after every step. `before` is the breaker state at the start of the step. */
  onStep?: (w: World, before: BreakerState, callsBefore: number, st: Stats) => void;
}

/** Run one seeded fault schedule in `mode`, calling the observer after every step. */
function runSchedule(mode: Mode, seed: number, sch: Schedule = scheduleFor(seed), obs: Observer = {}) {
  const w = createWorld(sch.rate, seed);
  w.sim.setMode(mode);
  for (let i = 0; i < RUN_SECONDS / DT; i++) {
    const t = i * DT;
    if (near(t, sch.at)) {
      w.sim.failRate = sch.fail / 100;
      w.sim.latency = sch.latency / 1000;
    }
    if (near(t, sch.heal)) {
      w.sim.failRate = HEALTHY.fail / 100;
      w.sim.latency = HEALTHY.latency / 1000;
    }
    const before = w.sim.breaker;
    const callsBefore = w.sim.callsSent;
    advance(w, DT);
    obs.onStep?.(w, before, callsBefore, w.sim.stats());
  }
  return w;
}

/** The worst B load, as a multiple of user traffic, over any window after the first two seconds. */
function worstLoad(mode: Mode, seed: number, sch = scheduleFor(seed)) {
  let worst = { ratio: 0, firstAttempts: 0, at: 0 };
  runSchedule(mode, seed, sch, {
    onStep: (w, _b, _c, st) => {
      const ratio = st.bLoad / sch.rate;
      if (w.sim.now >= 2 && ratio > worst.ratio) worst = { ratio, firstAttempts: (st.bLoad - st.bRetryLoad) / sch.rate, at: w.sim.now };
    },
  });
  return worst;
}

/** Calls sent in a step that began and ended with the breaker open and saw no transition: none are allowed. */
function sentWhileOpen(w: World, before: BreakerState, callsBefore: number): number {
  const { sim } = w;
  const transitioned = sim.transitions.some((t) => near(t.t, sim.now));
  return before === 'open' && sim.breaker === 'open' && !transitioned ? sim.callsSent - callsBefore : 0;
}

describe('safety invariants over 200 seeded fault schedules (breaker mode)', () => {
  it('the open-breaker check catches a caller that ignores the breaker (naive mode with the breaker forced open)', () => {
    let violations = 0;
    runSchedule('naive', 0, scheduleFor(0), {
      onStep: (w, before, callsBefore) => {
        if (near(w.sim.now, 1)) w.sim.setBreaker('open');
        violations += sentWhileOpen(w, before, callsBefore) > 0 ? 1 : 0;
      },
    });
    expect(violations).toBeGreaterThan(10);
  });

  it('no call is sent to B while the breaker is open, and threads and attempts stay within their bounds, at every step', () => {
    for (const seed of SEEDS) {
      runSchedule('breaker', seed, scheduleFor(seed), {
        onStep: (w, before, callsBefore) => {
          const { sim } = w;
          expect(sentWhileOpen(w, before, callsBefore), `seed ${seed} t=${sim.now.toFixed(2)}`).toBe(0);
          expect(sim.threads.filter(Boolean).length).toBeLessThanOrEqual(THREADS);
          expect(sim.threads.filter(Boolean).length).toBe(sim.reqs.filter((r) => !r.done).length);
          for (const r of sim.reqs) expect(r.attempt).toBeLessThanOrEqual(MAX_RETRIES);
        },
      });
    }
  });

  it('transitions are only closed to open, open to half, half to open and half to closed', () => {
    const allowed = new Set(['closed>open', 'open>half', 'half>open', 'half>closed']);
    let seen = 0;
    for (const seed of SEEDS) {
      let last = 0;
      let state: BreakerState = 'closed';
      runSchedule('breaker', seed, scheduleFor(seed), {
        onStep: (w) => {
          for (const t of w.sim.transitions.filter((x) => x.t > last)) {
            last = t.t;
            expect(allowed.has(`${state}>${t.to}`), `seed ${seed}: ${state} to ${t.to}`).toBe(true);
            state = t.to;
            seen++;
          }
        },
      });
    }
    expect(seen).toBeGreaterThan(SEEDS.length);
  });

  it('trips as soon as the window holds at least MIN_CALLS calls and TRIP_RATIO of them failed, and not before', () => {
    let trips = 0;
    for (const seed of SEEDS) {
      runSchedule('breaker', seed, scheduleFor(seed), {
        onStep: (w, before) => {
          const { sim } = w;
          const fails = sim.window.filter((x) => !x).length;
          const ruleMet = sim.window.length >= MIN_CALLS && fails / sim.window.length >= TRIP_RATIO;
          if (sim.breaker === 'closed') expect(ruleMet, `seed ${seed}`).toBe(false);
          if (before === 'closed' && sim.breaker === 'open') {
            expect(ruleMet, `seed ${seed}`).toBe(true);
            trips++;
          }
        },
      });
    }
    expect(trips).toBeGreaterThan(50);
  });

  it('stays open for OPEN_FOR seconds before going half-open, then lets through at most PROBES probes', () => {
    for (const seed of SEEDS.slice(0, 60)) {
      let openedAt: number | null = null;
      let halfAt = Infinity;
      const probes = new Set<number>();
      runSchedule('breaker', seed, scheduleFor(seed), {
        onStep: (w) => {
          const { sim } = w;
          for (const t of sim.transitions.filter((x) => near(x.t, sim.now))) {
            if (t.to === 'open') openedAt = t.t;
            if (t.to === 'half') {
              expect(t.t - (openedAt ?? -Infinity), `seed ${seed}`).toBeGreaterThanOrEqual(OPEN_FOR - 1e-9);
              expect(t.t - (openedAt ?? -Infinity)).toBeLessThan(OPEN_FOR + 2 * DT);
              halfAt = t.t;
              probes.clear();
            }
          }
          if (sim.breaker === 'half') {
            for (const c of sim.calls.filter((x) => x.probe && x.sentAt >= halfAt)) probes.add(c.id);
            expect(probes.size).toBeLessThanOrEqual(PROBES);
          }
        },
      });
    }
  });

  it('closes only after PROBES successful probes and reopens on a failed probe (each close is backed by probes seen succeeding)', () => {
    let closes = 0;
    let reopens = 0;
    for (const seed of SEEDS) {
      let probeResults = new Map<number, boolean>();
      let halfAt = Infinity;
      runSchedule('breaker', seed, scheduleFor(seed), {
        onStep: (w, before) => {
          const { sim } = w;
          for (const c of sim.calls.filter((x) => x.probe && x.resolved && x.sentAt >= halfAt)) probeResults.set(c.id, c.ok && !c.timedOut);
          for (const t of sim.transitions.filter((x) => near(x.t, sim.now))) {
            if (t.to === 'half') {
              probeResults = new Map();
              halfAt = t.t;
            }
            if (t.to === 'closed') {
              closes++;
              expect([...probeResults.values()].filter(Boolean).length, `seed ${seed}`).toBeGreaterThanOrEqual(PROBES);
              expect([...probeResults.values()].some((ok) => !ok), `seed ${seed}`).toBe(false);
            }
            if (t.to === 'open' && before === 'half') {
              reopens++;
              expect([...probeResults.values()].some((ok) => !ok), `seed ${seed}`).toBe(true);
            }
          }
        },
      });
    }
    expect(closes).toBeGreaterThan(0);
    expect(reopens).toBeGreaterThan(0);
  });

  it('liveness, stated separately: once B is healed, the breaker is closed again by the end of the run on at least 95% of the seeds that tripped it', () => {
    let tripped = 0;
    let recovered = 0;
    for (const seed of SEEDS) {
      let everOpen = false;
      const w = runSchedule('breaker', seed, scheduleFor(seed), { onStep: (x) => (everOpen ||= x.sim.breaker === 'open') });
      if (everOpen) {
        tripped++;
        if (w.sim.breaker === 'closed') recovered++;
      }
    }
    expect(tripped).toBeGreaterThan(100);
    expect(recovered / tripped).toBeGreaterThanOrEqual(0.95);
  });
});

describe('naive retries are the broken mode: they break the load bound the breaker keeps', () => {
  it('BROKEN_SEED breaks the bound by a wide margin, so a small change to the model cannot quietly flip it (the lowest failing seed would pass by 0.01)', () => {
    const margin = worstLoad('naive', BROKEN_SEED).ratio - STORM_RATIO;
    expect(margin).toBeGreaterThanOrEqual(BROKEN_SEED_MARGIN);
    // And the breaker, on the same schedule, keeps the bound.
    expect(worstLoad('breaker', BROKEN_SEED).ratio).toBeLessThanOrEqual(STORM_RATIO);
  });

  it('on BROKEN_SEED the excess is the retries: first attempts alone stay under the bound, the total does not', () => {
    const sch = scheduleFor(BROKEN_SEED);
    const w = worstLoad('naive', BROKEN_SEED, sch);
    expect(w.ratio).toBeGreaterThan(STORM_RATIO);
    expect(w.firstAttempts).toBeLessThanOrEqual(STORM_RATIO);
    expect(w.ratio - w.firstAttempts).toBeGreaterThan(BROKEN_SEED_MARGIN);
    // The bad day is on at that moment, and the violation is not there before it starts.
    expect(w.at).toBeGreaterThan(sch.at);
    let before = 0;
    runSchedule('naive', BROKEN_SEED, sch, {
      onStep: (x, _b, _c, st) => {
        if (x.sim.now >= 2 && x.sim.now < sch.at) before = Math.max(before, st.bLoad / sch.rate);
      },
    });
    expect(before).toBeLessThanOrEqual(STORM_RATIO);
  });

  it('a healthy B never looks like a storm: with no fault, load stays under STORM_RATIO on every seed', () => {
    for (const seed of SEEDS) {
      const none = { ...scheduleFor(seed), fail: HEALTHY.fail, latency: HEALTHY.latency };
      expect(worstLoad('naive', seed, none).ratio, `seed ${seed}`).toBeLessThanOrEqual(STORM_RATIO);
    }
  });

  it('naive and backoff break the bound on most schedules; the breaker on very few', () => {
    const broken = (mode: Mode) => SEEDS.filter((seed) => worstLoad(mode, seed).ratio > STORM_RATIO).length / SEEDS.length;
    expect(broken('naive')).toBeGreaterThan(0.8);
    expect(broken('backoff')).toBeGreaterThan(0.6);
    expect(broken('breaker')).toBeLessThan(0.05);
  });

  it('retries multiply load up to 4x per request in this model: no request makes more than 1 + MAX_RETRIES calls, and a bad day gets close', () => {
    let worstPerRequest = 0;
    for (const seed of SEEDS.slice(0, 40)) {
      const w = runSchedule('naive', seed, scheduleFor(seed), {
        onStep: (x) => {
          for (const r of x.sim.reqs) worstPerRequest = Math.max(worstPerRequest, r.attempt + 1);
        },
      });
      expect(w.sim.callsSent / w.sim.admitted).toBeLessThanOrEqual(1 + MAX_RETRIES);
    }
    expect(1 + MAX_RETRIES).toBe(4);
    expect(worstPerRequest).toBe(1 + MAX_RETRIES);
  });
});

/** Put `n` calls in flight at B for a long time, so B's concurrency is n. */
function park(sim: Sim, n: number) {
  for (let i = 0; i < n; i++) {
    sim.calls.push({
      id: -i, req: { id: -i, born: 0, attempt: 0, thread: 0, retryAt: null, done: true }, attempt: 0, probe: false, sentAt: 0, arriveB: 0,
      bDoneAt: 1000, respAt: 1000, ok: true, resolved: true, timedOut: false, scheduled: true,
    });
  }
}

describe("the failure rate on B's box is the rate the model applies", () => {
  /**
   * Measure it rather than recompute it: park `parked` calls in flight at B, send one more through the real step(), and count how
   * often it fails over many seeds. Nothing here calls failChance or the label's formula.
   */
  const measuredFailure = (failRate: number, parked: number, trials = 4000) => {
    let failed = 0;
    for (let seed = 0; seed < trials; seed++) {
      const sim = new Sim(seed);
      sim.failRate = failRate;
      park(sim, parked);
      const probe = { id: 1, req: { id: 1, born: 0, attempt: 0, thread: 1, retryAt: null, done: true }, attempt: 0, probe: false, sentAt: 0, arriveB: 0.001, bDoneAt: Infinity, respAt: Infinity, ok: false, resolved: false, timedOut: false, scheduled: false };
      sim.calls.push(probe);
      sim.step(0.002);
      if (!probe.ok) failed++;
    }
    return failed / trials;
  };

  it('with B overloaded and a 3% base rate, the sim fails about the share the box shows, not the base 3%', () => {
    for (const parked of [0, 14, 22, 30, 60]) {
      const sim = new Sim(0);
      sim.failRate = HEALTHY.fail / 100;
      park(sim, parked);
      const shown = Math.round(sim.nextCallFailChance * 100);
      const measured = measuredFailure(HEALTHY.fail / 100, parked);
      expect(Math.abs(measured * 100 - shown), `${parked} calls at B: shows ${shown}%, measured ${(measured * 100).toFixed(1)}%`).toBeLessThanOrEqual(2.5);
    }
  });

  it('the box says "3% fail" only when B is not overloaded, and a heal during a backlog shows a far higher rate (try-this 2)', () => {
    const healed = (parked: number) => {
      const sim = new Sim(0);
      sim.failRate = HEALTHY.fail / 100;
      park(sim, parked);
      return Math.round(sim.nextCallFailChance * 100);
    };
    expect(healed(5)).toBe(HEALTHY.fail);
    expect(healed(40)).toBeGreaterThan(50);
    // and the real run after Heal B reaches such a backlog
    const w = createWorld(DEFAULT_RATE, BROKEN_SEED);
    w.sim.failRate = BAD_DAY.fail / 100;
    w.sim.latency = BAD_DAY.latency / 1000;
    for (let i = 0; i < 12 / DT; i++) advance(w, DT);
    w.sim.failRate = HEALTHY.fail / 100;
    w.sim.latency = HEALTHY.latency / 1000;
    advance(w, DT);
    expect(w.sim.nextCallFailChance).toBeGreaterThan(0.2);
    expect(w.sim.failRate).toBe(HEALTHY.fail / 100);
  });

  it('it never exceeds the cap, however deep the backlog', () => {
    const sim = new Sim(0);
    sim.failRate = 0.9;
    park(sim, 100);
    expect(sim.nextCallFailChance).toBe(MAX_FAIL_CHANCE);
  });
});

describe('the storm stat fires on retry load, also at the busiest user traffic', () => {
  it("isStorm: above STORM_RATIO times the users, or mostly retries on top of the users' load; a healthy trickle of retries is neither", () => {
    expect(isStorm({ bLoad: 10 * STORM_RATIO + 1, bRetryLoad: 0 }, 10)).toBe(true);
    expect(isStorm({ bLoad: 15, bRetryLoad: 8 }, 10)).toBe(true);
    expect(isStorm({ bLoad: 15, bRetryLoad: 5 }, 10)).toBe(false);
    expect(isStorm({ bLoad: 8, bRetryLoad: 6 }, 10)).toBe(false);
    expect(isStorm({ bLoad: 10.3, bRetryLoad: 0.3 }, 10)).toBe(false);
  });

  it('at 25 users a second the thread pool keeps B under STORM_RATIO, yet most of its load is retries and the stat fires', () => {
    const rate = 25;
    const w = createWorld(rate, BROKEN_SEED);
    w.sim.failRate = BAD_DAY.fail / 100;
    w.sim.latency = BAD_DAY.latency / 1000;
    let peakRatio = 0;
    let fired = false;
    let retryShare = 0;
    for (let i = 0; i < 30 / DT; i++) {
      advance(w, DT);
      const st = w.sim.stats();
      peakRatio = Math.max(peakRatio, st.bLoad / rate);
      if (isStorm(st, rate)) {
        fired = true;
        retryShare = Math.max(retryShare, st.bRetryLoad / st.bLoad);
      }
    }
    expect(peakRatio).toBeLessThan(STORM_RATIO);
    expect(fired).toBe(true);
    expect(retryShare).toBeGreaterThan(0.9);
  });

  it('never fires for a healthy B on any seed, with naive retries', () => {
    for (const seed of SEEDS.slice(0, 60)) {
      const none = { ...scheduleFor(seed), fail: HEALTHY.fail, latency: HEALTHY.latency };
      runSchedule('naive', seed, none, { onStep: (w, _b, _c, st) => expect(isStorm(st, none.rate), `seed ${seed} t=${w.sim.now.toFixed(2)}`).toBe(false) });
    }
  });
});

describe('backoff with jitter spreads retries out', () => {
  const delaysOf = (mode: Mode, seed: number) => {
    const sch = scheduleFor(seed);
    const delays: number[] = [];
    let seen = -1;
    runSchedule(mode, seed, { ...sch, fail: BAD_DAY.fail, latency: BAD_DAY.latency }, {
      onStep: (w) => {
        for (const d of w.sim.retryDelays.filter((x) => x.t > seen)) {
          delays.push(d.delay);
          seen = Math.max(seen, d.t);
        }
      },
    });
    return delays;
  };

  it('naive retries all wait zero; with backoff every wait is within the last cap and they are not bunched in one place', () => {
    const naive = delaysOf('naive', BROKEN_SEED);
    const backoff = delaysOf('backoff', BROKEN_SEED);
    expect(naive.length).toBeGreaterThan(50);
    expect(naive.every((d) => d === 0)).toBe(true);
    expect(backoff.length).toBeGreaterThan(50);
    const cap = BASE_BACKOFF * 2 ** (MAX_RETRIES - 1);
    for (const d of backoff) expect(d).toBeLessThanOrEqual(cap);
    // Spread: no thin slice of the strip holds a big share of the waits (naive puts 100% in the slice at zero).
    const SLICES = 32;
    const slices = Array.from({ length: SLICES }, () => 0);
    for (const d of backoff) slices[Math.min(SLICES - 1, Math.floor((d / cap) * SLICES))]++;
    expect(Math.max(...slices) / backoff.length).toBeLessThan(0.2);
    expect(slices.filter((n) => n > 0).length).toBeGreaterThan(SLICES / 2);
  });

  it('jitter is uniform: the wait before retry k is a uniform draw on [0, BASE_BACKOFF x 2^(k-1)], so its mean is half of that cap', () => {
    const waits = new Map<number, number[]>();
    for (const seed of SEEDS.slice(0, 30)) {
      const sch = { ...scheduleFor(seed), fail: BAD_DAY.fail, latency: BAD_DAY.latency };
      let seen = -1;
      runSchedule('backoff', seed, sch, {
        onStep: (w) => {
          for (const d of w.sim.retryDelays.filter((x) => x.t > seen)) {
            seen = Math.max(seen, d.t);
            waits.set(d.attempt, [...(waits.get(d.attempt) ?? []), d.delay]);
          }
        },
      });
    }
    for (let k = 1; k <= MAX_RETRIES; k++) {
      const xs = waits.get(k) ?? [];
      const cap = BASE_BACKOFF * 2 ** (k - 1);
      expect(xs.length, `retry ${k}`).toBeGreaterThan(200);
      expect(Math.max(...xs)).toBeLessThanOrEqual(cap);
      const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
      expect(Math.abs(mean - cap / 2) / cap, `retry ${k}`).toBeLessThan(0.05);
    }
  });
});

describe('insights and captions are computed from the run', () => {
  const stats = (over: Partial<Stats>): Stats => ({
    bLoad: 10, bRetryLoad: 0, bConc: 3, bOrphans: 0, errorPct: 0, fallbackPct: 0, p99: 0.1, busyThreads: 4, breaker: 'closed', ...over,
  });

  it('insightFor picks cascade, storm or backlog from the numbers, and nothing for a healthy run', () => {
    const o = { rate: 10, mode: 'naive' as Mode, failRate: 0.03 };
    expect(insightFor(stats({}), o)).toBeNull();
    expect(insightFor(stats({ busyThreads: THREADS, errorPct: CASCADE_ERROR_PCT + 1 }), o)).toEqual({ kind: 'cascade' });
    expect(insightFor(stats({ busyThreads: THREADS, errorPct: CASCADE_ERROR_PCT }), o)).toBeNull();
    expect(insightFor(stats({ bLoad: 10 * STORM_RATIO + 1 }), o)).toEqual({ kind: 'storm', ratio: (10 * STORM_RATIO + 1) / 10 });
    expect(insightFor(stats({ bLoad: 10 * STORM_RATIO + 1 }), { ...o, mode: 'breaker' })).toBeNull();
    expect(insightFor(stats({ bConc: B_CAP * 2 + 1, bOrphans: 7 }), o)).toEqual({ kind: 'backlog', conc: B_CAP * 2 + 1, orphans: 7 });
    expect(insightFor(stats({ bConc: B_CAP * 2 + 1 }), { ...o, failRate: 0.6 })).toBeNull();
  });

  it('captions quote the constants the model uses', () => {
    const t = (n: Parameters<typeof captionText>[0]) => captionText(n, { strict: true });
    expect(t(modeCaption('naive'))).toContain(`up to ${MAX_RETRIES} times`);
    expect(t(modeCaption('backoff'))).toContain('up to 0.2 s, 0.4 s, 0.8 s');
    expect(BASE_BACKOFF).toBe(0.2);
    expect(t(modeCaption('breaker'))).toContain(`at least ${MIN_CALLS} calls are on record and ${TRIP_RATIO * 100}% or more of the last 20`);
    expect(t(transitionCaption('open'))).toContain(`${TRIP_RATIO * 100}% or more of the recent calls`);
    expect(t(transitionCaption('open'))).toContain(`For ${OPEN_FOR} s`);
    expect(t(transitionCaption('half'))).toContain(`Let ${PROBES} probe`);
    expect(t(transitionCaption('closed'))).toContain(`All ${PROBES} probes`);
    expect(t(badDayCaption())).toContain(`${BAD_DAY.fail}% of calls fail`);
    expect(t(badDayCaption())).toContain(`${TIMEOUT} s`);
    expect(t(insightCaption({ kind: 'cascade' }))).toContain(`all ${THREADS} of A's threads`);
    expect(t(insightCaption({ kind: 'storm', ratio: 2.46 }))).toContain('2.5×');
    expect(t(insightCaption({ kind: 'backlog', conc: 51, orphans: 33 }))).toContain('51 calls, 33 of them');
    expect(t(introCaption())).toContain('Naive retries');
    expect(t(healCaption())).toContain('B is fixed');
    expect(Object.values(MODE_LABEL)).toHaveLength(3);
  });

  it('the bad-day state is a real fault: more failures and slower than healthy', () => {
    expect(BAD_DAY.fail).toBeGreaterThan(HEALTHY.fail);
    expect(BAD_DAY.latency).toBeGreaterThan(HEALTHY.latency);
  });
});

describe('try-this, from the lesson as it loads (naive retries, healthy B, 15 users a second, seed BROKEN_SEED)', () => {
  /** Load the lesson, run `before` seconds healthy, then apply the bad day (what the button sets). */
  const badDayRun = (mode: Mode, seconds: number, onStep?: (w: World, st: Stats) => void) => {
    const w = createWorld(DEFAULT_RATE, BROKEN_SEED);
    w.sim.setMode(mode);
    w.sim.failRate = BAD_DAY.fail / 100;
    w.sim.latency = BAD_DAY.latency / 1000;
    for (let i = 0; i < seconds / DT; i++) {
      advance(w, DT);
      onStep?.(w, w.sim.stats());
    }
    return w;
  };

  it('try-this 1: on a bad day with naive retries the load on B rises above the user traffic and every one of A\'s threads fills up', () => {
    let maxLoad = 0;
    let maxThreads = 0;
    badDayRun('naive', 20, (_w, st) => {
      maxLoad = Math.max(maxLoad, st.bLoad);
      maxThreads = Math.max(maxThreads, st.busyThreads);
    });
    expect(maxLoad).toBeGreaterThan(DEFAULT_RATE * STORM_RATIO);
    expect(maxThreads).toBe(THREADS);
  });

  it('try-this 2: after Heal B the error rate does not drop at once (backlog), and the system does recover on its own', () => {
    const w = badDayRun('naive', 12);
    w.sim.failRate = HEALTHY.fail / 100;
    w.sim.latency = HEALTHY.latency / 1000;
    const after: Stats[] = [];
    for (let i = 0; i < 40 / DT; i++) {
      advance(w, DT);
      if (i % 20 === 19) after.push(w.sim.stats());
    }
    const firstSecond = after[0];
    expect(firstSecond.errorPct).toBeGreaterThanOrEqual(1);
    expect(firstSecond.bConc).toBeGreaterThan(B_CAP);
    expect(after.at(-1)!.errorPct).toBeLessThan(1);
  });

  it('try-this 3: on a bad day naive retries bunch at 0 s while backoff retries spread across the strip', () => {
    const bunched = (mode: Mode) => {
      const w = badDayRun(mode, 10);
      const delays = w.sim.retryDelays.map((d) => d.delay);
      return { n: delays.length, atZero: delays.filter((d) => d === 0).length };
    };
    const naive = bunched('naive');
    const backoff = bunched('backoff');
    expect(naive.n).toBeGreaterThan(0);
    expect(naive.atZero).toBe(naive.n);
    expect(backoff.atZero / backoff.n).toBeLessThan(0.2);
  });

  it('try-this 4: with the breaker on a bad day then Heal B, the switch goes CLOSED, OPEN, HALF-OPEN, back to OPEN while B is bad, and CLOSED after the heal', () => {
    const w = createWorld(DEFAULT_RATE, BROKEN_SEED);
    w.sim.setMode('breaker');
    const seq: string[] = [];
    let last = 0;
    const watch = () => {
      for (const t of w.sim.transitions.filter((x) => x.t > last)) {
        last = t.t;
        seq.push(t.to);
      }
    };
    w.sim.failRate = BAD_DAY.fail / 100;
    w.sim.latency = BAD_DAY.latency / 1000;
    for (let i = 0; i < 20 / DT; i++) {
      advance(w, DT);
      watch();
    }
    expect(seq.slice(0, 3)).toEqual(['open', 'half', 'open']);
    w.sim.failRate = HEALTHY.fail / 100;
    w.sim.latency = HEALTHY.latency / 1000;
    for (let i = 0; i < 20 / DT; i++) {
      advance(w, DT);
      watch();
    }
    expect(seq.at(-1)).toBe('closed');
    expect(seq.join(',')).toMatch(/^open,half(,open,half)*,closed/);
  });
});

describe('the lesson text', () => {
  it('has four try-this entries and keeps its quiz claim about 4x load in line with MAX_RETRIES', () => {
    expect(lesson.tryThis).toHaveLength(4);
    expect(lesson.quiz[0].q).toContain(`${MAX_RETRIES} each`);
  });
});
