import { describe, expect, it } from 'vitest';
import { captionText as text } from '../../core/testing/captions';
import { sig } from '../distributions/fmt';
import { curveCaption, littleCaption, liveCaption, poolCaption, sizingCaption } from './frames';
import lesson from './index';
import {
  CURVE_MARKS, LITTLE_DEFAULT, LIVE_DEFAULT, MU, POOL_DEFAULT, POOL_SERVERS, QUEUE_ICONS, RHO_RANGE, SHAPES, SHAPE_CV2, TOPOLOGIES, TOPOLOGY_NAME,
  concurrency, createQueueSim, drainedRun, littleRun, measure, mm1Multiple, picture, simulateQueue, theory, topologyTheory, type ServiceShape,
} from './model';

const SIMULATION_TIMEOUT_MS = 90_000;
const rhos = Array.from({ length: 19 }, (_, i) => (i + 1) * 0.05);

describe('try-this entries, from the default state, as written', () => {
  it('try-this 1: M/M/1 at ρ = 80% reads W = 0.5 s (five service times), and ρ = 90% doubles it to 1 s', () => {
    expect(LIVE_DEFAULT).toMatchObject({ rho: 0.8, shape: 'exp' });
    const at80 = theory(LIVE_DEFAULT.rho, LIVE_DEFAULT.shape)!;
    expect(at80.W).toBeCloseTo(0.5, 12);
    expect(at80.W * MU).toBeCloseTo(5, 12);
    const at90 = theory(0.9, LIVE_DEFAULT.shape)!;
    expect(at90.W).toBeCloseTo(1, 12);
    expect(at90.W / at80.W).toBeCloseTo(2, 12);
    const c = text(liveCaption(LIVE_DEFAULT.rho, LIVE_DEFAULT.shape));
    expect(c).toContain('W = 0.5 s');
    expect(c).toContain('5 service times');
    expect(text(liveCaption(0.9, LIVE_DEFAULT.shape))).toContain('W = 1 s');
  });

  it('try-this 2: at ρ = 80% the wait Wq is 0.4 s for M/M/1, 0.2 s for deterministic and 1 s for high variance', () => {
    expect(theory(0.8, 'exp')!.Wq).toBeCloseTo(0.4, 12);
    expect(theory(0.8, 'det')!.Wq).toBeCloseTo(0.2, 12);
    expect(theory(0.8, 'hyper')!.Wq).toBeCloseTo(1, 12);
  });

  it('try-this 3: at ρ = 120% theory is null and a run from the default seed has far more jobs waiting than the icons show', () => {
    expect(RHO_RANGE.max).toBeCloseTo(1.2, 12);
    expect(theory(RHO_RANGE.max, LIVE_DEFAULT.shape)).toBeNull();
    expect(text(liveCaption(RHO_RANGE.max, LIVE_DEFAULT.shape))).toContain('no steady state');
    const sim = createQueueSim({ rho: RHO_RANGE.max, shape: LIVE_DEFAULT.shape }, LIVE_DEFAULT.seed);
    sim.run(Math.round(60 / 0.005));
    expect(picture(sim.state).waiting).toBeGreaterThan(QUEUE_ICONS.wide);
    const later = createQueueSim({ rho: RHO_RANGE.max, shape: LIVE_DEFAULT.shape }, LIVE_DEFAULT.seed);
    later.run(Math.round(120 / 0.005));
    expect(picture(later.state).waiting).toBeGreaterThan(picture(sim.state).waiting);
  });

  it('try-this 4: at the default the area and the sum of times agree to rounding, and queue-only gives Lq = λ·Wq', () => {
    const run = drainedRun({ rho: LITTLE_DEFAULT.rho, horizon: LITTLE_DEFAULT.horizon, seed: LITTLE_DEFAULT.seed });
    const system = littleRun(run, LITTLE_DEFAULT.boundary);
    expect(Math.abs(system.area - system.sum)).toBeLessThanOrEqual(1e-9 * system.sum);
    const queue = littleRun(run, 'queue');
    expect(queue.L).toBeCloseTo(queue.lambda * queue.W, 9);
    expect(text(littleCaption(system))).toContain(`λ·W = ${sig(system.lambda)} × ${sig(system.W)}`);
  });

  it('try-this 5: at ρ = 70% the shared queue waits least and the single fast server has the shortest time in system', () => {
    const [split, pool, fast] = TOPOLOGIES.map((t) => topologyTheory(t, POOL_DEFAULT.rho));
    expect(pool.Wq).toBeLessThan(fast.Wq);
    expect(fast.Wq).toBeLessThan(split.Wq);
    expect(fast.W).toBeLessThan(pool.W);
    expect(pool.W).toBeLessThan(split.W);
    const c = text(poolCaption(POOL_DEFAULT.rho));
    expect(c).toContain('The shared queue waits least, but the fast server finishes each job 4× sooner');
  });
});

describe('captions are computed from the model', () => {
  it('the live caption quotes theory at ρ = 5%, 80%, 95%, 100% and 120% for every shape, and says "no steady state" exactly when theory is null', () => {
    for (const shape of SHAPES) {
      for (const rho of [0.05, 0.8, 0.95, 1, 1.2]) {
        const t = theory(rho, shape);
        const c = text(liveCaption(rho, shape as ServiceShape));
        expect(c.includes('no steady state'), `${shape} ρ=${rho}`).toBe(t === null);
        if (t) {
          expect(c).toContain(`W = ${sig(t.W)} s`);
          expect(c).toContain(`${sig(t.W * MU)} service times`);
          expect(c).toContain(`${sig(t.L)} jobs in the system`);
          expect(c.includes('Pollaczek-Khinchine'), `${shape} ρ=${rho}`).toBe(shape !== 'exp');
          if (shape !== 'exp') expect(c).toContain(`${sig(t.factor)}× the M/M/1 wait`);
        } else {
          expect(c).not.toContain('W =');
          expect(c.includes('keeps growing'), `ρ=${rho}`).toBe(rho > 1);
          if (rho > 1) expect(c).toContain(`${sig((rho - 1) * MU)} jobs/s`);
        }
      }
    }
  });

  it('the Little caption quotes the area, the sum and L = λ·W for every boundary', () => {
    for (const seed of [1, 2]) {
      const run = drainedRun({ rho: 0.7, horizon: 30, seed });
      for (const boundary of ['system', 'queue', 'server'] as const) {
        const l = littleRun(run, boundary);
        const c = text(littleCaption(l));
        expect(c).toContain(`area under N(t) is ${sig(l.area, 6)} job·s`);
        expect(c).toContain(`sum of the jobs' times is ${sig(l.sum, 6)} job·s`);
        expect(c).toContain(`L = ${sig(l.L)} = λ·W = ${sig(l.lambda)} × ${sig(l.W)}`);
      }
    }
  });

  it('the pool caption names the longest and shortest layouts and the ratio from the analytic numbers at every ρ in the slider', () => {
    for (const rho of rhos) {
      const c = text(poolCaption(rho));
      const W = Object.fromEntries(TOPOLOGIES.map((t) => [t, topologyTheory(t, rho).W]));
      expect(c).toContain(`longest for ${TOPOLOGY_NAME.split} (${sig(W.split)} s)`);
      expect(c).toContain(`shortest for ${TOPOLOGY_NAME.fast} (${sig(W.fast)} s), ${sig(W.split / W.fast)}× less`);
      expect(c).toContain(`${TOPOLOGY_NAME.split}, then ${TOPOLOGY_NAME.fast}, then ${TOPOLOGY_NAME.pool}`);
    }
  });

  it('the curve caption quotes 1/(1 − ρ) and what ten more points do, only where that stays below 100%', () => {
    expect(text(curveCaption(0.8))).toContain('5× its service time');
    expect(text(curveCaption(0.8))).toContain('make that 10× (2× as long)');
    expect(text(curveCaption(0.5))).toContain('2× its service time');
    expect(text(curveCaption(0.5))).toContain('make that 2.5× (1.25× as long)');
    expect(text(curveCaption(0.99))).toContain('100× its service time');
    expect(text(curveCaption(0.99))).not.toContain('Ten more points');
    expect(text(curveCaption(0.9))).not.toContain('Ten more points');
    for (const rho of CURVE_MARKS) expect(text(curveCaption(rho))).toContain(`${sig(mm1Multiple(rho))}×`);
  });

  it('the sizing caption quotes rate × seconds = in flight', () => {
    expect(text(sizingCaption(200, 0.05, concurrency(200, 0.05)))).toContain('200 requests/s × 0.05 s each is 10 requests in flight');
  });
});

describe('quiz answers, from independent oracles', { timeout: SIMULATION_TIMEOUT_MS }, () => {
  it('Q1: 80% → 90% doubles M/M/1 time in system (5 → 10 service times), and 50% → 90% is 5×', () => {
    expect(mm1Multiple(0.8)).toBeCloseTo(5, 12);
    expect(mm1Multiple(0.9)).toBeCloseTo(10, 12);
    expect(mm1Multiple(0.9) / mm1Multiple(0.5)).toBeCloseTo(5, 12);
    const w = (rho: number) => {
      let sum = 0;
      for (let seed = 1; seed <= 8; seed++) sum += simulateQueue({ lambda: rho * MU, mu: MU, shape: 'exp', servers: 1, layout: 'pool', jobs: 150_000, seed }).meanSystem / 8;
      return sum;
    };
    expect(Math.abs(w(0.9) / w(0.8) / 2 - 1)).toBeLessThan(0.15);
  });

  it('Q2: 1,200 requests/s × 25 ms is 30 in flight; the distractors are 1,200/25 = 48, ×10 and the rate itself', () => {
    expect(concurrency(1200, 0.025)).toBeCloseTo(30, 12);
    expect(1200 / 25).toBe(48);
    expect(lesson.quiz[1].options).toEqual(['30', '48', '300', '1,200']);
    expect(lesson.quiz[1].options[lesson.quiz[1].answer]).toBe('30');
  });

  it('Q3: CV² = 4 waits 2.5 times as long as exponential service at the same ρ, in theory and in 8 seeded runs of 150,000 jobs', () => {
    expect(SHAPE_CV2.hyper).toBe(4);
    expect(theory(0.5, 'hyper')!.Wq / theory(0.5, 'exp')!.Wq).toBeCloseTo(2.5, 12);
    const wq = (shape: ServiceShape) => {
      let sum = 0;
      for (let seed = 1; seed <= 8; seed++) sum += simulateQueue({ lambda: 0.5 * MU, mu: MU, shape, servers: 1, layout: 'pool', jobs: 150_000, seed }).meanWait / 8;
      return sum;
    };
    expect(Math.abs(wq('hyper') / wq('exp') / 2.5 - 1)).toBeLessThan(0.1);
  });

  it('Q4: four servers behind one queue wait less than four separate queues at ρ = 70%, in theory and in simulation', () => {
    const [split, pool] = (['split', 'pool'] as const).map((t) => topologyTheory(t, 0.7));
    expect(pool.Wq).toBeLessThan(split.Wq);
    const wait = (layout: 'split' | 'pool') => {
      let sum = 0;
      for (let seed = 1; seed <= 6; seed++) sum += simulateQueue({ lambda: POOL_SERVERS * 0.7 * MU, mu: MU, shape: 'exp', servers: POOL_SERVERS, layout, jobs: 100_000, seed }).meanWait / 6;
      return sum;
    };
    expect(wait('pool')).toBeLessThan(wait('split'));
    expect(Math.abs(wait('pool') / pool.Wq - 1)).toBeLessThan(0.1);
  });
});

describe('hidden controls do not feed numbers', () => {
  it('the drained run of the Little scene is always the exponential M/M/1 run (the shape picker lives only in scene 1)', () => {
    const a = drainedRun({ rho: 0.7, horizon: 30, seed: 1 });
    const b = drainedRun({ rho: 0.7, horizon: 30, seed: 1, shape: 'exp' });
    const c = drainedRun({ rho: 0.7, horizon: 30, seed: 1, shape: 'hyper' });
    expect(a).toEqual(b);
    expect(a.departure).not.toEqual(c.departure);
  });

  it('the analytic columns of the pool scene do not depend on the seed that only drives the measured columns', () => {
    expect(topologyTheory('pool', 0.7)).toEqual(topologyTheory('pool', 0.7));
    const run1 = simulateQueue({ lambda: 28, mu: MU, shape: 'exp', servers: 4, layout: 'pool', jobs: 20_000, seed: 1 });
    const run2 = simulateQueue({ lambda: 28, mu: MU, shape: 'exp', servers: 4, layout: 'pool', jobs: 20_000, seed: 2 });
    expect(run1.meanWait).not.toBe(run2.meanWait);
  });

  it('the measured stats of a live run are null until there is something to measure, never NaN', () => {
    const sim = createQueueSim({ rho: 0.05, shape: 'exp' }, 1);
    const m = measure(sim.state);
    expect(m.W).toBeNull();
    expect(m.L).toBeNull();
    sim.run(2000);
    const later = measure(sim.state);
    for (const v of [later.L, later.Lq, later.busy]) expect(Number.isFinite(v!)).toBe(true);
  });
});
