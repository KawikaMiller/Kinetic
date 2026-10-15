import { DOMAIN, type Point } from './data';
import type { Hnsw, TraceStep } from './hnsw';

const SIZE = 380;
const PAD = 14;
const px = (v: number) => PAD + (v / DOMAIN) * (SIZE - 2 * PAD);
const py = (v: number) => SIZE - PAD - (v / DOMAIN) * (SIZE - 2 * PAD);

/**
 * One layer of the graph as a flat plane: every node on the layer, its links as one path, the query, and the search so far (the
 * nodes visited, the node it stands on and the hop it just made). Lightweight on purpose: layer 0 has about two thousand links.
 */
export function LayerPlot({ h, layer, query, visited, current, hop, ariaLabel }: { h: Hnsw; layer: number; query: Point; visited: ReadonlySet<number>; current: number | null; hop: TraceStep | null; ariaLabel: string }) {
  const nodes = h.points.map((_, id) => id).filter((id) => h.levels[id] >= layer);
  const edges = nodes.flatMap((a) => h.links[layer][a].filter((b) => a < b || !h.links[layer][b].includes(a)).map((b) => `M${px(h.points[a][0])} ${py(h.points[a][1])}L${px(h.points[b][0])} ${py(h.points[b][1])}`));
  return (
    <svg className="vs-layer" viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={ariaLabel}>
      <path className={layer === 0 ? 'vs-edges is-base' : 'vs-edges is-upper'} d={edges.join('')} />
      {hop && hop.from !== undefined && hop.layer === layer && (
        <line className="vs-hop" x1={px(h.points[hop.from][0])} y1={py(h.points[hop.from][1])} x2={px(h.points[hop.node][0])} y2={py(h.points[hop.node][1])} />
      )}
      {nodes.map((id) => (
        <circle key={id} className={`vs-node ${visited.has(id) ? 'is-visited' : ''} ${id === current ? 'is-current' : ''}`} cx={px(h.points[id][0])} cy={py(h.points[id][1])} r={id === current ? 5.5 : layer === 0 ? 2.4 : 3.6} />
      ))}
      <circle className="vs-query" cx={px(query[0])} cy={py(query[1])} r={6} />
    </svg>
  );
}
