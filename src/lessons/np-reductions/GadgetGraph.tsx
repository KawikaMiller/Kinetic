import { useMemo } from 'react';
import { GraphView, type GraphNodeMark } from '../../components/GraphView';
import { WideRegion } from '../../components/WideRegion';
import { minWidthForText } from '../../core/scale';
import type { Tone } from '../../core/tone';
import { GRAPH_H, GRAPH_W, NODE_RADIUS, gadgetPositions } from './layout';
import { clauseOfVertex, edgeText, vertexName, type EdgeKind, type Gadget } from './model';

const LABEL_PX = 14;
const READABLE_MIN_WIDTH = 420;
const GRAPH_MIN_WIDTH = minWidthForText(GRAPH_W, LABEL_PX, READABLE_MIN_WIDTH);
const BAD_EDGE_WIDTH = 4.5;

/** Plain categories (never ok/bad): variable edges sky, triangle edges amber, connection edges pink. */
const EDGE_TONE: Record<EdgeKind, Tone> = { variable: 'sky', triangle: 'amber', connection: 'pink' };

const vertexLabel = (n: number, v: number) => vertexName(n, v).replace('not ', '¬');

/**
 * The gadget graph, drawn at fixed positions: literal pairs on top, clause triangles below. `shown` limits which edges are
 * drawn (the learner's own, plus the reference when `ghost` lists them); an edge in `bad` is uncovered and draws `--bad`.
 */
export function GadgetGraph({
  g, shown, ghost, bad, mark, onAddEdge, onNodeClick, ariaLabel,
}: {
  g: Gadget;
  shown?: readonly number[];
  ghost?: ReadonlySet<number>;
  bad?: readonly number[];
  mark?: (v: number) => GraphNodeMark | null;
  onAddEdge?: (a: number, b: number) => void;
  onNodeClick?: (v: number) => void;
  ariaLabel: string;
}) {
  const at = useMemo(() => gadgetPositions(g.n, g.m), [g.n, g.m]);
  const drawn = shown ?? g.edges.map((_, i) => i);
  const nodes = useMemo(
    () => at.map((p, v) => ({ id: v, label: vertexLabel(g.n, v), at: p })),
    [at, g.n],
  );
  const edges = drawn.map((i) => ({ from: g.edges[i][0], to: g.edges[i][1] }));
  return (
    <WideRegion minWidth={GRAPH_MIN_WIDTH} label="Gadget graph: scroll sideways to see all of it">
      <GraphView
        nodes={nodes}
        edges={edges}
        width={GRAPH_W}
        height={GRAPH_H}
        radius={NODE_RADIUS}
        className="npr-graph"
        ariaLabel={ariaLabel}
        nodeColor={(v) => (clauseOfVertex(g.n, v) ? 'var(--violet)' : undefined)}
        nodeMark={mark}
        edgeMark={(_, k) => {
          const i = drawn[k];
          if (bad?.includes(i)) return { tone: 'bad', width: BAD_EDGE_WIDTH };
          if (ghost?.has(i)) return { tone: 'dim', dashed: true };
          return { tone: EDGE_TONE[g.kinds[i]] };
        }}
        nodeAriaLabel={(v) => (clauseOfVertex(g.n, v) ? `Clause vertex ${vertexName(g.n, v)}` : `Literal vertex ${vertexName(g.n, v)}`)}
        edgeAriaLabel={(e) => `Edge ${edgeText(g, [Number(e.from), Number(e.to)])}`}
        editable={onAddEdge ? { onAddEdge: (a, b) => onAddEdge(Number(a), Number(b)) } : undefined}
        onNodeClick={onNodeClick ? (v) => onNodeClick(Number(v)) : undefined}
      />
    </WideRegion>
  );
}
