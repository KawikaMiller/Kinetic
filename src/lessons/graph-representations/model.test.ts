import { describe, expect, it } from 'vitest';
import { mulberry32, randInt } from '../../core/random';
import {
  adjacencyList, adjacencyMatrix, addEdge, addNode, components, degrees, findCycle, freeSpot, hasEdge, memory, properties, setDirected,
  twoColouring, type Graph,
} from './model';
import { PRESETS } from './presets';

const TRIALS = 400;
const preset = (id: string) => PRESETS.find((p) => p.id === id)!.graph;

function randomGraph(rnd: () => number, directed: boolean): Graph {
  const v = randInt(1, 8, rnd);
  let g: Graph = { directed, weighted: false, nodes: Array.from({ length: v }, (_, id) => ({ id, label: String(id), x: 0, y: 0 })), edges: [] };
  const density = rnd();
  for (let u = 0; u < v; u++) for (let w = 0; w < v; w++) if (u !== w && rnd() < density * 0.5) g = addEdge(g, u, w);
  return g;
}

/** Independent reference: union-find over the edges, direction ignored. */
function unionFindCount(g: Graph) {
  const parent = new Map(g.nodes.map((n) => [n.id, n.id]));
  const find = (x: number): number => (parent.get(x) === x ? x : find(parent.get(x)!));
  for (const e of g.edges) parent.set(find(e.u), find(e.v));
  return new Set(g.nodes.map((n) => find(n.id))).size;
}

/** Independent reference: Kahn's algorithm finishes only if the directed graph has no cycle. */
function kahnAcyclic(g: Graph) {
  const indeg = new Map(g.nodes.map((n) => [n.id, 0]));
  for (const e of g.edges) indeg.set(e.v, indeg.get(e.v)! + 1);
  const ready = g.nodes.filter((n) => indeg.get(n.id) === 0).map((n) => n.id);
  let removed = 0;
  while (ready.length) {
    const u = ready.pop()!;
    removed++;
    for (const e of g.edges) if (e.u === u && indeg.set(e.v, indeg.get(e.v)! - 1).get(e.v) === 0) ready.push(e.v);
  }
  return removed === g.nodes.length;
}

/** Independent reference: try every 2-colouring. */
function bruteBipartite(g: Graph) {
  const ids = g.nodes.map((n) => n.id);
  for (let mask = 0; mask < 1 << ids.length; mask++) {
    const side = new Map(ids.map((id, i) => [id, (mask >> i) & 1]));
    if (g.edges.every((e) => side.get(e.u) !== side.get(e.v))) return true;
  }
  return false;
}

/** A returned cycle must use real edges and close up: every node entered as often as left. */
function expectRealCycle(g: Graph, cycle: [number, number][]) {
  expect(cycle.length).toBeGreaterThanOrEqual(g.directed ? 2 : 3);
  const balance = new Map<number, number>();
  for (const [a, b] of cycle) {
    expect(hasEdge(g, a, b)).toBe(true);
    balance.set(a, (balance.get(a) ?? 0) + 1);
    balance.set(b, (balance.get(b) ?? 0) - 1);
  }
  for (const v of balance.values()) expect(v).toBe(0);
}

describe('cycle detection', () => {
  it('undirected: agrees with "more edges than V − components" on seeded random graphs', () => {
    const rnd = mulberry32(51);
    for (let t = 0; t < TRIALS; t++) {
      const g = randomGraph(rnd, false);
      const cycle = findCycle(g);
      expect(cycle !== null).toBe(g.edges.length > g.nodes.length - unionFindCount(g));
      if (cycle) expectRealCycle(g, cycle);
    }
  });

  it('directed (three-colour DFS): agrees with Kahn\'s topological sort on seeded random graphs', () => {
    const rnd = mulberry32(52);
    for (let t = 0; t < TRIALS; t++) {
      const g = randomGraph(rnd, true);
      const cycle = findCycle(g);
      expect(cycle === null).toBe(kahnAcyclic(g));
      if (cycle) expectRealCycle(g, cycle);
    }
  });

  it('treats a 2-node back-and-forth as a cycle only when directed', () => {
    let g: Graph = { directed: true, weighted: false, nodes: [{ id: 0, label: 'A', x: 0, y: 0 }, { id: 1, label: 'B', x: 0, y: 0 }], edges: [] };
    g = addEdge(addEdge(g, 0, 1), 1, 0);
    expect(findCycle(g)).not.toBeNull();
    expect(findCycle(setDirected(g, false))).toBeNull();
  });
});

describe('components, bipartite, trees', () => {
  it('components match union-find', () => {
    const rnd = mulberry32(53);
    for (let t = 0; t < TRIALS; t++) {
      const g = randomGraph(rnd, rnd() < 0.5);
      const comps = components(g);
      expect(comps).toHaveLength(unionFindCount(g));
      expect(comps.flat().sort((a, b) => a - b)).toEqual(g.nodes.map((n) => n.id));
    }
  });

  it('two-colouring matches trying every colouring, and a returned colouring is valid', () => {
    const rnd = mulberry32(54);
    for (let t = 0; t < TRIALS; t++) {
      const g = randomGraph(rnd, false);
      const colouring = twoColouring(g);
      expect(colouring !== null).toBe(bruteBipartite(g));
      if (colouring) for (const e of g.edges) expect(colouring.get(e.u)).not.toBe(colouring.get(e.v));
    }
  });

  it('gets every preset\'s properties right', () => {
    const social = properties(preset('social'));
    expect(social.components).toHaveLength(2);
    expect(social.cycle).not.toBeNull(); // A-B-C triangle
    expect(social.isTree).toBe(false);
    expect(social.bipartite).toBeNull();

    const roads = properties(preset('roads'));
    expect(roads.components).toHaveLength(1);
    expect(roads.bipartite).not.toBeNull();
    expect(roads.cycle).not.toBeNull();

    const courses = properties(preset('courses'));
    expect(courses.isDag).toBe(true);
    expect(courses.cycle).toBeNull();
    expect(courses.isTree).toBeNull();

    const complete = properties(preset('complete'));
    expect(preset('complete').edges).toHaveLength(15);
    expect(complete.bipartite).toBeNull();
  });

  it('a path is a tree; add one edge and it isn\'t', () => {
    let g: Graph = { directed: false, weighted: false, nodes: [0, 1, 2, 3].map((id) => ({ id, label: String(id), x: 0, y: 0 })), edges: [] };
    g = addEdge(addEdge(addEdge(g, 0, 1), 1, 2), 2, 3);
    expect(properties(g).isTree).toBe(true);
    expect(properties(addEdge(g, 3, 0)).isTree).toBe(false);
  });
});

describe('representations', () => {
  it('matrix and list describe the same edges, with the expected memory and degree sums', () => {
    const rnd = mulberry32(55);
    for (let t = 0; t < TRIALS; t++) {
      const g = randomGraph(rnd, rnd() < 0.5);
      const m = adjacencyMatrix(g);
      const list = adjacencyList(g);
      g.nodes.forEach((a, i) =>
        g.nodes.forEach((b, j) => expect(m[i][j] !== 0).toBe(list.get(a.id)!.some((n) => n.id === b.id))),
      );
      const listEntries = [...list.values()].reduce((s, l) => s + l.length, 0);
      expect(memory(g)).toEqual({ matrixCells: g.nodes.length ** 2, listEntries: g.nodes.length + listEntries });
      const degreeSum = g.nodes.reduce((s, n) => s + degrees(g, n.id).total, 0);
      expect(degreeSum).toBe(2 * g.edges.length);
      if (g.directed) {
        expect(g.nodes.reduce((s, n) => s + degrees(g, n.id).in, 0)).toBe(g.edges.length);
      } else {
        expect(m).toEqual(m[0] ? m[0].map((_, j) => m.map((row) => row[j])) : m); // symmetric
      }
    }
  });

  it('keeps graphs simple: no self-loops or duplicate edges', () => {
    let g: Graph = { directed: false, weighted: false, nodes: [0, 1].map((id) => ({ id, label: String(id), x: 0, y: 0 })), edges: [] };
    g = addEdge(addEdge(addEdge(g, 0, 0), 0, 1), 1, 0);
    expect(g.edges).toHaveLength(1);
  });
});

describe('placing a node from the keyboard', () => {
  const empty: Graph = { directed: false, weighted: false, nodes: [], edges: [] };
  it('finds a spot clear of every node, and none when the drawing is full', () => {
    const first = freeSpot(empty, 200, 100, 50)!;
    expect(first).toEqual({ x: 25, y: 25 });
    let g = empty;
    for (let i = 0; i < 8; i++) {
      const p = freeSpot(g, 200, 100, 50)!;
      expect(g.nodes.every((n) => Math.hypot(n.x - p.x, n.y - p.y) >= 50)).toBe(true);
      g = addNode(g, p.x, p.y);
    }
    expect(freeSpot(g, 200, 100, 50)).toBeNull();
  });
});
