// A small graph and everything the lesson derives from it: both memory layouts and the
// structural properties. Pure, so the stage and the tests share one implementation.

export interface GNode {
  id: number;
  label: string;
  x: number;
  y: number;
}

export interface GEdge {
  u: number;
  v: number;
  w: number;
}

export interface Graph {
  directed: boolean;
  weighted: boolean;
  nodes: GNode[];
  edges: GEdge[];
}

export const MAX_NODES = 10;

const sameEdge = (g: Graph, e: GEdge, u: number, v: number) => (e.u === u && e.v === v) || (!g.directed && e.u === v && e.v === u);

export const hasEdge = (g: Graph, u: number, v: number) => g.edges.some((e) => sameEdge(g, e, u, v));

/** Add u→v (or u—v). No self-loops or duplicates: this lesson sticks to simple graphs. */
export function addEdge(g: Graph, u: number, v: number, w = 1): Graph {
  if (u === v || hasEdge(g, u, v)) return g;
  return { ...g, edges: [...g.edges, { u, v, w }] };
}

export function addNode(g: Graph, x: number, y: number): Graph {
  if (g.nodes.length >= MAX_NODES) return g;
  const id = Math.max(-1, ...g.nodes.map((n) => n.id)) + 1;
  const used = new Set(g.nodes.map((n) => n.label));
  const label = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].find((c) => !used.has(c))!;
  return { ...g, nodes: [...g.nodes, { id, label, x, y }] };
}

/**
 * The first spot, scanning row by row, at least `gap` from every node and `gap / 2` inside the
 * drawing: where the keyboard "Add a node" button puts it. Null when the drawing is full.
 */
export function freeSpot(g: Graph, width: number, height: number, gap: number): { x: number; y: number } | null {
  for (let y = gap / 2; y <= height - gap / 2; y += gap) {
    for (let x = gap / 2; x <= width - gap / 2; x += gap) {
      if (g.nodes.every((n) => Math.hypot(n.x - x, n.y - y) >= gap)) return { x, y };
    }
  }
  return null;
}

export const removeNode = (g: Graph, id: number): Graph => ({
  ...g,
  nodes: g.nodes.filter((n) => n.id !== id),
  edges: g.edges.filter((e) => e.u !== id && e.v !== id),
});

export const removeEdge = (g: Graph, u: number, v: number): Graph => ({ ...g, edges: g.edges.filter((e) => !sameEdge(g, e, u, v)) });

/** Switch directed/undirected; going undirected merges u→v and v→u into one edge. */
export function setDirected(g: Graph, directed: boolean): Graph {
  if (directed === g.directed) return g;
  let next: Graph = { ...g, directed, edges: [] };
  for (const e of g.edges) next = addEdge(next, e.u, e.v, e.w);
  return next;
}

/** Neighbours reachable in one step (out-neighbours when directed), sorted by label order. */
export function neighbours(g: Graph, u: number): { id: number; w: number }[] {
  const order = new Map(g.nodes.map((n, i) => [n.id, i]));
  const out: { id: number; w: number }[] = [];
  for (const e of g.edges) {
    if (e.u === u) out.push({ id: e.v, w: e.w });
    else if (!g.directed && e.v === u) out.push({ id: e.u, w: e.w });
  }
  return out.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
}

/** V × V grid in node order: the weight (or 1) where an edge exists, else 0. */
export function adjacencyMatrix(g: Graph): number[][] {
  const index = new Map(g.nodes.map((n, i) => [n.id, i]));
  const m = g.nodes.map(() => g.nodes.map(() => 0));
  for (const e of g.edges) {
    const w = g.weighted ? e.w : 1;
    m[index.get(e.u)!][index.get(e.v)!] = w;
    if (!g.directed) m[index.get(e.v)!][index.get(e.u)!] = w;
  }
  return m;
}

export const adjacencyList = (g: Graph) => new Map(g.nodes.map((n) => [n.id, neighbours(g, n.id)]));

/** Memory: the matrix always has V² cells; the list has one head per node plus one entry per edge end. */
export function memory(g: Graph) {
  const v = g.nodes.length;
  const e = g.edges.length;
  return { matrixCells: v * v, listEntries: v + (g.directed ? e : 2 * e) };
}

export function degrees(g: Graph, u: number) {
  const out = g.edges.filter((e) => e.u === u).length;
  const inn = g.edges.filter((e) => e.v === u).length;
  return g.directed ? { in: inn, out, total: inn + out } : { in: inn + out, out: inn + out, total: inn + out };
}

/** Connected components, ignoring edge direction (weakly connected when directed). */
export function components(g: Graph): number[][] {
  const seen = new Set<number>();
  const result: number[][] = [];
  const undirected: Graph = { ...g, directed: false };
  for (const start of g.nodes) {
    if (seen.has(start.id)) continue;
    const comp: number[] = [];
    const stack = [start.id];
    seen.add(start.id);
    while (stack.length) {
      const u = stack.pop()!;
      comp.push(u);
      for (const { id } of neighbours(undirected, u)) {
        if (!seen.has(id)) {
          seen.add(id);
          stack.push(id);
        }
      }
    }
    result.push(comp);
  }
  return result;
}

/**
 * One cycle as a list of edges [u, v], or null. Directed graphs use three-colour DFS
 * (a "grey" node reached again is a back edge); undirected graphs use DFS that ignores
 * the edge it arrived by.
 */
export function findCycle(g: Graph): [number, number][] | null {
  const parent = new Map<number, number | null>();
  const colour = new Map<number, 'grey' | 'black'>();
  const walkBack = (from: number, to: number): [number, number][] => {
    // edge from → to closes the cycle; follow parents from `from` back up to `to`
    const edges: [number, number][] = [[from, to]];
    let at = from;
    while (at !== to) {
      const p = parent.get(at)!;
      edges.push([p, at]);
      at = p;
    }
    return edges;
  };
  const dfs = (u: number, via: number | null): [number, number][] | null => {
    colour.set(u, 'grey');
    for (const { id: v } of neighbours(g, u)) {
      if (!g.directed && v === via) continue;
      if (colour.get(v) === 'grey' || (!g.directed && colour.has(v))) return walkBack(u, v);
      if (!colour.has(v)) {
        parent.set(v, u);
        const found = dfs(v, u);
        if (found) return found;
      }
    }
    colour.set(u, 'black');
    return null;
  };
  for (const n of g.nodes) {
    if (colour.has(n.id)) continue;
    parent.set(n.id, null);
    const found = dfs(n.id, null);
    if (found) return found;
  }
  return null;
}

/** Two-colouring by BFS on the undirected view: the side (0/1) of each node, or null if impossible. */
export function twoColouring(g: Graph): Map<number, 0 | 1> | null {
  const undirected: Graph = { ...g, directed: false };
  const side = new Map<number, 0 | 1>();
  for (const start of g.nodes) {
    if (side.has(start.id)) continue;
    side.set(start.id, 0);
    const queue = [start.id];
    while (queue.length) {
      const u = queue.shift()!;
      for (const { id: v } of neighbours(undirected, u)) {
        if (!side.has(v)) {
          side.set(v, side.get(u) === 0 ? 1 : 0);
          queue.push(v);
        } else if (side.get(v) === side.get(u)) return null;
      }
    }
  }
  return side;
}

export interface GraphProperties {
  components: number[][];
  cycle: [number, number][] | null;
  /** Only meaningful for directed graphs. */
  isDag: boolean | null;
  /** Only meaningful for undirected graphs: connected, no cycle. */
  isTree: boolean | null;
  bipartite: Map<number, 0 | 1> | null;
}

export function properties(g: Graph): GraphProperties {
  const comps = components(g);
  const cycle = findCycle(g);
  return {
    components: comps,
    cycle,
    isDag: g.directed ? cycle === null : null,
    isTree: g.directed ? null : g.nodes.length > 0 && comps.length === 1 && cycle === null,
    bipartite: twoColouring(g),
  };
}
