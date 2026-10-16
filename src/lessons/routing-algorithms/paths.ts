/**
 * Shortest paths on a small undirected weighted graph: what a link-state router runs on its own
 * copy of the database. Every tie is broken by the smallest router id, so two routers that hold
 * the same database always pick the same next hop.
 */
export type Adj = Record<string, Record<string, number>>;

const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Dijkstra from `src`: cost to every router, `Infinity` when unreachable. O(n²), fine for a dozen routers. */
export function dijkstra(adj: Adj, src: string): Record<string, number> {
  const dist: Record<string, number> = {};
  for (const id of Object.keys(adj)) dist[id] = Infinity;
  dist[src] = 0;
  const done = new Set<string>();
  for (;;) {
    let best: string | null = null;
    for (const id of Object.keys(dist).sort(byId)) {
      if (!done.has(id) && dist[id] < Infinity && (best === null || dist[id] < dist[best])) best = id;
    }
    if (best === null) return dist;
    done.add(best);
    for (const [n, w] of Object.entries(adj[best] ?? {})) {
      if (dist[best] + w < dist[n]) dist[n] = dist[best] + w;
    }
  }
}

/** For each destination, the neighbour of `src` that starts a cheapest path (smallest id on a tie), or null for itself or unreachable. */
export function nextHops(adj: Adj, src: string): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const dest of Object.keys(adj)) {
    out[dest] = null;
    if (dest === src) continue;
    const toDest = dijkstra(adj, dest);
    let best: string | null = null;
    let bestCost = Infinity;
    for (const [n, w] of Object.entries(adj[src] ?? {}).sort(([a], [b]) => byId(a, b))) {
      if (w + toDest[n] < bestCost) {
        bestCost = w + toDest[n];
        best = n;
      }
    }
    out[dest] = best;
  }
  return out;
}

/** The shortest-path tree of `src` as parent edges [parent, child], one per reachable router. */
export function treeEdges(adj: Adj, src: string): [string, string][] {
  const dist = dijkstra(adj, src);
  const edges: [string, string][] = [];
  for (const child of Object.keys(adj).sort(byId)) {
    if (child === src || dist[child] === Infinity) continue;
    const parent = Object.entries(adj[child] ?? {})
      .sort(([a], [b]) => byId(a, b))
      .find(([p, w]) => dist[p] + w === dist[child]);
    if (parent) edges.push([parent[0], child]);
  }
  return edges;
}
