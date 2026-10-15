import { describe, expect, it } from 'vitest';
import { checkInvariants, forSeeds } from '../../core/distSim';
import { exponentialPdf } from '../../core/distributions';
import {
  SLEW_RATE, asymmetryError, driftMsPerDay, firstEstimate, localTime, ntpEstimate, skewAt, skewSeries, wallClockDemo, worstDriftError, worstSkew, type ClockSpec,
} from './clocks';
import { MEAN_GAP_MS, decidableShare, decidableShareExact, gapDensity, isDecidable, sampleGaps } from './intervals';
import {
  GRACE_MS, HOLDER, LEASE_BROKEN_SEED, LEASE_END_MS, LEASE_SKEW_BOUND_MS, NEXT, atMostOneHolder, believedUntil, leaseCluster, leaseScenario, runLease,
} from './lease';
import { BROKEN_SEED, FIRST_WRITE_AT, GAP_MS, LWW_LATENCY, RAW_SKEW_MAX, lwwCluster, lwwScenario, runLww, writeTwoWins } from './lww';
import { ntpCluster, runExchange } from './ntp';
import { LOG_BROKEN_SEED, REPLIER, REQUESTER, SKEW_B_MAX, causeBeforeEffect, logCluster, logScenario, mergedByStamp, runLog } from './orderLog';

describe('the clock model matches hand arithmetic', () => {
  it('1 ppm is 86.4 ms a day and 50 ppm for 86,400 s is 4.32 s', () => {
    expect(driftMsPerDay(1)).toBeCloseTo(86.4, 9);
    expect(driftMsPerDay(50)).toBeCloseTo(4320, 9);
    expect(skewAt({ offsetMs: 0, driftPpm: 50 }, 86_400_000)).toBeCloseTo(4320, 6);
    expect(skewAt({ offsetMs: 250, driftPpm: -100 }, 10_000)).toBeCloseTo(250 - 1, 9);
    expect(localTime({ offsetMs: 100, driftPpm: 10 }, 1_000_000)).toBeCloseTo(100 + 1_000_000 + 10, 6);
  });
  it('the worst error between syncs is drift times the poll interval: 50 ppm and 1,024 s is 51.2 ms', () => {
    expect(worstDriftError(50, 1024)).toBeCloseTo(51.2, 9);
    expect(worstDriftError(-50, 1024)).toBeCloseTo(51.2, 9);
  });
});

describe('NTP formulas against hand-worked exchanges', () => {
  it('t0=100, t1=130, t2=131, t3=161 gives theta 0 and delta 60', () => {
    expect(ntpEstimate(100, 130, 131, 161)).toEqual({ theta: 0, delta: 60 });
  });
  it('a server 50 ahead (t1=180, t2=181) gives theta 50', () => {
    expect(ntpEstimate(100, 180, 181, 161).theta).toBe(50);
  });
  it('forward 10 and return 50 with perfect clocks (t1=110, t2=111, t3=161) gives theta -20, which is (10 - 50) / 2', () => {
    expect(ntpEstimate(100, 110, 111, 161).theta).toBe(-20);
    expect(asymmetryError(10, 50)).toBe(-20);
  });
  it('the same exchange run on distSim with real messages carries the same timestamps and estimate', () => {
    const { exchange } = runExchange({ clock: { offsetMs: 0, driftPpm: 0 }, forwardMs: 10, returnMs: 50 });
    expect([exchange.t0, exchange.t1, exchange.t2, exchange.t3]).toEqual([0, 10, 10, 60]);
    expect(exchange.theta).toBe(-20);
    expect(exchange.delta).toBe(60);
  });
  it('with a client 300 ms fast and a symmetric path, theta is minus the offset and the error is zero', () => {
    const { exchange } = runExchange({ clock: { offsetMs: 300, driftPpm: 0 }, forwardMs: 20, returnMs: 20 });
    expect(exchange.theta).toBe(-300);
    expect(exchange.delta).toBe(40);
  });
  it('the estimate is off by (forward - return) / 2 even with perfect clocks, for many path pairs', () => {
    for (const [f, r] of [[0, 0], [10, 50], [50, 10], [200, 0], [0, 200], [33, 77]]) {
      const { exchange } = runExchange({ clock: { offsetMs: 0, driftPpm: 0 }, forwardMs: f, returnMs: r });
      expect(exchange.theta).toBeCloseTo((f - r) / 2, 9);
    }
  });
  it('drift during the exchange moves the estimate by far less than a microsecond', () => {
    const clock: ClockSpec = { offsetMs: 0, driftPpm: 200 };
    const { exchange } = runExchange({ clock, forwardMs: 100, returnMs: 100 });
    expect(Math.abs(exchange.theta)).toBeLessThan(0.02);
  });
});

describe('the sawtooth: error grows at the drift rate and snaps back at each sync', () => {
  const base = { pollSeconds: 64, forwardMs: 20, returnMs: 20, horizonMs: 64_000 * 10 + 1000 };
  const clocks: ClockSpec[] = [{ offsetMs: 0, driftPpm: 50 }, { offsetMs: 800, driftPpm: -120 }, { offsetMs: -500, driftPpm: 200 }];

  it('step mode matches a distSim client polling a perfect server, at every sync', () => {
    for (const clock of clocks) {
      for (const [forwardMs, returnMs] of [[20, 20], [10, 50]]) {
        const series = skewSeries(clock, { ...base, forwardMs, returnMs, mode: 'step' });
        const cluster = ntpCluster({ clock, forwardMs, returnMs, pollMs: 64_000, step: true });
        cluster.run({ until: base.horizonMs });
        const { exchanges } = cluster.snapshot().nodes.client.state!;
        expect(exchanges.length).toBeGreaterThanOrEqual(9);
        let adjust = 0;
        for (const e of exchanges) {
          adjust += e.theta;
          const trueSkew = localTime(clock, e.arrivedAt) + adjust - e.arrivedAt;
          const point = series.filter((p) => Math.abs(p.t - e.arrivedAt) < 1e-6).at(-1);
          expect(point, `${JSON.stringify(clock)} at ${e.arrivedAt}`).toBeDefined();
          expect(point!.skew).toBeCloseTo(trueSkew, 6);
        }
      }
    }
  });

  it('after the first sync the worst error is about drift x poll: 50 ppm and 1,024 s reads 51.2 ms', () => {
    const series = skewSeries({ offsetMs: 0, driftPpm: 50 }, { pollSeconds: 1024, forwardMs: 10, returnMs: 10, horizonMs: 1024_000 * 12, mode: 'step' });
    const afterFirst = series.filter((p) => p.t > 1024_000 * 1.5);
    expect(worstSkew(afterFirst)).toBeCloseTo(worstDriftError(50, 1024), 1);
  });

  it('with an asymmetric path the clock settles on (forward - return) / 2 away from true time, not on zero', () => {
    const series = skewSeries({ offsetMs: 0, driftPpm: 0 }, { pollSeconds: 16, forwardMs: 10, returnMs: 50, horizonMs: 16_000 * 6, mode: 'step' });
    expect(series.at(-1)!.skew).toBeCloseTo(-20, 6);
  });

  it('without sync the skew is the straight line offset + drift x t', () => {
    const clock: ClockSpec = { offsetMs: 100, driftPpm: 80 };
    const s = skewSeries(clock, { pollSeconds: 8, forwardMs: 0, returnMs: 0, horizonMs: 3_600_000, mode: 'off' });
    expect(s).toEqual([{ t: 0, skew: 100 }, { t: 3_600_000, skew: skewAt(clock, 3_600_000) }]);
  });

  it('a step moves a fast clock backwards (the wall clock reads earlier after it); a slew never does', () => {
    const clock: ClockSpec = { offsetMs: 500, driftPpm: 0 };
    const opts = { pollSeconds: 8, forwardMs: 10, returnMs: 10, horizonMs: 8000 * 4 };
    const step = skewSeries(clock, { ...opts, mode: 'step' });
    const backward = step.some((p, i) => i > 0 && p.skew - step[i - 1].skew < 0 && p.t === step[i - 1].t);
    expect(backward).toBe(true);
    const slew = skewSeries(clock, { ...opts, mode: 'slew' });
    for (let i = 1; i < slew.length; i++) {
      const wallMove = slew[i].t - slew[i - 1].t + (slew[i].skew - slew[i - 1].skew);
      expect(wallMove, `segment ${i}`).toBeGreaterThanOrEqual(0);
    }
    expect(slew.at(-1)!.skew).toBeLessThan(500);
  });

  it('slewing reaches the same place as stepping once it has absorbed the correction', () => {
    const clock: ClockSpec = { offsetMs: 300, driftPpm: 0 };
    const opts = { pollSeconds: 4096, forwardMs: 10, returnMs: 10, horizonMs: 4096_000 * 2 };
    const step = skewSeries(clock, { ...opts, mode: 'step' }).at(-1)!.skew;
    const slew = skewSeries(clock, { ...opts, mode: 'slew' }).at(-1)!.skew;
    expect(slew).toBeCloseTo(step, 6);
    expect(300 / SLEW_RATE).toBeLessThan(4096_000);
  });

  it('the wall-clock demo: a step by -theta moves a fast clock back, a slew moves it forward, the monotonic clock advances either way', () => {
    const clock: ClockSpec = { offsetMs: 500, driftPpm: 0 };
    const { tau, theta } = firstEstimate(clock, { pollSeconds: 8, forwardMs: 10, returnMs: 10 });
    expect(theta).toBeCloseTo(-500, 6);
    const step = wallClockDemo(clock, 'step', tau, 1, theta);
    expect(step.moved).toBeCloseTo(1 - 500, 6);
    expect(step.moved).toBeLessThan(0);
    const slew = wallClockDemo(clock, 'slew', tau, 1, theta);
    expect(slew.moved).toBeGreaterThan(0);
    expect(step.monotonicAdvance).toBe(1);
    expect(slew.monotonicAdvance).toBe(1);
  });
});

describe('intervals: an order is decidable when the gap exceeds 2 epsilon', () => {
  const gaps = sampleGaps();
  it('matches the closed form P(gap > 2e) = exp(-2e / mean) within 3 standard errors, for epsilon 0 to 20 ms', () => {
    for (const eps of [0, 1, 2.5, 5, 10, 15, 20]) {
      const p = decidableShareExact(eps);
      const se = Math.sqrt((p * (1 - p)) / gaps.length);
      expect(Math.abs(decidableShare(gaps, eps) - p), `eps ${eps}`).toBeLessThanOrEqual(3 * se + 1e-12);
      expect(p).toBeCloseTo(Math.exp((-2 * eps) / MEAN_GAP_MS), 12);
    }
    expect(decidableShare(gaps, 0)).toBe(1);
  });
  it('the boundary: a gap of exactly 2 epsilon is not decidable, anything larger is', () => {
    expect(isDecidable(10, 5)).toBe(false);
    expect(isDecidable(10.001, 5)).toBe(true);
    expect(gapDensity(3)).toBe(exponentialPdf(3, 1 / MEAN_GAP_MS));
  });
  it('the share falls as epsilon grows', () => {
    let last = 2;
    for (let eps = 0; eps <= 20; eps += 2) {
      const s = decidableShare(gaps, eps);
      expect(s).toBeLessThanOrEqual(last);
      last = s;
    }
  });
});

describe('last-write-wins with skewed clocks', () => {
  const hand = { seed: 0, fixedLatencyMs: 5 } as const;

  it('hand-built: A is 5 s fast, so write 1 is stamped 105.005 s and beats write 2 (stamped 100.016 s) although write 2 began after write 1 was acknowledged', () => {
    const run = runLww({ ...hand, mode: 'raw', offsets: [5000, 0] });
    expect(run.stamps).toEqual({ 1: 105_005, 2: 100_016 });
    expect(run.secondStartAt).toBe(FIRST_WRITE_AT + 5 + 5 + GAP_MS);
    expect(run.ackAt!).toBeLessThan(run.secondStartAt!);
    expect(run.finals.A.value).toBe(1);
    expect(run.finals.B.value).toBe(1);
    const verdict = checkInvariants(lwwCluster({ ...hand, mode: 'raw', offsets: [5000, 0] }), [writeTwoWins]);
    expect(verdict.ok).toBe(false);
  });
  it('hand-built, perfect clocks: write 2 wins at both replicas', () => {
    const run = runLww({ ...hand, mode: 'raw', offsets: [0, 0] });
    expect(run.finals.A.value).toBe(2);
    expect(run.finals.B.value).toBe(2);
    expect(checkInvariants(lwwCluster({ ...hand, mode: 'raw', offsets: [0, 0] }), [writeTwoWins]).ok).toBe(true);
  });
  it('hand-built: with commit wait and epsilon 10 the same schedule holds when A is 8 ms fast, and fails again when A is 60 ms fast', () => {
    const within = runLww({ ...hand, mode: 'commit-wait', epsilonMs: 10, offsets: [8, 0] });
    expect([within.finals.A.value, within.finals.B.value]).toEqual([2, 2]);
    const beyond = runLww({ ...hand, mode: 'commit-wait', epsilonMs: 10, offsets: [60, 0] });
    expect([beyond.finals.A.value, beyond.finals.B.value]).toEqual([1, 1]);
  });
  it('commit wait costs 2 epsilon: the acknowledgement leaves 2 epsilon after the write reached its replica', () => {
    for (const eps of [0, 1, 7, 20]) expect(runLww({ ...hand, mode: 'commit-wait', epsilonMs: eps, offsets: [0, 0] }).commitWaitMs).toBe(2 * eps);
    expect(runLww({ ...hand, mode: 'raw', offsets: [0, 0] }).commitWaitMs).toBe(0);
  });

  it('BROKEN_SEED is the lowest of 500 seeds on which raw stamping loses write 2', () => {
    const verdict = forSeeds(500, lwwScenario('raw', { within: RAW_SKEW_MAX }), [writeTwoWins]);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.seed).toBe(BROKEN_SEED);
  });
  it('on BROKEN_SEED the cause is the skew: write 1 got the larger stamp although it was earlier in true time, and zero skew on the same seed passes', () => {
    const c = lwwScenario('raw', { within: RAW_SKEW_MAX })(BROKEN_SEED);
    c.run();
    const stamps: Record<number, number> = {};
    for (const r of c.trace) if (r.kind === 'send' && r.payload?.type === 'replicate') stamps[r.payload.id] = r.payload.stamp;
    const ack = c.trace.find((r) => r.kind === 'deliver' && r.payload?.type === 'ack')!;
    const second = c.trace.find((r) => r.kind === 'send' && r.payload?.type === 'write' && r.payload.id === 2)!;
    expect(second.t).toBeGreaterThan(ack.t);
    expect(stamps[1]).toBeGreaterThan(stamps[2]);
    expect(checkInvariants(lwwCluster({ seed: BROKEN_SEED, mode: 'raw', offsets: [0, 0] }), [writeTwoWins]).ok).toBe(true);
  });
  it('500 seeds with loss, duplication, a partition, a crash and a pause: commit wait holds at every step while every clock is within epsilon', () => {
    expect(forSeeds(500, lwwScenario('commit-wait', { epsilonMs: 10, within: 10, faults: true }), [writeTwoWins])).toEqual({ ok: true, seeds: 500 });
  });
  it('the guarantee is only as good as the bound: when clocks can be wrong by far more than epsilon the violation returns', () => {
    const verdict = forSeeds(500, lwwScenario('commit-wait', { epsilonMs: 10, within: 6000 }), [writeTwoWins]);
    expect(verdict.ok).toBe(false);
  });
  it('liveness, apart from safety: with no loss and bounded delay every run acknowledges write 1, starts write 2, and both replicas see both', () => {
    for (let seed = 0; seed < 200; seed++) {
      const run = runLww({ seed, mode: 'commit-wait', epsilonMs: 5, offsets: [0, 0] });
      expect(run.ackAt, `seed ${seed}`).not.toBeNull();
      expect(run.secondStartAt).not.toBeNull();
      expect(run.finals.A.seen).toEqual([1, 2]);
      expect(run.finals.B.seen).toEqual([1, 2]);
    }
    expect(LWW_LATENCY.max).toBeLessThan(100);
  });
  it('same seed, same trace', () => {
    const a = runLww({ seed: 4, mode: 'raw', offsets: [1234, -99], faults: true }).trace;
    expect(runLww({ seed: 4, mode: 'raw', offsets: [1234, -99], faults: true }).trace).toEqual(a);
  });
});

describe('a lease two holders believe in', () => {
  const slow = { offsetMs: -3000, driftPpm: 0 };
  it('hand-built: a holder 3 s slow believes until true time 13 s, N is granted at 10.5 s, and they overlap', () => {
    expect(believedUntil(slow, 0)).toBe(13_000);
    const run = runLease({ seed: 0, holderClock: slow, marginMs: 0, fixedLatencyMs: 5 });
    const h = run.beliefs.find((b) => b.node === HOLDER)!;
    const n = run.beliefs.find((b) => b.node === NEXT)!;
    expect(h.from).toBe(5);
    expect(h.to).toBe(13_000);
    expect(n.from).toBe(LEASE_END_MS + GRACE_MS + 5);
    expect(run.overlap).toEqual({ from: 10_505, to: 13_000 });
    expect(checkInvariants(leaseCluster({ seed: 0, holderClock: slow, marginMs: 0, fixedLatencyMs: 5 }), [atMostOneHolder]).ok).toBe(false);
  });
  it('a margin of 3 s (as large as the skew) removes the overlap', () => {
    const run = runLease({ seed: 0, holderClock: slow, marginMs: 3000, fixedLatencyMs: 5 });
    expect(run.overlap).toBeNull();
    expect(run.beliefs.find((b) => b.node === HOLDER)!.to).toBe(10_000);
    expect(checkInvariants(leaseCluster({ seed: 0, holderClock: slow, marginMs: 3000, fixedLatencyMs: 5 }), [atMostOneHolder]).ok).toBe(true);
  });
  it('drift breaks durations too: a holder whose clock runs 200 ppm slow believes 2 ms longer over a 10 s lease', () => {
    const c = { offsetMs: 0, driftPpm: -200 };
    expect(believedUntil(c, 0)).toBeCloseTo(LEASE_END_MS / (1 - 200e-6), 6);
    const run = runLease({ seed: 0, holderClock: c, marginMs: 0, fixedLatencyMs: 5 });
    expect(run.beliefs.find((b) => b.node === HOLDER)!.to!).toBeCloseTo(believedUntil(c, 0), 3);
  });
  it('LEASE_BROKEN_SEED is the lowest of 500 seeds on which a holder with no margin overlaps N', () => {
    const verdict = forSeeds(500, leaseScenario({ marginMs: 0, within: LEASE_SKEW_BOUND_MS }), [atMostOneHolder]);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.seed).toBe(LEASE_BROKEN_SEED);
  });
  it('on that seed the cause is the slow clock, not the network: with a perfect clock it passes', () => {
    const c = leaseScenario({ marginMs: 0, within: LEASE_SKEW_BOUND_MS })(LEASE_BROKEN_SEED);
    expect(checkInvariants(c, [atMostOneHolder]).ok).toBe(false);
    expect(checkInvariants(leaseCluster({ seed: LEASE_BROKEN_SEED, holderClock: { offsetMs: 0, driftPpm: 0 }, marginMs: 0 }), [atMostOneHolder]).ok).toBe(true);
  });
  it('500 seeds with loss, duplication, a partition and a crash: a margin as large as the skew bound holds at every step', () => {
    expect(forSeeds(500, leaseScenario({ marginMs: LEASE_SKEW_BOUND_MS, within: LEASE_SKEW_BOUND_MS, faults: true }), [atMostOneHolder])).toEqual({ ok: true, seeds: 500 });
  });
  it('a margin smaller than the real skew is not enough', () => {
    expect(forSeeds(500, leaseScenario({ marginMs: 500, within: LEASE_SKEW_BOUND_MS }), [atMostOneHolder]).ok).toBe(false);
  });
});

describe('the effect before the cause in a merged log', () => {
  it('hand-built: b 100 ms behind and 5 ms of delay puts "request handled" before "request sent" in the merge', () => {
    const { merged } = runLog({ seed: 0, clockB: { offsetMs: -100, driftPpm: 0 }, fixedLatencyMs: 5 });
    expect(merged.map((l) => l.text)).toEqual(['request handled', 'request sent', 'reply received']);
    expect(checkInvariants(logCluster({ seed: 0, clockB: { offsetMs: -100, driftPpm: 0 }, fixedLatencyMs: 5 }), [causeBeforeEffect]).ok).toBe(false);
  });
  it('with a perfect clock the merge keeps cause before effect', () => {
    const { merged } = runLog({ seed: 0, clockB: { offsetMs: 0, driftPpm: 0 }, fixedLatencyMs: 5 });
    expect(merged.map((l) => l.text)).toEqual(['request sent', 'request handled', 'reply received']);
  });
  it('matches a closed-form oracle on 500 seeds: it breaks exactly when offset + request delay <= 0 or offset >= reply delay', () => {
    for (let seed = 0; seed < 500; seed++) {
      const c = logScenario(seed);
      const verdict = checkInvariants(c, [causeBeforeEffect]);
      const send = c.trace.find((r) => r.kind === 'send' && r.from === REQUESTER)!;
      const handled = c.trace.find((r) => r.kind === 'deliver' && r.to === REPLIER)!;
      const reply = c.trace.find((r) => r.kind === 'deliver' && r.to === REQUESTER);
      const offset = c.localTime(REPLIER, 0);
      const l1 = handled.t - send.t;
      const l2 = reply ? reply.t - handled.t : Infinity;
      expect(!verdict.ok, `seed ${seed}`).toBe(l1 + offset <= 0 || offset >= l2);
      expect(Math.abs(offset)).toBeLessThanOrEqual(SKEW_B_MAX);
    }
  });
  it('LOG_BROKEN_SEED is the lowest failing seed, and the same seed with a perfect clock passes', () => {
    const verdict = forSeeds(500, logScenario, [causeBeforeEffect]);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.seed).toBe(LOG_BROKEN_SEED);
    expect(checkInvariants(logCluster({ seed: LOG_BROKEN_SEED, clockB: { offsetMs: 0, driftPpm: 0 } }), [causeBeforeEffect]).ok).toBe(true);
  });
  it('mergedByStamp sorts by the writers\' own stamps, ties to the requester', () => {
    const lines = [
      { node: REPLIER, text: 'b', stamp: 5, trueAt: 9 },
      { node: REQUESTER, text: 'a', stamp: 5, trueAt: 1 },
    ];
    expect(mergedByStamp(lines).map((l) => l.text)).toEqual(['a', 'b']);
  });
});
