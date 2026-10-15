import { describe, expect, it } from 'vitest';
import { mulberry32, randInt, shuffle } from '../../core/random';
import {
  MAX_NODES, ORDERS, PRESETS, addEdge, addNode, adjacency, byName, chromatic, colourWith, conflicts, degrees, greedyColour, identityOrder, isPermutation, maxDegree, peel, presetById,
  smallestLast, twoColour, type Graph,
} from './model';

const NO_POS = { x: 0, y: 0 };
function randomGraph(rnd: () => number, maxN = 9, p?: number): Graph {
  const n = randInt(1, maxN, rnd);
  const density = p ?? [0.15, 0.3, 0.5][randInt(0, 2, rnd)];
  const edges: Graph['edges'] = [];
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) if (rnd() < density) edges.push([a, b]);
  return { names: Array.from({ length: n }, (_, i) => `n${i}`), at: Array(n).fill(NO_POS), edges };
}
const graphs = (count: number, maxN = 9): Graph[] => {
  const rnd = mulberry32(123);
  return Array.from({ length: count }, () => randomGraph(rnd, maxN));
};

/** Chromatic number as the fewest blocks in a partition of the nodes into independent sets (restricted-growth strings): independent of backtracking and of any k-colouring search. */
function bruteChromatic(g: Graph): number {
  const n = g.names.length;
  if (n === 0) return 0;
  const adj = adjacency(g).map((l) => new Set(l));
  const block = Array<number>(n).fill(0);
  let best = n;
  const go = (v: number, blocks: number) => {
    if (blocks >= best) return;
    if (v === n) {
      best = blocks;
      return;
    }
    for (let b = 0; b <= blocks; b++) {
      let ok = true;
      for (let u = 0; u < v && ok; u++) if (block[u] === b && adj[v].has(u)) ok = false;
      if (!ok) continue;
      block[v] = b;
      go(v + 1, Math.max(blocks, b + 1));
    }
  };
  go(0, 0);
  return best;
}

/** The degeneracy as the largest minimum degree over every non-empty subset of nodes (no peeling). */
function bruteDegeneracy(g: Graph): number {
  const n = g.names.length;
  let best = 0;
  for (let mask = 1; mask < 1 << n; mask++) {
    let minDeg = Infinity;
    for (let v = 0; v < n; v++) {
      if (!(mask & (1 << v))) continue;
      let d = 0;
      for (const [a, b] of g.edges) if ((a === v && mask & (1 << b)) || (b === v && mask & (1 << a))) d++;
      minDeg = Math.min(minDeg, d);
    }
    best = Math.max(best, minDeg);
  }
  return best;
}

function permutations(xs: number[]): number[][] {
  return xs.length < 2 ? [xs] : xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));
}

describe('greedy colouring is always proper and within the degree bounds', () => {
  it('every ordering of a small graph (all orders up to 7 nodes, 500 seeded orders otherwise) gives a proper colouring using at most max degree + 1 colours', () => {
    const rnd = mulberry32(5);
    let orders = 0;
    for (const g of graphs(300)) {
      const n = g.names.length;
      const list = n <= 6 ? permutations(identityOrder(n)) : Array.from({ length: 100 }, () => shuffle(identityOrder(n), rnd));
      for (const order of list) {
        const run = greedyColour(g, order);
        expect(conflicts(g, run.colours)).toEqual([]);
        expect(run.colours.every((c) => c >= 1)).toBe(true);
        expect(run.used).toBeLessThanOrEqual(maxDegree(g) + 1);
        orders++;
      }
    }
    expect(orders).toBeGreaterThan(20000);
  });

  it('each step takes the smallest colour no coloured neighbour has, and lists exactly the forbidden ones', () => {
    for (const g of graphs(200)) {
      const run = greedyColour(g, identityOrder(g.names.length));
      const adj = adjacency(g);
      const seen = Array<number>(g.names.length).fill(0);
      for (const s of run.steps) {
        const taken = new Set(adj[s.node].map((w) => seen[w]).filter((c) => c > 0));
        expect(s.forbidden).toEqual([...taken].sort((a, b) => a - b));
        expect(s.colour).toBe(Math.min(...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].filter((c) => !taken.has(c))));
        seen[s.node] = s.colour;
      }
    }
  });

  it('smallest-last never needs more than degeneracy + 1 colours, with the degeneracy found by checking every subset', () => {
    let tighter = 0;
    for (const g of graphs(1000)) {
      const degeneracy = bruteDegeneracy(g);
      expect(peel(g).degeneracy).toBe(degeneracy);
      const run = greedyColour(g, smallestLast(g));
      expect(conflicts(g, run.colours)).toEqual([]);
      expect(run.used).toBeLessThanOrEqual(degeneracy + 1);
      if (degeneracy + 1 < maxDegree(g) + 1) tighter++;
    }
    expect(tighter).toBeGreaterThan(100);
  });
});

describe('the exact minimum against brute force', () => {
  it('backtracking equals the fewest independent-set blocks over all partitions, 1,000 graphs of up to 9 nodes', () => {
    for (const g of graphs(1000)) {
      const c = chromatic(g);
      expect(c.number).toBe(bruteChromatic(g));
      expect(conflicts(g, c.colours)).toEqual([]);
      expect(Math.max(0, ...c.colours)).toBe(c.number);
      if (c.number > 1) expect(colourWith(g, c.number - 1)).toBeNull();
    }
  });

  it('BFS two-colouring agrees with "chromatic number at most 2", and an odd cycle is a real odd cycle', () => {
    let odd = 0;
    for (const g of graphs(1000)) {
      const t = twoColour(g);
      expect(t.ok).toBe(chromatic(g).number <= 2);
      if (t.ok) {
        expect(conflicts(g, t.colours)).toEqual([]);
        continue;
      }
      odd++;
      const cyc = t.oddCycle!;
      expect(cyc.length % 2).toBe(1);
      expect(cyc.length).toBeGreaterThanOrEqual(3);
      expect(new Set(cyc).size).toBe(cyc.length);
      const has = (a: number, b: number) => g.edges.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
      cyc.forEach((v, i) => expect(has(v, cyc[(i + 1) % cyc.length])).toBe(true));
    }
    expect(odd).toBeGreaterThan(200);
  });
});

describe('the presets, with the spec\'s numbers', () => {
  const crown = presetById('crown').graph;
  const idx = (g: Graph, names: string[]) => names.map((n) => g.names.indexOf(n));

  it('crown graph: order a1, b1, a2, b2, a3, b3, a4, b4 uses 4 colours, a1..a4 then b1..b4 uses 2, and the optimum is 2', () => {
    expect(crown.names.every((n) => n[0] === 'a' || n[0] === 'b')).toBe(true);
    // Every a_i is joined to every b_j with j != i.
    for (let i = 1; i <= 4; i++) {
      for (let j = 1; j <= 4; j++) {
        const joined = crown.edges.some(([x, y]) => [crown.names[x], crown.names[y]].sort().join() === [`a${i}`, `b${j}`].join());
        expect(joined).toBe(i !== j);
      }
    }
    const bad = idx(crown, ['a1', 'b1', 'a2', 'b2', 'a3', 'b3', 'a4', 'b4']);
    const good = idx(crown, ['a1', 'a2', 'a3', 'a4', 'b1', 'b2', 'b3', 'b4']);
    expect(greedyColour(crown, bad).used).toBe(4);
    expect(greedyColour(crown, good).used).toBe(2);
    expect(chromatic(crown).number).toBe(2);
    expect(bad).toEqual(identityOrder(8));
    expect(byName(crown)).toEqual(good);
  });

  it('K5 needs 5 colours and the 5-cycle needs 3, whatever the order', () => {
    const k5 = presetById('k5').graph;
    const odd = presetById('odd').graph;
    expect(chromatic(k5).number).toBe(5);
    expect(chromatic(odd).number).toBe(3);
    for (const order of permutations([0, 1, 2, 3, 4])) {
      expect(greedyColour(k5, order).used).toBe(5);
      expect(greedyColour(odd, order).used).toBeGreaterThanOrEqual(3);
    }
    expect(twoColour(odd).ok).toBe(false);
    expect(twoColour(odd).oddCycle).toHaveLength(5);
  });

  it('the timetable and register presets are small enough for the exact search, and greedy as given beats nothing the exact search does not: it is never fewer than the optimum', () => {
    for (const p of PRESETS) {
      const c = chromatic(p.graph).number;
      for (const o of ORDERS) {
        const order = o.build(p.graph);
        expect(isPermutation(order, p.graph.names.length)).toBe(true);
        expect(greedyColour(p.graph, order).used).toBeGreaterThanOrEqual(c);
      }
      expect(p.graph.names.length).toBeLessThanOrEqual(MAX_NODES);
      expect(c).toBe(bruteChromatic(p.graph));
    }
  });

  it('the timetable and register presets show the lesson: as given, greedy uses more colours than the optimum', () => {
    for (const id of ['timetable', 'registers'] as const) {
      const g = presetById(id).graph;
      expect(greedyColour(g, identityOrder(g.names.length)).used).toBeGreaterThan(chromatic(g).number);
    }
  });
});

describe('the editor refuses hostile input', () => {
  it('refuses a self-loop and a duplicate (in either direction), stops at 12 nodes', () => {
    const g = presetById('odd').graph;
    expect(addEdge(g, 1, 1)).toMatchObject({ ok: false });
    expect(addEdge(g, 0, 1)).toMatchObject({ ok: false });
    expect(addEdge(g, 1, 0)).toMatchObject({ ok: false });
    expect(addEdge(g, 0, 2).ok).toBe(true);
    let big = presetById('crown').graph;
    for (let i = 0; i < 20; i++) {
      const r = addNode(big);
      if (r.ok) big = r.value;
    }
    expect(big.names).toHaveLength(MAX_NODES);
    expect(new Set(big.names).size).toBe(MAX_NODES);
    expect(addNode(big).ok).toBe(false);
    expect(chromatic(big).number).toBe(2);
  });

  it('only permutations count as an order', () => {
    expect(isPermutation([2, 0, 1], 3)).toBe(true);
    expect(isPermutation([0, 0, 1], 3)).toBe(false);
    expect(isPermutation([0, 1], 3)).toBe(false);
    expect(isPermutation([0, 1, 3], 3)).toBe(false);
    expect(isPermutation([0, 1, 1.5], 3)).toBe(false);
  });

  it('a random sequence of edits keeps the graph valid and the exact search fast and right', () => {
    const rnd = mulberry32(8);
    let g = presetById('timetable').graph;
    for (let step = 0; step < 300; step++) {
      if (rnd() < 0.25) {
        const r = addNode(g);
        if (r.ok) g = r.value;
      } else {
        const r = addEdge(g, randInt(0, g.names.length - 1, rnd), randInt(0, g.names.length - 1, rnd));
        if (r.ok) g = r.value;
      }
      expect(g.names.length).toBeLessThanOrEqual(MAX_NODES);
      expect(new Set(g.edges.map(([a, b]) => `${a}-${b}`)).size).toBe(g.edges.length);
      expect(g.edges.every(([a, b]) => a < b)).toBe(true);
      expect(degrees(g).reduce((s, d) => s + d, 0)).toBe(2 * g.edges.length);
      expect(conflicts(g, chromatic(g).colours)).toEqual([]);
    }
  });
});
