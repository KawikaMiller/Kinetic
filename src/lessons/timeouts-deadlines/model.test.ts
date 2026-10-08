import { describe, expect, it } from 'vitest';
import { percentile } from '../../core/sim';
import {
  amplification, CALLERS, HOPS, hopOf, latencySamples, logHistogram, LOG_BINS, MAX_ATTEMPTS, MIN_BUDGET, NET, NORMAL_DB, OWN_WORK,
  remainingBudget, retryFits, runChain, runRetries, SLOW_ATTEMPT, SLOW_DB, timeoutAt, timeoutStats, TYPICAL_ATTEMPT,
  type CallerId, type ChainParams, type HopId, type Outcome,
} from './model';

const params = (over: Partial<ChainParams> = {}, t: Partial<Record<CallerId, number>> = {}): ChainParams => ({
  patience: 2, timeouts: { A: 5, B: 10, C: 30, ...t }, dbLatency: SLOW_DB, queueB: 0, propagate: false, ...over,
});
const near = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

describe('the chain without propagation, worked by hand', () => {
  // 5 / 10 / 30 s timeouts, a 4 s database, a user who leaves at 2 s.
  // A starts at 0.05, calls B at 0.10; B starts 0.15, calls C at 0.20; C starts 0.25, calls the
  // database at 0.30; the database starts 0.35 and answers at 4.35; C 4.40, B 4.45, A 4.50.
  const run = runChain(params());
  it('every hop finishes after the user has left, with its own downstream answer', () => {
    expect(HOPS.map((h) => hopOf(run, h).finish)).toEqual([4.5, 4.45, 4.4, 4.35]);
    expect(HOPS.every((h) => hopOf(run, h).outcome === 'ok')).toBe(true);
    expect(run.userSees).toBe('gave-up');
  });
  it('wasted work is the time worked after the user left: sum of (finish - 2)', () => {
    expect(HOPS.map((h) => hopOf(run, h).wasted)).toEqual([2.5, 2.45, 2.4, 2.35]);
    near(run.totalWasted, 9.7);
  });
  it('only A answered after its own caller had gone: B, C and the database were still wanted by their callers', () => {
    expect(HOPS.map((h) => hopOf(run, h).lateSuccess)).toEqual([true, false, false, false]);
  });
  it('the timeouts never fired, so nothing cancelled the work', () => {
    expect(run.hops.some((h) => h.outcome === 'timeout')).toBe(false);
  });
});

describe('misordered timeouts: the inner one is longer than the outer', () => {
  // A waits only 1.5 s for B; B waits 6 s for C. A gives up at 1.60, B succeeds at 4.45.
  const run = runChain(params({}, { A: 1.5, B: 6, C: 6 }));
  it('A times out first and the user gets an error before giving up', () => {
    expect(hopOf(run, 'A').outcome).toBe('timeout');
    near(hopOf(run, 'A').finish, 1.6);
    expect(run.userSees).toBe('error');
  });
  it('B still succeeds later: a success its caller never saw', () => {
    const b = hopOf(run, 'B');
    expect(b.outcome).toBe('ok');
    near(b.finish, 4.45);
    expect(b.lateSuccess).toBe(true);
  });
  it('the wasted time counts from when A stopped waiting (1.6), not from when the user left (2.0)', () => {
    near(hopOf(run, 'B').usefulUntil, 1.6);
    near(hopOf(run, 'B').wasted, 4.45 - 1.6);
    near(hopOf(run, 'DB').wasted, 4.35 - 1.6);
  });
});

describe('sensible, ordered timeouts: only the database tail is orphaned', () => {
  // C calls the database at 0.30 and waits 1 s, so it gives up at 1.30; the error reaches B at 1.35, A at 1.40 and the user at 1.45.
  const run = runChain(params({}, { A: 3, B: 2, C: 1 }));
  it('the failure climbs back to the user before they give up', () => {
    expect(['C', 'B', 'A'].map((h) => hopOf(run, h as HopId).outcome)).toEqual(['timeout', 'error', 'error']);
    expect(run.userSees).toBe('error');
    near(run.answerAt, 1.45);
  });
  it('the database keeps executing: it is the one hop whose work nobody wanted', () => {
    expect(HOPS.map((h) => hopOf(run, h).wasted > 0)).toEqual([false, false, false, true]);
    near(hopOf(run, 'DB').wasted, 4.35 - 1.3);
  });
});

describe('deadline propagation', () => {
  const run = runChain(params({ propagate: true }));
  it('the remaining budget at each hop is the deadline minus the time elapsed when it starts', () => {
    expect(HOPS.map((h) => hopOf(run, h).budget)).toEqual([1.95, 1.85, 1.75, 1.65]);
    expect(remainingBudget(2, 0.35)).toBe(1.65);
  });
  it('no hop works past the original deadline, and nothing is wasted', () => {
    for (const h of run.hops) expect(h.finish).toBeLessThanOrEqual(2);
    expect(run.totalWasted).toBe(0);
    expect(hopOf(run, 'DB').outcome).toBe('deadline');
  });
  it("a caller's own shorter timeout tightens the deadline it passes on, so its callee stops when the caller does", () => {
    const tight = runChain(params({ propagate: true }, { A: 0.5 }));
    near(hopOf(tight, 'A').finish, 0.6);
    expect(hopOf(tight, 'A').outcome).toBe('timeout');
    near(hopOf(tight, 'B').finish, 0.6);
    expect(hopOf(tight, 'B').outcome).toBe('deadline');
    expect(tight.totalWasted).toBe(0);
    // the same timeout without propagation leaves the downstream running
    expect(runChain(params({}, { A: 0.5 })).totalWasted).toBeGreaterThan(5);
  });
  it('a hop refuses to start when the budget is under MIN_BUDGET, and fails fast without calling downstream', () => {
    // B's queue wait of 1.7 s leaves C arriving at 1.95 with 0.05 s: it refuses and the database is never called.
    const queued = runChain(params({ propagate: true, queueB: 1.7 }));
    const c = hopOf(queued, 'C');
    expect(c.refused).toBe(true);
    expect(c.finish).toBe(c.start);
    expect(c.budget!).toBeLessThan(MIN_BUDGET);
    expect(hopOf(queued, 'DB').reached).toBe(false);
    expect(hopOf(queued, 'DB').outcome).toBe('idle');
  });
  it('without propagation the same queue wait goes on to do all the work', () => {
    const queued = runChain(params({ queueB: 1.7 }));
    expect(HOPS.every((h) => hopOf(queued, h).reached)).toBe(true);
    expect(queued.totalWasted).toBeGreaterThan(5);
  });
  it('a budget shorter than a hop can use is refused at the first hop', () => {
    const tiny = runChain(params({ propagate: true, patience: 0.12 }));
    expect(hopOf(tiny, 'A').refused).toBe(true);
    expect(tiny.hops.slice(1).every((h) => !h.reached)).toBe(true);
  });
});

// ── An independent reference: a millisecond clock and message passing, no recursion ──────────

const MS = (s: number) => Math.round(s * 1000);

/** Steps a clock one millisecond at a time. Hops are state machines that react to messages and timers. */
function referenceChain(p: ChainParams): { finish: number[]; outcome: (Outcome | 'idle')[] } {
  const net = MS(NET);
  const own = MS(OWN_WORK);
  const D = MS(p.patience);
  const minBudget = MS(MIN_BUDGET);
  const timeout = (i: number) => MS(p.timeouts[CALLERS[i]]);
  type State = {
    phase: 'idle' | 'queued' | 'working' | 'waiting' | 'done';
    arrive: number; start: number; workEnd: number; expiry: number; finish: number; outcome: Outcome | 'idle';
    /** The absolute deadline this hop was told (the caller's own wait limit). */
    deadline: number; budgetLimited: boolean;
  };
  const hops: State[] = HOPS.map(() => ({
    phase: 'idle', arrive: -1, start: -1, workEnd: -1, expiry: -1, finish: -1, outcome: 'idle', deadline: D, budgetLimited: false,
  }));
  // messages in flight: a call (no outcome) or an answer
  const inbox: { at: number; to: number; outcome?: Outcome }[] = [];
  inbox.push({ at: net, to: 0 });
  const finishHop = (i: number, t: number, outcome: Outcome) => {
    hops[i].phase = 'done';
    hops[i].finish = t;
    hops[i].outcome = outcome;
    if (i > 0) inbox.push({ at: t + net, to: i - 1, outcome });
  };
  for (let t = 0; t < 60_000; t++) {
    // 1. messages that arrive now
    for (const m of inbox.filter((x) => x.at === t)) {
      const h = hops[m.to];
      if (m.outcome === undefined) {
        h.phase = 'queued';
        h.arrive = t;
        h.start = t + (HOPS[m.to] === 'B' ? MS(p.queueB) : 0);
      } else if (h.phase === 'waiting') {
        finishHop(m.to, t, m.outcome === 'ok' ? 'ok' : m.outcome === 'deadline' ? 'deadline' : 'error');
      }
    }
    // 2. timers
    for (let i = 0; i < hops.length; i++) {
      const h = hops[i];
      if (h.phase === 'queued' && t === h.start) {
        if (p.propagate && h.deadline - t < minBudget) {
          finishHop(i, t, 'deadline');
          hops[i].start = t;
          continue;
        }
        h.phase = 'working';
        h.workEnd = i === 3 ? (p.propagate ? Math.min(t + MS(p.dbLatency), h.deadline) : t + MS(p.dbLatency)) : t + own;
        h.start = t;
      }
      if (h.phase === 'working' && t === h.workEnd) {
        if (i === 3) {
          finishHop(i, t, p.propagate && h.start + MS(p.dbLatency) > h.deadline ? 'deadline' : 'ok');
        } else {
          h.phase = 'waiting';
          const limit = p.propagate ? Math.min(timeout(i), h.deadline - t) : timeout(i);
          h.expiry = t + limit;
          // the callee is told this call's own limit as its deadline
          hops[i + 1].deadline = h.expiry;
          inbox.push({ at: t + net, to: i + 1 });
          h.budgetLimited = p.propagate && limit < timeout(i);
        }
      }
      if (h.phase === 'waiting' && t === h.expiry) {
        finishHop(i, t, h.budgetLimited ? 'deadline' : 'timeout');
      }
    }
    if (hops.every((h) => h.phase === 'done' || h.phase === 'idle') && hops[0].phase === 'done' && !inbox.some((m) => m.at > t)) break;
  }
  return { finish: hops.map((h) => h.finish / 1000), outcome: hops.map((h) => h.outcome) };
}

describe('against a millisecond-clock reference over a grid of settings', () => {
  const timeoutGrid = [0.5, 2, 5, 30];
  const cases: ChainParams[] = [];
  for (const A of timeoutGrid) for (const B of timeoutGrid) for (const C of timeoutGrid) {
    for (const dbLatency of [NORMAL_DB, SLOW_DB]) for (const queueB of [0, 0.5, 1.7]) for (const patience of [0.5, 1, 2, 3]) {
      for (const propagate of [false, true]) cases.push({ patience, timeouts: { A, B, C }, dbLatency, queueB, propagate });
    }
  }
  it('finish times and outcomes match for every combination', () => {
    expect(cases.length).toBeGreaterThan(3000);
    for (const p of cases) {
      const run = runChain(p);
      const ref = referenceChain(p);
      const label = JSON.stringify(p);
      run.hops.forEach((h, i) => {
        if (h.reached) {
          expect(h.finish, label + ' finish ' + h.id).toBeCloseTo(ref.finish[i], 6);
          expect(h.outcome, label + ' outcome ' + h.id).toBe(ref.outcome[i]);
        } else {
          expect(ref.outcome[i], label + ' idle ' + h.id).toBe('idle');
        }
      });
    }
  });

  it('with propagation no hop works past the deadline, for every setting', () => {
    for (const p of cases.filter((c) => c.propagate)) {
      const run = runChain(p);
      // A hop that refuses does no work at all (it only notices once it leaves its queue), so it is exempt.
      for (const h of run.hops.filter((x) => x.reached && !x.refused)) expect(h.finish, JSON.stringify(p)).toBeLessThanOrEqual(p.patience + 1e-9);
      for (const h of run.hops.filter((x) => x.refused)) expect(h.finish).toBe(h.start);
      expect(run.totalWasted, JSON.stringify(p)).toBe(0);
    }
  });

  it('wasted time equals a brute-force count of the milliseconds nobody was waiting for', () => {
    for (const p of cases.filter((c) => !c.propagate && c.patience === 2 && c.queueB === 0)) {
      const run = runChain(p);
      // A moment t of hop i's work is wanted while the user waits and every caller above is still waiting.
      const waitingUntil = (i: number) => Math.min(p.patience, ...run.hops.slice(0, i + 1).map((h) => h.expiry));
      let brute = 0;
      for (const [i, h] of run.hops.entries()) {
        for (let ms = MS(h.start); ms < MS(h.finish); ms++) if (ms / 1000 >= waitingUntil(i)) brute += 0.001;
      }
      expect(run.totalWasted, JSON.stringify(p)).toBeCloseTo(brute, 2);
    }
  });
});

describe('retries inside the budget', () => {
  const slow = [SLOW_ATTEMPT];
  it('a retry is attempted only when its expected cost fits the remaining budget', () => {
    expect(retryFits(0.31, TYPICAL_ATTEMPT)).toBe(true);
    expect(retryFits(TYPICAL_ATTEMPT, TYPICAL_ATTEMPT)).toBe(true);
    expect(retryFits(0.29, TYPICAL_ATTEMPT)).toBe(false);
  });
  it('naive retries blow the deadline: 3 attempts of 0.9 s end at 2.7 s', () => {
    const naive = runRetries('naive', { deadline: 2, attemptTimeout: 0.9, latencies: slow });
    expect(naive.attempts).toHaveLength(MAX_ATTEMPTS);
    near(naive.finish, 2.7);
    near(naive.afterDeadline, 0.7);
  });
  it('the budgeted retry stops at 1.8 s: the third attempt would have 0.2 s left, under its expected cost', () => {
    const budgeted = runRetries('budgeted', { deadline: 2, attemptTimeout: 0.9, latencies: slow });
    expect(budgeted.attempts).toHaveLength(2);
    expect(budgeted.refused).toEqual({ n: 3, remaining: 0.2 });
    near(budgeted.finish, 1.8);
    expect(budgeted.afterDeadline).toBe(0);
  });
  it('when every attempt fits the deadline anyway, both behave the same', () => {
    const a = runRetries('naive', { deadline: 2, attemptTimeout: 0.5, latencies: slow });
    const b = runRetries('budgeted', { deadline: 2, attemptTimeout: 0.5, latencies: slow });
    expect(b.attempts).toEqual(a.attempts);
    expect(b.refused).toBeNull();
  });
  it('a budgeted attempt is never allowed to run past the deadline', () => {
    for (let t = 0.1; t <= 3; t += 0.1) {
      for (const deadline of [0.5, 1, 2, 3]) {
        const r = runRetries('budgeted', { deadline, attemptTimeout: t, latencies: slow });
        for (const at of r.attempts) expect(at.end).toBeLessThanOrEqual(deadline + 1e-9);
      }
    }
  });
  it('a healthy attempt succeeds and stops the retries', () => {
    const r = runRetries('naive', { deadline: 2, attemptTimeout: 0.9, latencies: [SLOW_ATTEMPT, 0.2] });
    expect(r.attempts.map((a) => a.outcome)).toEqual(['timeout', 'ok']);
    near(r.finish, 1.1);
  });
  it('retries at every layer multiply: 3 attempts at each of 3 hops is 27 calls', () => {
    expect(amplification(3, 3)).toBe(27);
    expect(amplification(1, 3)).toBe(1);
  });
});

describe('picking a timeout', () => {
  const samples = latencySamples();
  it('is seeded: the same seed gives the same samples', () => {
    expect(latencySamples().slice(0, 5)).toEqual(samples.slice(0, 5));
    expect(latencySamples(12).slice(0, 5)).not.toEqual(samples.slice(0, 5));
  });
  it('marks p50 and p99 with core/sim percentile', () => {
    const stats = timeoutStats(samples, 1);
    const sorted = samples.map((s) => s.seconds).sort((a, b) => a - b);
    expect(stats.p50).toBe(percentile(sorted, 0.5));
    expect(stats.p99).toBe(percentile(sorted, 0.99));
    expect(stats.p50).toBeGreaterThan(0.12);
    expect(stats.p50).toBeLessThan(0.18);
    expect(stats.p99).toBeGreaterThan(0.4);
    expect(stats.p99).toBeLessThan(0.7);
  });
  it('a timeout below p99 cuts off healthy requests: about 1% at p99, nearly all at the median', () => {
    const { p50, p99 } = timeoutStats(samples, 1);
    expect(timeoutStats(samples, p99).healthyCut).toBeGreaterThan(0.005);
    expect(timeoutStats(samples, p99).healthyCut).toBeLessThan(0.02);
    expect(timeoutStats(samples, p50).healthyCut).toBeGreaterThan(0.4);
    expect(timeoutStats(samples, 8).healthyCut).toBe(0);
  });
  it('a timeout far above holds stuck requests longer', () => {
    expect(timeoutStats(samples, 0.5).stuckHold).toBe(0.5);
    expect(timeoutStats(samples, 8).stuckHold).toBeGreaterThan(timeoutStats(samples, 1).stuckHold * 3);
  });
  it('the log histogram keeps every sample, in log-spaced bins', () => {
    const h = logHistogram(samples);
    expect(h.outside).toBe(0);
    expect(h.counts.reduce((a, b) => a + b, 0)).toBe(samples.length);
    expect(h.counts).toHaveLength(LOG_BINS.bins);
    near(h.edges[0], LOG_BINS.min);
    near(h.edges.at(-1)!, LOG_BINS.max);
  });
  it('the slider position maps to seconds, log-spaced from 50 ms to 8 s', () => {
    expect(timeoutAt(0)).toBe(0.05);
    expect(timeoutAt(100)).toBe(8);
    expect(timeoutAt(50)).toBeCloseTo(Math.sqrt(0.05 * 8), 2);

  });
});
