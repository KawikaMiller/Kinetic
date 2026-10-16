import type { Rnd } from '../../core/random';
import { mulberry32 } from '../../core/random';

export interface Graph {
  n: number;
  edges: [number, number][];
}

export const V_MIN = 6;
export const V_MAX = 8;
export const E_MAX = 20;
export const BATCH = 1000;

export interface Contraction {
  /** The index (into graph.edges) of the edge chosen at random among the edges still between different super-nodes. */
  edge: number;
}

export interface KargerRun {
  steps: Contraction[];
  /** The super-node each vertex ends in (a representative vertex id). */
  group: number[];
  /** Edges between the two last super-nodes, as indices into graph.edges. */
  cutEdges: number[];
  cut: number;
}

/** Contract random edges until two super-nodes remain (or no edge joins different ones: a disconnected graph). */
export function kargerRun(g: Graph, rnd: Rnd, maxSteps = Infinity): KargerRun {
  const parent = Array.from({ length: g.n }, (_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const steps: Contraction[] = [];
  let groups = g.n;
  while (groups > 2 && steps.length < maxSteps) {
    const live = g.edges.flatMap((e, i) => (find(e[0]) !== find(e[1]) ? [i] : []));
    if (live.length === 0) break;
    const edge = live[Math.floor(rnd() * live.length)];
    parent[find(g.edges[edge][0])] = find(g.edges[edge][1]);
    groups--;
    steps.push({ edge });
  }
  const group = g.n === 0 ? [] : Array.from({ length: g.n }, (_, i) => find(i));
  const roots = [...new Set(group)];
  const first = roots[0];
  const cutEdges = g.edges.flatMap((e, i) => ((group[e[0]] === first) !== (group[e[1]] === first) ? [i] : []));
  return { steps, group, cutEdges, cut: cutEdges.length };
}

/** The super-node of each vertex after the first `shown` contractions of a run, numbered 0, 1, ... by first appearance. */
export function groupsAfter(g: Graph, steps: readonly Contraction[], shown: number): number[] {
  const parent = Array.from({ length: g.n }, (_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  for (const { edge } of steps.slice(0, shown)) parent[find(g.edges[edge][0])] = find(g.edges[edge][1]);
  const order = new Map<number, number>();
  return Array.from({ length: g.n }, (_, v) => {
    const root = find(v);
    if (!order.has(root)) order.set(root, order.size);
    return order.get(root)!;
  });
}

/** The minimum cut by checking every partition with the last vertex fixed on one side: 2^(n-1) of them. */
export function bruteMinCut(g: Graph): { size: number; count: number } {
  let size = Infinity;
  let count = 0;
  for (let mask = 1; mask < 1 << (g.n - 1); mask++) {
    // mask names the vertices on side A; the last vertex is always on side B, so each partition is checked once.
    let cut = 0;
    for (const [a, b] of g.edges) if (((mask >> a) & 1) !== ((mask >> b) & 1)) cut++;
    if (cut < size) {
      size = cut;
      count = 1;
    } else if (cut === size) {
      count++;
    }
  }
  return { size, count };
}

/** Karger's bound: one run finds a given minimum cut with probability at least 2 / (n (n - 1)). */
export const kargerBound = (n: number): number => 2 / (n * (n - 1));

/** `runs` seeded runs: how many found a cut of the minimum size, and the smallest cut seen. */
export function repeat(g: Graph, runs: number, seed: number, min: number): { hits: number; runs: number; best: number } {
  const rnd = mulberry32(seed);
  let hits = 0;
  let best = Infinity;
  for (let r = 0; r < runs; r++) {
    const { cut } = kargerRun(g, rnd);
    if (cut === min) hits++;
    best = Math.min(best, cut);
  }
  return { hits, runs, best };
}

/** Independent runs needed so that the chance of missing a minimum cut every time is at most `miss`, using the bound per run. */
export function runsNeeded(n: number, miss: number): number {
  return Math.ceil(Math.log(miss) / Math.log(1 - kargerBound(n)));
}

/** The graph with the edge a-b added, or the sentence refusing it. */
export function addEdge(g: Graph, a: number, b: number): { ok: true; graph: Graph } | { ok: false; error: string } {
  if (a === b) return { ok: false, error: 'An edge needs two different vertices.' };
  if (g.edges.some(([x, y]) => (x === a && y === b) || (x === b && y === a))) return { ok: false, error: `${a}-${b} is already an edge: this lesson uses simple graphs.` };
  if (g.edges.length >= E_MAX) return { ok: false, error: `At most ${E_MAX} edges.` };
  return { ok: true, graph: { n: g.n, edges: [...g.edges, [a, b]] } };
}

export function removeEdge(g: Graph, index: number): Graph {
  return { n: g.n, edges: g.edges.filter((_, i) => i !== index) };
}

export interface Preset {
  id: string;
  label: string;
  graph: Graph;
}

/** The seeded presets: each has between 6 and 8 vertices. */
export const PRESETS: Preset[] = [
  { id: 'clusters', label: 'Two triangles, two bridges', graph: { n: 6, edges: [[0, 1], [1, 2], [0, 2], [3, 4], [4, 5], [3, 5], [2, 3], [0, 5]] } },
  { id: 'cycle', label: 'A ring of 7', graph: { n: 7, edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 0]] } },
  { id: 'dense', label: 'Dense core with a triangle tail', graph: { n: 7, edges: [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3], [2, 4], [3, 4], [4, 5], [5, 6], [4, 6], [1, 4]] } },
  { id: 'cubes', label: 'Two squares joined', graph: { n: 8, edges: [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [2, 6]] } },
];
