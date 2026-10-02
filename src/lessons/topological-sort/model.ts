/**
 * Topological sorting, as pure functions over a directed graph: Kahn's algorithm and
 * reversed DFS post-order (each with an event trace for the frames), an order checker,
 * a cycle finder, and an exact count of valid orders.
 *
 * An edge a → b means "a must come before b".
 */

export interface Dag {
  nodes: readonly string[];
  edges: readonly { from: string; to: string }[];
}

export type KahnEvent =
  | { kind: 'start'; indeg: Record<string, number>; queue: string[] }
  | { kind: 'emit'; node: string; queue: string[] }
  | { kind: 'consume'; node: string; edges: number[]; freed: string[]; indeg: Record<string, number>; queue: string[] };

export interface KahnResult {
  order: string[];
  events: KahnEvent[];
  /** Nodes never emitted: non-empty exactly when the graph has a cycle. */
  stuck: string[];
}

/** Kahn's algorithm with a FIFO queue; ties go in node order. */
export function kahn(g: Dag): KahnResult {
  const indeg: Record<string, number> = Object.fromEntries(g.nodes.map((n) => [n, 0]));
  g.edges.forEach((e) => indeg[e.to]++);
  const queue = g.nodes.filter((n) => indeg[n] === 0);
  const events: KahnEvent[] = [{ kind: 'start', indeg: { ...indeg }, queue: [...queue] }];
  const order: string[] = [];
  while (queue.length) {
    const node = queue.shift()!;
    order.push(node);
    events.push({ kind: 'emit', node, queue: [...queue] });
    const out: number[] = [];
    const freed: string[] = [];
    g.edges.forEach((e, i) => {
      if (e.from !== node) return;
      out.push(i);
      if (--indeg[e.to] === 0) {
        queue.push(e.to);
        freed.push(e.to);
      }
    });
    events.push({ kind: 'consume', node, edges: out, freed, indeg: { ...indeg }, queue: [...queue] });
  }
  const done = new Set(order);
  return { order, events, stuck: g.nodes.filter((n) => !done.has(n)) };
}

export type DfsEvent =
  | { kind: 'enter'; node: string }
  | { kind: 'finish'; node: string }
  /** A back edge: `to` is still on the path, so the path from `to` down to `from` plus this edge is a cycle. */
  | { kind: 'back'; from: string; to: string; edge: number; cycle: string[] };

export interface DfsResult {
  /** Reversed post-order; empty when a cycle stopped the search. */
  order: string[];
  events: DfsEvent[];
  cycle: string[] | null;
}

/** Depth-first search from each unvisited node in node order; a node is written to the front when it finishes. */
export function dfsTopo(g: Dag): DfsResult {
  const state = new Map<string, 'path' | 'done'>();
  const path: string[] = [];
  const post: string[] = [];
  const events: DfsEvent[] = [];
  let cycle: string[] | null = null;

  const visit = (n: string): boolean => {
    state.set(n, 'path');
    path.push(n);
    events.push({ kind: 'enter', node: n });
    for (let i = 0; i < g.edges.length; i++) {
      const e = g.edges[i];
      if (e.from !== n) continue;
      const s = state.get(e.to);
      if (s === 'path') {
        cycle = path.slice(path.indexOf(e.to));
        events.push({ kind: 'back', from: n, to: e.to, edge: i, cycle });
        return false;
      }
      if (s === undefined && !visit(e.to)) return false;
    }
    path.pop();
    state.set(n, 'done');
    post.push(n);
    events.push({ kind: 'finish', node: n });
    return true;
  };
  for (const n of g.nodes) if (!state.has(n) && !visit(n)) break;
  return { order: cycle ? [] : post.reverse(), events, cycle };
}

/** True when `order` lists every node exactly once and every edge points forward in it. */
export function isValidOrder(g: Dag, order: readonly string[]): boolean {
  if (order.length !== g.nodes.length) return false;
  const pos = new Map(order.map((n, i) => [n, i]));
  if (pos.size !== g.nodes.length || g.nodes.some((n) => !pos.has(n))) return false;
  return g.edges.every((e) => pos.get(e.from)! < pos.get(e.to)!);
}

/**
 * A cycle among `within` (default: all nodes), as nodes v0 … vk where each vi → vi+1 and
 * vk → v0 are edges, or null when that part of the graph is acyclic.
 */
export function findCycle(g: Dag, within: readonly string[] = g.nodes): string[] | null {
  const keep = new Set(within);
  return dfsTopo({ nodes: g.nodes.filter((n) => keep.has(n)), edges: g.edges.filter((e) => keep.has(e.from) && keep.has(e.to)) }).cycle;
}

/** Indices of the edges that run around `cycle` (consecutive pairs, plus last → first). */
export function cycleEdges(g: Dag, cycle: readonly string[]): number[] {
  return cycle.map((a, i) => {
    const b = cycle[(i + 1) % cycle.length];
    return g.edges.findIndex((e) => e.from === a && e.to === b);
  });
}

/** Largest graph countOrders accepts: 2^MAX subsets. */
export const COUNT_MAX_NODES = 16;

/**
 * The exact number of valid topological orders (0 when there's a cycle), by dynamic
 * programming over the set of nodes already placed: ways(S) sums ways(S ∪ {v}) over every
 * v whose predecessors are all in S.
 */
export function countOrders(g: Dag): number {
  const n = g.nodes.length;
  if (n > COUNT_MAX_NODES) throw new RangeError(`countOrders handles at most ${COUNT_MAX_NODES} nodes`);
  const idx = new Map(g.nodes.map((v, i) => [v, i]));
  const preds = new Array<number>(n).fill(0);
  g.edges.forEach((e) => (preds[idx.get(e.to)!] |= 1 << idx.get(e.from)!));
  const full = (1 << n) - 1;
  const ways = new Float64Array(1 << n);
  ways[full] = 1;
  for (let s = full - 1; s >= 0; s--) {
    let total = 0;
    for (let v = 0; v < n; v++) {
      if (s & (1 << v)) continue;
      if ((preds[v] & s) === preds[v]) total += ways[s | (1 << v)];
    }
    ways[s] = total;
  }
  return ways[0];
}

/** Why an edge the learner proposes can't be added, or null when it can. */
export function refuseEdge(g: Dag, from: string, to: string): string | null {
  if (from === to) return 'A task can’t depend on itself.';
  if (!g.nodes.includes(from) || !g.nodes.includes(to)) return 'Both ends must be nodes in the graph.';
  if (g.edges.some((e) => e.from === from && e.to === to)) return `${from} → ${to} is already there.`;
  return null;
}

/**
 * The edges to lay the drawing out by: `base` edges first, then each other edge only if it
 * keeps the set acyclic. Edges that close a cycle are drawn but don't move any node.
 */
export function layoutEdges(g: Dag, base: Dag): Dag['edges'] {
  const inBase = (e: Dag['edges'][number]) => base.edges.some((b) => b.from === e.from && b.to === e.to);
  const kept = g.edges.filter(inBase);
  for (const e of g.edges) if (!inBase(e) && !findCycle({ nodes: g.nodes, edges: [...kept, e] })) kept.push(e);
  return kept;
}
