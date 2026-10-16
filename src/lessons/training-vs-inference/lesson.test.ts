import { describe, expect, it } from 'vitest';
import { bytes, sig } from '../../core/format';
import { expectCaption } from '../../core/testing/captions';
import { sceneElements } from '../../core/testing/sceneKeys';
import { checkpointCaption, loopCaption, memoryCaption, servingCaption, skewCaption } from './captions';
import { CHECKPOINT_DEFAULT, bestInterval, idealSeconds, noProgress, sweepIntervals, youngDaly } from './checkpoint';
import lesson from './index';
import { DEVICE_BYTES, bytesPerParameter, memoryFigures, trainingRatio } from './memory';
import { checkpointOpening, loopOpening, memoryOpening, servingOpening } from './openings';
import {
  ARRIVAL_SEED, HORIZON_MS, LATENCY_BUDGET_MS, LOOP_HORIZON_MS, capacityPerSecond, kneeBatch, lateCount, makeArrivals, overloaded, queueingCheck, runServing, serviceMs, servingSim, servingStats, stateAtMs,
} from './serving';
import { BATCH_SIZES, DRIFT_STEPS, TRAIN_STEPS, evaluationAccuracy, served, servedAccuracy, skewModel, stepsDone, trainLoop } from './training';

describe('try-this entries, from the default state, as written', () => {
  it('try-this 1: calm, training reaches step 34 at 69.4 samples per second and 0 requests are late; frozen, step 26 and 31 late', () => {
    const open = loopOpening();
    expect(open).toEqual({ batch: 8, stall: false });
    const run = trainLoop(open.batch);
    expect(sig(run.samplesPerSecond, 3)).toBe('69.4');
    const arrivals = makeArrivals(ARRIVAL_SEED, 20, LOOP_HORIZON_MS);
    const calm = servingSim(arrivals, { lambda: 20, maxBatch: 1, maxWaitMs: 0, stall: null }, LOOP_HORIZON_MS);
    const frozen = servingSim(arrivals, { lambda: 20, maxBatch: 1, maxWaitMs: 0, stall: [1000, 2000] }, LOOP_HORIZON_MS);
    expect(stepsDone(4, 0, run.stepSeconds, TRAIN_STEPS)).toBe(34);
    expect(stepsDone(4, 1, run.stepSeconds, TRAIN_STEPS)).toBe(26);
    expect(lateCount(stateAtMs(calm, LOOP_HORIZON_MS), arrivals, LATENCY_BUDGET_MS)).toBe(0);
    expect(lateCount(stateAtMs(frozen, LOOP_HORIZON_MS), arrivals, LATENCY_BUDGET_MS)).toBe(31);
    const end = stateAtMs(frozen, LOOP_HORIZON_MS);
    const text = expectCaption(loopCaption({ now: LOOP_HORIZON_MS, steps: 26, loss: run.loss[26], samplesPerSecond: run.samplesPerSecond, frozen: false, stats: servingStats(end, arrivals), late: 31 }));
    expect(text).toContain('finished 26 steps');
    expect(text).toContain('31 of them over 100 ms');
  });

  it('try-this 2: training state at 1 billion parameters is 16.0 GB, inference 2.0 GB, ratio 8x; 7 billion in training is 112 GB and does not fit 80 GB', () => {
    const open = memoryOpening();
    expect(open.regime).toBe('training');
    const gb = (n: number) => bytes(n, { base: 1000 });
    expect(gb(memoryFigures(1e9, 'training').total)).toBe('16.0 GB');
    expect(gb(memoryFigures(1e9, 'inference').total)).toBe('2.0 GB');
    expect(trainingRatio()).toBe(8);
    const big = memoryFigures(7e9, 'training');
    expect(gb(big.total)).toBe('112.0 GB');
    expect(big.fits).toBe(false);
    const text = expectCaption(memoryCaption({ parameters: 7e9, regime: 'training', total: big.total, bytesPerParameter: 16, fits: big.fits, device: DEVICE_BYTES, ratio: 8 }));
    expect(text).toContain('which does not fit an illustrative 80.0 GB device');
  });

  it('try-this 3: at 120/s, B = 8, T = 10 ms p99 is about 65 ms and in budget; B = 1 is overloaded; the knee is 4', () => {
    const open = servingOpening();
    expect(open).toMatchObject({ lambda: 120, maxBatch: 8, maxWaitMs: 10 });
    const arrivals = makeArrivals(ARRIVAL_SEED, open.lambda, HORIZON_MS);
    const stats = servingStats(runServing(arrivals, { lambda: 120, maxBatch: 8, maxWaitMs: 10 }, HORIZON_MS), arrivals);
    expect(Math.round(stats.p99)).toBe(65);
    expect(stats.p99).toBeLessThan(LATENCY_BUDGET_MS);
    expect(overloaded(120, 1)).toBe(true);
    expect(kneeBatch(120, 32)).toBe(4);
    const one = servingStats(runServing(arrivals, { lambda: 120, maxBatch: 1, maxWaitMs: 10 }, HORIZON_MS), arrivals);
    const text = expectCaption(servingCaption({ lambda: 120, maxBatch: 1, maxWaitMs: 10, stats: one, arrivedPerSecond: (one.arrived * 1000) / HORIZON_MS, capacity: capacityPerSecond(1), overloaded: true, knee: 4 }));
    expect(text).toContain('Overloaded: the queue is growing.');
    expect(text).toContain('A max batch of 4 or more would keep up.');
  });

  it('try-this 3, second part: from B = 2 with T = 50 ms and 40/s, dragging B to 8 takes p99 from 72 to 80 ms and p50 from 33 to 66 ms with throughput near 42/s', () => {
    expect(lesson.tryThis[2]).toContain('p99 rises from 72 to 80 ms and p50 from 33 to 66 ms');
    const arrivals = makeArrivals(ARRIVAL_SEED, 40, HORIZON_MS);
    const at = (maxBatch: number) => servingStats(runServing(arrivals, { lambda: 40, maxBatch, maxWaitMs: 50 }, HORIZON_MS), arrivals);
    expect([at(2).p99, at(8).p99].map(Math.round)).toEqual([72, 80]);
    expect([at(2).p50, at(8).p50].map(Math.round)).toEqual([33, 66]);
    expect(Math.round(at(8).throughput)).toBe(42);
    const p99s = [2, 3, 4, 5, 6, 7, 8].map((b) => at(b).p99);
    for (let i = 1; i < p99s.length; i++) expect(p99s[i], `B = ${i + 2}`).toBeGreaterThanOrEqual(p99s[i - 1]);
  });

  it('the queueing check: the M/D/1 closed form at 20/s is 22 + 0.44 x 22 / (2 x 0.56) = 30.64 ms, there is none at or past 1000/22 per second, and the simulation sits above the bare service time', () => {
    expect(queueingCheck(makeArrivals(ARRIVAL_SEED, 20, HORIZON_MS), 20, HORIZON_MS).closedFormMs).toBeCloseTo(22 + (0.44 * 22) / (2 * 0.56), 9);
    const arrivals = makeArrivals(ARRIVAL_SEED, 50, HORIZON_MS);
    const past = queueingCheck(arrivals, 50, HORIZON_MS);
    expect(past.closedFormMs).toBeNull();
    expect(past.simulatedMs).toBeGreaterThan(serviceMs(1));
    const light = queueingCheck(makeArrivals(ARRIVAL_SEED, 20, HORIZON_MS), 20, HORIZON_MS);
    expect(light.simulatedMs).toBeGreaterThanOrEqual(serviceMs(1));
  });

  it('try-this 4: matching serves 92.8% like the offline evaluation; missing 50%; other statistics 73%', () => {
    expect(evaluationAccuracy()).toBe(0.9275);
    expect(servedAccuracy('matching')).toBe(0.9275);
    expect(servedAccuracy('missing')).toBe(0.5);
    expect(servedAccuracy('different')).toBe(0.73);
    const matching = expectCaption(skewCaption({ how: 'matching', drift: 0, served: 0.9275, evaluation: 0.9275 }));
    expect(matching).toContain('identical, same weights and same pipeline');
    const missing = expectCaption(skewCaption({ how: 'missing', drift: 0, served: 0.5, evaluation: 0.9275 }));
    expect(missing).toContain('50.0%');
    expect(missing).toContain('42.8 percentage points lower');
  });

  it('try-this 5: M = 3,600 s, C = 30 s: best simulated interval 400 steps (11,380 s) beside 465; M = 600 s with K = 1,000 raises the warning', () => {
    const open = checkpointOpening();
    expect(open).toEqual(CHECKPOINT_DEFAULT);
    const results = sweepIntervals(open);
    const best = bestInterval(results);
    expect(best.interval).toBe(400);
    expect(Math.round(best.expected)).toBe(11380);
    expect(Math.round(youngDaly(open))).toBe(465);
    expect(noProgress({ mtbf: 600, cost: 30 }, 1000)).toBe(true);
    const text = expectCaption(checkpointCaption({ mtbf: 600, cost: 30, interval: 1000, expected: 27891, best: 200, bestSeconds: 14075, youngDaly: 190, noProgress: true, ideal: idealSeconds }));
    expect(text).toContain('a cycle usually fails before it finishes');
    const ok = expectCaption(checkpointCaption({ mtbf: 3600, cost: 30, interval: 500, expected: results.find((r) => r.interval === 500)!.expected, best: 400, bestSeconds: best.expected, youngDaly: 465, noProgress: false, ideal: idealSeconds }));
    expect(ok).toContain('Checkpointing every 500 steps');
    expect(ok).toContain('The simulated best interval is 400 steps');
  });
});

describe('captions are computed from the model', () => {
  it('the serving caption names overload exactly when arrivals exceed capacity, for every max batch at 120 and at 400 per second', () => {
    for (const lambda of [120, 400]) {
      const arrivals = makeArrivals(ARRIVAL_SEED, lambda, HORIZON_MS);
      for (const maxBatch of [1, 2, 4, 8, 16, 32]) {
        const stats = servingStats(runServing(arrivals, { lambda, maxBatch, maxWaitMs: 10 }, HORIZON_MS), arrivals);
        const text = expectCaption(servingCaption({ lambda, maxBatch, maxWaitMs: 10, stats, arrivedPerSecond: (stats.arrived * 1000) / HORIZON_MS, capacity: capacityPerSecond(maxBatch), overloaded: overloaded(lambda, maxBatch), knee: kneeBatch(lambda, 32) }));
        expect(text.includes('Overloaded'), `${lambda} B ${maxBatch}`).toBe(overloaded(lambda, maxBatch));
        if (!overloaded(lambda, maxBatch)) {
          expect(text).toContain(`throughput ${sig(stats.throughput)}/s`);
          expect(text).toContain(`delivered ${sig((stats.arrived * 1000) / HORIZON_MS)}/s so far`);
        }
        if (lambda === 400) expect(text).toContain('No batch size up to 32 would keep up.');
      }
    }
  });

  it('the loop caption says "frozen" only inside the stall window', () => {
    const run = trainLoop(8);
    const arrivals = makeArrivals(ARRIVAL_SEED, 20, LOOP_HORIZON_MS);
    const stats = servingStats(runServing(arrivals, { lambda: 20, maxBatch: 1, maxWaitMs: 0 }, 500), arrivals);
    for (const frozen of [false, true]) {
      const text = expectCaption(loopCaption({ now: 1500, steps: 5, loss: run.loss[5], samplesPerSecond: run.samplesPerSecond, frozen, stats, late: 0 }));
      expect(text.includes('The machine is frozen right now')).toBe(frozen);
    }
  });

  it('the memory caption states the real bytes per parameter and the fit, at every stop and regime', () => {
    for (const regime of ['inference', 'training'] as const) {
      for (const parameters of [1e6, 1e7, 1e8, 1e9, 7e9, 1e10]) {
        const f = memoryFigures(parameters, regime);
        const text = expectCaption(memoryCaption({ parameters, regime, total: f.total, bytesPerParameter: bytesPerParameter(regime), fits: f.fits, device: DEVICE_BYTES, ratio: trainingRatio() }));
        expect(text).toContain(`at ${bytesPerParameter(regime)} bytes each`);
        expect(text.includes('which does not fit'), `${regime} ${parameters}`).toBe(!f.fits);
        expect(text).toContain(`${trainingRatio()}x the inference weights`);
      }
    }
  });
});

describe('quiz answers, from independent oracles', () => {
  it('Q2: at 40/s with a 50 ms timer, B from 2 to 8 raises capacity, leaves throughput at the arrival rate and raises p50 and p99 (so "lowers every latency" is false)', () => {
    for (let b = 1; b < 32; b++) expect(capacityPerSecond(b + 1)).toBeGreaterThan(capacityPerSecond(b));
    expect(lesson.quiz[1].q).toContain('40 requests per second');
    expect(lesson.quiz[1].q).toContain('50 ms');
    const arrivals = makeArrivals(ARRIVAL_SEED, 40, HORIZON_MS);
    const run = (maxBatch: number) => servingStats(runServing(arrivals, { lambda: 40, maxBatch, maxWaitMs: 50 }, HORIZON_MS), arrivals);
    const [small, big] = [run(2), run(8)];
    expect(overloaded(40, 2)).toBe(false);
    expect(Math.abs(big.throughput - small.throughput)).toBeLessThan(0.5);
    expect(Math.abs(big.throughput - (small.arrived * 1000) / HORIZON_MS)).toBeLessThan(1);
    expect(big.p50).toBeGreaterThan(small.p50);
    expect(big.p99).toBeGreaterThan(small.p99);
    expect([small.p50, big.p50, small.p99, big.p99].map(Math.round)).toEqual([33, 66, 72, 80]);
  });

  it('Q3: the memory options 2, 4 and 8 GB are the inference weights, a guess and the ratio; training state is 16 GB', () => {
    expect(memoryFigures(1e9, 'training').total / 1e9).toBe(16);
    expect(memoryFigures(1e9, 'inference').total / 1e9).toBe(2);
    expect(lesson.quiz[2].options[lesson.quiz[2].answer]).toBe('16 GB');
  });

  it('Q4: the same trained weights give 93% offline and 50% when the standardisation is missing', () => {
    expect(Math.round(evaluationAccuracy() * 100)).toBe(93);
    expect(servedAccuracy('missing')).toBe(0.5);
  });
});

describe('scenes', () => {
  it('every scene the Stage returns carries its own key', () => {
    const elements = sceneElements('training-vs-inference');
    expect(elements.map((e) => e.component)).toEqual(['MemoryScene', 'ServingScene', 'SkewScene', 'CheckpointScene', 'LoopScene']);
    for (const element of elements) expect(element.keyed, element.component).toBe(true);
  });
});

describe('statements the scenes make about their own flat lines', () => {
  it('samples per second is the same for every minibatch size in this model', () => {
    const rates = BATCH_SIZES.map((b) => trainLoop(b).samplesPerSecond);
    for (const r of rates) expect(r).toBeCloseTo(rates[0], 9);
  });

  it('with the pipeline missing, every point gets the same class and accuracy is 50% from drift -0.75 up; only a larger downward drift moves it', () => {
    const m = skewModel();
    for (const drift of DRIFT_STEPS.filter((d) => d >= -0.75)) {
      const classes = new Set(m.test.map(({ x }) => (m.net.predict(served([x[0] + drift, x[1]], 'missing', m)) > 0.5 ? 1 : 0)));
      expect(classes.size, `drift ${drift}`).toBe(1);
      expect(servedAccuracy('missing', drift)).toBe(0.5);
    }
    expect(servedAccuracy('missing', -3)).toBeGreaterThan(0.6);
  });
});
