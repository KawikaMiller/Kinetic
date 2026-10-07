/** The plain (unbalanced) binary search tree: immutable insert, find, delete and in-order walk. */

export interface BNode {
  id: number;
  key: number;
  left: number | null;
  right: number | null;
}
export interface Tree {
  nodes: Record<number, BNode>;
  root: number | null;
  nextId: number;
}
export type Side = 'left' | 'right';

export const clone = (t: Tree): Tree => ({
  root: t.root,
  nextId: t.nextId,
  nodes: Object.fromEntries(Object.values(t.nodes).map((n) => [n.id, { ...n }])),
});

export const emptyTree = (): Tree => ({ nodes: {}, root: null, nextId: 1 });

/** Insert `k` at the empty spot its search ends in. A key already present leaves the tree unchanged. */
export function insertKey(t0: Tree, k: number): Tree {
  const t = clone(t0);
  const id = t.nextId++;
  const node: BNode = { id, key: k, left: null, right: null };
  if (t.root == null) {
    t.nodes[id] = node;
    t.root = id;
    return t;
  }
  let cur = t.root;
  for (;;) {
    const n = t.nodes[cur];
    if (k === n.key) return t0;
    const side = k < n.key ? 'left' : 'right';
    const next = n[side];
    if (next == null) {
      t.nodes[id] = node;
      n[side] = id;
      return t;
    }
    cur = next;
  }
}

export function build(keys: number[]): Tree {
  return keys.reduce(insertKey, emptyTree());
}

export interface Probe {
  /** Every node compared with `k`, root first: one comparison each. */
  path: number[];
  found: number | null;
  /** Where the search fell off (or the found node's parent) and on which side. */
  parent: number | null;
  side: Side;
}

/** Walk down from the root comparing with `k`. */
export function findPath(t: Tree, k: number): Probe {
  const path: number[] = [];
  let cur = t.root;
  let parent: number | null = null;
  let side: Side = 'left';
  while (cur != null) {
    const n = t.nodes[cur];
    path.push(cur);
    if (n.key === k) return { path, found: cur, parent, side };
    parent = cur;
    side = k < n.key ? 'left' : 'right';
    cur = n[side];
  }
  return { path, found: null, parent, side };
}

/** In-order successor of a node with a right child: step right once, then left as far as possible. */
export function successorPath(t: Tree, id: number): number[] {
  const out = [t.nodes[id].right!];
  while (t.nodes[out.at(-1)!].left != null) out.push(t.nodes[out.at(-1)!].left!);
  return out;
}

/** Delete `k`: a leaf is cut off, one child moves up, two children are replaced by the in-order successor. */
export function deleteKey(t: Tree, k: number): Tree {
  const { found, parent, side } = findPath(t, k);
  if (found == null) return t;
  const target = t.nodes[found];
  const t2 = clone(t);
  const link = (to: number | null) => {
    if (parent == null) t2.root = to;
    else t2.nodes[parent][side] = to;
  };
  if (target.left == null || target.right == null) {
    link(target.left ?? target.right);
  } else {
    const succPath = successorPath(t, found);
    const s = succPath.at(-1)!;
    if (succPath.length > 1) {
      // The successor leaves its spot to its right child, then adopts the target's right subtree.
      t2.nodes[succPath.at(-2)!].left = t.nodes[s].right;
      t2.nodes[s].right = target.right;
    }
    t2.nodes[s].left = target.left;
    link(s);
  }
  delete t2.nodes[found];
  return t2;
}

/** Node ids in in-order: left subtree, node, right subtree. */
export function inorderIds(t: Tree): number[] {
  const order: number[] = [];
  const walk = (id: number | null) => {
    if (id == null) return;
    walk(t.nodes[id].left);
    order.push(id);
    walk(t.nodes[id].right);
  };
  walk(t.root);
  return order;
}

/** Levels on the longest root-to-leaf path (a single node has height 1). */
export function height(t: Tree, id: number | null = t.root): number {
  if (id == null) return 0;
  const n = t.nodes[id];
  return 1 + Math.max(height(t, n.left), height(t, n.right));
}

export const size = (t: Tree) => Object.keys(t.nodes).length;

/** The fewest levels any binary tree with `n` nodes can have. */
export const minHeight = (n: number) => (n ? Math.ceil(Math.log2(n + 1)) : 0);

/** The Stage flags a tree as lopsided once it's more than this many levels above the minimum. */
export const LOPSIDED_SLACK = 1;
export const isLopsided = (t: Tree) => height(t) > minHeight(size(t)) + LOPSIDED_SLACK;
