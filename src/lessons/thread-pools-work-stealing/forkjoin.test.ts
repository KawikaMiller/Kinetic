import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import {
  BROKEN_SEED, GRAIN_RANGE, RATIOS, SLOW_STEAL_TICKS, TOTAL_WORK, brentBound, buildTree, createForkSim, forkInit, forkStep, lowerBound, makespanOf, runForkJoin, span, sweepGrain, work,
  type Params,
} from './forkjoin';

const base: Params = { n: TOTAL_WORK, grain: 8, ratioPct: 50, forkCost: 0, workers: 4, steal: true, stealLatency: 0, seed: 1 };
const params = (over: Partial<Params>): Params => ({ ...base, ...over });

describe('the task tree', () => {
  it('a 128-unit range at grain 8 and an even split is 16 leaves of 8 and 15 forks, hand-worked', () => {
    const t = buildTree(128, 8, 50, 0);
    expect(t.leaves).toHaveLength(16);
    expect(t.leaves.every((id) => t.tasks[id].size === 8)).toBe(true);
    expect(t.tasks.filter((x) => x.kind === 'fork')).toHaveLength(15);
    expect(work(t)).toBe(128);
    expect(span(t)).toBe(8);
  });

  it('the leaves always add up to the whole range, and a fork costs its cost: work is the range plus forks x cost', () => {
    const rnd = mulberry32(5);
    for (let i = 0; i < 100; i++) {
      const n = 1 + Math.floor(rnd() * 200);
      const grain = 1 + Math.floor(rnd() * n);
      const ratio = 50 + Math.floor(rnd() * 41);
      const cost = Math.floor(rnd() * 5);
      const t = buildTree(n, grain, ratio, cost);
      expect(t.leaves.reduce((s, id) => s + t.tasks[id].size, 0)).toBe(n);
      expect(t.tasks.every((x) => x.kind === 'fork' || x.size <= grain)).toBe(true);
      expect(work(t)).toBe(n + cost * t.tasks.filter((x) => x.kind === 'fork').length);
    }
  });

  it('the span is the longest root-to-leaf chain, found by walking every path', () => {
    const t = buildTree(100, 7, 70, 3);
    let best = 0;
    const walk = (id: number, acc: number) => {
      const task = t.tasks[id];
      const here = acc + task.cost;
      if (!task.children) best = Math.max(best, here);
      else task.children.forEach((c) => walk(c, here));
    };
    walk(t.root, 0);
    expect(span(t)).toBe(best);
  });
});

/** Ticks of work done on each task, read off the history, never off the scheduler's own counters. */
function workTicksByTask(p: Params): { counts: number[]; ranBy: number[]; tasks: number } {
  const tree = buildTree(p.n, p.grain, p.ratioPct, p.forkCost);
  const sim = createForkSim(p, tree);
  const total = work(tree) * (p.stealLatency + 2) + 10;
  sim.run(total);
  const counts = tree.tasks.map(() => 0);
  for (const s of sim.history.slice(1)) for (const t of s.working) if (t >= 0) counts[t]++;
  const last = sim.history.find((s) => s.remaining === 0)!;
  return { counts, ranBy: last.ranBy, tasks: tree.tasks.length };
}

describe('work is conserved: no task lost, none run twice', () => {
  it('over 200 seeded trees, 1 to 8 workers, with and without stealing, every task does exactly its cost in ticks of work', () => {
    const rnd = mulberry32(99);
    let runs = 0;
    for (let i = 0; i < 200; i++) {
      const n = 8 + Math.floor(rnd() * 120);
      const p = params({
        n,
        grain: 1 + Math.floor(rnd() * 16),
        ratioPct: 50 + Math.floor(rnd() * 41),
        forkCost: Math.floor(rnd() * 3),
        workers: 1 + (i % 8),
        steal: i % 2 === 0,
        seed: i,
      });
      const tree = buildTree(p.n, p.grain, p.ratioPct, p.forkCost);
      const { counts, ranBy } = workTicksByTask(p);
      tree.tasks.forEach((t, id) => {
        expect(counts[id], `run ${i} task ${id}`).toBe(t.cost);
        expect(ranBy[id], `run ${i} task ${id} never started`).toBeGreaterThanOrEqual(0);
      });
      // the multiset of leaf costs executed equals the multiset in the tree
      const executed = tree.leaves.map((id) => counts[id]).sort((a, b) => a - b);
      expect(executed).toEqual(tree.leaves.map((id) => tree.tasks[id].size).sort((a, b) => a - b));
      runs++;
    }
    expect(runs).toBe(200);
  });
});

describe('the work-span bounds', () => {
  const grid: Params[] = [];
  for (const workers of [1, 2, 3, 4, 5, 8]) {
    for (const grain of [1, 4, 9, 16, 40, 128]) {
      for (const ratioPct of RATIOS) {
        for (const forkCost of [0, 2]) grid.push(params({ workers, grain, ratioPct, forkCost, seed: grain + workers }));
      }
    }
  }

  it('the makespan is at least max(T1 / P, T-infinity), in exact integer ticks', () => {
    for (const p of grid) {
      const r = runForkJoin(p);
      expect(r.makespan, JSON.stringify(p)).toBeGreaterThanOrEqual(Math.ceil(r.work / p.workers));
      expect(r.makespan).toBeGreaterThanOrEqual(r.span);
      expect(r.makespan).toBeGreaterThanOrEqual(lowerBound(r, p.workers));
    }
  });

  it('with steals landing in the tick they are attempted the scheduler is greedy and Brent holds: makespan <= T1 / P + T-infinity', () => {
    for (const p of grid) {
      const r = runForkJoin(p);
      expect(r.makespan, JSON.stringify(p)).toBeLessThanOrEqual(brentBound(r, p.workers));
    }
  });

  it('on 200 seeds the greedy model never breaks Brent, at several worker counts', () => {
    for (let seed = 0; seed < 200; seed++) {
      const p = params({ workers: 2 + (seed % 7), seed });
      const r = runForkJoin(p);
      expect(r.makespan, `seed ${seed}`).toBeLessThanOrEqual(brentBound(r, p.workers));
    }
  });

  it('a steal that takes ticks is not greedy, and on the named seed it breaks Brent', () => {
    const broken = (seed: number) => {
      const p = params({ stealLatency: SLOW_STEAL_TICKS, seed });
      const r = runForkJoin(p);
      return r.makespan > brentBound(r, p.workers);
    };
    const failing = Array.from({ length: 200 }, (_, s) => s).filter(broken);
    expect(failing.length).toBeGreaterThan(0);
    expect(failing[0]).toBe(BROKEN_SEED);
    expect(broken(BROKEN_SEED)).toBe(true);
    // and the same seed in the greedy model holds
    const ok = runForkJoin(params({ seed: BROKEN_SEED }));
    expect(ok.makespan).toBeLessThanOrEqual(brentBound(ok, 4));
  });

  it('one worker with no fork cost takes exactly the sequential time, and no stealing means no speedup', () => {
    for (const grain of [1, 8, 33, 128]) {
      expect(runForkJoin(params({ workers: 1, grain })).makespan).toBe(TOTAL_WORK);
      for (const workers of [2, 4, 8]) {
        const r = runForkJoin(params({ workers, grain, steal: false }));
        expect(r.makespan).toBe(r.work);
        expect(r.steals).toBe(0);
      }
    }
  });

  it('stealing is what buys the speedup: with it on, 4 workers beat T1 on a wide tree', () => {
    const on = runForkJoin(params({}));
    const off = runForkJoin(params({ steal: false }));
    expect(off.makespan).toBe(TOTAL_WORK);
    expect(on.makespan).toBeLessThan(TOTAL_WORK / 2);
    expect(on.steals).toBeGreaterThan(0);
  });
});

describe('what a thief takes', () => {
  it('steals the oldest task, from the front of the victim deque, which is at least as large as everything behind it', () => {
    let steals = 0;
    for (let seed = 0; seed < 40; seed++) {
      const p = params({ seed, ratioPct: RATIOS[seed % RATIOS.length], workers: 2 + (seed % 5) });
      const tree = buildTree(p.n, p.grain, p.ratioPct, p.forkCost);
      const sim = createForkSim(p, tree);
      sim.run(200);
      for (let t = 1; t < sim.history.length; t++) {
        for (const e of sim.history[t].stolen) {
          steals++;
          // the victim's deque as the tick began, which still held the stolen task at its front unless the victim popped it first this tick
          const before = sim.history[t - 1].deques[e.victim];
          if (before[0] === e.task) {
            const sizes = before.map((id) => tree.tasks[id].size);
            expect(sizes[0], `seed ${seed} tick ${t}`).toBe(Math.max(...sizes));
          }
        }
      }
    }
    expect(steals).toBeGreaterThan(40);
  });

  it('all the work starts on worker 0 and the first steals take the root\'s second child', () => {
    const p = params({ workers: 4 });
    const tree = buildTree(p.n, p.grain, p.ratioPct, p.forkCost);
    const s0 = forkInit(tree, p);
    expect(s0.deques[0]).toEqual([tree.root]);
    expect(s0.deques.slice(1).every((d) => d.length === 0)).toBe(true);
    const sim = createForkSim(p, tree);
    sim.run(1);
    const first = sim.history[1].stolen[0];
    expect(first.thief).not.toBe(0);
    expect(first.victim).toBe(0);
    expect(first.task).toBe(tree.tasks[tree.root].children![1]);
    void forkStep;
  });
});

describe('the seeded sim', () => {
  it('the same seed gives the same history, at(k) equals running k ticks, and the live makespan matches the run', () => {
    const p = params({ seed: 7, workers: 5 });
    const a = createForkSim(p);
    const b = createForkSim(p);
    a.run(30);
    expect(b.at(30)).toEqual(a.state);
    const total = runForkJoin(p).makespan;
    expect(makespanOf(createForkSim(p), total + 50)).toBe(total);
    expect(createForkSim({ ...p, seed: 8 }).at(30)).not.toEqual(a.state);
  });
});

describe('grain size: the U-shaped curve', () => {
  const tree = { ...base, forkCost: 8, workers: 4 };
  const { grain: _unused, ...rest } = { ...tree, grain: 1 };
  void _unused;
  const curve = sweepGrain(rest);

  it('too fine is slower than sequential, too coarse leaves workers idle, and something between beats both', () => {
    expect(curve).toHaveLength(GRAIN_RANGE.max);
    expect(curve[0].makespan).toBeGreaterThan(TOTAL_WORK);
    expect(curve.at(-1)!.makespan).toBe(TOTAL_WORK);
    const best = curve.reduce((a, b) => (b.makespan < a.makespan ? b : a));
    expect(best.grain).toBeGreaterThan(1);
    expect(best.grain).toBeLessThan(GRAIN_RANGE.max);
    expect(best.makespan).toBeLessThan(TOTAL_WORK / 2);
  });
});
