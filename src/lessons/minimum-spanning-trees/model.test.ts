import { describe, expect, it } from 'vitest';
import { createDisjointSet } from '../../core/disjointSet';
import { mulberry32, randInt, shuffle, type Rnd } from '../../core/random';
import { captionText } from '../../core/testing/captions';
import { mstFrames } from './frames';
import { components, countMinimumTrees, cut, distinctWeights, kruskal, parseWeight, prim, worstDetour, type WGraph } from './model';
import { PRESETS } from './presets';

function randomGraph(rnd: Rnd, maxN: number, p: number, distinct = false): WGraph {
  const n = randInt(1, maxN, rnd);
  const edges: { a: number; b: number; w: number }[] = [];
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) if (rnd() < p) edges.push({ a, b, w: randInt(0, 20, rnd) });
  if (distinct) shuffle(edges.map((_, i) => i), rnd).forEach((k, i) => (edges[k].w = i));
  return { n, edges };
}

/** Brute force: the lightest acyclic edge set of size n − components, over every subset of that size. */
function bruteMinimum(g: WGraph): number {
  const need = g.n - components(g);
  let best = Infinity;
  const pick: number[] = [];
  const walk = (from: number) => {
    if (pick.length === need) {
      const ds = createDisjointSet(g.n);
      if (pick.every((i) => ds.union(g.edges[i].a, g.edges[i].b))) best = Math.min(best, pick.reduce((s, i) => s + g.edges[i].w, 0));
      return;
    }
    for (let i = from; i <= g.edges.length - (need - pick.length); i++) {
      pick.push(i);
      walk(i + 1);
      pick.pop();
    }
  };
  walk(0);
  return need === 0 ? 0 : best;
}

/** Kirchhoff's matrix-tree theorem: spanning trees = any cofactor of the Laplacian. */
function spanningTreeCount(g: WGraph): number {
  const m = Array.from({ length: g.n - 1 }, () => new Array<number>(g.n - 1).fill(0));
  for (const { a, b } of g.edges) {
    if (a < g.n - 1) m[a][a]++;
    if (b < g.n - 1) m[b][b]++;
    if (a < g.n - 1 && b < g.n - 1) {
      m[a][b]--;
      m[b][a]--;
    }
  }
  let det = 1;
  for (let c = 0; c < m.length; c++) {
    const p = m.findIndex((row, r) => r >= c && Math.abs(row[c]) > 1e-9);
    if (p < 0) return 0;
    if (p !== c) {
      [m[p], m[c]] = [m[c], m[p]];
      det = -det;
    }
    det *= m[c][c];
    for (let r = c + 1; r < m.length; r++) {
      const k = m[r][c] / m[c][c];
      for (let j = c; j < m.length; j++) m[r][j] -= k * m[c][j];
    }
  }
  return Math.round(det);
}

const sorted = (xs: readonly number[]) => [...xs].sort((a, b) => a - b);

describe('minimum spanning trees', () => {
  it('Kruskal and Prim totals equal brute force over every spanning tree (presets and 300 seeded graphs of up to 7 nodes)', () => {
    for (const p of PRESETS) {
      const best = bruteMinimum(p.graph);
      expect(kruskal(p.graph).total).toBe(best);
      expect(prim(p.graph, 0).total).toBe(best);
    }
    const rnd = mulberry32(31);
    for (let t = 0; t < 300; t++) {
      const g = randomGraph(rnd, 7, 0.25 + rnd() * 0.4);
      const best = bruteMinimum(g);
      expect(kruskal(g).total).toBe(best);
      expect(prim(g, randInt(0, g.n - 1, rnd)).total).toBe(best);
    }
  });

  it('Kruskal and Prim agree on 1,000 graphs of up to 30 nodes, and pick identical edges (both break ties by edge order)', () => {
    const rnd = mulberry32(32);
    for (let t = 0; t < 1000; t++) {
      const g = randomGraph(rnd, 30, 0.05 + rnd() * 0.4, t % 2 === 0);
      const k = kruskal(g);
      const p = prim(g, randInt(0, g.n - 1, rnd));
      expect(p.total).toBe(k.total);
      expect(k.edges).toHaveLength(g.n - k.components);
      expect(p.edges).toHaveLength(g.n - p.components);
      expect(sorted(p.edges)).toEqual(sorted(k.edges));
    }
  });

  it('the lightest edge across a cut is in the tree (distinct weights, random cuts)', () => {
    const rnd = mulberry32(33);
    for (let t = 0; t < 400; t++) {
      const g = randomGraph(rnd, 12, 0.5, true);
      const side = Array.from({ length: g.n }, (_, v) => v).filter(() => rnd() < 0.5);
      const c = cut(g, side);
      if (!c.crossing.length) continue;
      expect(c.lightest).toHaveLength(1);
      expect(kruskal(g).edges).toContain(c.lightest[0]);
    }
  });

  it('every edge Kruskal takes is a lightest edge across the cut it names', () => {
    const rnd = mulberry32(34);
    for (let t = 0; t < 300; t++) {
      const g = randomGraph(rnd, 10, 0.5);
      for (const e of kruskal(g).events) if (e.accepted) expect(cut(g, e.side!).lightest.map((i) => g.edges[i].w)).toContain(g.edges[e.edge].w);
    }
  });

  it('reports a disconnected graph as a spanning forest, from the component count', () => {
    const g: WGraph = { n: 5, edges: [{ a: 0, b: 1, w: 3 }, { a: 1, b: 2, w: 1 }, { a: 3, b: 4, w: 2 }] };
    expect(components(g)).toBe(2);
    for (const algo of ['kruskal', 'prim'] as const) {
      const frames = mstFrames(g, algo, 0, 'units', String);
      const text = captionText(frames.at(-1)!.say);
      expect(text).toMatch(/Spanning forest, not a tree: the graph is in 2 separate pieces/);
      expect(text).toContain('3 edges, total 6');
    }
    for (const p of PRESETS) for (const algo of ['kruskal', 'prim'] as const) expect(captionText(mstFrames(p.graph, algo, 0, p.unit, String).at(-1)!.say)).not.toMatch(/forest/);
  });

  it('counts minimum trees exactly: one when weights are distinct, several with ties', () => {
    expect(countMinimumTrees({ n: 3, edges: [{ a: 0, b: 1, w: 1 }, { a: 1, b: 2, w: 1 }, { a: 0, b: 2, w: 1 }] })).toBe(3);
    expect(countMinimumTrees({ n: 3, edges: [{ a: 0, b: 1, w: 1 }, { a: 1, b: 2, w: 1 }, { a: 0, b: 2, w: 2 }] })).toBe(1);
    // Equal weights: every spanning tree is minimum, so the count must match Kirchhoff.
    const equal = PRESETS.find((p) => p.id === 'equal')!.graph;
    expect(countMinimumTrees(equal)).toBe(spanningTreeCount(equal));
    const rndEq = mulberry32(36);
    for (let t = 0; t < 100; t++) {
      const g = randomGraph(rndEq, 7, 0.5);
      if (g.edges.length > 16 || components(g) > 1) continue;
      const flat = { n: g.n, edges: g.edges.map((e) => ({ ...e, w: 1 })) };
      expect(countMinimumTrees(flat)).toBe(spanningTreeCount(flat));
    }
    const rnd = mulberry32(35);
    for (let t = 0; t < 200; t++) {
      const g = randomGraph(rnd, 7, 0.5, t % 2 === 0);
      if (g.edges.length > 16) continue;
      if (distinctWeights(g)) expect(countMinimumTrees(g)).toBe(1);
      expect(countMinimumTrees(g)).toBeGreaterThanOrEqual(1);
    }
  });

  it('accepts weights 0 to 999 only', () => {
    expect(parseWeight(' 7 ')).toEqual({ ok: true, value: 7 });
    expect(parseWeight('0')).toEqual({ ok: true, value: 0 });
    expect(parseWeight('999')).toEqual({ ok: true, value: 999 });
    for (const bad of ['1000', '-1', '3.5', '', 'abc', '1e2', '0x10', '+5']) expect(parseWeight(bad).ok).toBe(false);
  });

  it('the trap preset: the tree route from Hub to D is twice the direct road', () => {
    const trap = PRESETS.find((p) => p.id === 'trap')!;
    expect(worstDetour(trap.graph, kruskal(trap.graph).edges)).toEqual({ from: 0, to: 4, viaTree: 10, shortest: 5 });
  });
});

describe('frames', () => {
  const combos = PRESETS.flatMap((p) => (['kruskal', 'prim'] as const).flatMap((algo) => [0, p.graph.n - 1].map((start) => ({ p, algo, start }))));

  it.each(combos.map((c) => [`${c.p.id} ${c.algo} from ${c.start}`, c] as const))('%s: running total, cut claims and ending match the model', (_, { p, algo, start }) => {
    const g = p.graph;
    const frames = mstFrames(g, algo, start, p.unit, (i) => p.names[i]);
    const last = frames.at(-1)!;
    const result = algo === 'kruskal' ? kruskal(g) : prim(g, start);
    expect(last.total).toBe(result.total);
    expect(sorted(last.accepted)).toEqual(sorted(result.edges));
    const text = captionText(last.say);
    expect(text).toContain(`total ${result.total}`);
    const count = countMinimumTrees(g);
    if (distinctWeights(g)) expect(text).toMatch(/only minimum tree/);
    else expect(text).toMatch(count === 1 ? /only this one tree/ : new RegExp(`${count} different trees reach this same total`));
    for (const f of frames) {
      // Whenever a cut is shown, the edge being taken is a lightest edge across it.
      if (f.side && f.considered !== null) expect(cut(g, f.side).lightest.map((i) => g.edges[i].w)).toContain(g.edges[f.considered].w);
      // The running total is the sum of the edges taken so far.
      expect(f.total).toBe(f.accepted.reduce((s, i) => s + g.edges[i].w, 0));
    }
  });

  it('a rejected edge is red for its own step, then stays dim', () => {
    const g = PRESETS[0].graph;
    const frames = mstFrames(g, 'kruskal', 0, 'm', String);
    const firstReject = frames.findIndex((f) => f.rejectedNow !== null);
    expect(firstReject).toBeGreaterThan(0);
    const edge = frames[firstReject].rejectedNow!;
    expect(frames[firstReject + 1].rejectedNow).not.toBe(edge);
    expect(frames[firstReject + 1].rejected).toContain(edge);
  });
});
