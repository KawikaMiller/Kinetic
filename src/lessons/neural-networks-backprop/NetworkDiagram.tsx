import type { Tone } from '../../core/tone';

export type NodeId = 'x1' | 'x2' | 'h1' | 'h2' | 'out';

/** The six edges of the 2-2-1 network, in this order: x1-h1, x2-h1, x1-h2, x2-h2, h1-out, h2-out. */
const EDGES: readonly (readonly [NodeId, NodeId])[] = [
  ['x1', 'h1'], ['x2', 'h1'], ['x1', 'h2'], ['x2', 'h2'], ['h1', 'out'], ['h2', 'out'],
];

const VIEW = { w: 400, h: 214 } as const;
const RADIUS = 22;
/** Where each node sits, and how far along its edge each label is drawn (so crossing edges keep apart labels). */
const POS: Record<NodeId, { x: number; y: number }> = {
  x1: { x: 56, y: 56 }, x2: { x: 56, y: 150 }, h1: { x: 200, y: 56 }, h2: { x: 200, y: 150 }, out: { x: 344, y: 103 },
};
const LABEL_AT = [0.3, 0.3, 0.3, 0.3, 0.5, 0.5] as const;
const MIN_WIDTH = 1;
const MAX_WIDTH = 7;

export interface DiagramEdge {
  /** The magnitude the line width shows: |weight| or |gradient|. */
  size: number;
  /** Negative values are dashed, so the sign never rides on colour alone. */
  negative: boolean;
  label: string;
  /** The size that draws at full width; default is the largest size on the diagram. A group of edges that show one quantity shares one. */
  full?: number;
}

export interface DiagramNode {
  main: string;
  /** Small lines under the node (a pre-activation, a bias). */
  below?: readonly string[];
  tone?: Tone;
}

/** The 2-2-1 network as nodes and edges: width is size, dashes are negative, labels are the numbers. */
export function NetworkDiagram({
  edges, nodes, edgeTone, ariaLabel,
}: {
  edges: readonly DiagramEdge[];
  nodes: Record<NodeId, DiagramNode>;
  edgeTone: Tone;
  ariaLabel: string;
}) {
  const largest = Math.max(...edges.map((e) => e.size), Number.EPSILON);
  return (
    <svg className="nn-diagram" viewBox={`0 0 ${VIEW.w} ${VIEW.h}`} role="img" aria-label={ariaLabel}>
      {EDGES.map(([from, to], i) => {
        const [a, b] = [POS[from], POS[to]];
        const e = edges[i];
        const t = LABEL_AT[i];
        return (
          <g key={`${from}-${to}`} className={`tone-${edgeTone}`}>
            <line
              className="nn-edge"
              x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              strokeWidth={MIN_WIDTH + ((MAX_WIDTH - MIN_WIDTH) * Math.min(1, e.size / (e.full ?? largest)))}
              strokeDasharray={e.negative ? '7 5' : undefined}
            />
            <text className="nn-edge-label" x={a.x + (b.x - a.x) * t} y={a.y + (b.y - a.y) * t - 4} textAnchor="middle">{e.label}</text>
          </g>
        );
      })}
      {(Object.keys(POS) as NodeId[]).map((id) => {
        const node = nodes[id];
        const { x, y } = POS[id];
        return (
          <g key={id} className={`tone-${node.tone ?? 'muted'}`}>
            <circle className="nn-node" cx={x} cy={y} r={RADIUS} />
            <text className="nn-node-main" x={x} y={y + 4} textAnchor="middle">{node.main}</text>
            <text className="nn-node-name" x={x} y={y - RADIUS - 5} textAnchor="middle">{id === 'out' ? 'output' : id}</text>
            {node.below?.map((line, k) => (
              <text key={line} className="nn-node-below" x={x} y={y + RADIUS + 13 + k * 12} textAnchor="middle">{line}</text>
            ))}
          </g>
        );
      })}
    </svg>
  );
}
