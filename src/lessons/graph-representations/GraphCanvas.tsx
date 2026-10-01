import { GraphView } from '../../components/GraphView';
import type { Graph } from './model';
import { VIEW_H, VIEW_W } from './presets';

const R = 20;
/** New nodes can't be dropped this close to an existing one. */
export const MIN_GAP = 2 * R + 8;

export type Selection = { kind: 'node'; id: number } | { kind: 'edge'; u: number; v: number } | null;

interface Pt {
  x: number;
  y: number;
}

/**
 * The editable graph drawing (a GraphView over the lesson's model). Click empty space to
 * add a node, drag from one node to another to add an edge, click a node or an edge to
 * select it. One tab stop: arrow keys move between nodes and edges, Enter selects, C then
 * Enter on another node connects them.
 */
export function GraphCanvas({
  graph, selection, colourOf, cycle, onAddNode, onAddEdge, onSelect,
}: {
  graph: Graph;
  selection: Selection;
  colourOf: (id: number) => string;
  cycle: Set<string>;
  onAddNode: (p: Pt) => void;
  onAddEdge: (u: number, v: number) => void;
  onSelect: (s: Selection) => void;
}) {
  const label = new Map(graph.nodes.map((n) => [n.id, n.label]));
  const selectedEdge = (u: number, v: number) =>
    selection?.kind === 'edge' && ((selection.u === u && selection.v === v) || (!graph.directed && selection.u === v && selection.v === u));
  const inCycle = (u: number, v: number) => cycle.has(`${u}-${v}`) || (!graph.directed && cycle.has(`${v}-${u}`));

  return (
    <GraphView
      nodes={graph.nodes.map((n) => ({ id: n.id, label: n.label, at: { x: n.x, y: n.y } }))}
      edges={graph.edges.map((e) => ({ from: e.u, to: e.v, weight: graph.weighted ? e.w : undefined }))}
      directed={graph.directed}
      width={VIEW_W}
      height={VIEW_H}
      radius={R}
      nodeColor={colourOf}
      nodeMark={(id) => (selection?.kind === 'node' && selection.id === id ? { tone: 'hi', fill: 'solid' } : null)}
      edgeMark={(e) => (selectedEdge(e.from, e.to) ? { tone: 'hi', width: 4 } : inCycle(e.from, e.to) ? { tone: 'bad', width: 3.5 } : null)}
      onNodeClick={(id) => onSelect({ kind: 'node', id })}
      onEdgeClick={(e) => onSelect({ kind: 'edge', u: e.from, v: e.to })}
      edgeAriaLabel={(e) => `Edge ${label.get(e.from)}${graph.directed ? '→' : '—'}${label.get(e.to)}${graph.weighted ? `, weight ${e.weight}` : ''}`}
      editable={{ onAddNode, onAddEdge, minGap: MIN_GAP }}
      className="gr-canvas"
      ariaLabel="Graph editor: click empty space to add a node, drag between nodes to add an edge. Arrow keys move between nodes and edges; C starts an edge from a node."
    />
  );
}
