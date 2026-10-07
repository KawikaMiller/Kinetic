import { useId, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import {
  circlePositions, layeredLayout, layeredPositions, outlineDistance, routeEdge, spatialNext, type GraphKey, type LayeredSpacing, type LayoutEdge,
  type LoopSide, type NodeBox, type Pt, type Radii,
} from '../core/graphLayout';
import { TONES, toneVar, type Tone } from '../core/tone';
import { arrowMarkerDef } from './ArrowMarker';
import type { TreeNodeMark } from './TreeSvg';

export type { GraphKey, LoopSide, Pt, Radii } from '../core/graphLayout';

export interface GraphNode<K extends GraphKey> {
  id: K;
  /** Drawn in the default node (default: the id). */
  label?: ReactNode;
  /** Position for `layout="fixed"`. */
  at?: Pt;
  shape?: 'circle' | 'box';
  /** An accepting state: a second ring inside the circle, or a second outline inside the box. */
  accept?: boolean;
  /** Which side its self-loop is drawn on (default top). */
  loopSide?: LoopSide;
}

export interface GraphEdge<K extends GraphKey> {
  from: K;
  to: K;
  /** Drawn at the edge's middle (or at `labelAt`); a weight is drawn when there's no label. */
  label?: ReactNode;
  weight?: number;
  /** Where the label sits along the edge: 0 at `from` .. 1 at `to` (default 0.5). Pulls labels out of a crowded hub. */
  labelAt?: number;
}

/** Same shape as TreeSvg's: `tint` = a wash of the tone with a tone ring, `solid` = filled. */
export type GraphNodeMark = TreeNodeMark;

export interface GraphEdgeMark {
  tone: Tone;
  dashed?: boolean;
  /** Stroke width (default 3.5). */
  width?: number;
}

/** The CI pipeline's spacing: columns 150 apart, rows 64 apart. */
const DEFAULT_SPACING: LayeredSpacing = { direction: 'right', layerGap: 150, nodeGap: 64, padMain: 70, padCross: 44 };
/** A box node's size; `rx` is its corner radius (default 10; the focus ring follows it, 4 wider). */
export interface GraphBox {
  w: number;
  h: number;
  rx?: number;
}
const DEFAULT_BOX: GraphBox = { w: 112, h: 46 };
const BOX_RX = 10;
const RING_GAP = 5;
/** An accepting state's second ring sits this far inside the circle, or its second outline inside the box. */
const ACCEPT_INSET = 4;
/** A press that moves less than this is a click, not a drag. */
const DRAG_SLOP = 6;
const START_ARROW = 30;

type Item<K extends GraphKey> = { kind: 'node'; id: K } | { kind: 'edge'; index: number };

/**
 * A node-and-edge drawing: a graph editor, a pipeline DAG, a state machine.
 *
 * - `layout`: `fixed` uses each node's `at`; `layered` places a DAG in layers (longest
 *   path, barycentre ordering; core/graphLayout) with `spacing`; `circle` puts the nodes
 *   round a circle in `width` × `height` (an ellipse with `circleRadii`). `layoutEdges` lays a layered graph out by a
 *   different edge set than it draws, so adding an edge (one that closes a cycle) doesn't
 *   rearrange the drawing.
 * - Edges are straight (trimmed at the target when `directed`), or `edgeStyle="curve"`
 *   for layered S-curves. In a layered layout a straight edge that would cross a node
 *   (a back edge closing a cycle) bends round it. Self-loops draw above the node (or on its `loopSide`); `labelAt` slides an edge label along it; a→b with b→a bends both apart.
 * - `nodeMark` / `edgeMark` highlight with tones; `nodeColor` gives unmarked nodes a
 *   colour (a component, a side); `nodeClass` / `edgeClass` add lesson classes.
 * - `renderNode(node, at, base)` draws a node yourself (absolute coordinates), e.g. a
 *   SceneNode. `base` is the default drawing (focus ring, shape, label), so a lesson that
 *   only adds a badge or a tag returns `<>{base}{badge}</>` instead of copying it.
 * - With `onNodeClick` / `onEdgeClick` / `editable` the graph is one tab stop: arrow keys
 *   move between nodes (and clickable edges) by position, Home/End jump to the ends,
 *   Enter or Space presses.
 * - `editable`: click empty space to add a node (only with `onAddNode`), drag from node to
 *   node to add an edge.
 *   From the keyboard: C on a node starts a connection, Enter on another node makes the
 *   edge, Escape cancels. (Adding a node from the keyboard is the lesson's button, since
 *   only the lesson knows where a new node should go.)
 */
export function GraphView<K extends GraphKey>({
  nodes, edges, directed = false, layout = 'fixed', layoutEdges, spacing, width, height, circleRadii, radius = 20, box = DEFAULT_BOX, edgeStyle = 'straight',
  arrowSize = 7, arrowGap = 3, nodeMark, nodeColor, nodeClass, edgeMark, edgeClass, renderNode, startNode, onNodeClick, onEdgeClick,
  nodeAriaLabel, edgeAriaLabel, editable, ariaLabel, className = '',
}: {
  nodes: readonly GraphNode<K>[];
  edges: readonly GraphEdge<K>[];
  directed?: boolean;
  layout?: 'fixed' | 'layered' | 'circle';
  /** Layered layout only: the edges to lay out by (default `edges`). */
  layoutEdges?: readonly LayoutEdge<K>[];
  /** Layered layout spacing (default: columns 150 apart, rows 64 apart, left to right). */
  spacing?: Partial<LayeredSpacing>;
  /** viewBox size. Layered layouts default to their natural size; fixed and circle need it. */
  width?: number;
  height?: number;
  /** Circle layout only: place the nodes round an ellipse with these radii (wide labels need the width). */
  circleRadii?: Radii;
  /** Circle nodes' radius. */
  radius?: number;
  /** Box nodes' size and corner radius. */
  box?: GraphBox;
  edgeStyle?: 'straight' | 'curve';
  arrowSize?: number;
  /** Gap between an arrowhead and the node it points at. */
  arrowGap?: number;
  nodeMark?: (id: K) => GraphNodeMark | null | undefined;
  /** Any CSS colour for an unmarked node (a categorical component colour). */
  nodeColor?: (id: K) => string | undefined;
  nodeClass?: (id: K) => string;
  edgeMark?: (edge: GraphEdge<K>, index: number) => GraphEdgeMark | null | undefined;
  edgeClass?: (edge: GraphEdge<K>, index: number) => string;
  renderNode?: (node: GraphNode<K>, at: Pt, base: ReactNode) => ReactNode;
  /** Draws an incoming start arrow (a state machine's initial state). */
  startNode?: K;
  onNodeClick?: (id: K) => void;
  onEdgeClick?: (edge: GraphEdge<K>, index: number) => void;
  nodeAriaLabel?: (id: K) => string;
  edgeAriaLabel?: (edge: GraphEdge<K>, index: number) => string;
  editable?: {
    /** Without it, clicking empty space does nothing (edges only). */
    onAddNode?: (p: Pt) => void;
    onAddEdge: (from: K, to: K) => void;
    /** New nodes can't be dropped closer than this to an existing one (default 2r + 8). */
    minGap?: number;
  };
  ariaLabel: string;
  className?: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const markerBase = `graph-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const [drag, setDrag] = useState<{ from: K; start: Pt; at: Pt } | null>(null);
  const [pendingAdd, setPendingAdd] = useState<Pt | null>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [connectFrom, setConnectFrom] = useState<K | null>(null);
  const itemRefs = useRef(new Map<string, SVGGElement>());

  // ---- positions ----
  const sp = { ...DEFAULT_SPACING, ...spacing };
  const ids = nodes.map((n) => n.id);
  let at: Map<K, Pt>;
  let natural = { width: width ?? 0, height: height ?? 0 };
  if (layout === 'layered') {
    const placed = layeredPositions(layeredLayout(ids, layoutEdges ?? edges), sp);
    at = placed.at;
    natural = { width: placed.width, height: placed.height };
  } else if (layout === 'circle') {
    at = circlePositions(ids, width ?? 0, height ?? 0, radius + 16, circleRadii);
  } else {
    at = new Map(nodes.flatMap((n) => (n.at ? [[n.id, n.at] as const] : [])));
  }
  const W = width ?? natural.width;
  const H = height ?? natural.height;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const boxOf = (id: K): NodeBox => ({ shape: byId.get(id)?.shape ?? 'circle', r: radius, w: box.w, h: box.h });
  const pairs = new Set(edges.map((e) => `${e.from}\u0000${e.to}`));

  const detour = layout === 'layered' && edgeStyle === 'straight';
  const routes = edges.map((e) => {
    const a = at.get(e.from);
    const b = at.get(e.to);
    if (!a || !b) return null;
    const parallel = directed && edgeStyle === 'straight' && e.from !== e.to && pairs.has(`${e.to}\u0000${e.from}`);
    // Layered drawings bend a straight edge round any node it would cross (a back edge).
    const obstacles = detour
      ? ids.flatMap((id) => (id === e.from || id === e.to || !at.has(id) ? [] : [{ at: at.get(id)!, box: boxOf(id) }]))
      : undefined;
    return routeEdge(a, b, boxOf(e.from), boxOf(e.to), {
      directed, arrowGap, parallel, curve: edgeStyle === 'curve' ? sp.direction : undefined, obstacles,
      loopSide: byId.get(e.from)?.loopSide, labelAt: e.labelAt,
    });
  });

  // ---- keyboard ----
  const interactive = !!(onNodeClick || onEdgeClick || editable);
  // Reading order (top row first, left to right): where the tab stop starts, and Home/End.
  const readingOrder = (a: Pt, b: Pt) => Math.round(a.y) - Math.round(b.y) || a.x - b.x;
  const items: { key: string; item: Item<K>; x: number; y: number }[] = [
    ...nodes.flatMap((n) => {
      const p = at.get(n.id);
      return p ? [{ key: `n:${n.id}`, item: { kind: 'node', id: n.id } as Item<K>, ...p }] : [];
    }).sort(readingOrder),
    ...(onEdgeClick || editable
      ? routes.flatMap((r, index) => (r ? [{ key: `e:${index}`, item: { kind: 'edge', index } as Item<K>, x: r.label.x, y: r.label.y }] : [])).sort(readingOrder)
      : []),
  ];
  const current = items.some((i) => i.key === focusKey) ? focusKey : (items[0]?.key ?? null);
  const focusedPoint = items.find((i) => i.key === current);

  const press = (item: Item<K>) => {
    if (item.kind === 'edge') return connectFrom === null && onEdgeClick?.(edges[item.index], item.index);
    if (connectFrom !== null && editable) {
      if (item.id !== connectFrom) editable.onAddEdge(connectFrom, item.id);
      setConnectFrom(null);
      return;
    }
    onNodeClick?.(item.id);
  };

  const onItemKey = (e: KeyboardEvent<SVGGElement>, key: string, item: Item<K>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      press(item);
      return;
    }
    if (editable && item.kind === 'node' && (e.key === 'c' || e.key === 'C')) {
      e.preventDefault();
      setConnectFrom(item.id);
      return;
    }
    if (e.key === 'Escape' && connectFrom !== null) {
      e.preventDefault();
      setConnectFrom(null);
      return;
    }
    // While connecting, only nodes can be the other end.
    const targets = connectFrom !== null ? items.filter((i) => i.item.kind === 'node') : items;
    const next = spatialNext(targets, key, e.key);
    if (!next) return;
    e.preventDefault();
    setFocusKey(next);
    itemRefs.current.get(next)?.focus();
  };

  const itemProps = (key: string, item: Item<K>, name: string) =>
    interactive && {
      role: 'button',
      tabIndex: key === current ? 0 : -1,
      'aria-label': name,
      ref: (el: SVGGElement | null) => {
        if (el) itemRefs.current.set(key, el);
        else itemRefs.current.delete(key);
      },
      onFocus: () => setFocusKey(key),
      onKeyDown: (e: KeyboardEvent<SVGGElement>) => onItemKey(e, key, item),
      // Editable graphs handle the pointer on the whole drawing (drags, adds) instead.
      ...(!editable && { onClick: () => press(item) }),
    };

  // ---- pointer editing ----
  const toSvg = (e: PointerEvent): Pt => {
    const ctm = svgRef.current?.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  };
  const nodeAt = (p: Pt): K | undefined =>
    nodes.find((n) => {
      const q = at.get(n.id);
      if (!q) return false;
      if ((n.shape ?? 'circle') === 'circle') return Math.hypot(q.x - p.x, q.y - p.y) <= radius + 4;
      return Math.abs(q.x - p.x) <= box.w / 2 + 4 && Math.abs(q.y - p.y) <= box.h / 2 + 4;
    })?.id;
  const minGap = editable?.minGap ?? 2 * radius + 8;

  const down = (e: PointerEvent<SVGSVGElement>) => {
    const edge = (e.target as Element).getAttribute('data-edge');
    if (edge !== null) {
      const index = Number(edge);
      onEdgeClick?.(edges[index], index);
      return;
    }
    const p = toSvg(e);
    const hit = nodeAt(p);
    if (hit !== undefined) {
      setDrag({ from: hit, start: p, at: p });
      svgRef.current?.setPointerCapture(e.pointerId);
    } else if (editable?.onAddNode) setPendingAdd(p);
  };
  const move = (e: PointerEvent<SVGSVGElement>) => {
    if (drag) setDrag({ ...drag, at: toSvg(e) });
  };
  const up = (e: PointerEvent<SVGSVGElement>) => {
    const p = toSvg(e);
    if (drag) {
      const target = nodeAt(p);
      const moved = Math.hypot(p.x - drag.start.x, p.y - drag.start.y) > DRAG_SLOP;
      if (target !== undefined && target !== drag.from) editable!.onAddEdge(drag.from, target);
      else if (!moved) onNodeClick?.(drag.from);
      setDrag(null);
    } else if (pendingAdd && nodes.every((n) => {
      const q = at.get(n.id);
      return !q || Math.hypot(q.x - p.x, q.y - p.y) >= minGap;
    })) {
      editable?.onAddNode?.({ x: Math.round(p.x), y: Math.round(p.y) });
    }
    setPendingAdd(null);
  };

  // ---- drawing ----
  const markerId = (tone?: Tone) => `${markerBase}-${tone ?? 'plain'}`;
  const dragFrom = drag ? at.get(drag.from) : connectFrom !== null ? at.get(connectFrom) : undefined;
  const dragTo = drag ? drag.at : focusedPoint;
  const start = startNode !== undefined ? at.get(startNode) : undefined;

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      className={`graph-view ${editable ? 'is-editable' : ''} ${editable?.onAddNode ? 'can-add' : ''} ${className}`}
      role={interactive ? 'group' : 'img'}
      aria-label={ariaLabel}
      {...(editable && { onPointerDown: down, onPointerMove: move, onPointerUp: up })}
    >
      {(directed || start) && (
        <defs>
          {arrowMarkerDef(markerId(), 'var(--line-2)', arrowSize, 9)}
          {TONES.map((t) => arrowMarkerDef(markerId(t), toneVar(t), arrowSize, 9))}
        </defs>
      )}
      {edges.map((e, i) => {
        const r = routes[i];
        if (!r) return null;
        const mark = edgeMark?.(e, i);
        const cls = `graph-edge ${mark ? `is-marked tone-${mark.tone}` : ''} ${mark?.dashed ? 'is-dashed' : ''} ${edgeClass?.(e, i) ?? ''}`;
        const style = mark ? { strokeWidth: mark.width ?? 3.5 } : undefined;
        const markerEnd = directed ? `url(#${markerId(mark?.tone)})` : undefined;
        const label = e.label ?? e.weight;
        const a = at.get(e.from)!;
        const b = at.get(e.to)!;
        const clickable = !!(onEdgeClick || editable);
        const name = edgeAriaLabel?.(e, i) ?? `Edge ${textOf(byId.get(e.from)?.label, e.from)} ${directed ? 'to' : 'and'} ${textOf(byId.get(e.to)?.label, e.to)}`;
        return (
          <g key={`${e.from}-${e.to}-${i}`} className="graph-edge-group" {...(clickable && itemProps(`e:${i}`, { kind: 'edge', index: i }, name))}>
            {r.kind === 'line' ? (
              <line x1={r.x1} y1={r.y1} x2={r.x2} y2={r.y2} className={cls} style={style} markerEnd={markerEnd} />
            ) : (
              <path d={r.d} className={cls} style={style} markerEnd={markerEnd} />
            )}
            {clickable &&
              (r.kind === 'line' ? (
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="graph-edge-hit" data-edge={i} />
              ) : (
                <path d={r.d} className="graph-edge-hit" data-edge={i} />
              ))}
            {label != null && (
              <text x={r.label.x} y={r.label.y} textAnchor="middle" className="graph-edge-label">
                {label}
              </text>
            )}
          </g>
        );
      })}
      {start && (
        <line
          className="graph-start"
          x1={start.x - outlineDistance(boxOf(startNode!), 1, 0) - START_ARROW}
          y1={start.y}
          x2={start.x - outlineDistance(boxOf(startNode!), 1, 0) - arrowGap}
          y2={start.y}
          markerEnd={`url(#${markerId()})`}
        />
      )}
      {dragFrom && dragTo && <line x1={dragFrom.x} y1={dragFrom.y} x2={dragTo.x} y2={dragTo.y} className="graph-drag" />}
      {nodes.map((n) => {
        const p = at.get(n.id);
        if (!p) return null;
        const mark = nodeMark?.(n.id);
        const color = mark ? undefined : nodeColor?.(n.id);
        const style = {
          ...(color && { '--c': color }),
          ...(mark?.tint !== undefined && { '--graph-tint': `${mark.tint}%` }),
        } as CSSProperties;
        const connecting = connectFrom === n.id;
        const name = `${nodeAriaLabel?.(n.id) ?? textOf(n.label, n.id)}${connecting ? ' (connecting: move to another node and press Enter, Escape cancels)' : ''}`;
        return (
          <g
            key={String(n.id)}
            className={`graph-node ${mark ? `is-${mark.fill} tone-${mark.tone}` : ''} ${connecting ? 'is-connecting' : ''} ${nodeClass?.(n.id) ?? ''}`}
            style={color || mark?.tint !== undefined ? style : undefined}
            {...itemProps(`n:${n.id}`, { kind: 'node', id: n.id }, name)}
          >
            {renderNode ? renderNode(n, p, <DefaultNode node={n} at={p} radius={radius} box={box} />) : <DefaultNode node={n} at={p} radius={radius} box={box} />}
          </g>
        );
      })}
    </svg>
  );
}

function DefaultNode<K extends GraphKey>({ node, at, radius, box }: { node: GraphNode<K>; at: Pt; radius: number; box: GraphBox }) {
  const label = node.label ?? node.id;
  if (node.shape === 'box') {
    const rx = box.rx ?? BOX_RX;
    return (
      <>
        <rect
          className="graph-node-ring"
          x={at.x - box.w / 2 - RING_GAP}
          y={at.y - box.h / 2 - RING_GAP}
          width={box.w + 2 * RING_GAP}
          height={box.h + 2 * RING_GAP}
          rx={rx + 4}
        />
        <rect className="graph-node-shape" x={at.x - box.w / 2} y={at.y - box.h / 2} width={box.w} height={box.h} rx={rx} />
        {node.accept && (
          <rect
            className="graph-node-accept"
            x={at.x - box.w / 2 + ACCEPT_INSET}
            y={at.y - box.h / 2 + ACCEPT_INSET}
            width={box.w - 2 * ACCEPT_INSET}
            height={box.h - 2 * ACCEPT_INSET}
            rx={Math.max(0, rx - 3)}
          />
        )}
        <text className="graph-node-label" x={at.x} y={at.y + 5} textAnchor="middle">
          {label}
        </text>
      </>
    );
  }
  return (
    <>
      <circle className="graph-node-ring" cx={at.x} cy={at.y} r={radius + RING_GAP} />
      <circle className="graph-node-shape" cx={at.x} cy={at.y} r={radius} />
      {node.accept && <circle className="graph-node-accept" cx={at.x} cy={at.y} r={radius - ACCEPT_INSET} />}
      <text className="graph-node-label" x={at.x} y={at.y + 5} textAnchor="middle">
        {label}
      </text>
    </>
  );
}

const textOf = (label: ReactNode, id: GraphKey) => (typeof label === 'string' || typeof label === 'number' ? String(label) : String(id));
