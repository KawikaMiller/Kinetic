import { AnimatePresence, motion, type Transition } from 'motion/react';
import { useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { SPRING } from '../core/motion';
import type { Tone } from '../core/tone';
import { layoutTree, treeKeyTarget, treeX, type TreeKey, type TreeLayoutMode, type TreeShape } from '../core/treeLayout';

export type { TreeShape } from '../core/treeLayout';

/** How a node is highlighted: `tint` = coloured ring on a light wash, `solid` = filled. */
export interface TreeNodeMark {
  tone: Tone;
  fill: 'tint' | 'solid';
  /** Wash strength for `tint`, in % (default 16). */
  tint?: number;
}

export interface TreeEdgeMark {
  tone: Tone;
  dashed?: boolean;
}

/** Where things are, for drawing extras (a ghost child, a cursor) over the tree. */
export interface TreeGeometry<K extends TreeKey> {
  at: (id: K) => { x: number; y: number } | undefined;
  levelGap: number;
}

/**
 * An SVG tree: lays out `shape`, then draws animated edges and positioned node groups.
 * Nodes glide when the shape changes, pop in when added and fade out when removed.
 *
 * - Default nodes are a circle of `radius` with `label(id)` centred in it; pass
 *   `renderNode` to draw something else (a rect, two lines of text) around (0, 0).
 * - `nodeMark` / `edgeMark` highlight with semantic tones; `nodeClass` adds lesson classes.
 * - `nodeScale` / `nodeOpacity` animate a node's size and fade (e.g. fade what can't be
 *   picked). motion owns the node group's opacity, so fade through this, not CSS.
 * - Vertical spacing: `levelGap` fixes it; otherwise it fits the depth into
 *   `height - bottomRoom`, capped at `maxLevelGap`.
 * - `hidden(id)` keeps a node (and the edge to it) out of the picture without moving
 *   anything else: the layout always uses the whole shape.
 * - `overlay` draws between edges and nodes with the tree's geometry.
 * - `natural` sizes it to the container but never past its viewBox width (no wrapper div needed).
 * - `nodeSize(id)` (tidy) gives a node a wider footprint than one column (the tries' radix pills).
 * - Forest mode: give `shape.roots` (and no `root`) to draw several trees side by side
 *   (union-find sets, a Huffman merge); `forestGap` is the empty columns between trees.
 * - With `onNodeClick` the nodes are buttons and the tree is one tab stop (starting at the
 *   first node in reading order): arrow keys follow the tree (Up = parent, Down = leftmost
 *   child, Left/Right = neighbour on the same level), Home/End jump to the first and last
 *   node, Enter/Space press. `treeKeyTarget` in core/treeLayout is the pure key map.
 */
export function TreeSvg<K extends TreeKey>({
  shape, layout = 'tidy', forestGap, nodeSize, width, height, pad = 40, top = 34, levelGap, maxLevelGap = 70, bottomRoom = 70,
  radius = 19, label, renderNode, nodeMark, nodeClass, nodeScale, nodeOpacity, edgeMark, markedEdgeWidth, hidden,
  enterScale = 0.2, transition = SPRING.soft, onNodeClick, nodeAriaLabel, overlay, natural = false, className = '', ariaLabel,
}: {
  shape: TreeShape<K>;
  layout?: TreeLayoutMode;
  /** Forest mode only: empty columns between neighbouring trees (default FOREST_GAP, 0.5). */
  forestGap?: number;
  /**
   * `tidy` only: a node's footprint in columns (default 1), so a wide pill gets the room it
   * needs without widening every column. `layoutTree(shape, 'tidy', { size })` gives the
   * resulting `columns` to size `width` with.
   */
  nodeSize?: (id: K) => number;
  /** viewBox size; the SVG scales to its CSS box. */
  width: number;
  height: number;
  pad?: number;
  top?: number;
  levelGap?: number;
  maxLevelGap?: number;
  bottomRoom?: number;
  radius?: number;
  label?: (id: K) => ReactNode;
  renderNode?: (id: K) => ReactNode;
  nodeMark?: (id: K) => TreeNodeMark | null | undefined;
  nodeClass?: (id: K) => string;
  nodeScale?: (id: K) => number;
  /** 0..1, default 1. */
  nodeOpacity?: (id: K) => number;
  edgeMark?: (parent: K, child: K) => TreeEdgeMark | null | undefined;
  /** Stroke width of marked edges (default 3.5). */
  markedEdgeWidth?: number;
  hidden?: (id: K) => boolean;
  enterScale?: number;
  transition?: Transition;
  /** Makes nodes buttons: clickable, one tab stop for the whole tree, arrow keys move, Enter/Space press. */
  onNodeClick?: (id: K) => void;
  /** Screen-reader name of a clickable node (default: its label, or its id). */
  nodeAriaLabel?: (id: K) => string;
  overlay?: (geometry: TreeGeometry<K>) => ReactNode;
  /** Fill the container's width but never grow past the viewBox `width`, centred: a three-node tree stays small. */
  natural?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [focusId, setFocusId] = useState<K | null>(null);
  const { place, columns, depth } = layoutTree(shape, layout, { gap: forestGap, size: nodeSize });
  const gap = levelGap ?? Math.min(maxLevelGap, (height - bottomRoom) / Math.max(1, depth));
  const at = (id: K) => {
    const p = place.get(id);
    return p && { x: treeX(p.col, columns, width, pad), y: top + p.depth * gap };
  };
  // Reading order (top row first, left to right), so Tab walks the tree the way it's drawn;
  // layouts record nodes in their own traversal order.
  const shown = [...place.keys()]
    .filter((id) => !hidden?.(id))
    .sort((a, b) => place.get(a)!.depth - place.get(b)!.depth || place.get(a)!.col - place.get(b)!.col);
  const tabStop = focusId !== null && shown.includes(focusId) ? focusId : shown[0];

  const onNodeKey = (e: KeyboardEvent<SVGGElement>, id: K) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onNodeClick?.(id);
      return;
    }
    const to = treeKeyTarget(e.key, id, shape, place, (n) => !hidden?.(n));
    if (to === null) return;
    e.preventDefault();
    setFocusId(to);
    svgRef.current?.querySelector<SVGGElement>(`[data-node="${CSS.escape(String(to))}"]`)?.focus();
  };

  const style = markedEdgeWidth === undefined && !natural
    ? undefined
    : ({ ...(markedEdgeWidth !== undefined && { '--tree-marked-w': markedEdgeWidth }), ...(natural && { maxWidth: width }) } as CSSProperties);

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${width} ${height}`}
      className={`tree-svg ${natural ? 'is-natural' : ''} ${className}`}
      preserveAspectRatio="xMidYMid meet"
      style={style}
      // A drawing of buttons is a group (an img would hide them from assistive tech).
      role={onNodeClick ? 'group' : ariaLabel ? 'img' : undefined}
      aria-label={ariaLabel}
    >
      <AnimatePresence>
        {shown.flatMap((id) =>
          shape.children(id).map((c) => {
            if (c == null || hidden?.(c) || !place.has(c)) return null;
            const a = at(id)!;
            const b = at(c)!;
            const mark = edgeMark?.(id, c);
            const pos = { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
            return (
              <motion.line
                key={`${id}-${c}`}
                className={`tree-edge ${mark ? `is-marked tone-${mark.tone}` : ''} ${mark?.dashed ? 'is-dashed' : ''}`}
                initial={{ opacity: 0, ...pos }}
                animate={{ opacity: 1, ...pos }}
                exit={{ opacity: 0 }}
                transition={transition}
              />
            );
          }),
        )}
      </AnimatePresence>
      {overlay?.({ at, levelGap: gap })}
      <AnimatePresence>
        {shown.map((id) => {
          const { x, y } = at(id)!;
          const mark = nodeMark?.(id);
          const markClass = mark ? `is-${mark.fill} tone-${mark.tone}` : '';
          const tintStyle = mark?.tint === undefined ? undefined : ({ '--tree-tint': `${mark.tint}%` } as CSSProperties);
          return (
            <motion.g
              key={id}
              className={`tree-node ${markClass} ${onNodeClick ? 'is-clickable' : ''} ${nodeClass?.(id) ?? ''}`}
              style={tintStyle}
              initial={{ opacity: 0, scale: enterScale, x, y }}
              animate={{ opacity: nodeOpacity?.(id) ?? 1, scale: nodeScale?.(id) ?? 1, x, y }}
              exit={{ opacity: 0, scale: enterScale }}
              transition={transition}
              {...(onNodeClick && {
                role: 'button',
                tabIndex: id === tabStop ? 0 : -1,
                'aria-label': nodeAriaLabel?.(id) ?? textLabel(label?.(id), id),
                'data-node': String(id),
                onClick: () => onNodeClick(id),
                onFocus: () => setFocusId(id),
                onKeyDown: (e: KeyboardEvent<SVGGElement>) => onNodeKey(e, id),
              })}
            >
              {renderNode ? (
                renderNode(id)
              ) : (
                <>
                  <circle r={radius} />
                  <text y={5} textAnchor="middle">
                    {label?.(id) ?? id}
                  </text>
                </>
              )}
            </motion.g>
          );
        })}
      </AnimatePresence>
    </svg>
  );
}

/** A node's accessible name when the lesson didn't give one: its text label, else its id. */
function textLabel(label: ReactNode, id: TreeKey): string {
  return typeof label === 'string' || typeof label === 'number' ? String(label) : String(id);
}
