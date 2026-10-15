/**
 * A persistent array: a perfect b-ary tree whose leaves hold one value each and whose internal nodes
 * hold child ids. Nodes are immutable and live in an append-only arena; a version is a root id plus
 * bookkeeping. Updating by path copying allocates the nodes on one root-to-leaf path and shares
 * every other node with the older version. The deliberately broken update overwrites a leaf in
 * place, which every version that reaches that leaf then sees.
 *
 * Memory is counted in one unit, "slots stored": a leaf is 1 slot (its value), an internal node is
 * `b` slots (its child pointers).
 */

export interface PNode {
  readonly id: number;
  /** Child ids, in order; null for a leaf. */
  readonly kids: readonly number[] | null;
  /** The value of a leaf; null for an internal node. */
  readonly value: number | null;
}

export type UpdateMode = 'path' | 'inplace';

export interface Version {
  readonly id: number;
  readonly root: number;
  /** The version this one was made from (null for v0). Versions form a tree, not a line. */
  readonly parent: number | null;
  readonly edit: { readonly index: number; readonly value: number } | null;
  /** Ids of the nodes this update allocated, root first (empty for v0's initial build and for an in-place edit). */
  readonly copied: readonly number[];
  /** The array this version held when it was made: a plain snapshot, the oracle for "is the old version intact?". */
  readonly recorded: readonly number[];
}

export interface Store {
  readonly b: number;
  /** Internal levels above the leaves: capacity = b^depth. */
  readonly depth: number;
  readonly nodes: readonly PNode[];
  readonly versions: readonly Version[];
}

/** Which update the editor makes: the in-place toggle only exists in the scene that offers it. */
export const updateMode = (offersInPlace: boolean, inPlace: boolean): UpdateMode => (offersInPlace && inPlace ? 'inplace' : 'path');

export const capacityOf = (b: number, depth: number): number => b ** depth;

/** Levels of internal nodes needed for n values: ceil(log_b n), at least 1. Integer arithmetic, so b^d is exact. */
export function depthFor(n: number, b: number): number {
  let depth = 1;
  while (b ** depth < n) depth++;
  return depth;
}

/** Slots one node occupies: b for an internal node (its child pointers), 1 for a leaf. */
export const slotsOf = (node: PNode): number => (node.kids ? node.kids.length : 1);

/** The child to follow at each level for `index`, most significant digit first. */
export function digits(index: number, b: number, depth: number): number[] {
  const out: number[] = [];
  let rest = index;
  for (let level = depth - 1; level >= 0; level--) {
    const unit = b ** level;
    out.push(Math.floor(rest / unit));
    rest %= unit;
  }
  return out;
}

/** Build v0 from `values`, padded with zeros up to the next power of b (so n is rounded up, never refused). */
export function createStore(values: readonly number[], b: number): Store {
  const depth = depthFor(values.length, b);
  const capacity = capacityOf(b, depth);
  const padded = [...values, ...Array<number>(capacity - values.length).fill(0)];
  const nodes: PNode[] = [];
  const add = (kids: readonly number[] | null, value: number | null): number => {
    const node: PNode = Object.freeze({ id: nodes.length, kids, value });
    nodes.push(node);
    return node.id;
  };
  let level = padded.map((v) => add(null, v));
  while (level.length > 1) {
    const next: number[] = [];
    for (let i = 0; i < level.length; i += b) next.push(add(Object.freeze(level.slice(i, i + b)), null));
    level = next;
  }
  const v0: Version = Object.freeze({ id: 0, root: level[0], parent: null, edit: null, copied: Object.freeze([]), recorded: Object.freeze(padded) });
  return { b, depth, nodes, versions: [v0] };
}

export const capacity = (s: Store): number => capacityOf(s.b, s.depth);

/** Read one cell of a version by walking from its root, never from the snapshot. */
export function read(s: Store, versionId: number, index: number): number {
  let node = s.nodes[s.versions[versionId].root];
  for (const d of digits(index, s.b, s.depth)) node = s.nodes[(node.kids as readonly number[])[d]];
  return node.value as number;
}

/** Every cell of a version, read by walking the tree. */
export function valuesOf(s: Store, versionId: number): number[] {
  return Array.from({ length: capacity(s) }, (_, i) => read(s, versionId, i));
}

/**
 * Make a new version from `from` with cell `index` set to `value`.
 * `path`: allocate a new leaf and a copy of each ancestor with one child pointer changed (depth + 1 nodes).
 * `inplace`: the broken update: overwrite the leaf where it stands and reuse the same root.
 */
export function setValue(s: Store, from: number, index: number, value: number, mode: UpdateMode = 'path'): Store {
  const base = s.versions[from];
  const recorded = Object.freeze(base.recorded.map((v, i) => (i === index ? value : v)));
  const edit = Object.freeze({ index, value });
  const path = digits(index, s.b, s.depth);
  if (mode === 'inplace') {
    let id = base.root;
    for (const d of path) id = (s.nodes[id].kids as readonly number[])[d];
    const nodes = s.nodes.map((n) => (n.id === id ? Object.freeze({ id, kids: null, value }) : n));
    const version: Version = Object.freeze({ id: s.versions.length, root: base.root, parent: from, edit, copied: Object.freeze([]), recorded });
    return { ...s, nodes, versions: [...s.versions, version] };
  }
  const ancestors: PNode[] = [s.nodes[base.root]];
  for (const d of path.slice(0, -1)) ancestors.push(s.nodes[(ancestors[ancestors.length - 1].kids as readonly number[])[d]]);
  const nodes = [...s.nodes];
  const alloc = (kids: readonly number[] | null, v: number | null): number => {
    const node: PNode = Object.freeze({ id: nodes.length, kids, value: v });
    nodes.push(node);
    return node.id;
  };
  const made: number[] = [];
  let child = alloc(null, value);
  made.push(child);
  for (let level = ancestors.length - 1; level >= 0; level--) {
    const kids = (ancestors[level].kids as readonly number[]).map((k, i) => (i === path[level] ? child : k));
    child = alloc(Object.freeze(kids), null);
    made.push(child);
  }
  const version: Version = Object.freeze({ id: s.versions.length, root: child, parent: from, edit, copied: Object.freeze(made.reverse()), recorded });
  return { ...s, nodes, versions: [...s.versions, version] };
}

/** The node ids on the root-to-leaf path of `index` in a version (root first). */
export function pathOf(s: Store, versionId: number, index: number): number[] {
  const out = [s.versions[versionId].root];
  for (const d of digits(index, s.b, s.depth)) out.push((s.nodes[out[out.length - 1]].kids as readonly number[])[d]);
  return out;
}

/** Cells where a version's walked contents differ from what it held when made: empty while the version is intact. */
export function corruptCells(s: Store, versionId: number): number[] {
  const rec = s.versions[versionId].recorded;
  return valuesOf(s, versionId).flatMap((v, i) => (v === rec[i] ? [] : [i]));
}

/** Every node reachable from the given versions' roots. */
export function reachable(s: Store, versionIds: Iterable<number>): Set<number> {
  const seen = new Set<number>();
  const walk = (id: number) => {
    if (seen.has(id)) return;
    seen.add(id);
    for (const k of s.nodes[id].kids ?? []) walk(k);
  };
  for (const v of versionIds) walk(s.versions[v].root);
  return seen;
}

/** For each node, how many of the given versions reach it. */
export function sharedBy(s: Store, versionIds: readonly number[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const v of versionIds) for (const id of reachable(s, [v])) counts.set(id, (counts.get(id) ?? 0) + 1);
  return counts;
}

/** Slots stored by the nodes reachable from these versions: what stays in memory while they are alive. */
export const memorySlots = (s: Store, versionIds: Iterable<number>): number => [...reachable(s, versionIds)].reduce((sum, id) => sum + slotsOf(s.nodes[id]), 0);

/** The designs compared in the cost scene, in slots stored. */
export interface Cost {
  depth: number;
  /** Nodes one update allocates: depth + 1. */
  nodesCopied: number;
  /** Slots one update allocates: depth * b + 1. */
  slotsCopied: number;
  /** A full array copy per update: capacity slots. */
  fullCopy: number;
  /** v0's tree, before any update. */
  initialSlots: number;
}

/** Measured on a real tree: build n values, make one path-copy update, and count what it allocated. */
export function measureCost(n: number, b: number): Cost {
  const s0 = createStore(Array.from({ length: n }, (_, i) => i), b);
  const s1 = setValue(s0, 0, 0, -1);
  const copied = s1.versions[1].copied.map((id) => s1.nodes[id]);
  return {
    depth: s0.depth,
    nodesCopied: copied.length,
    slotsCopied: copied.reduce((sum, node) => sum + slotsOf(node), 0),
    fullCopy: capacity(s0),
    initialSlots: memorySlots(s0, [0]),
  };
}

/** Memory (all versions kept) after 0..k path-copy updates, measured by doing them, beside k + 1 full copies. */
export function memorySeries(n: number, b: number, k: number, rnd: () => number): { persistent: number[]; fullCopies: number[] } {
  let s = createStore(Array.from({ length: n }, (_, i) => i), b);
  const persistent = [memorySlots(s, [0])];
  const fullCopies = [capacity(s)];
  for (let i = 1; i <= k; i++) {
    s = setValue(s, s.versions.length - 1, Math.floor(rnd() * capacity(s)), i + 100);
    persistent.push(memorySlots(s, s.versions.map((v) => v.id)));
    fullCopies.push((i + 1) * capacity(s));
  }
  return { persistent, fullCopies };
}

export const childrenOf = (s: Store, versionId: number): number[] => s.versions.filter((v) => v.parent === versionId).map((v) => v.id);
