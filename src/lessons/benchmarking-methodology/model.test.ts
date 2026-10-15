import { afterEach, describe, expect, it, vi } from 'vitest';
import { normal } from '../../core/distributions';
import { mulberry32 } from '../../core/random';
import {
  DISCARD_RANGE, GENERATOR_DEFAULT, IMPLS, LOOP_OVERHEAD_US, NOISE_DEFAULT, REAL, RUN_SECONDS, SERIES_LENGTH, STEADY_WINDOW, WARMUP_DEFAULT,
  backfill, differenceInterval, drawRuns, exactWindowMean, hidesStall, isBimodal, logBinnedMeans, medianInterval, medianOf, modelTime, playGenerator, readGenerator,
  readNoise, readWindow, startRealRun, stepRealRun, timelineRange, timerGranularityMs, warmupSeries, windowMean, windowOf, workload, type Clock, type GeneratorParams,
} from './model';

afterEach(() => vi.restoreAllMocks());

describe('warm-up: the sign flips with the window, from the named constants', () => {
  const brute = (id: 'A' | 'B', from: number, to: number) => {
    let sum = 0;
    for (let i = from; i < to; i++) sum += modelTime(id, i);
    return sum / (to - from);
  };

  it('the closed-form window mean equals a loop over the model, for several windows', () => {
    for (const [from, to] of [[0, 100], [100, 1100], [500, 1500], [5000, 10_000], [0, 10_000]]) {
      for (const id of ['A', 'B'] as const) expect(exactWindowMean(id, [from, to]), `${id} ${from}-${to}`).toBeCloseTo(brute(id, from, to), 9);
    }
  });

  it('over the first 100 iterations A reads about 18 µs and B about 137 µs (A looks about 7.6× faster), and in steady state B is faster, 8 against 10', () => {
    const first = [exactWindowMean('A', [0, 100]), exactWindowMean('B', [0, 100])];
    expect(first[0]).toBeCloseTo(18.15, 1);
    expect(first[1]).toBeCloseTo(137.4, 0);
    expect(first[1] / first[0]).toBeCloseTo(7.6, 1);
    expect(first[0]).toBeLessThan(first[1]);
    const steady = [exactWindowMean('A', STEADY_WINDOW), exactWindowMean('B', STEADY_WINDOW)];
    expect(steady[0]).toBeCloseTo(10, 6);
    expect(steady[1]).toBeCloseTo(8, 4);
    expect(steady[1]).toBeLessThan(steady[0]);
    expect(IMPLS.A.steadyUs).toBe(10);
    expect(IMPLS.B.steadyUs).toBe(8);
  });

  it('the sign flip is asserted from the constants: the first-100 window and the steady window name different winners, and the discard slider crosses over', () => {
    const state = warmupSeries(WARMUP_DEFAULT.seed, true);
    expect(readWindow(state, 'first100', 0, true).faster).toBe('A');
    expect(readWindow(state, 'steady', 0, true).faster).toBe('B');
    let crossing: number | null = null;
    for (let k = DISCARD_RANGE.min; k <= DISCARD_RANGE.max; k += DISCARD_RANGE.step) {
      if (exactWindowMean('B', windowOf('discard', k)) < exactWindowMean('A', windowOf('discard', k))) {
        crossing = k;
        break;
      }
    }
    expect(crossing).not.toBeNull();
    expect(crossing!).toBeGreaterThan(DISCARD_RANGE.min);
    expect(readWindow(state, 'discard', DISCARD_RANGE.min, true).faster).toBe('A');
    expect(readWindow(state, 'discard', DISCARD_RANGE.max, true).faster).toBe('B');
  });

  it('the seeded series read within 1% of the exact window means (noise has mean 1), and the same seed gives the same series', () => {
    const a = warmupSeries(1, true);
    const b = warmupSeries(1, true);
    expect(Array.from(a.a.subarray(0, 50))).toEqual(Array.from(b.a.subarray(0, 50)));
    expect(Array.from(warmupSeries(2, true).a.subarray(0, 50))).not.toEqual(Array.from(a.a.subarray(0, 50)));
    for (const w of [[0, 100], [500, 1500], STEADY_WINDOW] as const) {
      expect(Math.abs(windowMean(a.a, w) / exactWindowMean('A', w) - 1), `A ${w}`).toBeLessThan(w[1] - w[0] === 100 ? 0.03 : 0.01);
      expect(Math.abs(windowMean(a.b, w) / exactWindowMean('B', w) - 1), `B ${w}`).toBeLessThan(w[1] - w[0] === 100 ? 0.03 : 0.01);
    }
    expect(a.count).toBe(SERIES_LENGTH);
  });

  it('with the result unused both collapse to the empty loop, so there is no verdict', () => {
    const state = warmupSeries(1, false);
    for (const mode of ['first100', 'steady'] as const) {
      const r = readWindow(state, mode, 0, false);
      expect(r.faster).toBeNull();
      expect(r.meanA).toBeLessThan(2 * LOOP_OVERHEAD_US);
      expect(r.meanB).toBeLessThan(2 * LOOP_OVERHEAD_US);
    }
  });

  it('the log-binned curve has one value per bin, all positive, falling from the warm-up to the steady state', () => {
    const pts = logBinnedMeans(warmupSeries(1, true).b, 40);
    expect(pts.length).toBeGreaterThan(30);
    expect(pts.every(([x, y]) => x > 0 && y > 0)).toBe(true);
    expect(pts[0][1]).toBeGreaterThan(pts[pts.length - 1][1] * 5);
  });
});

describe('the opt-in real run, with an injected clock', () => {
  const ticking = (stepMs: number): Clock & { reads: number } => {
    const c = { t: 0, reads: 0, now() { this.reads++; return (this.t += stepMs) - stepMs; } };
    return c;
  };

  it('times batches with two reads each, per-call nanoseconds from the clock, and stops when the budget is spent', () => {
    const clock = ticking(10);
    let run = startRealRun(clock);
    while (!run.done) run = stepRealRun(run, clock);
    expect(run.perCallNs.every((ns) => Math.abs(ns - (10 * 1e6) / REAL.callsPerBatch) < 1e-6)).toBe(true);
    expect(run.perCallNs.length).toBe(Math.ceil(REAL.budgetMs / 20));
    expect(run.sink).toBe(((REAL.callsPerBatch * run.perCallNs.length * workload(REAL.size)) % 1_000_003));
  });

  it('stops at the batch cap when the clock is fast', () => {
    const clock = ticking(0.001);
    let run = startRealRun(clock);
    while (!run.done) run = stepRealRun(run, clock);
    expect(run.perCallNs).toHaveLength(REAL.maxBatches);
  });

  it('the timer probe reports the smallest non-zero step it saw, or null for a clock that never moves', () => {
    let reads = 0;
    const stepping: Clock = { now: () => Math.floor(reads++ / 7) * 0.1 };
    expect(timerGranularityMs(stepping, 500)).toBeCloseTo(0.1, 9);
    expect(timerGranularityMs({ now: () => 5 }, 100)).toBeNull();
  });

  it('the default state never reads a clock: building every scene\'s default numbers calls performance.now zero times', () => {
    const spy = vi.spyOn(performance, 'now');
    warmupSeries(WARMUP_DEFAULT.seed, WARMUP_DEFAULT.useResult);
    readNoise(NOISE_DEFAULT, NOISE_DEFAULT.seed);
    readGenerator(GENERATOR_DEFAULT.generator, GENERATOR_DEFAULT);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('noise and the bootstrap', () => {
  it('a hand case: the median of [1, 2, 3, 4, 5] is 3 and its interval contains it and stays inside the data', () => {
    const iv = medianInterval([1, 2, 3, 4, 5], 1000, mulberry32(1));
    expect(iv.estimate).toBe(3);
    expect(iv.lo).toBeGreaterThanOrEqual(1);
    expect(iv.hi).toBeLessThanOrEqual(5);
    expect(iv.lo).toBeLessThanOrEqual(3);
    expect(iv.hi).toBeGreaterThanOrEqual(3);
  });

  it('the 95% bootstrap interval for the median covers the true median 0.95 ± 0.03 over 1,000 seeded repeats on a near-normal source (n = 50)', () => {
    const repeats = 1000;
    let covered = 0;
    for (let r = 0; r < repeats; r++) {
      const rnd = mulberry32(1000 + r);
      const sample = Array.from({ length: 50 }, () => 10 + normal(rnd)).sort((a, b) => a - b);
      const iv = medianInterval(sample, 400, rnd);
      if (iv.lo <= 10 && 10 <= iv.hi) covered++;
    }
    expect(covered / repeats).toBeGreaterThan(0.92);
    expect(covered / repeats).toBeLessThan(0.98);
  });

  it('the difference interval is centred on the difference of medians, and flags a large difference against a null one', () => {
    const rnd = mulberry32(3);
    const base = Array.from({ length: 60 }, () => 10 + normal(rnd)).sort((a, b) => a - b);
    const shifted = base.map((v) => v + 5);
    const big = differenceInterval(base, shifted, 500, mulberry32(4));
    expect(big.lo).toBeGreaterThan(0);
    expect(big.estimate).toBeCloseTo(5, 9);
    const same = differenceInterval(base, [...base], 500, mulberry32(4));
    expect(same.lo).toBeLessThan(0);
    expect(same.hi).toBeGreaterThan(0);
  });

  it('defaults: 30 runs cannot tell a 3% difference and 200 runs can (so peeking at more runs changes the verdict)', () => {
    expect(readNoise(NOISE_DEFAULT, NOISE_DEFAULT.seed).verdict).toBe('cannot tell');
    const more = readNoise({ ...NOISE_DEFAULT, runs: 200 }, NOISE_DEFAULT.seed);
    expect(more.verdict).toBe('distinguishable');
    expect(more.faster).toBe('B');
  });

  it('another process makes the runs bimodal: a mean that sits between the modes where few runs are, while the median sits inside a mode', () => {
    const settings = { ...NOISE_DEFAULT, runs: 200, otherProcess: true };
    const r = readNoise(settings, 1);
    expect(r.bimodal).toBe(true);
    expect(isBimodal(drawRuns('A', { ...NOISE_DEFAULT, runs: 200 }, 1))).toBe(false);
    const near = (center: number) => r.runsA.filter((x) => Math.abs(x.us / center - 1) < 0.04).length / r.runsA.length;
    expect(near(r.A.mean)).toBeLessThan(near(r.A.median));
  });

  it('frequency scaling slows the early runs: the first fifth of runs reads slower than the last fifth', () => {
    const runs = drawRuns('A', { runs: 100, otherProcess: false, frequencyScaling: true }, 1);
    const mean = (xs: typeof runs) => xs.reduce((s, x) => s + x.us, 0) / xs.length;
    expect(mean(runs.slice(0, 20))).toBeGreaterThan(mean(runs.slice(80)) * 1.1);
  });

  it('the same seed gives the same runs, and the medians of both implementations sit near their named constants', () => {
    const a = drawRuns('A', { ...NOISE_DEFAULT, runs: 200 }, 5);
    expect(a).toEqual(drawRuns('A', { ...NOISE_DEFAULT, runs: 200 }, 5));
    expect(Math.abs(medianOf(a.map((x) => x.us).sort((x, y) => x - y)) / 10 - 1)).toBeLessThan(0.03);
  });
});

describe('coordinated omission, on the hand-worked vector', () => {
  const vector: GeneratorParams = { rate: 100, stallMs: 1000, stallAt: 1 };

  /** An independent run of the same story, written as plainly as possible: no shared code with the lesson. */
  function independent(closed: boolean) {
    const intervalMs = 10;
    const latencyFromIntended: number[] = [];
    const latencyFromSend: number[] = [];
    let previousReply = 0;
    let serverBusyUntil = 0;
    for (let k = 0; k < 1000; k++) {
      const meant = 10 * k;
      const sendAt = closed ? Math.max(meant, previousReply) : meant;
      const service = k === 100 ? 1000 : 1;
      const startAt = Math.max(sendAt, serverBusyUntil);
      const replyAt = startAt + service;
      serverBusyUntil = replyAt;
      previousReply = replyAt;
      latencyFromIntended.push(replyAt - meant);
      latencyFromSend.push(replyAt - sendAt);
    }
    return { intervalMs, latencyFromIntended, latencyFromSend };
  }

  const p99 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.ceil(0.99 * xs.length) - 1];

  it('closed-loop: 999 samples of 1 ms and one of 1,000 ms, so the tool reports p99 = 1 ms', () => {
    const r = readGenerator('closed', vector);
    expect(r.recorded.filter((v) => v === 1)).toHaveLength(999);
    expect(r.recorded.filter((v) => v === 1000)).toHaveLength(1);
    expect(r.reportedP99).toBe(1);
    expect(p99(independent(true).latencyFromSend)).toBe(1);
  });

  it('measured against the intended send time the latencies run 1,000, 991, 982, … and the p99 is 910 ms, with about 10% over 100 ms', () => {
    const r = readGenerator('closed', vector);
    expect(r.truth.slice(100, 106)).toEqual([1000, 991, 982, 973, 964, 955]);
    expect(r.trueP99).toBe(910);
    expect(p99(independent(true).latencyFromIntended)).toBe(910);
    expect(r.overSlo).toBeCloseTo(0.1, 12);
    expect(r.truth.filter((v) => v > 100)).toHaveLength(100);
  });

  it('the open-loop generator\'s measured p99 equals the per-intended-time answer (910 ms)', () => {
    const r = readGenerator('open', vector);
    expect(r.reportedP99).toBe(910);
    expect(r.reportedP99).toBe(r.trueP99);
    expect(p99(independent(false).latencyFromSend)).toBe(910);
    expect(r.recorded).toEqual(r.truth);
  });

  it('backfill: 99 synthetic samples (990 … 10) are added for the stalled one, and the corrected p99 is 900 ms, within 2% of 910', () => {
    const values = readGenerator('closed', vector).recorded;
    const filled = backfill(values, 10);
    expect(filled).toHaveLength(values.length + 99);
    const r = readGenerator('corrected', vector);
    expect(r.reportedP99).toBe(900);
    expect(Math.abs(r.reportedP99 / r.trueP99 - 1)).toBeLessThan(0.02);
    expect(r.recorded).toHaveLength(1099);
  });

  it('broken variant: a tool that omits instead of backfilling reports 1 ms and fails the "p99 ≥ 800 ms on the stall vector" check that the corrected one passes', () => {
    const omitting = readGenerator('closed', vector).reportedP99;
    expect(omitting >= 800).toBe(false);
    expect(readGenerator('corrected', vector).reportedP99 >= 800).toBe(true);
    expect(hidesStall(readGenerator('closed', vector))).toBe(true);
    expect(hidesStall(readGenerator('corrected', vector))).toBe(false);
    expect(hidesStall(readGenerator('open', vector))).toBe(false);
  });

  it('with no stall all three generators agree: every request replies in 1 ms', () => {
    for (const kind of ['open', 'closed', 'corrected'] as const) {
      const r = readGenerator(kind, { rate: 100, stallMs: 0, stallAt: 1 });
      expect(r.schedule.stalled).toBeNull();
      expect(r.reportedP99).toBe(1);
      expect(r.trueP99).toBe(1);
    }
  });

  it('the schedule is conserved: one request per interval for the run, replies in order, no reply before its send', () => {
    for (const rate of [10, 100, 500]) {
      for (const kind of ['open', 'closed'] as const) {
        const s = playGenerator(kind, { rate, stallMs: 2000, stallAt: 3 });
        expect(s.intended).toHaveLength(rate * RUN_SECONDS);
        s.done.forEach((d, k) => {
          expect(d).toBeGreaterThan(s.sent[k]);
          expect(s.sent[k]).toBeGreaterThanOrEqual(s.intended[k]);
          if (k > 0) expect(d).toBeGreaterThan(s.done[k - 1]);
        });
      }
    }
  });

  it('the closed-loop generator sends the delayed requests back to back after the stall, a millisecond apart', () => {
    const s = playGenerator('closed', vector);
    expect(s.sent[101]).toBe(s.done[100]);
    expect(s.sent[102] - s.sent[101]).toBe(1);
  });

  it('the timeline covers the stalled request, clamped to the run', () => {
    const [from, to] = timelineRange(playGenerator('closed', vector));
    expect([from, to]).toEqual([98, 107]);
    const [f2] = timelineRange(playGenerator('closed', { rate: 100, stallMs: 1000, stallAt: 0 }));
    expect(f2).toBe(0);
  });
});
