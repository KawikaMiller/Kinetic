/**
 * Strongly connected components of a directed graph on nodes 0..n-1, and the condensation (the
 * graph with each component collapsed to a node). Extracted from strongly-connected-components;
 * markov-chains uses it for communicating classes. Nodes are numbers and edges are `[from, to]`
 * pairs, so any lesson's graph type can feed it. Recursive depth-first search: fine to a few
 * thousand nodes, which is far beyond any lesson here.
 */

export type Arc = readonly [from: number, to: number];

/** Out-neighbours of each node in ascending order, without repeats: the fixed order every search here visits them in. */
export function adjacency(n: number, edges: readonly Arc[]): number[][] {
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (const [a, b] of edges) adj[a].push(b);
  return adj.map((l) => [...new Set(l)].sort((a, b) => a - b));
}

export const reverseEdges = (edges: readonly Arc[]): Arc[] => edges.map(([a, b]) => [b, a] as const);

export interface Components {
  /** Each component as a sorted node list, in the order Tarjan's search closes them: a component comes after every component it can reach (sinks first). */
  components: number[][];
  /** `comp[v]` is the index in `components` of v's component. */
  comp: number[];
}

/** Tarjan's one-pass algorithm. A self-loop or a lone node is a component of its own. */
export function stronglyConnectedComponents(n: number, edges: readonly Arc[]): Components {
  const adj = adjacency(n, edges);
  const index = new Array<number>(n).fill(-1);
  const low = new Array<number>(n).fill(0);
  const onStack = new Array<boolean>(n).fill(false);
  const stack: number[] = [];
  const components: number[][] = [];
  const comp = new Array<number>(n).fill(-1);
  let counter = 0;
  const strong = (v: number) => {
    index[v] = low[v] = counter++;
    stack.push(v);
    onStack[v] = true;
    for (const w of adj[v]) {
      if (index[w] < 0) {
        strong(w);
        low[v] = Math.min(low[v], low[w]);
      } else if (onStack[w]) low[v] = Math.min(low[v], index[w]);
    }
    if (low[v] === index[v]) {
      const c: number[] = [];
      let w: number;
      do {
        w = stack.pop()!;
        onStack[w] = false;
        comp[w] = components.length;
        c.push(w);
      } while (w !== v);
      components.push(c.sort((a, b) => a - b));
    }
  };
  for (let v = 0; v < n; v++) if (index[v] < 0) strong(v);
  return { components, comp };
}

/** A partition in canonical form: each class sorted, classes sorted by their smallest node. Equal partitions compare equal as strings. */
export const canonicalPartition = (classes: readonly (readonly number[])[]): string =>
  JSON.stringify([...classes].map((c) => [...c].sort((a, b) => a - b)).sort((a, b) => a[0] - b[0]));

export interface Condensation {
  count: number;
  /** Unique edges between different components. */
  edges: Arc[];
  /** A topological order of the components (Kahn's algorithm), or null if the condensation had a cycle (it cannot). */
  order: number[] | null;
}

/** Collapse each component (`comp[v]`, `count` components) to a node: the unique edges between components, and a topological order of them. */
export function condense(edges: readonly Arc[], comp: readonly number[], count: number): Condensation {
  const seen = new Set<string>();
  const between: Arc[] = [];
  for (const [a, b] of edges) {
    if (comp[a] === comp[b] || seen.has(`${comp[a]}>${comp[b]}`)) continue;
    seen.add(`${comp[a]}>${comp[b]}`);
    between.push([comp[a], comp[b]]);
  }
  const indeg = new Array<number>(count).fill(0);
  for (const [, b] of between) indeg[b]++;
  const queue = indeg.flatMap((d, c) => (d === 0 ? [c] : []));
  const order: number[] = [];
  while (queue.length) {
    const c = queue.shift()!;
    order.push(c);
    for (const [a, b] of between) if (a === c && --indeg[b] === 0) queue.push(b);
  }
  return { count, edges: between, order: order.length === count ? order : null };
}
