import { GraphView, type GraphNodeMark } from '../../components/GraphView';
import { WideRegion } from '../../components/WideRegion';
import { minWidthForText } from '../../core/scale';
import { compColor } from './colors';
import { hullPoints } from './hull';
import type { SccEditor } from './useSccEditor';

const W = 560;
const H = 260;
const NODE_LABEL_PX = 14;
const GRAPH_MIN_WIDTH = minWidthForText(W, NODE_LABEL_PX);
/** How far a component's hull reaches past its nodes. */
const HULL_PAD = 24;
const HULL_OPACITY = 0.2;


export function SccGraph({
  ed, comp, reversed = false, nodeMark, current, ariaLabel, markLast = false,
}: {
  ed: SccEditor;
  /** Component index per node, -1 for not assigned yet; assigned nodes get their colour and a hull. */
  comp: readonly number[];
  reversed?: boolean;
  nodeMark?: (v: number) => GraphNodeMark | null | undefined;
  current?: number | null;
  ariaLabel: string;
  /** Draw the learner's last-added edge in orange. */
  markLast?: boolean;
}) {
  const g = ed.graph;
  const classes = new Map<number, number[]>();
  comp.forEach((c, v) => {
    if (c >= 0) classes.set(c, [...(classes.get(c) ?? []), v]);
  });
  const lastIndex = markLast && ed.last ? g.edges.findIndex(([a, b]) => a === ed.last!.from && b === ed.last!.to) : -1;
  return (
    <>
      <p className="scc-note" role="status">
        {ed.note}
      </p>
      <WideRegion minWidth={GRAPH_MIN_WIDTH} label="Directed graph: scroll sideways to see all of it">
        <GraphView
          nodes={g.names.map((label, i) => ({ id: i, label, at: g.at[i] }))}
          edges={g.edges.map(([a, b]) => (reversed ? { from: b, to: a } : { from: a, to: b }))}
          directed
          width={W}
          height={H}
          className="scc-graph"
          ariaLabel={ariaLabel}
          underlay={
            <g opacity={HULL_OPACITY}>
              {[...classes].map(([c, vs]) => (
                <polygon
                  key={c}
                  points={hullPoints(vs.map((v) => g.at[v]))}
                  fill={compColor(c)}
                  stroke={compColor(c)}
                  strokeWidth={2 * HULL_PAD}
                  strokeLinejoin="round"
                />
              ))}
            </g>
          }
          nodeColor={(v) => (comp[v] >= 0 ? compColor(comp[v]) : undefined)}
          nodeMark={(v) => (v === current ? { tone: 'hi', fill: 'tint' } : nodeMark?.(v))}
          edgeMark={(_, i) => {
            if (i === lastIndex) return { tone: 'orange', width: 4.5 };
            return reversed ? { tone: 'violet', dashed: true, width: 2.5 } : null;
          }}
          nodeAriaLabel={(v) => g.names[v]}
          edgeAriaLabel={(e) => `Edge ${g.names[reversed ? e.to : e.from]} to ${g.names[reversed ? e.from : e.to]}`}
          editable={{ onAddEdge: (from, to) => ed.addEdge(reversed ? to : from, reversed ? from : to) }}
        />
      </WideRegion>
    </>
  );
}
