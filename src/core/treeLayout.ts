/** Any stable node id: a number (BST node ids) or a string (DOM paths, package names). */
export type TreeKey = string | number;

/**
 * The shape of a tree, independent of what's stored in it. `children(id)` lists the
 * children in order; `null` marks an empty slot, so a binary node without a left
 * child is `[null, right]` and still lays out on the correct side.
 */
export interface TreeShape<K extends TreeKey> {
  root: K | null;
  /**
   * Forest mode: several trees laid out side by side, in this order (union-find sets, a
   * Huffman merge in progress). When given, `root` is ignored.
   */
  roots?: readonly K[];
  children: (id: K) => readonly (K | null)[];
}

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
  /** Number of columns used: nodes in `inorder`, leaves in `tidy`. */
  columns: number;
  /** Depth of the deepest node (root = 0); 0 for an empty tree. */
  depth: number;
}

/**
 * Lay a tree (or a forest, via `shape.roots`) out on a grid of columns × depth. Pure; map
 * it to pixels with `treeX`. A forest's trees take consecutive runs of columns with `gap`
 * columns between neighbours and none at the ends, so one tree lays out exactly as before.
 */
export function layoutTree<K extends TreeKey>(
  shape: TreeShape<K>,
  mode: TreeLayoutMode,
  opts: { gap?: number } = {},
): TreeLayout<K> {
  const gap = opts.gap ?? FOREST_GAP;
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

  const tidy = (id: K, d: number): number => {
    depth = Math.max(depth, d);
    const cols = shape.children(id).flatMap((c) => (c == null ? [] : [tidy(c, d + 1)]));
    const col = cols.length ? (cols[0] + cols[cols.length - 1]) / 2 : next++;
    place.set(id, { col, depth: d });
    return col;
  };

  const roots = shape.roots ?? (shape.root != null ? [shape.root] : []);
  roots.forEach((root, i) => {
    if (i > 0) next += gap;
    if (mode === 'inorder') inorder(root, 0);
    else tidy(root, 0);
  });
  return { place, columns: next, depth };
}

/** Pixel x of a column across `width`, keeping `pad` clear on both sides; one column is centred. */
export function treeX(col: number, columns: number, width: number, pad: number): number {
  return columns <= 1 ? width / 2 : pad + (col * (width - pad * 2)) / (columns - 1);
}
