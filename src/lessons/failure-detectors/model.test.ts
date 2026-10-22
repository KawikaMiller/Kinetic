import { describe, expect, it } from 'vitest';
import { checkInvariants, forSeeds } from '../../core/distSim';
import { exponential } from '../../core/distributions';
import { mulberry32 } from '../../core/random';
import {
  BROKEN_SEED, BROKEN_TIMEOUT_MS, CRASH_AT_MS, DETECTOR_RULES, HEARTBEAT_MS, JITTER, LATENCY_CAP_MS, MINUTE_MS, PAUSE, PHI, PHI_DISPLAY_CAP,
  SAFE_TIMEOUT_MS, SEED_RUN_MS, SWEEP_SEEDS, SWIM_K, SWIM_LOSS, TIMEOUT,
  buildDetector, crashTimeFor, defaultSetup, defaultSwim, detectionMean, detectionTime, expectedFalseInRun, failingSeeds, falsePerMinute,
  falseSuspicions, gapExceedsProbability, impliedTimeout, judge, measurePoint, phiAt, phiReadout, runDetector, runSwim, survival,
  swimEnumerated, swimFalseSuspicion, swimFalseSuspicions, swimPatternCount, twinRuns, waitAfterArrival, type DetectorSetup, type SwimCut,
} from './model';

const base = (over: Partial<DetectorSetup> = {}): DetectorSetup => ({ ...defaultSetup(), ...over });
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs: number[]) => Math.sqrt(xs.reduce((s, x) => s + (x - mean(xs)) ** 2, 0) / (xs.length - 1));

describe('closed forms (hand-worked, then checked by scipy and by integration)', () => {
  it('per-gap false suspicion: 0.5 * e^-((T - 100) / s)', () => {
    // T = 185, s = 20: 0.5 * e^-4.25 = 0.5 * 0.014264 = 0.007132; 99 gaps in 10 s give 0.706 (scipy: 0.7060795...).
    expect(gapExceedsProbability(185, 20)).toBeCloseTo(0.007132, 6);
    expect(expectedFalseInRun(185, 20, 10_000)).toBeCloseTo(0.706, 3);
    // T = 400: 0.5 * e^-15 = 1.53e-7, times 99 = 1.5e-5.
    expect(expectedFalseInRun(400, 20, 10_000)).toBeCloseTo(1.5e-5, 6);
    // T = 150: 0.5 * e^-2.5 = 0.04104 per gap, 600 gaps a minute = 24.6.
    expect(gapExceedsProbability(150, 20)).toBeCloseTo(0.04104, 5);
    expect(falsePerMinute(150, 20)).toBeCloseTo(24.63, 2);
  });

  it('mean detection time: T + (1 + s) - 50', () => {
    expect(detectionMean(185, 20)).toBe(156);
    expect(detectionMean(400, 20)).toBe(371);
  });

  it('the Laplace form equals a trapezoid integral of the delay-difference density, at several T and s', () => {
    // P(e1 - e0 > c) = integral over x >= 0 of f(x) * S(x + c) dx, with e ~ Exp(mean s): a different route to the same number.
    const integral = (c: number, s: number) => {
      const steps = 400_000;
      const top = 60 * s;
      const h = top / steps;
      let sum = 0;
      for (let i = 0; i <= steps; i++) {
        const x = i * h;
        const v = (Math.exp(-x / s) / s) * Math.exp(-(x + c) / s);
        sum += i === 0 || i === steps ? v / 2 : v;
      }
      return sum * h;
    };
    for (const [t, s] of [[185, 20], [150, 20], [300, 40], [160, 5], [250, 60]]) {
      expect(gapExceedsProbability(t, s)).toBeCloseTo(integral(t - HEARTBEAT_MS, s), 8);
    }
  });

  it('twenty thousand sampled send-order gaps agree with the per-gap probability within 3 standard errors', () => {
    const rnd = mulberry32(2024);
    for (const [t, s] of [[150, 20], [185, 20], [210, 30]]) {
      const delays = Array.from({ length: 200_001 }, () => Math.min(LATENCY_CAP_MS, 1 + exponential(rnd, 1 / s)));
      let over = 0;
      for (let i = 1; i < delays.length; i++) if (HEARTBEAT_MS + delays[i] - delays[i - 1] > t) over++;
      const n = delays.length - 1;
      const p = gapExceedsProbability(t, s);
      expect(Math.abs(over / n - p)).toBeLessThan(3 * Math.sqrt((p * (1 - p)) / n) * 2);
    }
  });
});

describe('the monitor on distSim measures what the closed forms say', () => {
  it('false suspicions per minute sit just under the send-order closed form (M sees heartbeats in ARRIVAL order, where a late one can be overtaken)', () => {
    for (const t of [150, 185]) {
      const m = measurePoint(base(), t);
      const closed = falsePerMinute(t, JITTER.default);
      expect(m.falsePerMin / closed).toBeGreaterThan(0.85);
      expect(m.falsePerMin / closed).toBeLessThan(1.03);
    }
  });

  it('mean detection time over 200 seeded crashes is within 3 standard errors of T + (1 + s) - 50', () => {
    for (const t of [185, 400]) {
      const times: number[] = [];
      for (let seed = 1; seed <= SWEEP_SEEDS; seed++) {
        const d = runDetector(base({ seed, timeoutMs: t, crashAt: crashTimeFor(seed) }), CRASH_AT_MS + 2_000);
        times.push(detectionTime(d)!);
      }
      expect(Math.abs(mean(times) - detectionMean(t, JITTER.default))).toBeLessThan((3 * sd(times)) / Math.sqrt(times.length));
    }
  });

  it('completeness (bounded, separate from safety): a crash is suspected within T + the latency cap on all 200 seeds, in both modes', () => {
    for (const t of [BROKEN_TIMEOUT_MS, SAFE_TIMEOUT_MS]) {
      for (let seed = 1; seed <= SWEEP_SEEDS; seed++) {
        const d = runDetector(base({ seed, timeoutMs: t, crashAt: crashTimeFor(seed) }), CRASH_AT_MS + 2_000);
        const took = detectionTime(d);
        expect(took, `seed ${seed}`).not.toBeNull();
        expect(took!).toBeLessThanOrEqual(t + LATENCY_CAP_MS);
      }
    }
  });
});

describe('rule 0, accuracy: while P is up and not paused, M does not suspect it', () => {
  const scenario = (timeoutMs: number) => (seed: number) => buildDetector(base({ seed, timeoutMs })).cluster;

  it('broken mode: the lowest failing seed from 1 is pinned, with the rule index and the message', () => {
    const verdict = forSeeds({ from: 1, to: SWEEP_SEEDS + 1 }, scenario(BROKEN_TIMEOUT_MS), DETECTOR_RULES, { until: SEED_RUN_MS });
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.seed).toBe(BROKEN_SEED);
    expect(verdict.rule).toBe(0);
    expect(verdict.message).toMatch(/^M suspected a live peer at t = \d+ ms$/);
  });

  it('broken mode fails on a share of the 200 seeds inside the band (30% to 70%), never everywhere', () => {
    const bad = failingSeeds(base());
    expect(bad[0]).toBe(BROKEN_SEED);
    expect(bad.length).toBeGreaterThan(0.3 * SWEEP_SEEDS);
    expect(bad.length).toBeLessThan(0.7 * SWEEP_SEEDS);
  });

  it('the fixed mode (T = 400) passes the same 200 seeds', () => {
    expect(failingSeeds(base({ timeoutMs: SAFE_TIMEOUT_MS }))).toEqual([]);
    expect(forSeeds({ from: 1, to: SWEEP_SEEDS + 1 }, scenario(SAFE_TIMEOUT_MS), DETECTOR_RULES, { until: SEED_RUN_MS }).ok).toBe(true);
  });

  it('seed-free schedule: dropping the two heartbeats sent at 1,000 and 1,100 ms leaves a gap near 300 ms, which beats T = 185 and not T = 400', () => {
    for (const [timeoutMs, expected] of [[185, true], [400, false]] as const) {
      for (let seed = 1; seed <= 50; seed++) {
        const d = buildDetector(base({ seed, timeoutMs, jitterMs: JITTER.min }));
        d.cluster.dropNext((m) => m.payload.n === 10);
        d.cluster.dropNext((m) => m.payload.n === 11);
        const verdict = checkInvariants(d.cluster, DETECTOR_RULES, { until: 2_000 });
        expect(verdict.ok, `T ${timeoutMs} seed ${seed}`).toBe(!expected);
      }
    }
  });

  it('a false suspicion is counted by the model: the count in the run is the count of suspicions while P is alive', () => {
    const d = runDetector(base({ seed: BROKEN_SEED }), SEED_RUN_MS);
    expect(falseSuspicions(d).length).toBeGreaterThanOrEqual(1);
    expect(falseSuspicions(d).length).toBe(d.monitor.suspicions.length);
  });
});

describe('phi accrual, against values scipy gave (norm.sf, norm.isf)', () => {
  it('phi(t) for mu = 100, sigma = 10', () => {
    expect(survival(110, 100, 10)).toBeCloseTo(0.158655, 6);
    expect(phiAt(110, 100, 10)).toBeCloseTo(0.7995, 4);
    expect(phiAt(120, 100, 10)).toBeCloseTo(1.643, 3);
    expect(phiAt(130, 100, 10)).toBeCloseTo(2.8697, 4);
    expect(phiAt(150, 100, 10)).toBeCloseTo(6.5426, 4);
  });

  it('the implied timeout moves with sigma: phi = 8 gives 156.12 and 268.36 ms; phi = 3 gives 130.90 and 192.71', () => {
    expect(impliedTimeout(8, 100, 10)).toBeCloseTo(156.12, 2);
    expect(impliedTimeout(8, 100, 30)).toBeCloseTo(268.36, 2);
    expect(impliedTimeout(3, 100, 10)).toBeCloseTo(130.9, 1);
    expect(impliedTimeout(3, 100, 30)).toBeCloseTo(192.71, 2);
  });

  it('phi and its implied timeout round-trip, and phi is capped for display', () => {
    for (const phi of [1, 4, 8, 12]) expect(phiAt(impliedTimeout(phi, 100, 10), 100, 10)).toBeCloseTo(phi, 6);
    expect(phiAt(400, 100, 10)).toBe(PHI_DISPLAY_CAP);
  });

  it('extremes: phi = 1 and 16 give finite timeouts in order, and one beyond (17) is still finite', () => {
    const [lo, hi, beyond] = [PHI.min, PHI.max, PHI.max + 1].map((phi) => impliedTimeout(phi, 100, 10));
    expect(lo).toBeLessThan(hi);
    expect(hi).toBeLessThan(beyond);
    expect(Number.isFinite(beyond)).toBe(true);
  });

  it('the phi rule waits the fixed timeout until it has ten gaps, then the implied one', () => {
    const s = { rule: 'phi' as const, timeoutMs: 185, phi: 8 };
    expect(waitAfterArrival(s, [100, 100, 100])).toBe(185);
    const gaps = Array.from({ length: 20 }, (_, i) => 90 + (i % 2) * 20);
    expect(waitAfterArrival(s, gaps)).toBeCloseTo(impliedTimeout(8, mean(gaps), sd(gaps) * Math.sqrt(19 / 20)), 6);
    expect(waitAfterArrival({ ...s, rule: 'fixed' }, gaps)).toBe(185);
  });

  it('raising phi lowers false suspicions and raises detection time across 2, 4, 6, 8 (non-strict at the tail)', () => {
    const rows = [2, 4, 6, 8].map((phi) => {
      let falses = 0;
      let detect = 0;
      for (let seed = 1; seed <= 100; seed++) {
        const quiet = runDetector(base({ seed, rule: 'phi', phi, jitterMs: 20 }), 30_000);
        falses += falseSuspicions(quiet).length;
        detect += detectionTime(runDetector(base({ seed, rule: 'phi', phi, crashAt: crashTimeFor(seed) }), CRASH_AT_MS + 3_000)) ?? 0;
      }
      return { falses, detect };
    });
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].falses).toBeLessThanOrEqual(rows[i - 1].falses);
      expect(rows[i].detect).toBeGreaterThanOrEqual(rows[i - 1].detect);
    }
    expect(rows[0].falses).toBeGreaterThan(rows[3].falses);
    expect(rows[3].detect).toBeGreaterThan(rows[0].detect);
  });

  it('the requested probability is not the measured one: at phi = 8 the model promises 1e-8 and the gaps exceed it by orders of magnitude', () => {
    const r = phiReadout(1, 20, 8);
    expect(r.requested).toBe(1e-8);
    expect(r.actual).toBeGreaterThan(1e-5);
    expect(r.actual / r.requested).toBeGreaterThan(1e3);
  });

  it('the implied timeout moves with jitter (a fixed T does not)', () => {
    const quiet = phiReadout(1, JITTER.min, 8, 5);
    const noisy = phiReadout(1, JITTER.max, 8, 5);
    expect(noisy.timeoutMs).toBeGreaterThan(quiet.timeoutMs * 3);
  });
});

describe('scene 2: a crash and a pause look the same until the first post-resume heartbeat', () => {
  it('M observes identical arrival lists for D in {100, 600, 3000} over 50 seeds, and they part at 5,000 + D + the delay', () => {
    for (const pauseMs of [100, 600, 3000]) {
      for (let seed = 1; seed <= 50; seed++) {
        const twin = twinRuns(seed, pauseMs);
        const a = twin.crash.monitor.arrivals;
        const b = twin.pause.monitor.arrivals;
        const x = twin.partsAt!;
        expect(x, `D ${pauseMs} seed ${seed}`).toBeGreaterThanOrEqual(CRASH_AT_MS + pauseMs + 1);
        expect(x).toBeLessThanOrEqual(CRASH_AT_MS + pauseMs + LATENCY_CAP_MS);
        expect(a.filter((t) => t < x)).toEqual(b.filter((t) => t < x));
        const sus = (d: typeof twin.crash) => d.monitor.suspicions.filter((t) => t < x);
        expect(sus(twin.crash)).toEqual(sus(twin.pause));
        expect(b.some((t) => t >= x)).toBe(true);
        expect(a.some((t) => t >= x)).toBe(false);
      }
    }
  });

  it('manipulation 1: answering "paused" before the runs part is refused as a guess, with the pinned text', () => {
    const twin = twinRuns(1, PAUSE.default);
    const x = Math.round(twin.partsAt!);
    const v = judge(twin, CRASH_AT_MS + 400, 'paused');
    expect(v.indistinguishable).toBe(true);
    expect(v.text).toBe(`In run A the peer is dead. M's observations were the same until ${x} ms, so this answer was a guess.`);
    const w = judge(twin, CRASH_AT_MS + 400, 'crashed');
    expect(w.text).toBe(`In run B the peer was only paused. M's observations were the same until ${x} ms, so this answer was a guess.`);
  });

  it('manipulation 2: after the parting time the runs differ and the verdict says a detector can tell them apart', () => {
    const twin = twinRuns(1, PAUSE.default);
    const v = judge(twin, twin.partsAt! + 1, 'crashed');
    expect(v.indistinguishable).toBe(false);
    expect(v.text).toContain('can tell them apart');
  });

  it('at the extremes of D the pause run still parts after the pause', () => {
    for (const pauseMs of [PAUSE.min, PAUSE.max, PAUSE.max + 100]) expect(twinRuns(3, pauseMs).partsAt).toBeGreaterThan(CRASH_AT_MS + pauseMs);
  });
});

describe('scene 4: SWIM probing on distSim', () => {
  const periods = 2_000;
  const se = (p: number) => Math.sqrt((p * (1 - p)) / periods);

  it('hand vectors: p = 0.1 gives 0.19, 0.065341, 0.022471, 0.0077277; p = 0.2 with k = 3 gives 0.07409', () => {
    expect(swimFalseSuspicion(0.1, 0, 'none')).toBeCloseTo(0.19, 6);
    expect(swimFalseSuspicion(0.1, 1, 'none')).toBeCloseTo(0.065341, 6);
    expect(swimFalseSuspicion(0.1, 2, 'none')).toBeCloseTo(0.022471, 6);
    expect(swimFalseSuspicion(0.1, 3, 'none')).toBeCloseTo(0.0077277, 7);
    expect(swimFalseSuspicion(0.2, 3, 'none')).toBeCloseTo(0.07409, 5);
  });

  it('the closed form equals the sum over ALL 2^(2+4k) loss patterns, for k up to 3 (and 4), p up to 0.4, with and without a cut', () => {
    expect(swimPatternCount(3)).toBe(16_384);
    for (const cut of ['none', 'both'] as SwimCut[]) {
      for (const p of [0, 0.05, 0.1, 0.2, 0.4]) {
        for (const k of [0, 1, 2, 3, 4]) expect(swimEnumerated(p, k, cut), `p ${p} k ${k} ${cut}`).toBeCloseTo(swimFalseSuspicion(p, k, cut), 12);
      }
    }
  });

  it('the measured share of silent periods over 2,000 periods is within 3 standard errors, k = 0..4', () => {
    for (const k of [0, 1, 2, 3, 4]) {
      const r = runSwim({ ...defaultSwim(), k, seed: 7, periods });
      const expected = swimFalseSuspicion(SWIM_LOSS.default, k, 'none');
      expect(Math.abs(swimFalseSuspicions(r) / periods - expected), `k ${k}`).toBeLessThanOrEqual(3 * se(expected) + 1e-12);
    }
  });

  it('with the M-B link cut and p = 0: k = 0 suspects B in every period, k >= 1 never does, whichever direction is cut', () => {
    for (const cut of ['both', 'm-to-b', 'b-to-m'] as SwimCut[]) {
      expect(swimFalseSuspicions(runSwim({ ...defaultSwim(), loss: 0, k: 0, cut, periods: 200 }))).toBe(200);
      for (const k of [1, 2, 3, 4]) expect(swimFalseSuspicions(runSwim({ ...defaultSwim(), loss: 0, k, cut, periods: 200 }))).toBe(0);
    }
  });

  it('with the link cut and loss, the helpers are the only way through and the measured share follows (1 - (1-p)^4)^k', () => {
    const r = runSwim({ ...defaultSwim(), loss: 0.2, k: 2, cut: 'both', seed: 3, periods });
    const expected = swimFalseSuspicion(0.2, 2, 'both');
    expect(Math.abs(swimFalseSuspicions(r) / periods - expected)).toBeLessThanOrEqual(3 * se(expected));
  });

  it('extremes: p = 0 and 0.4, k = 0 and 4, one beyond (k = 5, loss 0.45) stays finite and in range', () => {
    for (const [loss, k] of [[SWIM_LOSS.min, SWIM_K.min], [SWIM_LOSS.max, SWIM_K.max], [0.45, 5]] as const) {
      const share = swimFalseSuspicions(runSwim({ ...defaultSwim(), loss, k, periods: 100 })) / 100;
      expect(share).toBeGreaterThanOrEqual(0);
      expect(share).toBeLessThanOrEqual(1);
    }
    expect(swimFalseSuspicion(0, 0, 'none')).toBe(0);
  });
});

describe('controls at their extremes and one beyond', () => {
  it('T = 120 and 600, s = 5 and 60 run to a finite answer; one beyond (T = 110, s = 65) too', () => {
    for (const [timeoutMs, jitterMs] of [[TIMEOUT.min, JITTER.min], [TIMEOUT.max, JITTER.max], [TIMEOUT.min, JITTER.max], [110, 65]]) {
      const d = runDetector(base({ timeoutMs, jitterMs, crashAt: 4_000 }), 8_000);
      expect(Number.isFinite(detectionTime(d) ?? 0)).toBe(true);
      expect(Number.isFinite(falsePerMinute(timeoutMs, jitterMs))).toBe(true);
    }
  });

  it('the one-minute window is 600 heartbeats', () => {
    expect(MINUTE_MS / HEARTBEAT_MS).toBe(600);
  });
});
