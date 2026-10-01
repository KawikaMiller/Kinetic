import { useRef, useState, type PointerEvent } from 'react';
import { useArrowMarker } from '../../components/ArrowMarker';
import type { Graph, GNode } from './model';
import { VIEW_H, VIEW_W } from './presets';

const R = 20;
/** A press that moves less than this is a click, not a drag. */
const DRAG_SLOP = 6;
/** New nodes can't be dropped this close to an existing one. */
export const MIN_GAP = 2 * R + 8;
const ARROW_GAP = 3;

export type Selection = { kind: 'node'; id: number } | { kind: 'edge'; u: number; v: number } | null;

interface Pt {
  x: number;
  y: number;
}

/**
 * The editable graph drawing. Click empty space to add a node, drag from one node to
 * another to add an edge, click a node or an edge to select it.
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
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<{ from: number; start: Pt; at: Pt } | null>(null);
  const [pendingAdd, setPendingAdd] = useState<Pt | null>(null);
  const plain = useArrowMarker('var(--line-2)', { size: 7, refX: 9 });
  const hot = useArrowMarker('var(--hi)', { size: 7, refX: 9 });
  const bad = useArrowMarker('var(--bad)', { size: 7, refX: 9 });

  const toSvg = (e: PointerEvent): Pt => {
    const ctm = svgRef.current?.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  };
  const nodeAt = (p: Pt): GNode | undefined => graph.nodes.find((n) => Math.hypot(n.x - p.x, n.y - p.y) <= R + 4);
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));

  const down = (e: PointerEvent<SVGSVGElement>) => {
    const target = e.target as Element;
    const edge = target.getAttribute('data-edge');
    if (edge) {
      const [u, v] = edge.split('-').map(Number);
      onSelect({ kind: 'edge', u, v });
      return;
    }
    const p = toSvg(e);
    const hit = nodeAt(p);
    if (hit) {
      setDrag({ from: hit.id, start: p, at: p });
      svgRef.current?.setPointerCapture(e.pointerId);
    } else setPendingAdd(p);
  };
  const move = (e: PointerEvent<SVGSVGElement>) => {
    if (drag) setDrag({ ...drag, at: toSvg(e) });
  };
  const up = (e: PointerEvent<SVGSVGElement>) => {
    const p = toSvg(e);
    if (drag) {
      const target = nodeAt(p);
      const moved = Math.hypot(p.x - drag.start.x, p.y - drag.start.y) > DRAG_SLOP;
      if (target && target.id !== drag.from) onAddEdge(drag.from, target.id);
      else if (!moved) onSelect({ kind: 'node', id: drag.from });
      setDrag(null);
    } else if (pendingAdd && graph.nodes.every((n) => Math.hypot(n.x - p.x, n.y - p.y) >= MIN_GAP)) {
      onAddNode({ x: Math.round(p.x), y: Math.round(p.y) });
    }
    setPendingAdd(null);
  };

  const selectedEdge = (u: number, v: number) =>
    selection?.kind === 'edge' && ((selection.u === u && selection.v === v) || (!graph.directed && selection.u === v && selection.v === u));

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      className="gr-canvas"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      role="img"
      aria-label="Graph editor: click empty space to add a node, drag between nodes to add an edge"
    >
      {plain.def}
      {hot.def}
      {bad.def}
      {graph.edges.map((e) => {
        const a = byId.get(e.u)!;
        const b = byId.get(e.v)!;
        const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const trim = graph.directed ? R + ARROW_GAP : 0;
        const end = { x: b.x - ((b.x - a.x) / len) * trim, y: b.y - ((b.y - a.y) / len) * trim };
        const isHot = selectedEdge(e.u, e.v);
        const inCycle = cycle.has(`${e.u}-${e.v}`) || (!graph.directed && cycle.has(`${e.v}-${e.u}`));
        const marker = !graph.directed ? undefined : isHot ? hot.url : inCycle ? bad.url : plain.url;
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        return (
          <g key={`${e.u}-${e.v}`}>
            <line x1={a.x} y1={a.y} x2={end.x} y2={end.y} className={`gr-edge ${isHot ? 'is-hot' : inCycle ? 'is-cycle' : ''}`} markerEnd={marker} />
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="gr-edge-hit" data-edge={`${e.u}-${e.v}`} />
            {graph.weighted && (
              <text x={mid.x} y={mid.y - 6} textAnchor="middle" className="gr-weight">
                {e.w}
              </text>
            )}
          </g>
        );
      })}
      {drag && <line x1={byId.get(drag.from)!.x} y1={byId.get(drag.from)!.y} x2={drag.at.x} y2={drag.at.y} className="gr-drag" />}
      {graph.nodes.map((n) => {
        const isHot = selection?.kind === 'node' && selection.id === n.id;
        return (
          <g key={n.id} className={`gr-node ${isHot ? 'is-hot' : ''}`} style={{ ['--c' as string]: colourOf(n.id) }}>
            <circle cx={n.x} cy={n.y} r={R} />
            <text x={n.x} y={n.y + 5} textAnchor="middle">
              {n.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
