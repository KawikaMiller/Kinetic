import type { ReactNode } from 'react';
import { GraphView } from '../../components/GraphView';
import { WideRegion } from '../../components/WideRegion';
import { minWidthForText } from '../../core/scale';
import { colourVar } from './colors';
import type { Edge, Graph } from './model';

const W = 560;
const H = 300;
const LABEL_PX = 13;
const GRAPH_MIN_WIDTH = minWidthForText(W, LABEL_PX);
const NODE_R = 22;
const BADGE_OFFSET = 15;

/**
 * An undirected graph whose nodes carry colours: the fill is the colour's hue and a small number repeats it, so the colour
 * never carries the meaning alone. Conflicting edges (equal colours) and an odd cycle draw `--bad`; the node being
 * coloured draws `--hi`.
 */
export function ColourGraph({
  g, colours, current = null, conflictEdges = [], cycle = [], onAddEdge, ariaLabel, note,
}: {
  g: Graph;
  /** colours[v], counting from 1; 0 means not coloured yet. */
  colours: readonly number[];
  current?: number | null;
  conflictEdges?: readonly Edge[];
  /** Nodes of an odd cycle, in order; its edges draw `--bad`. */
  cycle?: readonly number[];
  onAddEdge?: (a: number, b: number) => void;
  ariaLabel: string;
  note?: ReactNode;
}) {
  const inCycle = (a: number, b: number) => cycle.some((v, i) => {
    const w = cycle[(i + 1) % cycle.length];
    return (v === a && w === b) || (v === b && w === a);
  });
  return (
    <>
      {note !== undefined && (
        <p className="gc-note" role="status">
          {note}
        </p>
      )}
      <WideRegion minWidth={GRAPH_MIN_WIDTH} label="Graph: scroll sideways to see all of it">
        <GraphView
          nodes={g.names.map((label, i) => ({ id: i, label, at: g.at[i] }))}
          edges={g.edges.map(([from, to]) => ({ from, to }))}
          width={W}
          height={H}
          radius={NODE_R}
          className="gc-graph"
          ariaLabel={ariaLabel}
          nodeMark={(v) => (v === current ? { tone: 'hi', fill: 'tint' } : null)}
          nodeColor={(v) => (colours[v] > 0 ? colourVar(colours[v]) : undefined)}
          edgeMark={(e) => {
            const a = Number(e.from);
            const b = Number(e.to);
            return conflictEdges.some(([x, y]) => x === Math.min(a, b) && y === Math.max(a, b)) || inCycle(a, b) ? { tone: 'bad', width: 4.5 } : null;
          }}
          renderNode={(n, at, base) => (
            <>
              {base}
              {colours[Number(n.id)] > 0 && (
                <text x={at.x + BADGE_OFFSET} y={at.y - BADGE_OFFSET} className="gc-badge" textAnchor="middle">
                  {colours[Number(n.id)]}
                </text>
              )}
            </>
          )}
          nodeAriaLabel={(v) => `${g.names[v]}${colours[v] > 0 ? `, colour ${colours[v]}` : ', not coloured'}`}
          edgeAriaLabel={(e) => `Edge ${g.names[Number(e.from)]} to ${g.names[Number(e.to)]}`}
          editable={onAddEdge ? { onAddEdge } : undefined}
        />
      </WideRegion>
    </>
  );
}
