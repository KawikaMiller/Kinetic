import { describe, expect, it } from 'vitest';
import { poisson } from '../../core/distributions';
import { mulberry32 } from '../../core/random';
import {
  BROKEN_SEED, CAPACITY, COLLAPSE_WINDOW, JITTER, LOAD, LONG_OUTAGE, QMAX, RATIO, RETRIES, RUN_TICKS, SWEEP_SEEDS, TIMEOUT, TOKEN_CAP, TRIGGER, TRIGGER_START,
  budgetedLoad, canSustain, collapseMechanism, collapseShare, collapsedSeeds, conservation, crossoverLoad, createMetaSim, defaultParams, drainTime, effectiveLoad,
  firstOrderTipping, initialState, phaseOf, queueLength, recoveryTick, runMeta, stepOnce, triggerForSeed, type MetaParams,
} from './model';

const params = (over: Partial<MetaParams> = {}): MetaParams => ({ ...defaultParams(), ...over });
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

describe('one tick, hand-worked', () => {
  const cohorts = () => ({
    ...initialState(),
    queue: [
      { enq: 90, att: 1, count: 60, dead: true },
      { enq: 99, att: 1, count: 90, dead: false },
    ],
  });
  const quiet = params({ lambda: 0, trigger: 0 });

  it('without cancelling: serve the abandoned 60 (wasted), then 40 of the live 90 (goodput); 50 stay queued', () => {
    const s = stepOnce(cohorts(), quiet, mulberry32(1), 100);
    expect([s.tick.wasted, s.tick.goodput, queueLength(s)]).toEqual([60, 40, 50]);
  });

  it('with cancelling: skip the abandoned 60 for free, serve all 90 live (goodput 90), 10 units idle, queue empty', () => {
    const s = stepOnce(cohorts(), { ...quiet, cancel: true }, mulberry32(1), 100);
    expect([s.tick.wasted, s.tick.goodput, s.tick.cancelled, queueLength(s)]).toEqual([0, 90, 60, 0]);
  });

  it('a live cohort that has waited the timeout turns abandoned and sends its retries next tick', () => {
    const start = { ...initialState(), queue: [{ enq: 96, att: 1, count: 30, dead: false }, { enq: 99, att: 1, count: 500, dead: false }] };
    const s = stepOnce(start, quiet, mulberry32(1), 100);
    expect(s.retries).toEqual([{ at: 101, att: 2, count: 30 }]);
    expect([s.tick.wasted, s.tick.goodput]).toEqual([30, 70]);
    expect(s.queue).toEqual([{ enq: 99, att: 1, count: 430, dead: false }]);
  });
});

describe('conservation, and the checker can fail', () => {
  it('holds every tick over 200 seeds, with and without each mitigation, across a trigger', () => {
    const mixes: Partial<MetaParams>[] = [{}, { cancel: true }, { budget: 0.1 }, { jitter: 4 }, { shed: 300 }, { cancel: true, budget: 0.3, jitter: 8, shed: 100 }];
    for (const mix of mixes) {
      for (let seed = 1; seed <= SWEEP_SEEDS; seed += 4) {
        const sim = createMetaSim(params({ ...mix, seed, trigger: triggerForSeed(seed) }));
        sim.run(120);
        expect(sim.violation, `${JSON.stringify(mix)} seed ${seed}`).toBeNull();
      }
    }
  });

  it('reports a break: a missing item, a spent-too-much tick, a fractional cohort', () => {
    const s = createMetaSim(params({ seed: 1 })).at(30)!;
    expect(conservation(s)).toBeNull();
    expect(conservation({ ...s, total: { ...s.total, goodput: s.total.goodput + 1 } })).toContain('is not served');
    expect(conservation({ ...s, total: { ...s.total, offered: s.total.offered + 1 } })).toContain('is not accepted');
    expect(conservation({ ...s, tick: { ...s.tick, goodput: 500 } })).toContain('units of');
    expect(conservation({ ...s, queue: [{ enq: 1, att: 1, count: 1.5, dead: false }] })).toContain('fractional');
  });
});

describe('Little\'s law as an independent check (stable run, no trigger, 50 seeds)', () => {
  it('the model queue equals a plain Lindley recursion and the sum of queue lengths equals the sum of item waits', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const rnd = mulberry32(seed);
      const arrivals = Array.from({ length: RUN_TICKS }, () => poisson(rnd, LOAD.default));
      // The oracle: one item-level FIFO queue, served at CAPACITY per tick, remembering when each item came.
      const items: number[] = [];
      let waits = 0;
      let queueSum = 0;
      const oracleQueue: number[] = [];
      let timedOut = false;
      arrivals.forEach((a, i) => {
        const tick = i + 1;
        for (let k = 0; k < a; k++) items.push(tick);
        const served = items.splice(0, CAPACITY);
        for (const enq of served) {
          waits += tick - enq;
          if (tick - enq >= TIMEOUT.default) timedOut = true;
        }
        oracleQueue.push(items.length);
        queueSum += items.length;
      });
      expect(timedOut, `seed ${seed}: the oracle assumes no timeout`).toBe(false);
      const run = createMetaSim(params({ seed, trigger: 0 }));
      run.run(RUN_TICKS);
      expect(run.history.slice(1).map(queueLength)).toEqual(oracleQueue);
      // Little: the area under the queue length is the total waiting time of the items (served or still waiting).
      const stillWaiting = items.reduce((n, enq) => n + (RUN_TICKS - enq + 1), 0);
      expect(queueSum).toBe(waits + stillWaiting);
    }
  });
});

describe('the sustaining loop: closed forms and what the model does', () => {
  it('retry multiplication: at lambda 70 and R 3 a collapsed tail sees about 280 arrivals a tick and spends all capacity on abandoned work', () => {
    const m = collapseMechanism(runMeta(params({ seed: BROKEN_SEED })));
    expect(effectiveLoad(70, 3)).toBe(280);
    expect(Math.abs(m.arrivals - 280)).toBeLessThan(8);
    expect(m.wastedShare).toBeGreaterThanOrEqual(0.95);
  });

  it('the sustain criterion: lambda (1 + R) >= mu, so the crossover is mu / (1 + R) = 25 at R = 3 (24 gives 96, 26 gives 104)', () => {
    expect(crossoverLoad(3)).toBe(25);
    expect(effectiveLoad(24, 3)).toBe(96);
    expect(effectiveLoad(26, 3)).toBe(104);
    expect(canSustain(24, 3)).toBe(false);
    expect(canSustain(26, 3)).toBe(true);
  });

  it('simulation near the crossover (d = 30): nothing collapses at 22 or below, almost everything at 27 or above, and the 50% point is between 24 and 26', () => {
    const share = (lambda: number) => collapseShare(params({ lambda }), 30, 100);
    expect(share(22)).toBe(0);
    expect(share(LOAD.min)).toBe(0);
    expect(share(27)).toBeGreaterThanOrEqual(0.95);
    expect(share(24)).toBeLessThan(0.5);
    expect(share(26)).toBeGreaterThan(0.5);
  });

  it('with R = 0 nothing amplifies: the queue drains and goodput returns (also at d = 30)', () => {
    for (const trigger of [10, 30]) expect(phaseOf(runMeta(params({ retries: 0, trigger, seed: 1 }))).phase).toBe('recovered');
  });

  it('tipping point: first order says 8 ticks, the model first collapses at 6 (0 of 200 at 5 or less, 99% or more from 8)', () => {
    expect(firstOrderTipping(70, 4)).toBe(8);
    expect(collapseShare(params(), 5)).toBe(0);
    expect(collapseShare(params(), 4)).toBe(0);
    expect(collapseShare(params(), 6)).toBeGreaterThan(0.4);
    expect(collapseShare(params(), 6)).toBeLessThan(0.8);
    expect(collapseShare(params(), 7)).toBeGreaterThan(0.95);
    for (const d of [8, 10, 14]) expect(collapseShare(params(), d)).toBeGreaterThanOrEqual(0.995);
  });
});

describe('rule 0: goodput is back to 90% of the load within 60 ticks after the trigger ends', () => {
  it('broken mode (no mitigation, R = 3, a seed-drawn trigger of 2 to 14 ticks): the lowest collapsed seed is pinned, 55% to 80% of 200 seeds collapse, never all', () => {
    const bad = collapsedSeeds(params());
    expect(bad[0]).toBe(BROKEN_SEED);
    expect(bad.length).toBeGreaterThan(0.55 * SWEEP_SEEDS);
    expect(bad.length).toBeLessThan(0.8 * SWEEP_SEEDS);
  });

  it('every collapsed seed is collapsed for the stated reason: arrivals at or above capacity and 95% of capacity on abandoned work', () => {
    const bad = collapsedSeeds(params());
    for (const seed of bad.slice(0, 40)) {
      const m = collapseMechanism(runMeta(params({ seed, trigger: triggerForSeed(seed) })));
      expect(m.arrivals, `seed ${seed}`).toBeGreaterThanOrEqual(CAPACITY);
      expect(m.wastedShare).toBeGreaterThanOrEqual(0.95);
    }
    const fine = runMeta(params({ seed: 2, trigger: 2 }));
    expect(collapseMechanism(fine).wastedShare).toBeLessThan(0.5);
  });

  it('each fix passes all 200 seeds: cancelling abandoned work, a 10% retry budget, shedding at 300', () => {
    for (const fix of [{ cancel: true }, { budget: 0.1 }, { shed: 300 }] as Partial<MetaParams>[]) expect(collapsedSeeds(params(fix)), JSON.stringify(fix)).toEqual([]);
  });

  it('backoff alone is not a fix: at d = 10 it still collapses on all 200 seeds; it only moves the tipping point (d = 6 falls, d = 7 and up stay collapsed)', () => {
    const jittered = params({ jitter: JITTER.default });
    expect(collapseShare(jittered, 10)).toBe(1);
    expect(collapseShare(jittered, 6)).toBeLessThan(collapseShare(params(), 6));
    expect(collapseShare(jittered, 7)).toBeGreaterThan(0.85);
    expect(collapseShare(jittered, 5)).toBe(0);
  });

  it('both regimes exist with margin: 0 of 200 collapse at d = 5 or less and at least 199 of 200 from d = 8', () => {
    expect(collapseShare(params(), 5)).toBe(0);
    expect(collapseShare(params(), 8)).toBeGreaterThanOrEqual(199 / 200);
  });
});

describe('what a retry budget and shedding do, as measured', () => {
  it('the bucket cap binds: at cap 10 no ratio from 0.1 to 0.7 collapses at d = 10, because at most 10 retries leave a tick (70 + 10 < 100)', () => {
    for (const ratio of [0.1, 0.3, 0.5, 0.7]) expect(collapseShare(params({ budget: ratio }), 10, 100), `ratio ${ratio}`).toBe(0);
    expect(budgetedLoad(70, 0.7, TOKEN_CAP)).toBe(80);
  });

  it('raise the cap and it fails where the closed form says: lambda + min(ratio lambda, cap) >= mu collapses (cap 30 gives exactly 100), below it recovers', () => {
    expect(budgetedLoad(70, 0.7, 30)).toBeCloseTo(100, 12);
    expect(collapseShare(params({ budget: 0.7, tokenCap: 30 }), 10, 100)).toBeGreaterThanOrEqual(0.95);
    expect(collapseShare(params({ budget: 0.7, tokenCap: 100 }), 10, 100)).toBe(1);
    expect(collapseShare(params({ budget: 0.7, tokenCap: 20 }), 10, 100)).toBeLessThan(0.1);
  });

  it('a long outage with a 10% budget (d = 60) is not metastable: it drains in about backlog / (mu - lambda_eff) = 130 ticks', () => {
    expect(budgetedLoad(70, 0.1)).toBeCloseTo(77, 12);
    expect(drainTime(60 * (70 - 20), 77)).toBeCloseTo(130.43, 2);
    const measured = Array.from({ length: 20 }, (_, k) => {
      const r = runMeta(params({ budget: 0.1, trigger: LONG_OUTAGE, seed: k + 1 }), 400);
      return recoveryTick(r)! - (TRIGGER_START + LONG_OUTAGE);
    });
    expect(Math.abs(mean(measured) - 130)).toBeLessThan(10);
    expect(drainTime(1, 100)).toBeNull();
  });

  it('the shed crossover is measured, near mu x Tc = 400 and not at it: never collapses at 440 or below, always from 480, and reaches 50% between 445 and 460', () => {
    const share = (q: number) => collapseShare(params({ shed: q }), 10, 100);
    const grid = Array.from({ length: (QMAX.max - QMAX.min) / QMAX.step + 1 }, (_, i) => QMAX.min + i * QMAX.step);
    expect(grid.find((q) => share(q) >= 0.5)).toBe(500);
    const fine = Array.from({ length: 21 }, (_, i) => 400 + i * 5).find((q) => share(q) >= 0.5)!;
    expect(fine).toBeGreaterThanOrEqual(445);
    expect(fine).toBeLessThanOrEqual(460);
    expect(fine).not.toBe(CAPACITY * TIMEOUT.default);
    expect(share(440)).toBe(0);
    expect(share(480)).toBe(1);
    expect(share(QMAX.max)).toBe(1);
  });
});

describe('controls at their extremes and one beyond', () => {
  it('every extreme runs, conserves and stays finite', () => {
    const extremes: Partial<MetaParams>[] = [
      { lambda: LOAD.min }, { lambda: LOAD.max }, { timeout: TIMEOUT.min }, { timeout: TIMEOUT.max }, { retries: RETRIES.min }, { retries: RETRIES.max },
      { trigger: TRIGGER.min }, { trigger: TRIGGER.max }, { budget: RATIO.min }, { budget: RATIO.max }, { jitter: JITTER.min }, { jitter: JITTER.max },
      { shed: QMAX.min }, { shed: QMAX.max },
      { lambda: 100 }, { timeout: 1 }, { retries: 6 }, { trigger: 31 }, { budget: 0.75 }, { jitter: 9 }, { shed: 50 },
    ];
    for (const e of extremes) {
      const sim = createMetaSim(params({ ...e, seed: 3 }));
      sim.run(RUN_TICKS);
      expect(sim.violation, JSON.stringify(e)).toBeNull();
      for (const s of sim.history) expect(Number.isFinite(s.tick.queue) && Number.isFinite(s.tick.goodput)).toBe(true);
    }
  });

  it('d = 0 is "no trigger", and a run with a trigger reports recovered, recovering or collapsed', () => {
    expect(phaseOf(runMeta(params({ trigger: 0 }))).phase).toBe('no trigger');
    expect(phaseOf(runMeta(params({ trigger: 5, seed: 1 }))).phase).toBe('recovered');
    expect(phaseOf(runMeta(params({ trigger: 10, seed: BROKEN_SEED }))).phase).toBe('collapsed');
    expect(COLLAPSE_WINDOW).toBe(100);
  });
});
