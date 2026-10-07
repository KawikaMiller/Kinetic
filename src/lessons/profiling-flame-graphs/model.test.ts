import { describe, expect, it } from 'vitest';
import {
  HOT_LEAF, LOOP, MS, NO_FIXES, cpuTime, foldStacks, layoutChart, layoutFlame, margin95, program, sample, timeline, trueShare, wallTime,
  type FlameNode, type Sample,
} from './model';

const base = timeline(program(NO_FIXES));
const hoisted = timeline(program({ hoist: true, fastJson: false }));
const fastJson = timeline(program({ hoist: false, fastJson: true }));

const nodes = (n: FlameNode): FlameNode[] => [n, ...n.children.flatMap(nodes)];
const pathOf = (n: FlameNode) => n.id.split(';').slice(1);
const startsWith = (stack: readonly string[], prefix: readonly string[]) => prefix.every((p, i) => stack[i] === p);

describe('the program and its timeline', () => {
  it('adds up: on-CPU time is every own-work chunk, and the wait is off the CPU', () => {
    const want = 2 * MS.handlerSelf + MS.parse + MS.loadUserBefore + MS.loadUserAfter + MS.queryBuild + MS.queryRows + MS.renderBefore + MS.renderAfter
      + LOOP * (MS.newFormatter + MS.format + MS.formatPriceSelf) + MS.log;
    expect(cpuTime(base)).toBeCloseTo(want, 9);
    expect(wallTime(base)).toBeCloseTo(want + MS.queryWait, 9);
    // Contiguous, in order.
    base.forEach((s, i) => i > 0 && expect(s.start).toBeCloseTo(base[i - 1].end, 9));
  });

  it('hoisting the formatter saves exactly the time of the formatter frames it removes', () => {
    const formatterTime = (segs: typeof base) => segs.filter((s) => s.stack.at(-1) === HOT_LEAF).reduce((a, s) => a + s.end - s.start, 0);
    const saved = cpuTime(base) - cpuTime(hoisted);
    expect(saved).toBeCloseTo(formatterTime(base) - formatterTime(hoisted), 9);
    expect(saved).toBeCloseTo((LOOP - 1) * MS.newFormatter, 9);
  });

  it('the decoy parseJson fix changes almost nothing', () => {
    const saved = cpuTime(base) - cpuTime(fastJson);
    expect(saved).toBeCloseTo(MS.parse - MS.fastParse, 9);
    expect(saved / cpuTime(base)).toBeLessThan(0.03);
  });

  it('renderPage is wide but its own share is small; the hot leaf is the formatter', () => {
    expect(trueShare(base, 'renderPage', 'total')).toBeGreaterThan(0.7);
    expect(trueShare(base, 'renderPage', 'self')).toBeLessThan(0.06);
    const leaves = [...new Set(base.filter((s) => s.onCpu).map((s) => s.stack.at(-1)!))];
    const top = leaves.reduce((a, b) => (trueShare(base, b, 'self') > trueShare(base, a, 'self') ? b : a));
    expect(top).toBe(HOT_LEAF);
  });
});

describe('sampling', () => {
  it('never samples off the CPU', () => {
    const waits = base.filter((s) => !s.onCpu);
    for (const seed of [1, 2, 3])
      for (const s of sample(base, 2000, seed)) expect(waits.some((w) => s.at > w.start && s.at < w.end)).toBe(false);
  });

  it('puts each sample in the segment running at its time', () => {
    for (const s of sample(base, 500, 9)) {
      const seg = base.find((g) => g.onCpu && s.at >= g.start && s.at <= g.end)!;
      expect(seg.stack).toEqual(s.stack);
    }
  });

  it('at 1,000 samples the hot leaf’s measured share is within ±5 points of its true CPU share (200 seeds)', () => {
    const truth = trueShare(base, HOT_LEAF, 'self');
    let worst = 0;
    for (let seed = 0; seed < 200; seed++) {
      const root = foldStacks(sample(base, 1000, seed));
      const leaf = nodes(root).filter((n) => n.name === HOT_LEAF).reduce((a, n) => a + n.self, 0);
      worst = Math.max(worst, Math.abs(leaf / 1000 - truth));
    }
    expect(worst).toBeLessThan(0.05);
  });

  it('with only 20 samples, some seed is off by more than the 1,000-sample margin: the noise is real', () => {
    const truth = trueShare(base, 'parseJson', 'total');
    const errs = Array.from({ length: 200 }, (_, seed) => {
      const root = foldStacks(sample(base, 20, seed));
      return Math.abs((nodes(root).find((n) => n.name === 'parseJson')?.total ?? 0) / 20 - truth);
    });
    expect(Math.max(...errs)).toBeGreaterThan(margin95(truth, 1000));
  });
});

describe('foldStacks', () => {
  const samples: Sample[] = sample(base, 777, 5);
  const root = foldStacks(samples);

  it('counts each node’s samples exactly (brute force over the samples), self included', () => {
    expect(root.total).toBe(samples.length);
    for (const n of nodes(root).slice(1)) {
      const path = pathOf(n);
      expect(n.total).toBe(samples.filter((s) => startsWith(s.stack, path)).length);
      expect(n.self).toBe(samples.filter((s) => s.stack.length === path.length && startsWith(s.stack, path)).length);
    }
  });

  it('every node’s count is its self count plus its children’s', () => {
    for (const n of nodes(root)) expect(n.total).toBe(n.self + n.children.reduce((a, c) => a + c.total, 0));
  });

  it('merges siblings by name and sorts them alphabetically, like flamegraph.pl', () => {
    for (const n of nodes(root)) {
      const names = n.children.map((c) => c.name);
      expect(names).toEqual([...names].sort());
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it('a hand-worked case', () => {
    const r = foldStacks([{ stack: ['a', 'c'] }, { stack: ['a', 'b'] }, { stack: ['a'] }, { stack: ['a', 'b'] }]);
    expect(r.children.map((c) => [c.name, c.total, c.self])).toEqual([['a', 4, 1]]);
    expect(r.children[0].children.map((c) => [c.name, c.total, c.self])).toEqual([['b', 2, 2], ['c', 1, 1]]);
  });
});

describe('layouts', () => {
  const samples = sample(base, 400, 3);
  const root = foldStacks(samples);

  it('flame graph: width is share of samples, children tile left to right inside their parent', () => {
    const boxes = layoutFlame(root);
    for (const b of boxes) {
      expect(b.w).toBeCloseTo(b.node.total / root.total, 12);
      const kids = boxes.filter((k) => k.depth === b.depth + 1 && b.node.children.includes(k.node));
      let x = b.x;
      for (const k of kids) {
        expect(k.x).toBeCloseTo(x, 12);
        x += k.w;
      }
      expect(x).toBeLessThanOrEqual(b.x + b.w + 1e-12);
    }
  });

  it('flame chart: boxes follow time order and each covers samples sharing that stack prefix', () => {
    const ordered = [...samples].sort((a, b) => a.at - b.at);
    for (const box of layoutChart(samples)) {
      const run = ordered.slice(box.from, box.from + box.count);
      const prefix = run[0].stack.slice(0, box.depth);
      expect(prefix.at(-1)).toBe(box.name);
      for (const s of run) expect(s.stack.slice(0, box.depth)).toEqual(prefix);
    }
    // Under handleRequest, time order shows the phases as they ran; the flame graph sorts them by name.
    const chartOrder = layoutChart(samples).filter((b) => b.depth === 2).map((b) => b.name);
    expect(chartOrder).toEqual(['parseJson', 'loadUser', 'renderPage', 'logLine']);
    expect(root.children[0].children.map((c) => c.name)).toEqual(['loadUser', 'logLine', 'parseJson', 'renderPage']);
  });
});
