import type { Costs, Graph, NegativeCycle } from './model';

/** The sentence that compares the two all-pairs costs, from the counts on screen. */
export function costVerdict(c: Costs): string {
  const bf = c.bellmanFordAll;
  const fw = c.floydWarshall;
  const stopped = fw < c.floydWarshallFull ? ' Floyd-Warshall stopped early at a negative diagonal, so its count is a partial run.' : '';
  if (bf === fw) return `For all pairs on this graph the two cost the same: ${bf} comparisons each.${stopped}`;
  const cheaper = bf < fw ? 'Bellman-Ford from every source' : 'Floyd-Warshall';
  const dearer = bf < fw ? fw : bf;
  const less = bf < fw ? bf : fw;
  return `For all pairs on this graph, ${cheaper} is cheaper: ${less} comparisons against ${dearer}.${stopped} Adding edges raises Bellman-Ford's count; a full Floyd-Warshall run costs the same ${c.floydWarshallFull} for any ${c.nodes}-node graph.`;
}

/** A distance as it reads on screen: a number, an infinity for "not reached", or the no-shortest-path words. */
export function distText(g: Graph, x: number): string {
  if (x === Infinity) return '∞';
  if (x === -Infinity) return 'no shortest path';
  return g.market ? x.toFixed(3) : String(x);
}

/** A signed sum or weight as typed: market numbers to three decimals, integers plain. */
export const sumText = (g: Graph, x: number): string => (g.market ? x.toFixed(3) : String(x));

/** "x→t (-2)": an edge with its weight. */
export function edgeText(g: Graph, i: number): string {
  const e = g.edges[i];
  return `${g.names[e.from]}→${g.names[e.to]} (${sumText(g, e.w)})`;
}

/** The nodes of a cycle round to the start, beginning at the lowest-numbered node so the same cycle always reads the same. */
export function cycleText(g: Graph, c: NegativeCycle): string {
  const start = c.nodes.indexOf(Math.min(...c.nodes));
  const ring = [...c.nodes.slice(start), ...c.nodes.slice(0, start)];
  return [...ring, ring[0]].map((v) => g.names[v]).join('→');
}

export const nodeList = (g: Graph, nodes: readonly number[]): string => nodes.map((v) => g.names[v]).join(', ');
