import { DOMAIN, dist, inRect, type Pt, type Rect } from './data';

/** A cell stops splitting at this depth, so coincident points cannot split forever. */
export const MAX_DEPTH = 12;
/** Deciding a quadrant compares x with the cell's middle and y with its middle: two coordinate comparisons. */
const COMPARISONS_PER_QUADRANT = 2;

export interface QNode {
  id: number;
  rect: Rect;
  depth: number;
  /** Points held by a leaf (empty for an internal cell). */
  points: Pt[];
  /** Child ids: south-west, south-east, north-west, north-east; null for a leaf. */
  children: [number, number, number, number] | null;
}

export interface QuadTree {
  nodes: QNode[];
  capacity: number;
  /** Coordinate comparisons spent inserting so far. */
  comparisons: number;
}

const newNode = (t: QuadTree, rect: Rect, depth: number): QNode => {
  const node: QNode = { id: t.nodes.length, rect, depth, points: [], children: null };
  t.nodes.push(node);
  return node;
};

export function createQuadTree(capacity: number): QuadTree {
  const t: QuadTree = { nodes: [], capacity, comparisons: 0 };
  newNode(t, { x0: 0, y0: 0, x1: DOMAIN, y1: DOMAIN }, 0);
  return t;
}

const quadrantOf = (n: QNode, p: Pt): number => {
  const mx = (n.rect.x0 + n.rect.x1) / 2;
  const my = (n.rect.y0 + n.rect.y1) / 2;
  return (p[0] >= mx ? 1 : 0) + (p[1] >= my ? 2 : 0);
};

const quadrantRect = (r: Rect, q: number): Rect => {
  const mx = (r.x0 + r.x1) / 2;
  const my = (r.y0 + r.y1) / 2;
  return { x0: q & 1 ? mx : r.x0, x1: q & 1 ? r.x1 : mx, y0: q & 2 ? my : r.y0, y1: q & 2 ? r.y1 : my };
};

/** Split a leaf into four, pushing its points down; a child that is still over capacity splits again, down to MAX_DEPTH. Returns cells created. */
function split(t: QuadTree, n: QNode): number {
  const kids = [0, 1, 2, 3].map((q) => newNode(t, quadrantRect(n.rect, q), n.depth + 1));
  n.children = [kids[0].id, kids[1].id, kids[2].id, kids[3].id];
  const held = n.points;
  n.points = [];
  let created = 4;
  for (const p of held) {
    t.comparisons += COMPARISONS_PER_QUADRANT;
    kids[quadrantOf(n, p)].points.push(p);
  }
  for (const kid of kids) if (kid.points.length > t.capacity && kid.depth < MAX_DEPTH) created += split(t, kid);
  return created;
}

/** Insert one point. Returns how many cells the insert created (0 when the bucket had room). */
export function insertPoint(t: QuadTree, p: Pt): number {
  let n = t.nodes[0];
  while (n.children) {
    t.comparisons += COMPARISONS_PER_QUADRANT;
    n = t.nodes[n.children[quadrantOf(n, p)]];
  }
  n.points.push(p);
  return n.points.length > t.capacity && n.depth < MAX_DEPTH ? split(t, n) : 0;
}

export function buildQuad(points: readonly Pt[], capacity: number): QuadTree {
  const t = createQuadTree(capacity);
  for (const p of points) insertPoint(t, p);
  return t;
}

export const leaves = (t: QuadTree): QNode[] => t.nodes.filter((n) => n.children === null);
export const treeDepth = (t: QuadTree): number => Math.max(...t.nodes.map((n) => n.depth));
export const pointCount = (t: QuadTree): number => leaves(t).reduce((s, n) => s + n.points.length, 0);

const rectDistance = (r: Rect, q: Pt): number => {
  const dx = Math.max(r.x0 - q[0], 0, q[0] - r.x1);
  const dy = Math.max(r.y0 - q[1], 0, q[1] - r.y1);
  return Math.hypot(dx, dy);
};

export interface QuadKnn {
  found: number[];
  visited: number[];
  pruned: number[];
  /** Points whose distance was computed. */
  checks: number;
}

/** k nearest: visit cells nearest-first and skip a cell whose closest corner is no nearer than the k-th best. */
export function quadKnn(t: QuadTree, q: Pt, k: number): QuadKnn {
  const best: number[] = [];
  const visited: number[] = [];
  const pruned: number[] = [];
  let checks = 0;
  const walk = (id: number) => {
    const n = t.nodes[id];
    visited.push(id);
    if (!n.children) {
      for (const p of n.points) {
        checks++;
        const d = dist(p, q);
        if (best.length < k || d < best[best.length - 1]) {
          best.push(d);
          best.sort((a, b) => a - b);
          if (best.length > k) best.pop();
        }
      }
      return;
    }
    const order = n.children.map((c) => ({ c, d: rectDistance(t.nodes[c].rect, q) })).sort((a, b) => a.d - b.d);
    for (const { c, d } of order) {
      if (best.length === k && d >= best[best.length - 1]) pruned.push(c);
      else walk(c);
    }
  };
  walk(0);
  return { found: best, visited, pruned, checks };
}

export interface QuadRange {
  hits: Pt[];
  visited: number[];
  pruned: number[];
  checks: number;
}

export function quadRange(t: QuadTree, r: Rect): QuadRange {
  const hits: Pt[] = [];
  const visited: number[] = [];
  const pruned: number[] = [];
  let checks = 0;
  const overlaps = (c: Rect) => c.x0 <= r.x1 && c.x1 >= r.x0 && c.y0 <= r.y1 && c.y1 >= r.y0;
  const walk = (id: number) => {
    const n = t.nodes[id];
    visited.push(id);
    if (!n.children) {
      for (const p of n.points) {
        checks++;
        if (inRect(p, r)) hits.push(p);
      }
      return;
    }
    for (const c of n.children) {
      if (overlaps(t.nodes[c].rect)) walk(c);
      else pruned.push(c);
    }
  };
  walk(0);
  return { hits, visited, pruned, checks };
}

/** Invariants: buckets hold at most `capacity` points unless at the depth cap, every point lies in its cell, and no points are lost. */
export function quadInvariantViolations(t: QuadTree, expectedCount: number): string[] {
  const bad: string[] = [];
  for (const n of t.nodes) {
    if (n.children === null) {
      if (n.points.length > t.capacity && n.depth < MAX_DEPTH) bad.push(`leaf ${n.id} holds ${n.points.length} points above the capacity ${t.capacity}`);
      for (const p of n.points) if (!inRect(p, n.rect)) bad.push(`a point is outside leaf ${n.id}`);
    } else if (n.points.length > 0) bad.push(`internal cell ${n.id} still holds points`);
  }
  if (pointCount(t) !== expectedCount) bad.push('the tree lost or gained points');
  return bad;
}
