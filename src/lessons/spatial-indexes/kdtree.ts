import { dist, inRect, type Pt, type Rect } from './data';

/** A k-d tree node: the point it holds, the axis it splits on, and its two subtrees (ids, or null). */
export interface KdNode {
  id: number;
  point: Pt;
  axis: number;
  left: number | null;
  right: number | null;
  depth: number;
}

export interface KdTree {
  nodes: KdNode[];
  root: number | null;
  dims: number;
  /** Coordinate comparisons spent sorting for medians: the build cost in the unit the comparison table uses. */
  buildComparisons: number;
}

/** Merge sort that counts every comparison it makes, so the build cost is a measured number. */
function sortCounted(items: Pt[], axis: number, tally: { n: number }): Pt[] {
  if (items.length <= 1) return items;
  const mid = items.length >> 1;
  const a = sortCounted(items.slice(0, mid), axis, tally);
  const b = sortCounted(items.slice(mid), axis, tally);
  const out: Pt[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    tally.n++;
    if (b[j][axis] < a[i][axis]) out.push(b[j++]);
    else out.push(a[i++]);
  }
  while (i < a.length) out.push(a[i++]);
  while (j < b.length) out.push(b[j++]);
  return out;
}

/** Build by splitting on the axes in turn at the median; the median point becomes the node. Ids are in pre-order. */
export function buildKd(points: readonly Pt[], dims = 2): KdTree {
  const nodes: KdNode[] = [];
  const tally = { n: 0 };
  const make = (items: Pt[], depth: number): number | null => {
    if (items.length === 0) return null;
    const axis = depth % dims;
    const sorted = sortCounted(items, axis, tally);
    const m = sorted.length >> 1;
    const id = nodes.length;
    const node: KdNode = { id, point: sorted[m], axis, left: null, right: null, depth };
    nodes.push(node);
    node.left = make(sorted.slice(0, m), depth + 1);
    node.right = make(sorted.slice(m + 1), depth + 1);
    return id;
  };
  const root = make([...points], 0);
  return { nodes, root, dims, buildComparisons: tally.n };
}

/** The rectangle a node's subtree is confined to (2-D), given the map bounds. */
export function regionOf(tree: KdTree, target: number, bounds: Rect): Rect {
  const r = { ...bounds };
  const walk = (id: number | null): boolean => {
    if (id === null) return false;
    if (id === target) return true;
    const n = tree.nodes[id];
    const v = n.point[n.axis];
    const saved = { ...r };
    if (n.axis === 0) r.x1 = v;
    else r.y1 = v;
    if (walk(n.left)) return true;
    Object.assign(r, saved);
    if (n.axis === 0) r.x0 = v;
    else r.y0 = v;
    if (walk(n.right)) return true;
    Object.assign(r, saved);
    return false;
  };
  walk(tree.root);
  return r;
}

/** The splitting segment each node draws on the plane, clipped to its own region. */
export function splitSegments(tree: KdTree, bounds: Rect, maxDepth = Infinity): { from: [number, number]; to: [number, number]; depth: number; axis: number }[] {
  const out: { from: [number, number]; to: [number, number]; depth: number; axis: number }[] = [];
  const walk = (id: number | null, r: Rect) => {
    if (id === null) return;
    const n = tree.nodes[id];
    if (n.depth > maxDepth) return;
    const v = n.point[n.axis];
    if (n.axis === 0) {
      out.push({ from: [v, r.y0], to: [v, r.y1], depth: n.depth, axis: 0 });
      walk(n.left, { ...r, x1: v });
      walk(n.right, { ...r, x0: v });
    } else {
      out.push({ from: [r.x0, v], to: [r.x1, v], depth: n.depth, axis: 1 });
      walk(n.left, { ...r, y1: v });
      walk(n.right, { ...r, y0: v });
    }
  };
  walk(tree.root, bounds);
  return out;
}

export type KdEvent =
  | { kind: 'check'; node: number; distance: number; kth: number | null }
  | { kind: 'skip'; node: number; planeDistance: number; kth: number }
  | { kind: 'cross'; node: number; planeDistance: number; kth: number | null };

export interface KnnResult {
  /** The k nearest, closest first. */
  found: { node: number; distance: number }[];
  /** Nodes whose point was distance-checked, in order. */
  visited: number[];
  /** Subtree roots skipped because their region cannot beat the k-th best. */
  pruned: number[];
  events: KdEvent[];
}

/** Which wrong rule a broken search uses: it measures the plane distance on the other axis. */
export type KdBug = 'wrong-axis' | null;

/**
 * k nearest neighbours: descend toward the query, then on the way back visit the far side only when the
 * query is closer to the splitting line than the current k-th best distance.
 */
export function knn(tree: KdTree, q: Pt, k: number, bug: KdBug = null): KnnResult {
  const found: { node: number; distance: number }[] = [];
  const visited: number[] = [];
  const pruned: number[] = [];
  const events: KdEvent[] = [];
  const kth = () => (found.length < k ? null : found[found.length - 1].distance);
  const search = (id: number | null) => {
    if (id === null) return;
    const n = tree.nodes[id];
    visited.push(id);
    const d = dist(n.point, q);
    if (found.length < k || d < found[found.length - 1].distance) {
      found.push({ node: id, distance: d });
      found.sort((a, b) => a.distance - b.distance);
      if (found.length > k) found.pop();
    }
    events.push({ kind: 'check', node: id, distance: d, kth: kth() });
    const diff = q[n.axis] - n.point[n.axis];
    const [near, far] = diff < 0 ? [n.left, n.right] : [n.right, n.left];
    search(near);
    if (far === null) return;
    const wrongAxis = (n.axis + 1) % tree.dims;
    const planeDistance = bug === 'wrong-axis' ? Math.abs(q[wrongAxis] - n.point[wrongAxis]) : Math.abs(diff);
    const best = kth();
    if (best === null || planeDistance < best) {
      events.push({ kind: 'cross', node: far, planeDistance, kth: best });
      search(far);
    } else {
      pruned.push(far);
      events.push({ kind: 'skip', node: far, planeDistance, kth: best });
    }
  };
  search(tree.root);
  return { found, visited, pruned, events };
}

export type KdRangeEvent = { kind: 'check'; node: number; inside: boolean } | { kind: 'skip'; node: number; side: 'left' | 'right' };

export interface KdRangeResult {
  hits: Pt[];
  /** The nodes whose point was checked against the rectangle, in order. */
  visited: number[];
  pruned: number[];
  hitNodes: number[];
  events: KdRangeEvent[];
}

/** Range query: visit a subtree only when its splitting line lets the rectangle reach that side. */
export function kdRange(tree: KdTree, r: Rect): KdRangeResult {
  const hits: Pt[] = [];
  const hitNodes: number[] = [];
  const visited: number[] = [];
  const pruned: number[] = [];
  const events: KdRangeEvent[] = [];
  const search = (id: number | null) => {
    if (id === null) return;
    const n = tree.nodes[id];
    visited.push(id);
    const [lo, hi] = n.axis === 0 ? [r.x0, r.x1] : [r.y0, r.y1];
    const v = n.point[n.axis];
    const inside = inRect(n.point, r);
    if (inside) {
      hits.push(n.point);
      hitNodes.push(id);
    }
    events.push({ kind: 'check', node: id, inside });
    if (lo <= v) search(n.left);
    else if (n.left !== null) {
      pruned.push(n.left);
      events.push({ kind: 'skip', node: n.left, side: 'left' });
    }
    if (hi >= v) search(n.right);
    else if (n.right !== null) {
      pruned.push(n.right);
      events.push({ kind: 'skip', node: n.right, side: 'right' });
    }
  };
  search(tree.root);
  return { hits, visited, pruned, hitNodes, events };
}

/** Every node's point is on the correct side of every ancestor's split (left <= split <= right). */
export function kdInvariantViolations(tree: KdTree): string[] {
  const bad: string[] = [];
  const walk = (id: number | null, ancestors: { axis: number; value: number; side: 'left' | 'right' }[]) => {
    if (id === null) return;
    const n = tree.nodes[id];
    for (const a of ancestors) {
      const v = n.point[a.axis];
      if (a.side === 'left' ? v > a.value : v < a.value) bad.push(`node ${id} is on the wrong side of an ancestor split`);
    }
    if (n.axis !== n.depth % tree.dims) bad.push(`node ${id} splits on the wrong axis for its depth`);
    walk(n.left, [...ancestors, { axis: n.axis, value: n.point[n.axis], side: 'left' }]);
    walk(n.right, [...ancestors, { axis: n.axis, value: n.point[n.axis], side: 'right' }]);
  };
  walk(tree.root, []);
  return bad;
}

/** A node and every node below it. */
export function subtreeIds(tree: KdTree, id: number | null): number[] {
  if (id === null) return [];
  const n = tree.nodes[id];
  return [id, ...subtreeIds(tree, n.left), ...subtreeIds(tree, n.right)];
}
