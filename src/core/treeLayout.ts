/** Any stable node id: a number (BST node ids) or a string (DOM paths, package names). */
export type TreeKey = string | number;

/**
 * The shape of a tree, independent of what's stored in it. `children(id)` lists the
 * children in order; `null` marks an empty slot, so a binary node without a left
 * child is `[null, right]` and still lays out on the correct side.
 */
export type TreeShape<K extends TreeKey> = {
  children: (id: K) => readonly (K | null)[];
} & (
  | { root: K | null; roots?: undefined }
  | {
      /** Ignored in forest mode; leave it out. */
      root?: K | null;
      /**
       * Forest mode: several trees laid out side by side, in this order (union-find sets, a
       * Huffman merge in progress).
       */
      roots: readonly K[];
    }
);

/** Columns left empty between neighbouring trees of a forest, by default. */
export const FOREST_GAP = 0.5;

/**
 * - `inorder`: binary trees laid out by in-order rank: the first child's subtree, then
 *   the node, then the rest. Every left descendant sits left of its ancestor, so a
 *   BST reads as sorted from left to right.
 * - `tidy`: leaves take consecutive columns in depth-first order and each parent sits
 *   midway between its first and last child. Right for n-ary trees (DOM, dependency
 *   and accessibility trees) and for call trees like fib(n).
 */
export type TreeLayoutMode = 'inorder' | 'tidy';

export interface TreeNodePlace {
  /** Horizontal position in columns, 0 … columns - 1 (can be fractional in `tidy`). */
  col: number;
  depth: number;
}

export interface TreeLayout<K extends TreeKey> {
  place: Map<K, TreeNodePlace>;
  /**
   * Number of columns used: nodes in `inorder`, leaves in `tidy` (with `size`, the distance
   * from the leftmost to the rightmost node centre plus one, so `treeX` still maps it).
   */
  columns: number;
  /** Depth of the deepest node (root = 0); 0 for an empty tree. */
  depth: number;
}

/**
 * Lay a tree (or a forest, via `shape.roots`) out on a grid of columns × depth. Pure; map
 * it to pixels with `treeX`. A forest's trees take consecutive runs of columns with `gap`
 * columns between neighbours and none at the ends, so one tree lays out exactly as before.
 *
 * `size(id)` (tidy only) is a node's footprint in columns (default 1): a wide pill next to
 * small circles. Each subtree gets a run of columns as wide as the larger of its children's
 * runs and its own node, so neighbours never overlap; with every size 1 the layout is the
 * plain tidy one, column for column.
 */
export function layoutTree<K extends TreeKey>(
  shape: TreeShape<K>,
  mode: TreeLayoutMode,
  opts: { gap?: number; size?: (id: K) => number } = {},
): TreeLayout<K> {
  const gap = opts.gap ?? FOREST_GAP;
  const size = (id: K) => Math.max(0, opts.size?.(id) ?? 1);
  const place = new Map<K, TreeNodePlace>();
  let next = 0;
  let depth = 0;

  const inorder = (id: K | null, d: number) => {
    if (id == null) return;
    const [first = null, ...rest] = shape.children(id);
    inorder(first, d + 1);
    place.set(id, { col: next++, depth: d });
    depth = Math.max(depth, d);
    for (const c of rest) inorder(c, d + 1);
  };

  const kids = (id: K) => shape.children(id).filter((c): c is K => c != null);
  // Tidy, in two passes: each subtree's run width, then centres placed left to right.
  const span = new Map<K, number>();
  const measure = (id: K): number => {
    const w = Math.max(size(id), kids(id).reduce((sum, c) => sum + measure(c), 0));
    span.set(id, w);
    return w;
  };
  const tidy = (id: K, d: number, left: number): number => {
    depth = Math.max(depth, d);
    const cs = kids(id);
    const block = cs.reduce((sum, c) => sum + span.get(c)!, 0);
    let at = left + (span.get(id)! - block) / 2;
    const cols = cs.map((c) => {
      const col = tidy(c, d + 1, at);
      at += span.get(c)!;
      return col;
    });
    const col = cols.length ? (cols[0] + cols[cols.length - 1]) / 2 : left + span.get(id)! / 2;
    place.set(id, { col, depth: d });
    return col;
  };

  const roots = shape.roots ?? (shape.root != null ? [shape.root] : []);
  roots.forEach((root, i) => {
    if (i > 0) next += gap;
    if (mode === 'inorder') inorder(root, 0);
    else {
      measure(root);
      tidy(root, 0, next);
      next += span.get(root)!;
    }
  });
  if (mode === 'inorder' || place.size === 0) return { place, columns: next, depth };
  // Shift so the leftmost centre is column 0, as in the unsized layout (leaf k at column k).
  const cols = [...place.values()].map((p) => p.col);
  const lo = Math.min(...cols);
  for (const p of place.values()) p.col -= lo;
  return { place, columns: Math.max(...cols) - lo + 1, depth };
}

/** Pixel x of a column across `width`, keeping `pad` clear on both sides; one column is centred. */
export function treeX(col: number, columns: number, width: number, pad: number): number {
  return columns <= 1 ? width / 2 : pad + (col * (width - pad * 2)) / (columns - 1);
}

/** Every node's parent in the laid-out tree (roots map to null). */
function parentsOf<K extends TreeKey>(shape: TreeShape<K>, place: ReadonlyMap<K, TreeNodePlace>): Map<K, K | null> {
  const parent = new Map<K, K | null>();
  for (const id of place.keys()) if (!parent.has(id)) parent.set(id, null);
  for (const id of place.keys()) for (const c of shape.children(id)) if (c != null && place.has(c)) parent.set(c, id);
  return parent;
}

/**
 * Where keyboard focus goes when the focused node `from` leaves the tree: its nearest ancestor that
 * passes `live` (the parent, else the grandparent, ...). null = no ancestor is left (a root, or a
 * whole branch going), so the caller falls back to the container.
 */
export function treeExitFocus<K extends TreeKey>(
  from: K,
  shape: TreeShape<K>,
  place: ReadonlyMap<K, TreeNodePlace>,
  live: (id: K) => boolean,
): K | null {
  const parent = parentsOf(shape, place);
  for (let up = parent.get(from); up != null; up = parent.get(up)) if (live(up)) return up;
  return null;
}

/**
 * Where an arrow key moves keyboard focus in a drawn tree, following its structure:
 * ArrowUp goes to the parent, ArrowDown to the leftmost child, ArrowLeft/Right to the
 * neighbour on the same level (across subtrees, and across trees in a forest), Home/End to
 * the first and last node in reading order (top row first, left to right). Only nodes that
 * pass `visible` are targets. null = not a navigation key, or nowhere to go.
 */
export function treeKeyTarget<K extends TreeKey>(
  key: string,
  from: K,
  shape: TreeShape<K>,
  place: ReadonlyMap<K, TreeNodePlace>,
  visible: (id: K) => boolean = () => true,
): K | null {
  const at = place.get(from);
  if (!at) return null;
  const shown = [...place.keys()].filter(visible);
  const byReading = (a: K, b: K) => place.get(a)!.depth - place.get(b)!.depth || place.get(a)!.col - place.get(b)!.col;
  const row = shown.filter((id) => place.get(id)!.depth === at.depth).sort(byReading);
  const k = row.indexOf(from);
  let to: K | null | undefined = null;
  switch (key) {
    case 'ArrowUp':
      to = parentsOf(shape, place).get(from);
      break;
    case 'ArrowDown':
      to = shape.children(from).filter((c): c is K => c != null && place.has(c) && visible(c)).sort(byReading)[0];
      break;
    case 'ArrowLeft':
      to = k > 0 ? row[k - 1] : null;
      break;
    case 'ArrowRight':
      to = k >= 0 && k < row.length - 1 ? row[k + 1] : null;
      break;
    case 'Home':
      to = shown.sort(byReading)[0];
      break;
    case 'End':
      to = shown.sort(byReading).at(-1);
      break;
    default:
      return null;
  }
  return to != null && to !== from && visible(to) ? to : null;
}
