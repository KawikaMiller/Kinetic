import type { ReactNode } from 'react';
import { GraphView, type GraphEdgeMark, type GraphNodeMark } from '../../components/GraphView';
import { WideRegion } from '../../components/WideRegion';
import { minWidthForText } from '../../core/scale';
import { residualArcs, type Arc, type Network } from './model';

export const W = 580;
export const H = 270;
const LABEL_PX = 13;
const GRAPH_MIN_WIDTH = minWidthForText(W, LABEL_PX);
/** How far a cut region's blob reaches past its nodes. */
const REGION_R = 40;
const REGION_OPACITY = 0.18;
const FLOW_WIDTH_MIN = 3;
const FLOW_WIDTH_SPAN = 4;

export interface RegionSpec {
  side: ReadonlySet<number>;
  /** Edges drawn as the cut's crossing edges (--bad). */
  crossing: ReadonlySet<number>;
}

/** The S side as an `--ok` wash and the T side as a `--dim` one: a circle round each node, so a region is the union. */
function Region({ net, side }: { net: Network; side: ReadonlySet<number> }) {
  return (
    <>
      <g opacity={REGION_OPACITY}>
        {net.names.map((_, v) => (side.has(v) ? <circle key={v} cx={net.at[v].x} cy={net.at[v].y} r={REGION_R} fill="var(--ok)" /> : null))}
      </g>
      <g opacity={REGION_OPACITY}>
        {net.names.map((_, v) => (!side.has(v) ? <circle key={v} cx={net.at[v].x} cy={net.at[v].y} r={REGION_R} fill="var(--dim)" /> : null))}
      </g>
    </>
  );
}

const sameArc = (a: Arc, b: Arc) => a.edge === b.edge && a.back === b.back;

/**
 * The network, drawn either as flow / capacity on each edge or as the residual network (spare room forward, flow that could
 * be undone backward). The scene decides what a node click means and which region to shade.
 */
export function FlowGraph({
  net, flow, residual = false, path = [], walkEnd = null, region, onNodeClick, onEdgeClick, onAddEdge, selectedEdge = null, ariaLabel, note,
}: {
  net: Network;
  flow: readonly number[];
  residual?: boolean;
  /** The path being built or pushed (highlighted `--hi`). */
  path?: readonly Arc[];
  walkEnd?: number | null;
  region?: RegionSpec;
  onNodeClick?: (v: number) => void;
  onEdgeClick?: (edge: number) => void;
  onAddEdge?: (from: number, to: number) => void;
  selectedEdge?: number | null;
  ariaLabel: string;
  note?: ReactNode;
}) {
  const arcs = residual ? residualArcs(net, flow) : [];
  const drawn = residual
    ? arcs.map((a) => ({ from: a.from, to: a.to, label: String(a.res) }))
    : net.edges.map((e, i) => ({ from: e.from, to: e.to, label: `${flow[i]}/${e.cap}` }));

  const edgeMark = (_: unknown, i: number): GraphEdgeMark | null => {
    if (residual) {
      const a = arcs[i];
      if (path.some((p) => sameArc(p, a))) return { tone: 'hi', width: 5 };
      return a.back ? { tone: 'violet', dashed: true, width: 3 } : null;
    }
    if (path.some((p) => p.edge === i)) return { tone: 'hi', width: 5 };
    if (region?.crossing.has(i)) return { tone: 'violet', width: 4.5 };
    const f = flow[i];
    const cap = net.edges[i].cap;
    if (f > 0 && f === cap) return { tone: 'bad', width: 4 };
    if (f > 0) return { tone: 'info', width: FLOW_WIDTH_MIN + (FLOW_WIDTH_SPAN * f) / cap };
    return null;
  };
  const nodeMark = (v: number): GraphNodeMark | null => {
    if (v === walkEnd) return { tone: 'hi', fill: 'solid' };
    return path.some((a) => a.from === v || a.to === v) ? { tone: 'hi', fill: 'tint' } : null;
  };

  return (
    <>
      {note !== undefined && (
        <p className="nf-note" role="status">
          {note}
        </p>
      )}
      <WideRegion minWidth={GRAPH_MIN_WIDTH} label="Flow network: scroll sideways to see all of it">
        <GraphView
          nodes={net.names.map((label, i) => ({ id: i, label, at: net.at[i] }))}
          edges={drawn}
          directed
          width={W}
          height={H}
          labelHalo
          className="nf-graph"
          ariaLabel={ariaLabel}
          underlay={region ? <Region net={net} side={region.side} /> : undefined}
          edgeMark={edgeMark}
          edgeClass={(_, i) => ((residual ? arcs[i]?.edge : i) === selectedEdge ? 'nf-selected' : '')}
          nodeMark={nodeMark}
          nodeAriaLabel={(v) => `${net.names[v]}${v === net.source ? ', the source' : v === net.sink ? ', the sink' : ''}`}
          edgeAriaLabel={(_, i) => {
            const a = residual ? arcs[i] : null;
            const e = net.edges[a ? a.edge : i];
            return a
              ? `${a.back ? 'Undo' : 'Spare'} ${a.res} on ${net.names[e.from]} to ${net.names[e.to]}`
              : `Edge ${net.names[e.from]} to ${net.names[e.to]}, flow ${flow[i]} of ${e.cap}. Press to select it for editing`;
          }}
          onNodeClick={onNodeClick}
          onEdgeClick={onEdgeClick ? (_, i) => onEdgeClick(residual ? arcs[i].edge : i) : undefined}
          editable={onAddEdge ? { onAddEdge } : undefined}
        />
      </WideRegion>
    </>
  );
}
