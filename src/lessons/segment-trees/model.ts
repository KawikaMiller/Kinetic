/**
 * A segment tree over n cells (n need not be a power of two), computed live. Node ids are heap
 * numbers (root 1, children 2i and 2i + 1); a node holds the aggregate of its cell range and, for
 * range updates, a lazy tag: an add that its own aggregate already includes but its children do not.
 * One mutable worker does every operation, so the stepper, the final tree and the tests share code.
 */

export type Op = 'sum' | 'min' | 'max' | 'gcd';

const gcd2 = (a: number, b: number): number => {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) [x, y] = [y, x % y];
  return x;
};

export interface OpDef {
  label: string;
  /** The value that changes nothing when combined: 0 for sum and gcd, +Infinity for min, -Infinity for max. */
  identity: number;
  combine: (a: number, b: number) => number;
  /** The aggregate of `len` cells after adding `v` to each of them; null when the operation cannot do that. */
  shift: ((agg: number, v: number, len: number) => number) | null;
}

export const OPS: Record<Op, OpDef> = {
  sum: { label: 'sum', identity: 0, combine: (a, b) => a + b, shift: (agg, v, len) => agg + v * len },
  min: { label: 'min', identity: Infinity, combine: Math.min, shift: (agg, v) => agg + v },
  max: { label: 'max', identity: -Infinity, combine: Math.max, shift: (agg, v) => agg + v },
  gcd: { label: 'gcd', identity: 0, combine: gcd2, shift: null },
};

export interface SegNode {
  id: number;
  l: number;
  r: number;
  agg: number;
  /** Pending add for the children (0 = none). */
  tag: number;
}

/** An immutable view of a tree. */
export interface SegTree {
  n: number;
  op: Op;
  nodes: Readonly<Record<number, SegNode>>;
}

export const ROOT = 1;
export const leftOf = (id: number) => 2 * id;
export const rightOf = (id: number) => 2 * id + 1;
export const isLeaf = (n: SegNode) => n.l === n.r;
export const lengthOf = (n: SegNode) => n.r - n.l + 1;

export type Verdict = 'outside' | 'cover' | 'partial';

export type SegEvent =
  | { kind: 'visit'; node: number; verdict: Verdict; tree: SegTree }
  /** A pending tag moved from a node down onto its two children. */
  | { kind: 'push'; node: number; tag: number; tree: SegTree }
  /** A fully covered node took the add as a tag (a leaf just takes the add). */
  | { kind: 'tag'; node: number; v: number; tree: SegTree }
  /** The eager update reached a leaf in the range. */
  | { kind: 'leaf'; node: number; v: number; tree: SegTree }
  | { kind: 'set'; node: number; value: number; tree: SegTree }
  | { kind: 'recompute'; node: number; tree: SegTree };

export interface SegOptions {
  record?: boolean;
  /** The broken variant for the tests: do not push pending tags down before looking inside a node. */
  noPush?: boolean;
}

export interface SegResult {
  tree: SegTree;
  events: SegEvent[];
  /** The answer of a query. */
  value: number | null;
  /** Nodes whose whole range the operation used, and nodes it entered without covering. */
  covering: number[];
  partial: number[];
  /** Nodes the operation entered and did not skip: covering plus partial. */
  touched: number;
}

class Work {
  nodes: Record<number, SegNode> = {};
  readonly events: SegEvent[] = [];
  covering: number[] = [];
  partial: number[] = [];
  private readonly def: OpDef;
  private readonly opts: SegOptions;

  constructor(tree: SegTree, opts: SegOptions) {
    this.opts = opts;
    this.def = OPS[tree.op];
    this.n = tree.n;
    this.op = tree.op;
    for (const [k, v] of Object.entries(tree.nodes)) this.nodes[Number(k)] = { ...v };
  }

  readonly n: number;
  readonly op: Op;

  snapshot(): SegTree {
    const nodes: Record<number, SegNode> = {};
    for (const [k, v] of Object.entries(this.nodes)) nodes[Number(k)] = { ...v };
    return { n: this.n, op: this.op, nodes };
  }

  private note(make: (tree: SegTree) => SegEvent) {
    if (this.opts.record) this.events.push(make(this.snapshot()));
  }

  private recompute(id: number) {
    const node = this.nodes[id];
    node.agg = this.def.combine(this.nodes[leftOf(id)].agg, this.nodes[rightOf(id)].agg);
    this.note((tree) => ({ kind: 'recompute', node: id, tree }));
  }

  private apply(id: number, v: number) {
    const node = this.nodes[id];
    node.agg = (this.def.shift as NonNullable<OpDef['shift']>)(node.agg, v, lengthOf(node));
    if (!isLeaf(node)) node.tag += v;
  }

  private push(id: number) {
    const node = this.nodes[id];
    if (this.opts.noPush || node.tag === 0 || isLeaf(node)) return;
    const tag = node.tag;
    this.apply(leftOf(id), tag);
    this.apply(rightOf(id), tag);
    node.tag = 0;
    this.note((tree) => ({ kind: 'push', node: id, tag, tree }));
  }

  query(l: number, r: number): number {
    const go = (id: number): number => {
      const node = this.nodes[id];
      if (r < node.l || node.r < l) {
        this.note((tree) => ({ kind: 'visit', node: id, verdict: 'outside', tree }));
        return this.def.identity;
      }
      if (l <= node.l && node.r <= r) {
        this.covering.push(id);
        this.note((tree) => ({ kind: 'visit', node: id, verdict: 'cover', tree }));
        return node.agg;
      }
      this.partial.push(id);
      this.note((tree) => ({ kind: 'visit', node: id, verdict: 'partial', tree }));
      this.push(id);
      return this.def.combine(go(leftOf(id)), go(rightOf(id)));
    };
    return go(ROOT);
  }

  set(i: number, value: number) {
    const go = (id: number) => {
      const node = this.nodes[id];
      if (isLeaf(node)) {
        node.agg = value;
        this.partial.push(id);
        this.note((tree) => ({ kind: 'set', node: id, value, tree }));
        return;
      }
      this.partial.push(id);
      this.note((tree) => ({ kind: 'visit', node: id, verdict: 'partial', tree }));
      this.push(id);
      go(i <= this.nodes[leftOf(id)].r ? leftOf(id) : rightOf(id));
      this.recompute(id);
    };
    go(ROOT);
  }

  /** Add v to every cell of [l, r]: with `lazy`, covered nodes take a tag; without, every leaf in range is visited. */
  add(l: number, r: number, v: number, lazy: boolean) {
    const go = (id: number) => {
      const node = this.nodes[id];
      if (r < node.l || node.r < l) {
        this.note((tree) => ({ kind: 'visit', node: id, verdict: 'outside', tree }));
        return;
      }
      const covered = l <= node.l && node.r <= r;
      if (isLeaf(node)) {
        this.covering.push(id);
        this.apply(id, v);
        this.note((tree) => ({ kind: 'leaf', node: id, v, tree }));
        return;
      }
      if (covered && lazy) {
        this.covering.push(id);
        this.apply(id, v);
        this.note((tree) => ({ kind: 'tag', node: id, v, tree }));
        return;
      }
      (covered ? this.covering : this.partial).push(id);
      this.note((tree) => ({ kind: 'visit', node: id, verdict: covered ? 'cover' : 'partial', tree }));
      this.push(id);
      go(leftOf(id));
      go(rightOf(id));
      this.recompute(id);
    };
    go(ROOT);
  }

  result(value: number | null): SegResult {
    return {
      tree: this.snapshot(),
      events: this.events,
      value,
      covering: this.covering,
      partial: this.partial,
      touched: this.covering.length + this.partial.length,
    };
  }
}

/** Build a tree over `values` for one operation. */
export function buildTree(values: readonly number[], op: Op): SegTree {
  const def = OPS[op];
  const nodes: Record<number, SegNode> = {};
  const go = (id: number, l: number, r: number): number => {
    if (l === r) {
      nodes[id] = { id, l, r, agg: values[l], tag: 0 };
      return values[l];
    }
    const mid = (l + r) >> 1;
    const agg = def.combine(go(leftOf(id), l, mid), go(rightOf(id), mid + 1, r));
    nodes[id] = { id, l, r, agg, tag: 0 };
    return agg;
  };
  go(ROOT, 0, values.length - 1);
  return { n: values.length, op, nodes };
}

export function queryRange(tree: SegTree, l: number, r: number, opts: SegOptions = {}): SegResult {
  const w = new Work(tree, opts);
  return w.result(w.query(l, r));
}

export function setCell(tree: SegTree, i: number, value: number, opts: SegOptions = {}): SegResult {
  const w = new Work(tree, opts);
  w.set(i, value);
  return w.result(null);
}

export function addRange(tree: SegTree, l: number, r: number, v: number, lazy: boolean, opts: SegOptions = {}): SegResult {
  if (OPS[tree.op].shift === null) throw new Error(`${tree.op} has no range add`);
  const w = new Work(tree, opts);
  w.add(l, r, v, lazy);
  return w.result(null);
}

/** Depth of the root-to-leaf path to cell i, in nodes. */
export function pathTo(tree: SegTree, i: number): number[] {
  const out = [ROOT];
  for (let id = ROOT; !isLeaf(tree.nodes[id]); ) {
    id = i <= tree.nodes[leftOf(id)].r ? leftOf(id) : rightOf(id);
    out.push(id);
  }
  return out;
}

/** The cell values a tree currently holds, read by pushing tags along the way down (without changing the tree). */
export function cellValues(tree: SegTree): number[] {
  const out: number[] = Array<number>(tree.n).fill(0);
  const go = (id: number, pending: number) => {
    const node = tree.nodes[id];
    if (isLeaf(node)) {
      out[node.l] = node.agg + pending;
      return;
    }
    go(leftOf(id), pending + node.tag);
    go(rightOf(id), pending + node.tag);
  };
  go(ROOT, 0);
  return out;
}

/** Node count of a tree: 2n - 1. */
export const nodeCount = (tree: SegTree): number => Object.keys(tree.nodes).length;
