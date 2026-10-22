import { describe, expect, it } from 'vitest';
import { checkInvariants } from '../../core/distSim';
import { mulberry32 } from '../../core/random';
import {
  ACCURACY_ROUNDS, BROKEN_MEMBER, BROKEN_MEMBER_SEED, BROKEN_SPREAD, BROKEN_SPREAD_SEED, CRASH_ROUND, FANOUT, HORIZON_ROUNDS, LOSS, MEMBER, MODES, ROUND_MS,
  SWEEP_SEEDS, accuracyFailures, accuracyRule, buildMembership, buildSpread, defaultMember, defaultSpread, expectedCurve, expectedUninformedNext,
  failingSeeds, finalUninformedFraction, leftOut, memberSafety, meanRounds, pushReference, readMembership, roundsBelow, runMembership, runSpread, spreadSafety,
  type MemberSetup, type Mode, type SpreadSetup,
} from './model';

const spread = (over: Partial<SpreadSetup> = {}): SpreadSetup => ({ ...defaultSpread(), ...over });
const member = (over: Partial<MemberSetup> = {}): MemberSetup => ({ ...defaultMember(), ...over });
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const se = (xs: number[]) => Math.sqrt(xs.reduce((s, x) => s + (x - mean(xs)) ** 2, 0) / (xs.length - 1) / xs.length);

describe('one-step expectations, hand-worked (n = 16) and checked with a separate Python script', () => {
  it('i = 1, push: 15 * (14/15) = 14, and pull gives 14 too', () => {
    expect(expectedUninformedNext(16, 1, 'push', 1)).toBeCloseTo(14, 12);
    expect(expectedUninformedNext(16, 1, 'pull', 1)).toBeCloseTo(14, 12);
  });
  it('i = 2, push: 14 * (14/15)^2 = 12.1956', () => {
    expect(expectedUninformedNext(16, 1, 'push', 2)).toBeCloseTo(12.1956, 4);
  });
  it('i = 8 (u = 8): push 8 * (14/15)^8 = 4.6066, pull 8 * 7/15 = 3.7333, push-pull their product over u = 2.1498', () => {
    expect(expectedUninformedNext(16, 1, 'push', 8)).toBeCloseTo(4.6066, 4);
    expect(expectedUninformedNext(16, 1, 'pull', 8)).toBeCloseTo(3.7333, 4);
    // 8 * 0.575913 * 0.466667 = 2.1498 (the spec's 2.1501 rounded the first factor).
    expect(expectedUninformedNext(16, 1, 'push-pull', 8)).toBeCloseTo(2.1498, 4);
  });

  it('a pure combinatorial simulation of one step (100,000 trials from i = 8) agrees within 3 standard errors, in all three modes and with loss', () => {
    const rnd = mulberry32(99);
    const peer = (self: number, n: number) => {
      const k = Math.floor(rnd() * (n - 1));
      return k >= self ? k + 1 : k;
    };
    const trial = (n: number, f: number, mode: Mode, informed: number, loss: number): number => {
      const hit = new Set<number>();
      const lost = () => rnd() < loss;
      for (let i = 0; i < informed; i++) {
        if (mode !== 'pull') for (let k = 0; k < f; k++) { const p = peer(i, n); if (!lost()) hit.add(p); }
      }
      for (let u = informed; u < n; u++) {
        if (mode === 'push') continue;
        for (let k = 0; k < f; k++) { const p = peer(u, n); const reqLost = lost(); const repLost = lost(); if (p < informed && !reqLost && !repLost) hit.add(u); }
      }
      let uninformed = 0;
      for (let u = informed; u < n; u++) if (!hit.has(u)) uninformed++;
      return uninformed;
    };
    for (const [f, loss] of [[1, 0], [2, 0], [1, 0.3]] as const) {
      for (const mode of MODES) {
        const xs = Array.from({ length: 100_000 }, () => trial(16, f, mode, 8, loss));
        expect(Math.abs(mean(xs) - expectedUninformedNext(16, f, mode, 8, loss)), `${mode} f${f} loss${loss}`).toBeLessThan(3 * se(xs));
      }
    }
  });

  it('the real distSim spread matches the exact one-step value after round 1 (from i = 1), in all three modes, over 4,000 seeds', () => {
    for (const mode of MODES) {
      const xs = Array.from({ length: 4_000 }, (_, k) => {
        const run = runSpread(spread({ mode, seed: k + 1 }), 1);
        return 16 - run.counts[1];
      });
      expect(Math.abs(mean(xs) - expectedUninformedNext(16, 1, mode, 1)), mode).toBeLessThanOrEqual(3 * se(xs) + 1e-9);
    }
    const lossy = Array.from({ length: 4_000 }, (_, k) => 16 - runSpread(spread({ f: 2, loss: 0.3, seed: k + 1 }), 1).counts[1]);
    expect(Math.abs(mean(lossy) - expectedUninformedNext(16, 2, 'push', 1, 0.3))).toBeLessThanOrEqual(3 * se(lossy) + 1e-9);
  });
});

describe('expected rounds and the final-size equation', () => {
  it('rounds until the expected uninformed count is below 0.5 (an independent Python recursion): n = 16: 7, 6, 4; n = 64: 11, 9, 6; n = 256: 15, 11, 8', () => {
    const rows: [number, number[]][] = [[16, [7, 6, 4]], [64, [11, 9, 6]], [256, [15, 11, 8]]];
    for (const [n, expected] of rows) expect(MODES.map((mode) => roundsBelow({ ...defaultSpread(), n, mode }))).toEqual(expected);
  });

  it('the final-size roots are 0.20319, 0.05952 and 0.01983, and satisfy s = exp(-f (1 - s))', () => {
    expect(finalUninformedFraction(2)).toBeCloseTo(0.20319, 5);
    expect(finalUninformedFraction(3)).toBeCloseTo(0.05952, 5);
    expect(finalUninformedFraction(4)).toBeCloseTo(0.01983, 5);
    for (const f of [2, 3, 4]) {
      const s = finalUninformedFraction(f);
      expect(s).toBeCloseTo(Math.exp(-f * (1 - s)), 12);
    }
  });

  it('infect-and-die at n = 2,000, f = 3 leaves a fraction near 0.0595 over 50 seeds; at n = 16 the mean uninformed count sits below n * s', () => {
    const fractions = Array.from({ length: 50 }, (_, k) => {
      const run = runSpread(spread({ n: 2_000, f: 3, die: true, seed: k + 1 }), 40);
      return leftOut(run).length / 2_000;
    });
    expect(Math.abs(mean(fractions) - finalUninformedFraction(3))).toBeLessThan(3 * se(fractions));
    const small = Array.from({ length: SWEEP_SEEDS }, (_, k) => leftOut(runSpread(spread({ f: 3, die: true, seed: k + 1 }), 40)).length);
    expect(mean(small)).toBeLessThan(16 * finalUninformedFraction(3));
    expect(mean(small)).toBeGreaterThan(0.5);
  });

  it('measured mean rounds (push, f = 1) sit in [log2 n + ln n - 0.5, + 2.0] for n = 16, 64 and 256', () => {
    for (const n of [16, 64, 256]) {
      const m = meanRounds(spread({ n }));
      expect(m, `n ${n}`).toBeGreaterThanOrEqual(pushReference(n) - 0.5);
      expect(m).toBeLessThanOrEqual(pushReference(n) + 2.0);
    }
  });

  it('the mean-field curve decreases and pull ends faster than push', () => {
    const push = expectedCurve({ ...defaultSpread(), n: 64 }, 30);
    const pull = expectedCurve({ ...defaultSpread(), n: 64, mode: 'pull' }, 30);
    for (let r = 1; r < push.length; r++) expect(push[r]).toBeLessThanOrEqual(push[r - 1]);
    expect(pull[12]).toBeLessThan(push[12]);
  });
});

describe('rule 0: by round 30 every node holds the rumour (bounded liveness)', () => {
  it('broken mode (infect-and-die, n = 16, f = 3): the lowest failing seed is pinned, the share of seeds is inside 35% to 65%, never everywhere', () => {
    const bad = failingSeeds(BROKEN_SPREAD);
    expect(bad[0]).toBe(BROKEN_SPREAD_SEED);
    expect(bad.length).toBeGreaterThan(0.35 * SWEEP_SEEDS);
    expect(bad.length).toBeLessThan(0.65 * SWEEP_SEEDS);
    expect(leftOut(runSpread({ ...BROKEN_SPREAD, seed: BROKEN_SPREAD_SEED })).length).toBeGreaterThan(0);
  });

  it('fanout 2 is not the default: it fails on more than 85% of seeds', () => {
    expect(failingSeeds({ ...BROKEN_SPREAD, f: 2 }).length).toBeGreaterThan(0.85 * SWEEP_SEEDS);
  });

  it('fixed mode (every informed node keeps gossiping) passes the same 200 seeds', () => {
    expect(failingSeeds({ ...BROKEN_SPREAD, die: false })).toEqual([]);
  });

  it('seed-free schedule: n = 8, f = 1, infect-and-die, and the first push dropped, leaves seven nodes out', () => {
    const s = buildSpread({ ...defaultSpread(), n: 8, die: true });
    s.cluster.dropNext((m) => m.payload.type === 'push');
    s.cluster.run({ until: HORIZON_ROUNDS * ROUND_MS });
    expect(s.versions.filter((v) => v > 0).length).toBe(1);
  });
});

describe('safety (always on) over 200 seeds with loss, duplication, a crash and a partition', () => {
  it('a node only holds a version somebody wrote and never a lower one, in every mode, broken and fixed', () => {
    for (const mode of MODES) {
      for (const die of [true, false]) {
        for (let seed = 1; seed <= SWEEP_SEEDS; seed++) {
          const s = buildSpread(spread({ mode, die, seed, f: 2 }), { duplicate: 0.15 });
          s.cluster.randomFaults({ horizonMs: 1_500, partitions: 1, crashes: 1 });
          const verdict = checkInvariants(s.cluster, [spreadSafety()], { until: 2_500 });
          expect(verdict.ok, `${mode} die ${die} seed ${seed}`).toBe(true);
        }
      }
    }
  });

  it('the checker can fail: a version nobody wrote, and a version that goes down, are both reported', () => {
    const snap = (a: number, b: number) => ({ time: 0, step: 0, inFlight: 0, nodes: { n0: { up: true, paused: false, state: { version: a } }, n1: { up: true, paused: false, state: { version: b } } } });
    expect(spreadSafety()(snap(2, 0))).toContain('nobody wrote');
    const rule = spreadSafety();
    expect(rule(snap(1, 1))).toBeNull();
    expect(rule(snap(0, 1))).toContain('went from version 1 down to 0');
  });
});

describe('membership by heartbeat counters (scene 3)', () => {
  it('rule 1, accuracy: the broken mode (f = 1, T_fail = 12) has a pinned lowest failing seed and fails on 30% to 70% of 200 seeds; T_fail = 20 passes them all', () => {
    const bad = accuracyFailures(BROKEN_MEMBER);
    expect(bad[0]).toBe(BROKEN_MEMBER_SEED);
    expect(bad.length).toBeGreaterThan(0.3 * SWEEP_SEEDS);
    expect(bad.length).toBeLessThan(0.7 * SWEEP_SEEDS);
    expect(accuracyFailures({ ...BROKEN_MEMBER, tFail: 20 })).toEqual([]);
  });

  it('the default setting (n = 16, f = 2, T_fail = 12) passes all 200 seeds, and a shorter T_fail at f = 2 does not', () => {
    expect(accuracyFailures({ n: MEMBER.n.default, f: MEMBER.f.default, tFail: MEMBER.tFail.default })).toEqual([]);
    expect(accuracyFailures({ n: 16, f: 2, tFail: 6 }).length).toBeGreaterThan(0);
  });

  it('the accuracy message names the observer and the live node', () => {
    const m = buildMembership(member({ ...BROKEN_MEMBER, seed: BROKEN_MEMBER_SEED }));
    const verdict = checkInvariants(m.cluster, [accuracyRule], { until: ACCURACY_ROUNDS * ROUND_MS });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.message).toMatch(/^n\d+ suspects n\d+, which is up, in its round \d+$/);
  });

  it('safety (always on) holds over 200 seeds with loss, duplication, a crash and a cut, and the checker can fail', () => {
    for (let seed = 1; seed <= SWEEP_SEEDS; seed++) {
      const m = buildMembership(member({ n: 8, seed, crash: true, cut: true }), { loss: 0.1, duplicate: 0.15 });
      const verdict = checkInvariants(m.cluster, [memberSafety()], { until: 60 * ROUND_MS });
      expect(verdict.ok, `seed ${seed}`).toBe(true);
    }
    const node = (counters: number[]) => ({ up: true, paused: false, state: { round: 1, suspects: [], counters } });
    const bad = { time: 0, step: 0, inFlight: 0, nodes: { n0: node([5, 0]), n1: node([4, 1]) } };
    expect(memberSafety()(bad)).toBeNull();
    const above = { ...bad, nodes: { n0: node([5, 3]), n1: node([4, 1]) } };
    expect(memberSafety()(above)).toContain('above its own');
    const rule = memberSafety();
    rule(bad);
    expect(rule({ ...bad, nodes: { n0: node([5, 0]), n1: node([3, 1]) } })).toContain('lowered');
  });

  it('a crash at round 40 is suspected by every up node after the detection time, and a longer T_fail waits longer', () => {
    const quick = readMembership(runMembership(member({ crash: true, tFail: 8 })));
    const slow = readMembership(runMembership(member({ crash: true, tFail: 20 })));
    expect(quick.detection).not.toBeNull();
    expect(slow.detection).not.toBeNull();
    expect(slow.detection! - quick.detection!).toBeGreaterThanOrEqual(8);
    expect(quick.firstSuspicion!).toBeLessThanOrEqual(quick.detection!);
    expect(CRASH_ROUND).toBe(40);
  });

  it('a cut makes nodes suspect across it and a heal ends the suspicions', () => {
    const r = readMembership(runMembership(member({ cut: true })));
    expect(r.falsePairs).toBeGreaterThan(0);
    expect(r.convergence).not.toBeNull();
    expect(readMembership(runMembership(member())).falsePairs).toBe(0);
  });
});

describe('controls at their extremes and one beyond', () => {
  it('n = 8 and 256, f = 1 and 4, loss 0 and 30%, then f = 5 and loss 35%: every run is finite and ordered', () => {
    for (const [n, f, loss] of [[8, 1, 0], [256, 4, 0.3], [256, 1, 0], [8, FANOUT.max + 1, 0.35]] as const) {
      const run = runSpread(spread({ n, f, loss }), 40);
      expect(run.counts[0]).toBe(1);
      for (let r = 1; r < run.counts.length; r++) expect(run.counts[r]).toBeGreaterThanOrEqual(run.counts[r - 1]);
      expect(Number.isFinite(expectedCurve({ n, f, mode: 'push', die: false, loss }, 10)[10])).toBe(true);
    }
    expect(LOSS.max).toBe(0.3);
  });

  it('infect-and-die is ignored in pull mode (the hidden-control cross product): the same seed gives the same run with and without it', () => {
    for (const mode of ['pull'] as const) {
      expect(runSpread(spread({ mode, die: true })).counts).toEqual(runSpread(spread({ mode, die: false })).counts);
    }
    expect(expectedCurve({ ...defaultSpread(), mode: 'pull', die: true }, 10)).toEqual(expectedCurve({ ...defaultSpread(), mode: 'pull' }, 10));
  });

  it('membership: T_fail = 4 and 20, n = 8 and 64, f = 1 and 3, and one beyond (T_fail 3, f 4) run to the end', () => {
    for (const [n, f, tFail] of [[8, 3, 4], [64, 1, 20], [16, 4, 3]] as const) {
      const r = readMembership(runMembership(member({ n, f, tFail, crash: true, cut: true }), 80));
      expect(Number.isFinite(r.falsePairs)).toBe(true);
    }
  });
});
