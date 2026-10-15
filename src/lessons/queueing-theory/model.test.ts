import { describe, expect, it } from 'vitest';
import { CURVE_MARKS, LIVE_DEFAULT, MU, POOL_SERVERS, SHAPES, SHAPE_CV2, TICK_SECONDS, TOPOLOGIES, areaUnder, concurrency, createQueueSim, drainedRun, hyperBranches, littleRun, measure, mm1Multiple, parseRate, parseSeconds, picture, populationSteps, serviceTime, simulateQueue, sumOfTimes, theory, topologyTheory, type BatchOptions, type QueueState, type ServiceShape } from './model';
import { mulberry32 } from '../../core/random';

/** Long seeded runs get a generous limit, so a busy machine running several test suites at once does not fail them. */
const SIMULATION_TIMEOUT_MS = 90_000;
const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);

describe('closed forms, worked by hand', () => {
  it('M/M/1 at ρ = 0.8, μ = 10: L = 4, W = 0.5 s, Lq = 3.2, Wq = 0.4 s', () => {
    const t = theory(0.8, 'exp')!;
    expect([t.L, t.W, t.Lq, t.Wq].map((v) => Number(v.toFixed(12)))).toEqual([4, 0.5, 3.2, 0.4]);
  });

  it('Pollaczek-Khinchine: deterministic halves the M/M/1 wait, CV² = 4 multiplies it by 2.5', () => {
    const mm1 = theory(0.8, 'exp')!;
    expect(theory(0.8, 'det')!.Wq / mm1.Wq).toBeCloseTo(0.5, 12);
    expect(theory(0.8, 'hyper')!.Wq / mm1.Wq).toBeCloseTo(2.5, 12);
    expect(theory(0.8, 'det')!.factor).toBe(0.5);
    expect(theory(0.8, 'hyper')!.factor).toBe(2.5);
  });

  it('there is no steady state at ρ ≥ 1 (null, never a formula value)', () => {
    for (const rho of [1, 1.05, 1.2, 5]) for (const shape of SHAPES) expect(theory(rho, shape)).toBeNull();
    expect(theory(0.999, 'exp')).not.toBeNull();
  });

  it('W goes 2×, 5×, 10×, 20×, 100× the service time at 50%, 80%, 90%, 95%, 99%; 80% → 90% doubles it', () => {
    expect(CURVE_MARKS.map((r) => Math.round(mm1Multiple(r)))).toEqual([2, 5, 10, 20, 100]);
    expect(mm1Multiple(0.9) / mm1Multiple(0.8)).toBeCloseTo(2, 12);
    for (const rho of CURVE_MARKS) expect(theory(rho, 'exp')!.W * MU).toBeCloseTo(mm1Multiple(rho), 9);
  });

  it('Little\'s law holds inside the theory: L = λW and Lq = λWq at every ρ and shape', () => {
    for (const shape of SHAPES) {
      for (let rho = 0.05; rho < 1; rho += 0.05) {
        const t = theory(rho, shape)!;
        expect(t.L).toBeCloseTo(rho * MU * t.W, 9);
        expect(t.Lq).toBeCloseTo(rho * MU * t.Wq, 9);
      }
    }
  });

  it('the hyper-exponential has mean 1/μ and CV² = 4 from its own branches (moments computed by hand)', () => {
    const { p1, rate1, rate2 } = hyperBranches(MU, 4);
    const mean = p1 / rate1 + (1 - p1) / rate2;
    const second = (2 * p1) / rate1 ** 2 + (2 * (1 - p1)) / rate2 ** 2;
    expect(mean).toBeCloseTo(1 / MU, 12);
    expect(second / mean ** 2 - 1).toBeCloseTo(4, 10);
  });

});

const o = (patch: Partial<BatchOptions>): BatchOptions => ({
  lambda: 5, mu: MU, shape: 'exp', servers: 1, layout: 'pool', jobs: 200_000, seed: 1, ...patch,
});

/** Mean over seeds of W, Wq and L (L from the event sweep, never from λ·W). */
function measuredMeans(options: Partial<BatchOptions>, seeds: readonly number[]) {
  let W = 0;
  let Wq = 0;
  let L = 0;
  for (const seed of seeds) {
    const run = simulateQueue(o({ ...options, seed }));
    const last = run.departure.reduce((m, d) => Math.max(m, d), 0);
    W += run.meanSystem / seeds.length;
    Wq += run.meanWait / seeds.length;
    L += areaUnder(run.arrival, run.departure) / last / seeds.length;
  }
  return { W, Wq, L };
}

describe('closed forms vs seeded simulation (20 seeds × 200,000 jobs)', { timeout: SIMULATION_TIMEOUT_MS }, () => {
  it('M/M/1 and M/D/1 match W, Wq and L within 3% at ρ = 0.3, 0.5, 0.7', () => {
    for (const shape of ['exp', 'det'] as const) {
      for (const rho of [0.3, 0.5, 0.7]) {
        const t = theory(rho, shape)!;
        const m = measuredMeans({ lambda: rho * MU, shape }, SEEDS);
        expect(Math.abs(m.W / t.W - 1), `${shape} ρ=${rho} W`).toBeLessThan(0.03);
        expect(Math.abs(m.Wq / t.Wq - 1), `${shape} ρ=${rho} Wq`).toBeLessThan(0.03);
        expect(Math.abs(m.L / t.L - 1), `${shape} ρ=${rho} L`).toBeLessThan(0.03);
      }
    }
  });

  it('at ρ = 0.9 the match is within 10% (waits are autocorrelated, so the averages converge slowly)', () => {
    for (const shape of ['exp', 'det'] as const) {
      const t = theory(0.9, shape)!;
      const m = measuredMeans({ lambda: 0.9 * MU, shape }, SEEDS);
      expect(Math.abs(m.W / t.W - 1), `${shape} W`).toBeLessThan(0.1);
      expect(Math.abs(m.Wq / t.Wq - 1), `${shape} Wq`).toBeLessThan(0.1);
    }
  });

  it('Pollaczek-Khinchine for CV² = 0, 1 and 4 (hyper-exponential built as a two-branch mixture): within 3% at ρ = 0.5, 10% at 0.7', () => {
    for (const shape of SHAPES) {
      const t5 = theory(0.5, shape)!;
      const m5 = measuredMeans({ lambda: 0.5 * MU, shape }, SEEDS);
      expect(Math.abs(m5.Wq / t5.Wq - 1), `${shape} ρ=0.5`).toBeLessThan(0.03);
      const t7 = theory(0.7, shape)!;
      const m7 = measuredMeans({ lambda: 0.7 * MU, shape }, SEEDS);
      expect(Math.abs(m7.Wq / t7.Wq - 1), `${shape} ρ=0.7`).toBeLessThan(0.1);
    }
  });

  it('the service samplers have the stated mean and CV²', () => {
    for (const shape of SHAPES) {
      const rnd = mulberry32(3);
      const xs = Array.from({ length: 400_000 }, () => serviceTime(shape, MU, rnd));
      const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
      const cv2 = xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length / mean ** 2;
      expect(mean * MU).toBeCloseTo(1, 1);
      expect(cv2).toBeGreaterThan(SHAPE_CV2[shape] - 0.1 * Math.max(1, SHAPE_CV2[shape]));
      expect(cv2).toBeLessThan(SHAPE_CV2[shape] + 0.1 * Math.max(1, SHAPE_CV2[shape]));
    }
  });
});

describe('Little\'s identity is exact once the system has drained', () => {
  it('∫N dt (event sweep) equals Σ time in system to 1e-9 (relative) for every boundary, ρ and seed', () => {
    for (const rho of [0.2, 0.5, 0.8, 0.95]) {
      for (const seed of [1, 2, 3, 4, 5]) {
        const run = drainedRun({ rho, horizon: 60, seed });
        for (const boundary of ['system', 'queue', 'server'] as const) {
          const l = littleRun(run, boundary);
          expect(Math.abs(l.area - l.sum), `${boundary} ρ=${rho} seed=${seed}`).toBeLessThanOrEqual(1e-9 * Math.max(1, l.sum));
          expect(Math.abs(l.L - l.lambda * l.W)).toBeLessThanOrEqual(1e-9 * Math.max(1, l.L));
        }
      }
    }
  });

  it('a broken sum (one job dropped) no longer matches the area', () => {
    const run = drainedRun({ rho: 0.7, horizon: 30, seed: 1 });
    const area = areaUnder(run.arrival, run.departure);
    expect(Math.abs(area - sumOfTimes(run.arrival, run.departure))).toBeLessThan(1e-9 * area);
    for (const dropped of [0, 5, run.arrival.length - 1]) {
      expect(Math.abs(area - sumOfTimes(run.arrival, run.departure, dropped)), `dropped ${dropped}`).toBeGreaterThan(1e-6);
    }
  });

  it('the area sweep itself is right on a hand-worked case', () => {
    // jobs present over [0,2), [1,3), [5,6): N = 1,2,1,0,1 → 1·1 + 2·1 + 1·1 + 0·2 + 1·1 = 5
    expect(areaUnder([0, 1, 5], [2, 3, 6])).toBe(5);
    expect(populationSteps([0, 1, 5], [2, 3, 6])).toEqual([[0, 0], [0, 1], [1, 2], [2, 1], [3, 0], [5, 1], [6, 0]]);
  });

  it('server-only L is the measured utilisation and equals λ·E[S] (≈ ρ) on a long drained run', () => {
    const run = drainedRun({ rho: 0.6, horizon: 4000, seed: 2 });
    const l = littleRun(run, 'server');
    expect(Math.abs(l.L - 0.6)).toBeLessThan(0.03);
    expect(l.L).toBeCloseTo(l.lambda * l.W, 9);
  });

  it('queue-only Lq = λ·Wq and system L = Lq + L_server', () => {
    const run = drainedRun({ rho: 0.8, horizon: 200, seed: 3 });
    const [sys, q, srv] = (['system', 'queue', 'server'] as const).map((b) => littleRun(run, b));
    expect(q.L).toBeCloseTo(q.lambda * q.W, 9);
    expect(sys.L).toBeCloseTo(q.L + srv.L, 9);
  });
});

describe('one fast server or a pool', { timeout: SIMULATION_TIMEOUT_MS }, () => {
  const rhos = Array.from({ length: 19 }, (_, i) => (i + 1) * 0.05).concat([0.97]);

  it('the mean time in system orders split > pool > one fast server at 20 values of ρ', () => {
    for (const rho of rhos) {
      const [split, pool, fast] = TOPOLOGIES.map((t) => topologyTheory(t, rho).W);
      expect(split, `ρ=${rho}`).toBeGreaterThan(pool);
      expect(pool, `ρ=${rho}`).toBeGreaterThan(fast);
    }
  });

  it('the mean queueing wait orders split > fast server > pool at 20 values of ρ (Erlang C waits less often than ρ)', () => {
    for (const rho of rhos) {
      const [split, pool, fast] = TOPOLOGIES.map((t) => topologyTheory(t, rho));
      expect(split.Wq, `ρ=${rho}`).toBeGreaterThan(fast.Wq);
      expect(fast.Wq, `ρ=${rho}`).toBeGreaterThan(pool.Wq);
      expect(pool.waits).toBeLessThan(rho);
    }
  });

  it('each topology\'s analytic mean wait and time in system match a brute-force simulation within 4% (≥ 8 seeds × 100,000 jobs)', () => {
    for (const rho of [0.4, 0.7, 0.85]) {
      const lambda = POOL_SERVERS * rho * MU;
      const cases: [string, Partial<BatchOptions>][] = [
        ['split', { servers: POOL_SERVERS, layout: 'split' }],
        ['pool', { servers: POOL_SERVERS, layout: 'pool' }],
        ['fast', { servers: 1, mu: POOL_SERVERS * MU, layout: 'pool' }],
      ];
      for (const [name, patch] of cases) {
        let Wq = 0;
        let W = 0;
        const seeds = [1, 2, 3, 4, 5, 6, 7, 8];
        for (const seed of seeds) {
          const run = simulateQueue(o({ lambda, jobs: 100_000, seed, ...patch }));
          Wq += run.meanWait / seeds.length;
          W += run.meanSystem / seeds.length;
        }
        const t = topologyTheory(name as 'split' | 'pool' | 'fast', rho);
        expect(Math.abs(W / t.W - 1), `${name} ρ=${rho} W`).toBeLessThan(0.04);
        expect(Math.abs(Wq / t.Wq - 1), `${name} ρ=${rho} Wq`).toBeLessThan(0.08);
      }
    }
  });
});

describe('the live sim: exact events on a fixed tick', { timeout: SIMULATION_TIMEOUT_MS }, () => {
  const config = { rho: LIVE_DEFAULT.rho, shape: LIVE_DEFAULT.shape };

  /** An independent measurement: loop over the jobs and clip each interval to [0, t]. */
  function brute(s: QueueState) {
    const { log, t } = s;
    let done = 0;
    let wSum = 0;
    let wqSum = 0;
    let areaSys = 0;
    let areaQ = 0;
    let busy = 0;
    for (let i = 0; i < log.arrival.length; i++) {
      const a = log.arrival[i];
      const st = log.start[i];
      const d = log.departure[i];
      if (a > t) continue;
      if (d <= t) {
        done++;
        wSum += d - a;
        wqSum += st - a;
      }
      areaSys += Math.min(d, t) - a;
      areaQ += Math.min(st, t) - a;
      busy += Math.max(0, Math.min(d, t) - st);
    }
    return { done, W: done ? wSum / done : null, Wq: done ? wqSum / done : null, L: areaSys / t, Lq: areaQ / t, busy: busy / t };
  }

  it('same seed, same history; the measured numbers equal a per-job brute force at 40 random ticks', () => {
    const sim = createQueueSim(config, 7);
    sim.run(20_000);
    const again = createQueueSim(config, 7);
    again.run(20_000);
    expect(again.state.log.arrival).toEqual(sim.state.log.arrival);
    const rnd = mulberry32(1);
    for (let i = 0; i < 40; i++) {
      const s = sim.at(1 + Math.floor(rnd() * 20_000))!;
      const m = measure(s);
      const b = brute(s);
      expect(m.done).toBe(b.done);
      expect(m.W === null ? null : Number(m.W.toFixed(9))).toEqual(b.W === null ? null : Number(b.W.toFixed(9)));
      expect(m.Wq === null ? null : Number(m.Wq.toFixed(9))).toEqual(b.Wq === null ? null : Number(b.Wq.toFixed(9)));
      expect(m.L).toBeCloseTo(b.L, 9);
      expect(m.Lq).toBeCloseTo(b.Lq, 9);
      expect(m.busy).toBeCloseTo(b.busy, 9);
    }
  });

  it('tick size changes when the picture updates, not the measured waits (5 ms vs 50 ms vs 250 ms ticks over 60 s)', () => {
    const results = [TICK_SECONDS, 0.05, 0.25].map((dt) => {
      const sim = createQueueSim(config, 11, dt);
      sim.run(Math.round(60 / dt));
      return { dt, state: sim.state, measured: measure(sim.state) };
    });
    for (const r of results) expect(r.state.t).toBeCloseTo(60, 9);
    for (const r of results.slice(1)) {
      expect(r.measured.arrived).toBe(results[0].measured.arrived);
      expect(r.measured.done).toBe(results[0].measured.done);
      expect(r.measured.W).toBeCloseTo(results[0].measured.W!, 9);
      expect(r.measured.L).toBeCloseTo(results[0].measured.L!, 9);
    }
  });

  it('the jobs are the same stream the batch simulator draws for a single FIFO server (same seed, exact arrays)', () => {
    const sim = createQueueSim(config, 5);
    sim.run(Math.round(120 / TICK_SECONDS));
    const log = sim.state.log;
    const batch = simulateQueue(o({ lambda: config.rho * MU, jobs: log.arrival.length, seed: 5, shape: config.shape }));
    for (let i = 0; i < log.arrival.length; i++) {
      expect(log.arrival[i]).toBeCloseTo(batch.arrival[i], 9);
      expect(log.start[i]).toBeCloseTo(batch.start[i], 9);
      expect(log.departure[i]).toBeCloseTo(batch.departure[i], 9);
    }
  });

  it('bookkeeping invariants hold at every tick over 120 s for every shape, including past ρ = 1', () => {
    for (const shape of SHAPES) {
      for (const rho of [0.05, 0.5, 0.95, 1, 1.2]) {
        const sim = createQueueSim({ rho, shape: shape as ServiceShape }, 3);
        sim.run(Math.round(120 / TICK_SECONDS));
        expect(sim.violation, `${shape} ρ=${rho}`).toBeNull();
        const s = sim.state;
        expect(s.started - s.completed).toBeLessThanOrEqual(1);
        const p = picture(s);
        expect(p.waiting).toBe(s.generated - s.started);
        expect(p.serving === null).toBe(s.started === s.completed);
      }
    }
  });

  it('past ρ = 1 the queue is still growing (no steady state), while ρ = 0.5 stays short', () => {
    const grow = createQueueSim({ rho: 1.2, shape: 'exp' }, 2);
    grow.run(Math.round(300 / TICK_SECONDS));
    expect(picture(grow.state).waiting).toBeGreaterThan(30);
    const calm = createQueueSim({ rho: 0.5, shape: 'exp' }, 2);
    calm.run(Math.round(300 / TICK_SECONDS));
    expect(picture(calm.state).waiting).toBeLessThan(30);
  });

  it('every shape\'s measured numbers settle on the closed form (one long run, within 10%)', () => {
    for (const shape of SHAPES) {
      const sim = createQueueSim({ rho: 0.5, shape }, 9);
      sim.run(Math.round(40_000 / TICK_SECONDS));
      const m = measure(sim.state);
      const t = theory(0.5, shape)!;
      expect(Math.abs(m.W! / t.W - 1), shape).toBeLessThan(0.1);
      expect(Math.abs(m.L! / t.L - 1), shape).toBeLessThan(0.1);
      expect(Math.abs(m.busy! - 0.5)).toBeLessThan(0.03);
    }
  });
});

describe('the sizing calculator', () => {
  it('200 req/s × 0.05 s is 10 in flight and 1,200 req/s × 25 ms is 30', () => {
    expect(concurrency(200, 0.05)).toBeCloseTo(10, 12);
    expect(concurrency(1200, 0.025)).toBeCloseTo(30, 12);
    const [rate, seconds] = [parseRate('200'), parseSeconds('0.05')];
    expect(rate).toEqual({ ok: true, value: 200 });
    expect(seconds).toEqual({ ok: true, value: 0.05 });
  });

  it('refuses 0, negatives, over 1e6 requests/s, over 3,600 s, exponents, Infinity, units and text, with a reason each', () => {
    for (const bad of ['0', '0.0', '-5', '1000001', '1e3', 'Infinity', 'NaN', '', '  ', '200 req/s', 'abc', '+5', '.5', '5.', '1,000']) {
      const r = parseRate(bad);
      expect(r.ok, JSON.stringify(bad)).toBe(false);
      if (!r.ok) expect(r.error.length).toBeGreaterThan(5);
    }
    for (const bad of ['0', '-0.1', '3600.01', '1e2', 'Infinity', '50ms', '']) expect(parseSeconds(bad).ok, JSON.stringify(bad)).toBe(false);
    expect(parseRate('1000000')).toEqual({ ok: true, value: 1_000_000 });
    expect(parseSeconds('3600')).toEqual({ ok: true, value: 3600 });
  });
});
