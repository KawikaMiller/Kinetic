import { describe, expect, it } from 'vitest';
import { mulberry32, randInt } from '../../core/random';
import {
  EPS, MAX_NODES, RATE_MAX, RATE_MIN, WEIGHT_MAX, WEIGHT_MIN, addEdge, addNode, bellmanFord, costs, dijkstraVisited, dijkstraWrong, edgeTests, floydWarshall, hopsOfShortest,
  nudgeEdge, pathFromNext, presetById, removeEdge, settledAfter, type Graph,
} from './model';

const NO_POS = { x: 0, y: 0 };

/** A seeded random digraph of 2..6 nodes: no self-loops, no parallel edges, integer weights -9..9 (negatives common enough to make cycles). */
function randomGraph(rnd: () => number, minW = WEIGHT_MIN): Graph {
  const n = randInt(2, 6, rnd);
  const edges: Graph['edges'] = [];
  for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) if (a !== b && rnd() < 0.4) edges.push({ from: a, to: b, w: randInt(minW, WEIGHT_MAX, rnd) });
  return { names: Array.from({ length: n }, (_, i) => String(i)), at: Array(n).fill(NO_POS), edges };
}

// ---- independent oracles: enumeration of simple paths and simple cycles ----

/** Every simple path from `s`, as [node list, weight]. */
function simplePaths(g: Graph, s: number): { nodes: number[]; w: number }[] {
  const out: { nodes: number[]; w: number }[] = [];
  const walk = (nodes: number[], w: number) => {
    out.push({ nodes, w });
    const u = nodes[nodes.length - 1];
    for (const e of g.edges) if (e.from === u && !nodes.includes(e.to)) walk([...nodes, e.to], w + e.w);
  };
  walk([s], 0);
  return out;
}

/** Every simple cycle, once, as its node list starting at the lowest-numbered node. */
function simpleCycles(g: Graph): { nodes: number[]; w: number }[] {
  const out: { nodes: number[]; w: number }[] = [];
  for (let start = 0; start < g.names.length; start++) {
    const walk = (nodes: number[], w: number) => {
      const u = nodes[nodes.length - 1];
      for (const e of g.edges) {
        if (e.from !== u) continue;
        if (e.to === start) out.push({ nodes, w: w + e.w });
        else if (e.to > start && !nodes.includes(e.to)) walk([...nodes, e.to], w + e.w);
      }
    };
    walk([start], 0);
  }
  return out;
}

/** Reachability by Warshall's boolean closure, a different route from the model's search. */
function closure(g: Graph): boolean[][] {
  const n = g.names.length;
  const r = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (__, j) => i === j));
  for (const e of g.edges) r[e.from][e.to] = true;
  for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (r[i][k] && r[k][j]) r[i][j] = true;
  return r;
}

const bruteDist = (g: Graph, s: number): number[] => {
  const best = Array<number>(g.names.length).fill(Infinity);
  for (const p of simplePaths(g, s)) best[p.nodes[p.nodes.length - 1]] = Math.min(best[p.nodes[p.nodes.length - 1]], p.w);
  return best;
};

const SEED_COUNT = 1000;
const graphs = (minW = WEIGHT_MIN): Graph[] => {
  const rnd = mulberry32(2024);
  return Array.from({ length: SEED_COUNT }, () => randomGraph(rnd, minW));
};

describe('Bellman-Ford against brute force', () => {
  it('matches the minimum over all simple paths when there is no negative cycle, 1,000 graphs', () => {
    let checked = 0;
    for (const g of graphs()) {
      if (simpleCycles(g).some((c) => c.w < 0)) continue;
      for (let s = 0; s < g.names.length; s++) {
        const run = bellmanFord(g, s);
        expect(run.cycle).toBeNull();
        expect(run.dist).toEqual(bruteDist(g, s));
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(1500);
  });

  it('flags a negative cycle exactly when a reachable simple cycle sums below zero, and names the nodes with no shortest path', () => {
    let flagged = 0;
    for (const g of graphs()) {
      const reach = closure(g);
      const negatives = simpleCycles(g).filter((c) => c.w < 0);
      for (let s = 0; s < g.names.length; s++) {
        const run = bellmanFord(g, s);
        const live = negatives.filter((c) => reach[s][c.nodes[0]]);
        expect(run.cycle !== null).toBe(live.length > 0);
        const expected = new Set<number>();
        for (const c of live) for (let v = 0; v < g.names.length; v++) if (reach[c.nodes[0]][v]) expected.add(v);
        expect(run.noPath).toEqual([...expected].sort((a, b) => a - b));
        for (const v of run.noPath) expect(run.dist[v]).toBe(-Infinity);
        if (live.length) flagged++;
      }
    }
    expect(flagged).toBeGreaterThan(300);
  });

  it('returns a real cycle: closed, consecutive edges, a negative sum equal to the one reported', () => {
    for (const g of graphs()) {
      for (let s = 0; s < g.names.length; s++) {
        const { cycle } = bellmanFord(g, s);
        if (!cycle) continue;
        const es = cycle.edges.map((i) => g.edges[i]);
        es.forEach((e, k) => expect(e.to).toBe(es[(k + 1) % es.length].from));
        expect(new Set(cycle.nodes).size).toBe(cycle.nodes.length);
        expect(cycle.sum).toBeCloseTo(es.reduce((t, e) => t + e.w, 0), 9);
        expect(cycle.sum).toBeLessThan(0);
      }
    }
  });

  it('after round k every node whose shortest path has at most k edges holds its final distance (no negative cycle)', () => {
    let checked = 0;
    for (const g of graphs()) {
      if (simpleCycles(g).some((c) => c.w < 0)) continue;
      const run = bellmanFord(g, 0);
      const best = bruteDist(g, 0);
      // Fewest edges among the shortest simple paths, by enumeration.
      const hops = Array<number>(g.names.length).fill(Infinity);
      for (const p of simplePaths(g, 0)) {
        const v = p.nodes[p.nodes.length - 1];
        if (p.w === best[v]) hops[v] = Math.min(hops[v], p.nodes.length - 1);
      }
      expect(hopsOfShortest(g, run)).toEqual(hops);
      for (let k = 1; k <= run.afterRound.length; k++) {
        const settled = new Set(settledAfter(run, k));
        hops.forEach((h, v) => {
          if (h <= k) {
            expect(settled.has(v)).toBe(true);
            checked++;
          }
        });
      }
    }
    expect(checked).toBeGreaterThan(1500);
  });

  it('a round that changes nothing means no negative cycle is reachable, and the run stops there', () => {
    for (const g of graphs()) {
      const run = bellmanFord(g, 0);
      const last = run.roundChanges[run.roundChanges.length - 1];
      expect(run.stoppedEarly).toBe(last === 0);
      if (run.stoppedEarly) expect(run.cycle).toBeNull();
      expect(run.roundChanges.length).toBeLessThanOrEqual(g.names.length - 1);
    }
  });
});

describe('Floyd-Warshall against brute force and Bellman-Ford', () => {
  it('equals Bellman-Ford from every source on graphs without a negative cycle', () => {
    for (const g of graphs()) {
      if (simpleCycles(g).some((c) => c.w < 0)) continue;
      const fw = floydWarshall(g);
      expect(fw.stoppedAt).toBeNull();
      const final = fw.steps[fw.steps.length - 1].d;
      for (let s = 0; s < g.names.length; s++) expect(final[s]).toEqual(bellmanFord(g, s).dist);
    }
  });

  it('stops at the first k that a negative diagonal appears, which is the second-highest node of the cheapest-to-find negative cycle', () => {
    let stopped = 0;
    for (const g of graphs()) {
      const negatives = simpleCycles(g).filter((c) => c.w < 0);
      const fw = floydWarshall(g);
      if (!negatives.length) {
        expect(fw.stoppedAt).toBeNull();
        continue;
      }
      // A cycle shows on the diagonal once all of its nodes but its highest-numbered one may be intermediates.
      const needed = Math.min(...negatives.map((c) => [...c.nodes].sort((a, b) => a - b).slice(-2)[0]));
      expect(fw.stoppedAt).toBe(needed);
      expect(fw.steps).toHaveLength(needed + 2);
      stopped++;
    }
    expect(stopped).toBeGreaterThan(200);
  });

  it('every recovered path is a real path in the graph whose weight is the matrix entry', () => {
    let paths = 0;
    for (const g of graphs()) {
      if (simpleCycles(g).some((c) => c.w < 0)) continue;
      const { next, d } = floydWarshall(g).steps.at(-1)!;
      for (let i = 0; i < g.names.length; i++) {
        for (let j = 0; j < g.names.length; j++) {
          const p = pathFromNext(next, i, j);
          if (d[i][j] === Infinity) {
            expect(p).toBeNull();
            continue;
          }
          expect(p).not.toBeNull();
          let w = 0;
          for (let h = 0; h + 1 < p!.length; h++) {
            const e = g.edges.find((x) => x.from === p![h] && x.to === p![h + 1]);
            expect(e).toBeDefined();
            w += e!.w;
          }
          expect(w).toBe(d[i][j]);
          paths++;
        }
      }
    }
    expect(paths).toBeGreaterThan(4000);
  });

  it('marks exactly the cells whose value fell, and only cells in rows and columns it read', () => {
    for (const g of graphs().slice(0, 200)) {
      const fw = floydWarshall(g);
      for (let s = 1; s < fw.steps.length; s++) {
        const before = fw.steps[s - 1].d;
        const { d, changed, k } = fw.steps[s];
        const fell = new Set<string>();
        d.forEach((row, i) => row.forEach((x, j) => x < before[i][j] - EPS && fell.add(`${i},${j}`)));
        expect(new Set(changed.map((c) => `${c.i},${c.j}`))).toEqual(fell);
        // d[i][j] can only fall by going through k.
        expect(changed.every((c) => before[c.i][k] !== Infinity && before[k][c.j] !== Infinity)).toBe(true);
      }
    }
  });
});

describe('the presets, with the spec\'s hand-worked numbers', () => {
  const dist = (id: Parameters<typeof presetById>[0]) => {
    const p = presetById(id);
    return { p, run: bellmanFord(p.graph, p.source) };
  };

  it('textbook: distances t 2, y 7, x 4, z -2; 6, 1 and 0 changes in rounds 1 to 3, then it stops', () => {
    const { p, run } = dist('textbook');
    const at = (n: string) => run.dist[p.graph.names.indexOf(n)];
    expect([at('s'), at('t'), at('y'), at('x'), at('z')]).toEqual([0, 2, 7, 4, -2]);
    expect(run.roundChanges).toEqual([6, 1, 0]);
    expect(run.stoppedEarly).toBe(true);
    expect(run.cycle).toBeNull();
    expect(run.tests).toHaveLength(30);
  });

  it('negative cycle: t to x and back sums to -1, a cycle is flagged, and every node has no shortest path', () => {
    const { p, run } = dist('negative-cycle');
    const cycles = simpleCycles(p.graph);
    const names = (c: { nodes: number[] }) => c.nodes.map((v) => p.graph.names[v]).sort().join('');
    expect(cycles.find((c) => names(c) === 'tx')!.w).toBe(-1);
    // t -> z -> x -> t is a second, deeper negative cycle (-4 + 7 - 6): the run reports a real one, not necessarily the spec's.
    expect(cycles.find((c) => names(c) === 'txz')!.w).toBe(-3);
    expect(run.cycle).not.toBeNull();
    expect(cycles.some((c) => c.w === run.cycle!.sum && names(c) === run.cycle!.nodes.map((v) => p.graph.names[v]).sort().join(''))).toBe(true);
    expect(run.noPath).toEqual([0, 1, 2, 3, 4]);
    expect(run.roundChanges).toEqual([6, 6, 5, 6]) // hand-run in an independent script;
    expect(run.stoppedEarly).toBe(false);
    // Floyd-Warshall stops once x's diagonal goes negative: k = t, which is node 1.
    expect(floydWarshall(p.graph).stoppedAt).toBe(1);
  });

  it('Dijkstra breaks: a visited-set Dijkstra reports 2 for a, the truth is 1, and only a is wrong', () => {
    const { p, run } = dist('dijkstra-breaks');
    const dij = dijkstraVisited(p.graph, p.source);
    expect(dij.dist[1]).toBe(2);
    expect(run.dist[1]).toBe(1);
    expect(bruteDist(p.graph, 0)[1]).toBe(1);
    expect(dijkstraWrong(dij, run)).toEqual([1]);
    expect(dij.steps.map((s) => p.graph.names[s.node])).toEqual(['s', 'a', 'b']);
    expect(dij.steps[2].skipped).toEqual([2]);
  });

  it('arbitrage: the cycle sums to -0.0516 within 1e-4 and the product of rates is 1.053', () => {
    const { p, run } = dist('arbitrage');
    const rates = [0.9, 0.9, 1.3];
    const sum = rates.reduce((t, r) => t - Math.log(r), 0);
    expect(sum).toBeCloseTo(-0.0516, 4);
    expect(run.cycle).not.toBeNull();
    expect(run.cycle!.sum).toBeCloseTo(sum, 9);
    expect(rates.reduce((t, r) => t * r, 1)).toBeCloseTo(1.053, 9);
    expect(p.graph.edges.map((e) => e.rate)).toEqual(rates);
    // Without the gain (GBP to USD at 1.2) there is no cycle: the product is 0.972.
    const flat: Graph = { ...p.graph, edges: p.graph.edges.map((e) => (e.rate === 1.3 ? { ...e, rate: 1.2, w: -Math.log(1.2) } : e)) };
    expect(bellmanFord(flat, 0).cycle).toBeNull();
  });
});

describe('Dijkstra with a visited set', () => {
  it('matches Bellman-Ford when no weight is negative, 1,000 graphs', () => {
    for (const g of graphs(0)) {
      const run = bellmanFord(g, 0);
      expect(dijkstraWrong(dijkstraVisited(g, 0), run)).toEqual([]);
    }
  });

  it('is wrong on a good share of graphs with negative edges and no negative cycle (the test would fail if Dijkstra were fine)', () => {
    let wrong = 0;
    let usable = 0;
    for (const g of graphs()) {
      if (simpleCycles(g).some((c) => c.w < 0)) continue;
      usable++;
      if (dijkstraWrong(dijkstraVisited(g, 0), bellmanFord(g, 0)).length) wrong++;
    }
    expect(usable).toBeGreaterThan(200);
    expect(wrong).toBeGreaterThan(8);
  });
});

describe('the editor refuses hostile input', () => {
  const base = presetById('textbook').graph;

  it('refuses a self-loop and a duplicate edge with a message, and adds a fresh edge', () => {
    const loop = addEdge(base, 0, 0);
    expect(loop.ok).toBe(false);
    const dup = addEdge(base, 0, 1);
    expect(dup).toMatchObject({ ok: false });
    expect((dup as { error: string }).error).toContain('already exists');
    const fresh = addEdge(base, 1, 0);
    expect(fresh.ok && fresh.value.edges).toHaveLength(base.edges.length + 1);
  });

  it('stops at 7 nodes and never leaves the weight range', () => {
    let g = base;
    for (let i = 0; i < 10; i++) {
      const r = addNode(g);
      if (r.ok) g = r.value;
    }
    expect(g.names).toHaveLength(MAX_NODES);
    expect(new Set(g.names).size).toBe(MAX_NODES);
    expect(addNode(g).ok).toBe(false);
    let top = base;
    for (let i = 0; i < 40; i++) {
      const r = nudgeEdge(top, 0, 1);
      if (r.ok) top = r.value;
    }
    expect(top.edges[0].w).toBe(WEIGHT_MAX);
    expect(nudgeEdge(top, 0, 1).ok).toBe(false);
    let low = base;
    for (let i = 0; i < 40; i++) {
      const r = nudgeEdge(low, 0, -1);
      if (r.ok) low = r.value;
    }
    expect(low.edges[0].w).toBe(WEIGHT_MIN);
  });

  it('a market keeps its rates in range and its weights equal to -ln(rate)', () => {
    let g = presetById('arbitrage').graph;
    for (let i = 0; i < 60; i++) {
      const r = nudgeEdge(g, 2, 1);
      if (r.ok) g = r.value;
    }
    expect(g.edges[2].rate).toBe(RATE_MAX);
    expect(g.edges[2].w).toBeCloseTo(-Math.log(RATE_MAX), 12);
    for (let i = 0; i < 60; i++) {
      const r = nudgeEdge(g, 2, -1);
      if (r.ok) g = r.value;
    }
    expect(g.edges[2].rate).toBe(RATE_MIN);
  });

  it('a random sequence of editor actions never breaks the graph invariants', () => {
    const rnd = mulberry32(5);
    let g = base;
    for (let step = 0; step < 600; step++) {
      const roll = rnd();
      const n = g.names.length;
      if (roll < 0.3) {
        const r = addEdge(g, randInt(0, n - 1, rnd), randInt(0, n - 1, rnd));
        if (r.ok) g = r.value;
      } else if (roll < 0.5) {
        const r = addNode(g);
        if (r.ok) g = r.value;
      } else if (roll < 0.6 && g.edges.length) {
        g = removeEdge(g, randInt(0, g.edges.length - 1, rnd));
      } else if (g.edges.length) {
        const r = nudgeEdge(g, randInt(0, g.edges.length - 1, rnd), rnd() < 0.5 ? 1 : -1);
        if (r.ok) g = r.value;
      }
      expect(g.names.length).toBeLessThanOrEqual(MAX_NODES);
      expect(g.at).toHaveLength(g.names.length);
      expect(new Set(g.edges.map((e) => `${e.from}>${e.to}`)).size).toBe(g.edges.length);
      for (const e of g.edges) {
        expect(e.from).not.toBe(e.to);
        expect(e.w).toBeGreaterThanOrEqual(WEIGHT_MIN);
        expect(e.w).toBeLessThanOrEqual(WEIGHT_MAX);
      }
    }
  });
});

describe('cost counts', () => {
  it('count the work the runs did: rounds x edges for Bellman-Ford, k x n x n for Floyd-Warshall', () => {
    for (const id of ['textbook', 'negative-cycle', 'dijkstra-breaks'] as const) {
      const p = presetById(id);
      const bf = bellmanFord(p.graph, p.source);
      const fw = floydWarshall(p.graph);
      const c = costs(p.graph, bf, fw);
      const n = p.graph.names.length;
      const m = p.graph.edges.length;
      // Rounds counted from the run itself, not from the test list.
      const rounds = bf.roundChanges.length + (bf.stoppedEarly ? 0 : 1);
      expect(c.bellmanFordOne).toBe(rounds * m);
      expect(c.bellmanFordOne).toBe(edgeTests(bf, m));
      expect(c.floydWarshall).toBe((fw.steps.length - 1) * n * n);
      expect(c.floydWarshallFull).toBe(n ** 3);
      expect(c.bellmanFordWorst).toBe(n * m);
      expect(c.bellmanFordOne).toBeLessThanOrEqual(c.bellmanFordWorst);
    }
    const t = presetById('textbook');
    const c = costs(t.graph, bellmanFord(t.graph, 0), floydWarshall(t.graph));
    expect(c).toMatchObject({ bellmanFordOne: 30, floydWarshall: 125, floydWarshallFull: 125, bellmanFordWorst: 50 });
  });
});
