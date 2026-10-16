import { describe, expect, it } from 'vitest';
import { percentile } from '../../core/sim';
import {
  CHECKPOINT_DEFAULT, GIVE_UP_FACTOR, INTERVALS, JOB_STEPS, STEP_SECONDS, bestInterval, idealSeconds, noProgress, simulateRun, sweepIntervals, youngDaly,
} from './checkpoint';
import { mulberry32 } from '../../core/random';
import {
  DEVICE_BYTES, PARAMETER_MAX, PARAMETER_STOPS, TOKEN_STOPS, TRAINING_BYTES_PER_PARAMETER, bytesPerParameter, forwardFlopsPerToken, memoryFigures, trainingFlops, trainingRatio, type Regime,
} from './memory';
import { checkpointOpening, loopOpening, memoryOpening, servingOpening, skewOpening } from './openings';
import {
  ARRIVAL_SEED, FIXED_MS, HORIZON_MS, MAX_BATCH_LIMIT, PER_ITEM_MS, TICK_MS, capacityPerSecond, finishedBatches, inServiceCount, initialServing, kneeBatch, latencies, lateCount, makeArrivals,
  overloaded, queuedCount, runServing, serviceMs, servingSim, servingStats, stateAtMs, stepServing,
} from './serving';
import {
  BACKWARD_OVER_FORWARD, BATCH_SIZES, DEVICE_MACS_PER_SECOND, DRIFT_STEPS, TRAIN_STEPS, evaluationAccuracy, forwardMacs, served, servedAccuracy, skewModel, stepMacs, stepsDone, trainLoop,
  type Preprocessing,
} from './training';

const SLOW = { timeout: 180_000 };

describe('serving simulation (scenes 1 and 3)', () => {
  it('conservation: arrived = served + queued + in service at every tick, for 200 seeds and a grid of (B, T)', SLOW, () => {
    for (let seed = 1; seed <= 200; seed++) {
      const lambda = 10 + (seed % 40) * 10;
      const arrivals = makeArrivals(seed, lambda, 600);
      for (const maxBatch of [1, 2, 4, 8, 16, 32]) {
        for (const maxWaitMs of [0, 10, 50]) {
          const sim = servingSim(arrivals, { lambda, maxBatch, maxWaitMs }, 600);
          expect(sim.violation, `seed ${seed} B ${maxBatch} T ${maxWaitMs}`).toBeNull();
          expect(sim.ticks).toBe(600 / TICK_MS);
        }
      }
    }
  });

  it('capacity is B / (a + c B) exactly: 45.45 per second at B = 1 and 222.2 at B = 8', () => {
    for (let b = 1; b <= MAX_BATCH_LIMIT; b++) expect(capacityPerSecond(b)).toBeCloseTo((1000 * b) / (FIXED_MS + PER_ITEM_MS * b), 12);
    expect(capacityPerSecond(1)).toBeCloseTo(1000 / 22, 12);
    expect(capacityPerSecond(8)).toBeCloseTo(8 / 0.036, 9);
    expect(serviceMs(1)).toBe(22);
    expect(serviceMs(8)).toBe(36);
  });

  it('M/D/1 oracle: at B = 1 and no wait, mean latency matches 1/mu + rho / (2 mu (1 - rho)) within 5% at rho = 0.5 and 0.8, and Little\'s law holds within 3%', SLOW, () => {
    const service = serviceMs(1);
    for (const rho of [0.5, 0.8]) {
      const lambda = (rho * 1000) / service;
      const closedForm = service + (rho * service) / (2 * (1 - rho));
      let latencySum = 0;
      let latencyCount = 0;
      let inSystemSum = 0;
      let ticks = 0;
      let arrivedTotal = 0;
      for (const seed of [1, 2, 3, 4]) {
        const horizon = 300_000;
        const arrivals = makeArrivals(seed, lambda, horizon);
        let s = initialServing();
        const total = Math.round(horizon / TICK_MS);
        for (let i = 0; i < total; i++) {
          s = stepServing(s, arrivals, { lambda, maxBatch: 1, maxWaitMs: 0 });
          inSystemSum += s.arrived - s.served;
        }
        ticks += total;
        const l = latencies(s, arrivals);
        latencySum += l.reduce((a, b) => a + b, 0);
        latencyCount += l.length;
        arrivedTotal += s.arrived;
      }
      const meanLatency = latencySum / latencyCount;
      expect(Math.abs(meanLatency / closedForm - 1), `rho ${rho}: ${meanLatency.toFixed(1)} vs ${closedForm}`).toBeLessThan(0.05);
      const observedLambda = arrivedTotal / (ticks * TICK_MS);
      const averageInSystem = inSystemSum / ticks;
      expect(Math.abs(averageInSystem / (observedLambda * meanLatency) - 1), `Little at rho ${rho}`).toBeLessThan(0.03);
    }
  });

  it('every started batch obeys its rule (full, or the oldest waited T), and the checker rejects a run made with the wrong rule', () => {
    const lambda = 60;
    const arrivals = makeArrivals(3, lambda, 3000);
    const obeys = (maxBatch: number, maxWaitMs: number, s: ReturnType<typeof runServing>) =>
      finishedBatches(s).every((b) => b.count === maxBatch || b.start - arrivals[b.first] >= maxWaitMs - 1e-9);
    const good = runServing(arrivals, { lambda, maxBatch: 8, maxWaitMs: 10 }, 3000);
    expect(good.batches).toBeGreaterThan(10);
    expect(obeys(8, 10, good)).toBe(true);
    // Broken variant: a server that starts a batch as soon as anything is queued (wait 0) breaks the T = 10 rule.
    const eager = runServing(arrivals, { lambda, maxBatch: 8, maxWaitMs: 0 }, 3000);
    expect(obeys(8, 10, eager)).toBe(false);
  });

  it('batches start in arrival order and no request finishes faster than its batch takes', () => {
    const arrivals = makeArrivals(4, 100, 3000);
    const s = runServing(arrivals, { lambda: 100, maxBatch: 8, maxWaitMs: 10 }, 3000);
    const batches = finishedBatches(s);
    let expectedFirst = 0;
    for (const b of batches) {
      expect(b.first).toBe(expectedFirst);
      expectedFirst += b.count;
      expect(b.end - b.start).toBeCloseTo(serviceMs(b.count), 9);
    }
    for (const l of latencies(s, arrivals)) expect(l).toBeGreaterThanOrEqual(serviceMs(1) - 1e-9);
  });

  it('stats: throughput, p50, p99, mean batch and utilisation equal independent computations from the finished batches', () => {
    const arrivals = makeArrivals(ARRIVAL_SEED, 120, HORIZON_MS);
    const s = runServing(arrivals, { lambda: 120, maxBatch: 8, maxWaitMs: 10 }, HORIZON_MS);
    const stats = servingStats(s, arrivals);
    const sorted = finishedBatches(s).flatMap((b) => Array.from({ length: b.count }, (_, i) => b.end - arrivals[b.first + i])).sort((a, b) => a - b);
    expect(stats.p50).toBe(percentile(sorted, 0.5));
    expect(stats.p99).toBe(percentile(sorted, 0.99));
    expect(stats.throughput).toBeCloseTo((sorted.length * 1000) / s.t, 9);
    expect(stats.meanBatch).toBeCloseTo(sorted.length / finishedBatches(s).length, 12);
    expect(stats.utilisation).toBeGreaterThan(0);
    expect(stats.utilisation).toBeLessThanOrEqual(1);
  });

  it('the sweep knee: for 120 per second the smallest max batch that keeps up is 4; smaller ones are saturated with a growing queue, larger ones are stable', () => {
    const lambda = 120;
    expect(kneeBatch(lambda, MAX_BATCH_LIMIT)).toBe(4);
    const arrivals = makeArrivals(ARRIVAL_SEED, lambda, HORIZON_MS);
    for (let b = 1; b <= MAX_BATCH_LIMIT; b++) {
      const half = servingStats(runServing(arrivals, { lambda, maxBatch: b, maxWaitMs: 10 }, HORIZON_MS / 2), arrivals);
      const end = servingStats(runServing(arrivals, { lambda, maxBatch: b, maxWaitMs: 10 }, HORIZON_MS), arrivals);
      if (b < 4) {
        expect(overloaded(lambda, b), `B ${b}`).toBe(true);
        expect(end.utilisation).toBeGreaterThan(0.99);
        expect(end.queued).toBeGreaterThan(half.queued);
      } else {
        expect(overloaded(lambda, b), `B ${b}`).toBe(false);
        expect(end.queued, `B ${b}`).toBeLessThan(20);
      }
    }
  });

  it('past every capacity (400 per second against at most 381) the queue grows for every batch size', () => {
    expect(kneeBatch(400, MAX_BATCH_LIMIT)).toBeNull();
    const arrivals = makeArrivals(ARRIVAL_SEED, 400, HORIZON_MS);
    for (const b of [1, 8, 32]) {
      expect(overloaded(400, b)).toBe(true);
      const mid = runServing(arrivals, { lambda: 400, maxBatch: b, maxWaitMs: 10 }, HORIZON_MS / 2);
      const end = runServing(arrivals, { lambda: 400, maxBatch: b, maxWaitMs: 10 }, HORIZON_MS);
      expect(queuedCount(end)).toBeGreaterThan(queuedCount(mid));
    }
  });

  it('a stall starts no batch inside its window, holds the batch in service, and makes the waiting requests late', () => {
    const arrivals = makeArrivals(ARRIVAL_SEED, 20, 4000);
    const calm = runServing(arrivals, { lambda: 20, maxBatch: 1, maxWaitMs: 0 }, 4000);
    const frozen = runServing(arrivals, { lambda: 20, maxBatch: 1, maxWaitMs: 0, stall: [1000, 2000] }, 4000);
    for (const b of finishedBatches(frozen)) expect(b.start > 1000 && b.start <= 2000, `batch started at ${b.start}`).toBe(false);
    expect(lateCount(calm, arrivals, 100)).toBe(0);
    expect(lateCount(frozen, arrivals, 100)).toBe(31);
    expect(frozen.served).toBe(calm.served);
    expect(inServiceCount(initialServing())).toBe(0);
  });

  it('the tick sim and the plain run are the same simulation: the state after 500 ms matches, and stateAtMs looks up the history', () => {
    const arrivals = makeArrivals(2, 80, 1000);
    const params = { lambda: 80, maxBatch: 4, maxWaitMs: 20 };
    const sim = servingSim(arrivals, params, 1000);
    expect(stateAtMs(sim, 500)).toEqual(runServing(arrivals, params, 500));
    expect(stateAtMs(sim, 0)).toEqual(initialServing());
  });
});

describe('memory and compute (scene 2)', () => {
  it('the components add to the total for every parameter stop and both regimes, and 16 and 2 bytes are the named constants', () => {
    for (const regime of ['inference', 'training'] as Regime[]) {
      for (const parameters of PARAMETER_STOPS) {
        const f = memoryFigures(parameters, regime);
        expect(f.perComponent.reduce((s, c) => s + c.bytes, 0)).toBe(f.total);
        expect(f.total).toBe(bytesPerParameter(regime) * parameters);
      }
    }
    expect(TRAINING_BYTES_PER_PARAMETER).toBe(16);
    expect(bytesPerParameter('inference')).toBe(2);
    expect(trainingRatio()).toBe(8);
  });

  it('1 billion parameters is 16 GB (decimal) of training state and 2 GB of half-precision weights; 7 billion in training does not fit 80 GB', () => {
    expect(memoryFigures(1e9, 'training').total).toBe(16e9);
    expect(memoryFigures(1e9, 'inference').total).toBe(2e9);
    expect(memoryFigures(1e9, 'training').fits).toBe(true);
    expect(memoryFigures(7e9, 'training').total).toBe(112e9);
    expect(memoryFigures(7e9, 'training').fits).toBe(false);
    expect(memoryFigures(7e9, 'inference').fits).toBe(true);
    expect(DEVICE_BYTES).toBe(80e9);
  });

  it('sizes above the largest stop are clamped to it, never extrapolated', () => {
    expect(memoryFigures(5e12, 'training').total).toBe(PARAMETER_MAX * 16);
    expect(memoryOpening().stop).toBe(PARAMETER_STOPS.indexOf(1e9));
    expect(TOKEN_STOPS[memoryOpening().tokenStop]).toBe(1e10);
  });

  it('compute: 6 N D for training and 2 N a token forward, from the typed numbers', () => {
    const rnd = mulberry32(2);
    for (let i = 0; i < 50; i++) {
      const [n, d] = [Math.floor(rnd() * 1e10) + 1, Math.floor(rnd() * 1e12) + 1];
      expect(trainingFlops(n, d)).toBe(6 * n * d);
      expect(forwardFlopsPerToken(n)).toBe(2 * n);
    }
    expect(trainingFlops(1e9, 1e10)).toBe(6e19);
  });
});

describe('the training loop (scene 1)', () => {
  it('multiply-adds are counted from the layer sizes: 2-8-1 is 24 per forward pass, a step on a batch is (1 + 2) x 24 x batch', () => {
    expect(forwardMacs([2, 8, 1])).toBe(2 * 8 + 8 * 1);
    expect(forwardMacs([4, 16, 16, 1])).toBe(4 * 16 + 16 * 16 + 16);
    for (const b of BATCH_SIZES) expect(stepMacs([2, 8, 1], b)).toBe((1 + BACKWARD_OVER_FORWARD) * 24 * b);
  });

  it('throughput is model-based and the same for every minibatch size: device rate over the multiply-adds of one training sample', () => {
    const rates = BATCH_SIZES.map((b) => trainLoop(b).samplesPerSecond);
    for (const r of rates) expect(r).toBeCloseTo(DEVICE_MACS_PER_SECOND / (3 * 24), 9);
    expect(trainLoop(8).stepSeconds).toBeCloseTo((3 * 24 * 8) / DEVICE_MACS_PER_SECOND, 12);
    expect(trainLoop(8).stepsPerEpoch).toBe(5);
  });

  it('the loss falls over the run for every minibatch size, deterministically', () => {
    for (const b of BATCH_SIZES) {
      const run = trainLoop(b);
      expect(run.loss.length).toBe(TRAIN_STEPS + 1);
      expect(run.loss[TRAIN_STEPS]).toBeLessThan(run.loss[0] / 4);
      expect(trainLoop(b).loss).toEqual(run.loss);
    }
  });

  it('a stall delays steps and nothing else: steps done = floor((time - frozen time) / step time), capped, and the loss at step k does not depend on the stall', () => {
    const step = trainLoop(8).stepSeconds;
    expect(stepsDone(4, 0, step, TRAIN_STEPS)).toBe(Math.floor(4 / step));
    expect(stepsDone(4, 1, step, TRAIN_STEPS)).toBe(Math.floor(3 / step));
    expect(stepsDone(4, 0, step, TRAIN_STEPS)).toBe(34);
    expect(stepsDone(4, 1, step, TRAIN_STEPS)).toBe(26);
    expect(stepsDone(1000, 0, step, TRAIN_STEPS)).toBe(TRAIN_STEPS);
    expect(stepsDone(0.5, 2, step, TRAIN_STEPS)).toBe(0);
  });
});

describe('train-serve skew (scene 4)', () => {
  it('with matching preprocessing the served accuracy equals the evaluation accuracy exactly, checked against a manual computation', () => {
    const m = skewModel();
    const mean = [0, 1].map((k) => m.scaler.mean[k]);
    const sd = [0, 1].map((k) => m.scaler.sd[k]);
    const manual = m.test.filter(({ x, y }) => (m.net.predict([(x[0] - mean[0]) / sd[0], (x[1] - mean[1]) / sd[1]]) > 0.5 ? 1 : 0) === y).length / m.test.length;
    expect(servedAccuracy('matching')).toBe(evaluationAccuracy());
    expect(evaluationAccuracy()).toBe(manual);
    expect(manual).toBeGreaterThan(0.9);
  });

  it('missing or different preprocessing lowers accuracy with the very same weights (computed from real predictions)', () => {
    const m = skewModel();
    const before = [...m.net.params];
    expect(servedAccuracy('missing')).toBeLessThan(evaluationAccuracy() - 0.3);
    expect(servedAccuracy('different')).toBeLessThan(evaluationAccuracy() - 0.1);
    expect(servedAccuracy('different')).toBeGreaterThan(servedAccuracy('missing'));
    expect(m.net.params).toEqual(before);
  });

  it('drift: accuracy peaks with no shift and falls off both ways; every value is a real accuracy in [0, 1]', () => {
    const curve = DRIFT_STEPS.map((d) => servedAccuracy('matching', d));
    const at0 = curve[DRIFT_STEPS.indexOf(0)];
    expect(at0).toBe(evaluationAccuracy());
    expect(Math.max(...curve)).toBe(Math.max(at0, ...curve));
    expect(curve[0]).toBeLessThan(at0 - 0.2);
    expect(curve[curve.length - 1]).toBeLessThan(at0 - 0.2);
    for (const v of curve) expect(v >= 0 && v <= 1).toBe(true);
  });

  it('the served features differ by preprocessing as defined: matching standardises, missing passes raw numbers through', () => {
    const m = skewModel();
    expect(served([4, 1.5], 'missing', m)).toEqual([4, 1.5]);
    const matched = served([m.scaler.mean[0], m.scaler.mean[1]], 'matching', m);
    expect(matched[0]).toBeCloseTo(0, 12);
    expect(matched[1]).toBeCloseTo(0, 12);
    const different: Preprocessing = 'different';
    expect(served([m.scaler.mean[0], m.scaler.mean[1]], different, m)[0]).not.toBeCloseTo(0, 3);
  });
});

describe('checkpoints (scene 5)', () => {
  it('with no failures the total is the job plus one checkpoint per cycle, from a closed form', () => {
    for (const interval of INTERVALS) {
      const cycles = Math.ceil(JOB_STEPS / interval);
      expect(simulateRun({ mtbf: 1e15, cost: 30 }, interval, mulberry32(1))).toBeCloseTo(JOB_STEPS * STEP_SECONDS + cycles * 30, 6);
    }
  });

  it('the Monte Carlo mean matches the exact expectation (JOB / K) M (e^((K + C) / M) - 1) within 2% for intervals that divide the job', () => {
    const { mtbf, cost } = CHECKPOINT_DEFAULT;
    const divisors = [100, 200, 500, 1000, 2500];
    const results = sweepIntervals({ mtbf, cost }, 3000, divisors);
    for (const { interval, expected } of results) {
      const exact = (JOB_STEPS / interval) * mtbf * (Math.exp((interval * STEP_SECONDS + cost) / mtbf) - 1);
      expect(Math.abs(expected / exact - 1), `K ${interval}`).toBeLessThan(0.02);
    }
  });

  it('the default curve is U-shaped, its simulated minimum is interior and within a factor of two of sqrt(2 C M)', () => {
    const results = sweepIntervals(CHECKPOINT_DEFAULT);
    const best = bestInterval(results);
    const estimate = youngDaly(CHECKPOINT_DEFAULT);
    expect(estimate).toBeCloseTo(Math.sqrt(2 * 30 * 3600), 9);
    expect(best.interval).toBeGreaterThan(INTERVALS[0]);
    expect(best.interval).toBeLessThan(INTERVALS[INTERVALS.length - 1]);
    expect(results[0].expected).toBeGreaterThan(best.expected * 1.5);
    expect(results[results.length - 1].expected).toBeGreaterThan(best.expected * 1.5);
    expect(best.interval).toBeGreaterThanOrEqual(estimate / 2);
    expect(best.interval).toBeLessThanOrEqual(estimate * 2);
    expect(best.expected).toBeGreaterThan(idealSeconds);
  });

  it('the estimate tracks the simulated minimum for other failure rates too: M = 600 s and 14,400 s', () => {
    for (const mtbf of [600, 14_400]) {
      const model = { mtbf, cost: 30 };
      const best = bestInterval(sweepIntervals(model));
      const estimate = youngDaly(model);
      expect(best.interval, `M ${mtbf}`).toBeGreaterThanOrEqual(estimate / 2.5);
      expect(best.interval, `M ${mtbf}`).toBeLessThanOrEqual(estimate * 2.5);
    }
  });

  it('a run that cannot finish is stopped at the give-up time and counted, never looped forever; the warning is the computed condition M < K + C', () => {
    const hopeless = { mtbf: 600, cost: 30 };
    expect(simulateRun(hopeless, 10_000, mulberry32(1))).toBe(GIVE_UP_FACTOR * idealSeconds);
    const results = sweepIntervals(hopeless);
    expect(results[results.length - 1].unfinished).toBeGreaterThan(0);
    expect(noProgress(hopeless, 1000)).toBe(true);
    expect(noProgress(hopeless, 500)).toBe(false);
    expect(noProgress(CHECKPOINT_DEFAULT, 500)).toBe(false);
    expect(noProgress({ mtbf: 3600, cost: 30 }, 3000)).toBe(false);
    expect(noProgress({ mtbf: 3600, cost: 30 }, 5000)).toBe(true);
  });
});

describe('opening states are pure functions', () => {
  it('each scene opens from fresh values, and mutating one result never reaches the next', () => {
    for (const open of [loopOpening, memoryOpening, servingOpening, skewOpening, checkpointOpening]) {
      expect(open()).toEqual(open());
      expect(open()).not.toBe(open());
    }
    const s = servingOpening();
    s.lambda = 999;
    expect(servingOpening().lambda).toBe(120);
    expect(servingOpening().now).toBe(HORIZON_MS);
    expect(loopOpening()).toEqual({ batch: 8, stall: false });
  });
});
