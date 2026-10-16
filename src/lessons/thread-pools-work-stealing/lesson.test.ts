import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { sceneElements } from '../../core/testing/sceneKeys';
import { forkBars, parentsOf, leafState } from './bars';
import { forkFrames, forkSummary, grainCaption, poolCaption, starveFrames } from './frames';
import { BROKEN_SEED, GRAIN_RANGE, RATIOS, SLOW_STEAL_TICKS, TOTAL_WORK, brentBound, buildTree, createForkSim, runForkJoin, sweepGrain } from './forkjoin';
import lesson from './index';
import { FORK_COST, SCENE_OPENINGS, forkOpening, grainOpening, mixRatio, poolOpening, starveOpening } from './openings';
import { MIXES, POOL_CPU, POOL_RANGE, bestPool, burstTicks, ruleOfThumb, simulatePool, sweepPool } from './pool';
import { createStarveSim, runStarve } from './starve';

const text = expectCaption;

describe('try-this entries, from the default state, as written', () => {
  it('try-this 1: 4 cores at w/c = 4 with a pool of 4 give about 8 tasks per 100 ticks at 20% core use, and a pool of 20 about 36', () => {
    const open = poolOpening();
    expect(open).toEqual({ cores: 4, mixIndex: 3, pool: 4 });
    expect(mixRatio(open)).toBe(4);
    const here = simulatePool({ cores: 4, ratio: 4, pool: 4 });
    // closed form: 4 threads each finish a task every 10 + 40 ticks, so 4 / 50 = 8 per 100 ticks, using 8 x 10 / 4 = 20% of the cores
    expect(here.throughput).toBeCloseTo(8, 0);
    expect(here.coreUse).toBeCloseTo(0.2, 1);
    const rule = ruleOfThumb(4, 4);
    expect(rule).toBe(20);
    const there = simulatePool({ cores: 4, ratio: 4, pool: rule });
    const burst = POOL_CPU + Math.floor(rule / 16);
    const closed = Math.min(rule / (burst + 40), 4 / burst) * 100;
    expect(Math.abs(there.throughput - closed) / closed).toBeLessThan(0.05);
    for (const piece of ['8 tasks per 100 ticks', '20% busy', `pool = the rule of thumb (20): ${there.throughput.toPrecision(3).replace(/\.?0+$/, '')}`]) {
      void piece;
    }
    expect(lesson.tryThis[0]).toContain('pool = the rule of thumb (20)');
    expect(lesson.tryThis[0]).toContain('cores 20% busy');
  });

  it('try-this 2: the 128-unit job takes between 32 and 40 ticks with stealing, exactly 128 without, and steals happen', () => {
    const open = forkOpening();
    expect(open.params).toMatchObject({ n: 128, grain: 8, ratioPct: 50, workers: 4, steal: true, seed: 1 });
    const on = runForkJoin(open.params);
    expect(on.makespan).toBeGreaterThanOrEqual(128 / 4);
    expect(on.makespan).toBeLessThanOrEqual(128 / 4 + 8);
    expect(on.steals).toBeGreaterThan(0);
    const off = runForkJoin({ ...open.params, steal: false });
    expect(off.makespan).toBe(128);
    expect(lesson.tryThis[1]).toContain(`takes ${on.makespan} ticks with ${on.steals} steals`);
    expect(lesson.tryThis[1]).toContain('128 ticks, the whole work on worker 0');
  });

  it('try-this 3: grain 16 is faster than one worker and grain 1 slower, with a fork cost of 8', () => {
    const open = grainOpening();
    expect(open).toEqual({ workers: 4, grain: 16, seed: 1 });
    const base = { n: 128, ratioPct: 50, forkCost: FORK_COST, workers: 4, steal: true, stealLatency: 0, seed: 1 };
    const at = (grain: number) => runForkJoin({ ...base, grain });
    expect(at(16).makespan).toBeLessThan(128);
    // hand-worked bound: grain 1 has 127 forks of 8 ticks and 128 units: T1 = 1144, so four workers need at least 286 ticks
    expect(at(1).work).toBe(128 + 127 * 8);
    expect(at(1).makespan).toBeGreaterThanOrEqual(Math.ceil((128 + 127 * 8) / 4));
    expect(at(1).makespan).toBeGreaterThan(128);
    expect(lesson.tryThis[2]).toContain(`takes ${at(16).makespan} ticks`);
    expect(lesson.tryThis[2]).toContain(`${at(1).makespan} ticks, slower than the 128`);
  });

  it('try-this 4: 3 workers on a depth-3 tree stall (7 parents), and joining by helping finishes all 15 tasks', () => {
    const open = starveOpening();
    expect(open).toMatchObject({ workers: 3, depth: 3, helping: false });
    const stalled = runStarve(open);
    expect(stalled.stalled).toBe(true);
    expect(stalled.finished).toBeLessThan(15);
    const helped = runStarve({ ...open, helping: true });
    expect(helped.stalled).toBe(false);
    expect(helped.finished).toBe(15);
    expect(lesson.tryThis[3]).toContain(`stalls after ${stalled.ticks} ticks with ${stalled.finished} of 15`);
    expect(lesson.tryThis[3]).toContain(`all 15 finish in ${helped.ticks} ticks`);
  });

  it('try-this 5: the slow-steal model on its named seed runs past Brent\'s bound', () => {
    const open = forkOpening();
    const r = runForkJoin({ ...open.params, stealLatency: SLOW_STEAL_TICKS, seed: BROKEN_SEED });
    expect(r.makespan).toBeGreaterThan(brentBound(r, 4));
    expect(lesson.tryThis[4]).toContain(`the run takes ${r.makespan} ticks`);
    expect(lesson.tryThis[4]).toContain(`every seed breaks the bound`);
  });
});

describe('pool sizing captions', () => {
  it('quote the throughput, the core use and the plateau position from the same numbers, across the mix, core and pool grid', () => {
    for (const ratio of MIXES) {
      for (const cores of [1, 4, 8]) {
        const curve = sweepPool({ cores, ratio });
        const bestPoolSize = bestPool(curve);
        const best = { pool: bestPoolSize, throughput: curve[bestPoolSize - 1].throughput };
        for (const pool of [1, cores, 20, POOL_RANGE.max]) {
          const r = simulatePool({ cores, ratio, pool });
          const said = text(poolCaption({ cores, ratio, pool }, r, best));
          const share = r.throughput / best.throughput;
          expect(said.includes('on the plateau'), `C=${cores} r=${ratio} P=${pool}`).toBe(share >= 0.95);
          expect(said.includes('below the plateau'), `C=${cores} r=${ratio} P=${pool}`).toBe(share < 0.95);
          expect(said).toContain(`${burstTicks(pool)} ticks`);
          expect(said).toContain(`P = ${best.pool}`);
        }
      }
    }
  });
});

describe('fork-join captions across the control cross product', () => {
  it('every frame is a clean caption, the first-steal frame sits on the tick of the first steal, and the summary agrees with the bound', () => {
    let runs = 0;
    for (const workers of [1, 2, 4, 8]) {
      for (const ratioPct of RATIOS) {
        for (const steal of [false, true]) {
          for (const stealLatency of [0, SLOW_STEAL_TICKS]) {
            for (const grain of [1, 8, 128]) {
              const p = { n: TOTAL_WORK, grain, ratioPct, forkCost: 0, workers, steal, stealLatency, seed: BROKEN_SEED };
              const tree = buildTree(p.n, p.grain, p.ratioPct, p.forkCost);
              const res = runForkJoin(p, tree);
              const sim = createForkSim(p, tree);
              const frames = forkFrames(sim, p, res);
              frames.forEach((f) => f.say && text(f.say));
              expect(frames.at(-1)!.now).toBe(res.makespan);
              const firstSteal = sim.history.findIndex((s, t) => t > 0 && s.stolen.length > 0);
              const stealFrame = frames.find((f) => f.say && text(f.say).includes('the oldest task in worker'));
              if (firstSteal < 0 || firstSteal > res.makespan) expect(stealFrame).toBeUndefined();
              else expect(stealFrame!.now).toBe(firstSteal);
              const summary = text(forkSummary(p, res));
              expect(summary).toContain(`${res.makespan} ticks`);
              // a no-stealing run is not greedy: the bound is not applied to it, so it is neither within nor broken
              expect(summary.includes('is within it')).toBe(steal && res.makespan <= brentBound(res, workers));
              expect(summary.includes('breaks it')).toBe(steal && res.makespan > brentBound(res, workers));
              expect(summary.includes('not greedy and the bound does not apply')).toBe(!steal);
              runs++;
            }
          }
        }
      }
    }
    expect(runs).toBe(4 * 5 * 2 * 2 * 3);
  });

  it('the timeline covers every tick of every worker, and a steal diamond sits at each steal', () => {
    const p = forkOpening().params;
    const tree = buildTree(p.n, p.grain, p.ratioPct, p.forkCost);
    const res = runForkJoin(p, tree);
    const sim = createForkSim(p, tree);
    const bars = forkBars(sim, tree, res.makespan);
    for (let w = 0; w < p.workers; w++) {
      const mine = bars.filter((b) => b.lane === `w${w}` && b.start !== b.end).sort((a, b) => a.start - b.start);
      expect(mine[0].start).toBe(0);
      expect(mine.at(-1)!.end).toBe(res.makespan);
      mine.slice(1).forEach((b, i) => expect(b.start).toBe(mine[i].end));
    }
    expect(bars.filter((b) => b.start === b.end)).toHaveLength(res.steals);
  });

  it('the leaf strip walks from hidden to finished and ends with every leaf finished', () => {
    const p = forkOpening().params;
    const tree = buildTree(p.n, p.grain, p.ratioPct, p.forkCost);
    const res = runForkJoin(p, tree);
    const sim = createForkSim(p, tree);
    sim.at(res.makespan);
    const parent = parentsOf(tree);
    expect(tree.leaves.every((l) => leafState(sim, parent, l, 0).kind === 'hidden')).toBe(true);
    expect(tree.leaves.every((l) => leafState(sim, parent, l, res.makespan).kind === 'done')).toBe(true);
  });
});

describe('grain captions', () => {
  it('say slower than one worker exactly when the makespan is above the sequential time', () => {
    const base = { n: TOTAL_WORK, ratioPct: 50, forkCost: FORK_COST, workers: 4, steal: true, stealLatency: 0, seed: 1 };
    const curve = sweepGrain(base);
    const best = curve.reduce((a, b) => (b.makespan < a.makespan ? b : a));
    for (const c of curve) {
      const said = text(grainCaption(c.grain, c.makespan, TOTAL_WORK, best, 4));
      expect(said.includes('slower than running it on one worker'), `grain ${c.grain}`).toBe(c.makespan > TOTAL_WORK);
      expect(said.includes('the best grain in the sweep')).toBe(c.makespan <= TOTAL_WORK && c.makespan === best.makespan);
    }
    expect(curve).toHaveLength(GRAIN_RANGE.max);
  });
});

describe('starvation captions', () => {
  it('end on "Stalled" exactly when the sim reports a stall, over the worker, depth and join grid', () => {
    for (let workers = 1; workers <= 8; workers++) {
      for (let depth = 1; depth <= 4; depth++) {
        for (const helping of [false, true]) {
          const p = { workers, depth, helping, seed: 1 };
          const sim = createStarveSim(p);
          sim.run(400);
          const frames = starveFrames(sim, p);
          frames.forEach((f) => f.say && text(f.say));
          const last = text(frames.at(-1)!.say);
          expect(last.includes('Stalled'), `P=${workers} d=${depth} helping=${helping}`).toBe(sim.violation !== null);
          expect(last.includes('finished by tick')).toBe(sim.violation === null);
        }
      }
    }
  });
});

describe('scenes', () => {
  it('every scene the Stage returns carries its own key', () => {
    const elements = sceneElements('thread-pools-work-stealing');
    expect(elements.map((e) => e.component)).toEqual(['ForkScene', 'GrainScene', 'StarveScene', 'PoolScene']);
    for (const element of elements) expect(element.keyed, element.component).toBe(true);
  });

  it('each scene opens on its documented state, as a pure function, and visiting every scene twice changes nothing', () => {
    const walk = () => Object.values(SCENE_OPENINGS).map((open) => open());
    expect(walk()).toEqual(walk());
    expect(Object.keys(SCENE_OPENINGS)).toEqual(['pool', 'fork', 'grain', 'starve']);
    expect(forkOpening().model).toBe('greedy');
    expect(forkOpening().params.stealLatency).toBe(0);
    expect(forkOpening().params).not.toBe(forkOpening().params);
  });

  it('the pool mix slider offers exactly the ratios the closed form was checked at', () => {
    expect([...MIXES]).toEqual([0, 1, 2, 4, 9, 19]);
    expect(POOL_CPU).toBe(10);
  });
});
