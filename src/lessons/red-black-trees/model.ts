/**
 * Red-black tree, computed live (CLRS insert and delete with their fix-up cases). One mutable worker
 * with parent pointers does every operation, so the stepper's frames, the final tree and the tests
 * come from the same code. Nil leaves are not stored: an absent child counts as black.
 *
 * Counting: one rotation = one left or right rotation; one recolour = one colour flip of a node that
 * already existed. A new node is born red, which is not a flip. Both are counted, each in its own column.
 */

export type Color = 'R' | 'B';

export interface RbNode {
  key: number;
  color: Color;
  left: number | null;
  right: number | null;
}

/** An immutable view of a tree: node ids are the keys. */
export interface RbTree {
  root: number | null;
  nodes: Readonly<Record<number, RbNode>>;
}

export const EMPTY_RB: RbTree = { root: null, nodes: {} };

/** Which fix-up case a step is, named the way the lesson names them. */
export type FixCase =
  | 'uncle-red'
  | 'triangle'
  | 'line'
  | 'sibling-red'
  | 'sibling-black-black'
  | 'near-nephew-red'
  | 'far-nephew-red';

export interface Rotation {
  kind: 'left' | 'right';
  down: number;
  up: number;
}

export type RbStep =
  | { kind: 'visit'; key: number; path: readonly number[]; tree: RbTree }
  | { kind: 'place'; key: number; path: readonly number[]; tree: RbTree }
  /** Rule 3 broken at `child` and its red parent; the case is named by the uncle's colour. */
  | { kind: 'violation'; child: number; parent: number; grand: number; uncle: number | null; uncleColor: Color; case: FixCase; tree: RbTree }
  | { kind: 'recolor'; nodes: readonly number[]; tree: RbTree; reason: FixCase | 'root' }
  | { kind: 'rotate'; rotation: Rotation; tree: RbTree }
  | { kind: 'remove'; key: number; removed: Color; successor: number | null; x: number | null; xParent: number | null; xSide: 'left' | 'right' | null; tree: RbTree }
  /** The fix-up looks at the extra-black position `x` (a nil child of `xParent` when x is null). */
  | { kind: 'fix'; x: number | null; xParent: number; xSide: 'left' | 'right'; sibling: number; case: FixCase; tree: RbTree }
  | { kind: 'done'; tree: RbTree };

export interface RbResult {
  tree: RbTree;
  steps: RbStep[];
  rotations: Rotation[];
  recolors: number;
}

export interface RbOptions {
  record?: boolean;
  /** Broken variants for the tests: treat an uncle-red case as uncle-black, or leave the root red. */
  broken?: 'skip-uncle-recolor' | 'keep-root-red';
}

export const colorOf = (t: RbTree, k: number | null): Color => (k === null ? 'B' : t.nodes[k].color);
export const sizeOf = (t: RbTree): number => Object.keys(t.nodes).length;
export const hasKey = (t: RbTree, k: number): boolean => k in t.nodes;

/** Height in levels (a lone node is 1). */
export function heightOf(t: RbTree): number {
  const go = (k: number | null): number => (k === null ? 0 : 1 + Math.max(go(t.nodes[k].left), go(t.nodes[k].right)));
  return go(t.root);
}

/** Nodes on the shortest path from the root to a missing child: the least depth at which the tree has room. */
export function shortestPath(t: RbTree): number {
  const go = (k: number | null): number => (k === null ? 0 : 1 + Math.min(go(t.nodes[k].left), go(t.nodes[k].right)));
  return go(t.root);
}

export function inOrder(t: RbTree): number[] {
  const out: number[] = [];
  const walk = (k: number | null) => {
    if (k === null) return;
    walk(t.nodes[k].left);
    out.push(k);
    walk(t.nodes[k].right);
  };
  walk(t.root);
  return out;
}

class Work {
  nodes: Record<number, RbNode> = {};
  parent: Record<number, number | null> = {};
  root: number | null;
  readonly steps: RbStep[] = [];
  readonly rotations: Rotation[] = [];
  recolors = 0;
  private readonly opts: RbOptions;

  constructor(tree: RbTree, opts: RbOptions) {
    this.opts = opts;
    for (const [k, n] of Object.entries(tree.nodes)) this.nodes[Number(k)] = { ...n };
    this.root = tree.root;
    if (tree.root !== null) this.parent[tree.root] = null;
    for (const n of Object.values(this.nodes)) {
      if (n.left !== null) this.parent[n.left] = n.key;
      if (n.right !== null) this.parent[n.right] = n.key;
    }
  }

  snapshot(): RbTree {
    const nodes: Record<number, RbNode> = {};
    for (const [k, n] of Object.entries(this.nodes)) nodes[Number(k)] = { ...n };
    return { root: this.root, nodes };
  }

  record(make: (tree: RbTree) => RbStep) {
    if (this.opts.record) this.steps.push(make(this.snapshot()));
  }

  color(k: number | null): Color {
    return k === null ? 'B' : this.nodes[k].color;
  }

  private paint(k: number, c: Color) {
    if (this.nodes[k].color !== c) {
      this.nodes[k].color = c;
      this.recolors++;
    }
  }

  private replaceChild(p: number | null, old: number | null, next: number | null) {
    if (p === null) this.root = next;
    else if (this.nodes[p].left === old) this.nodes[p].left = next;
    else this.nodes[p].right = next;
    if (next !== null) this.parent[next] = p;
  }

  private rotate(kind: 'left' | 'right', k: number) {
    const n = this.nodes[k];
    const up = (kind === 'left' ? n.right : n.left) as number;
    const p = this.parent[k];
    if (kind === 'left') {
      n.right = this.nodes[up].left;
      if (n.right !== null) this.parent[n.right] = k;
      this.nodes[up].left = k;
    } else {
      n.left = this.nodes[up].right;
      if (n.left !== null) this.parent[n.left] = k;
      this.nodes[up].right = k;
    }
    this.parent[k] = up;
    this.replaceChild(p, k, up);
    const rotation: Rotation = { kind, down: k, up };
    this.rotations.push(rotation);
    this.record((tree) => ({ kind: 'rotate', rotation, tree }));
  }

  insert(key: number) {
    if (key in this.nodes) throw new Error(`${key} is already in the tree`);
    const path: number[] = [];
    let p: number | null = null;
    for (let cur = this.root; cur !== null; ) {
      path.push(cur);
      const visited = [...path];
      this.record((tree) => ({ kind: 'visit', key, path: visited, tree }));
      p = cur;
      cur = key < cur ? this.nodes[cur].left : this.nodes[cur].right;
    }
    this.nodes[key] = { key, color: 'R', left: null, right: null };
    this.parent[key] = p;
    if (p === null) this.root = key;
    else if (key < p) this.nodes[p].left = key;
    else this.nodes[p].right = key;
    this.record((tree) => ({ kind: 'place', key, path: [...path], tree }));
    this.insertFixup(key);
  }

  private insertFixup(start: number) {
    let z = start;
    while (this.color(this.parent[z]) === 'R') {
      const p = this.parent[z] as number;
      const g = this.parent[p] as number;
      const parentIsLeft = this.nodes[g].left === p;
      const uncle = parentIsLeft ? this.nodes[g].right : this.nodes[g].left;
      const uncleRed = this.color(uncle) === 'R' && this.opts.broken !== 'skip-uncle-recolor';
      const triangle = parentIsLeft ? this.nodes[p].right === z : this.nodes[p].left === z;
      const kind: FixCase = uncleRed ? 'uncle-red' : triangle ? 'triangle' : 'line';
      this.record((tree) => ({ kind: 'violation', child: z, parent: p, grand: g, uncle, uncleColor: this.color(uncle), case: kind, tree }));
      if (uncleRed) {
        this.paint(p, 'B');
        this.paint(uncle as number, 'B');
        this.paint(g, 'R');
        this.record((tree) => ({ kind: 'recolor', nodes: [p, uncle as number, g], tree, reason: 'uncle-red' }));
        z = g;
        continue;
      }
      if (triangle) {
        z = p;
        this.rotate(parentIsLeft ? 'left' : 'right', z);
        const lineParent = this.parent[z] as number;
        const lineGrand = this.parent[lineParent] as number;
        this.record((tree) => ({ kind: 'violation', child: z, parent: lineParent, grand: lineGrand, uncle, uncleColor: this.color(uncle), case: 'line', tree }));
      }
      const np = this.parent[z] as number;
      const ng = this.parent[np] as number;
      this.paint(np, 'B');
      this.paint(ng, 'R');
      this.record((tree) => ({ kind: 'recolor', nodes: [np, ng], tree, reason: 'line' }));
      this.rotate(parentIsLeft ? 'right' : 'left', ng);
    }
    if (this.root !== null && this.color(this.root) === 'R' && this.opts.broken !== 'keep-root-red') {
      this.paint(this.root, 'B');
      const r = this.root;
      this.record((tree) => ({ kind: 'recolor', nodes: [r], tree, reason: 'root' }));
    }
  }

  private transplant(u: number, v: number | null) {
    this.replaceChild(this.parent[u], u, v);
  }

  remove(key: number) {
    if (!(key in this.nodes)) throw new Error(`${key} is not in the tree`);
    const path: number[] = [];
    for (let cur = this.root as number; cur !== key; cur = key < cur ? (this.nodes[cur].left as number) : (this.nodes[cur].right as number)) {
      path.push(cur);
      const visited = [...path];
      this.record((tree) => ({ kind: 'visit', key, path: visited, tree }));
    }
    const z = this.nodes[key];
    let removedColor: Color = z.color;
    let x: number | null;
    let xParent: number | null;
    let successor: number | null = null;
    if (z.left === null) {
      x = z.right;
      xParent = this.parent[key];
      this.transplant(key, z.right);
    } else if (z.right === null) {
      x = z.left;
      xParent = this.parent[key];
      this.transplant(key, z.left);
    } else {
      let y = z.right;
      while (this.nodes[y].left !== null) y = this.nodes[y].left as number;
      successor = y;
      removedColor = this.nodes[y].color;
      x = this.nodes[y].right;
      if (this.parent[y] === key) {
        xParent = y;
      } else {
        xParent = this.parent[y];
        this.transplant(y, x);
        this.nodes[y].right = z.right;
        this.parent[z.right] = y;
      }
      this.transplant(key, y);
      this.nodes[y].left = z.left;
      this.parent[z.left as number] = y;
      this.paint(y, z.color);
    }
    delete this.nodes[key];
    delete this.parent[key];
    const side: 'left' | 'right' | null = xParent === null ? null : this.nodes[xParent].left === x ? 'left' : 'right';
    const xp = xParent;
    this.record((tree) => ({ kind: 'remove', key, removed: removedColor, successor, x, xParent: xp, xSide: side, tree }));
    if (removedColor === 'B') this.deleteFixup(x, xParent);
  }

  private deleteFixup(start: number | null, startParent: number | null) {
    let x = start;
    let xp = startParent;
    while (x !== this.root && this.color(x) === 'B' && xp !== null) {
      const left = this.nodes[xp].left === x;
      const dir = left ? 'left' : 'right';
      const far = left ? 'right' : 'left';
      let w = this.nodes[xp][far] as number;
      if (this.color(w) === 'R') {
        const xNow = x;
        const parentNow = xp;
        this.record((tree) => ({ kind: 'fix', x: xNow, xParent: parentNow, xSide: dir, sibling: w, case: 'sibling-red', tree }));
        this.paint(w, 'B');
        this.paint(xp, 'R');
        this.record((tree) => ({ kind: 'recolor', nodes: [w, parentNow], tree, reason: 'sibling-red' }));
        this.rotate(left ? 'left' : 'right', xp);
        w = this.nodes[xp][far] as number;
      }
      const wn = this.nodes[w];
      const nearRed = this.color(left ? wn.left : wn.right) === 'R';
      const farRed = this.color(left ? wn.right : wn.left) === 'R';
      const xNow = x;
      const parentNow = xp;
      if (!nearRed && !farRed) {
        this.record((tree) => ({ kind: 'fix', x: xNow, xParent: parentNow, xSide: dir, sibling: w, case: 'sibling-black-black', tree }));
        this.paint(w, 'R');
        this.record((tree) => ({ kind: 'recolor', nodes: [w], tree, reason: 'sibling-black-black' }));
        x = xp;
        xp = this.parent[x];
        continue;
      }
      if (!farRed) {
        this.record((tree) => ({ kind: 'fix', x: xNow, xParent: parentNow, xSide: dir, sibling: w, case: 'near-nephew-red', tree }));
        const near = (left ? wn.left : wn.right) as number;
        this.paint(near, 'B');
        this.paint(w, 'R');
        this.record((tree) => ({ kind: 'recolor', nodes: [near, w], tree, reason: 'near-nephew-red' }));
        this.rotate(left ? 'right' : 'left', w);
        w = this.nodes[xp][far] as number;
      } else {
        this.record((tree) => ({ kind: 'fix', x: xNow, xParent: parentNow, xSide: dir, sibling: w, case: 'far-nephew-red', tree }));
      }
      const wNow = this.nodes[w];
      this.paint(w, this.nodes[xp].color);
      this.paint(xp, 'B');
      const farChild = (left ? wNow.right : wNow.left) as number;
      this.paint(farChild, 'B');
      const pNow = xp;
      this.record((tree) => ({ kind: 'recolor', nodes: [w, pNow, farChild], tree, reason: 'far-nephew-red' }));
      this.rotate(left ? 'left' : 'right', xp);
      x = this.root;
      xp = null;
    }
    if (x !== null && this.color(x) === 'R') {
      this.paint(x, 'B');
      const xs = x;
      this.record((tree) => ({ kind: 'recolor', nodes: [xs], tree, reason: 'root' }));
    }
  }

  result(): RbResult {
    this.record((tree) => ({ kind: 'done', tree }));
    return { tree: this.snapshot(), steps: this.steps, rotations: this.rotations, recolors: this.recolors };
  }
}

export function insertKey(tree: RbTree, key: number, opts: RbOptions = {}): RbResult {
  const w = new Work(tree, opts);
  w.insert(key);
  return w.result();
}

export function removeKey(tree: RbTree, key: number, opts: RbOptions = {}): RbResult {
  const w = new Work(tree, opts);
  w.remove(key);
  return w.result();
}

export function buildRb(keys: readonly number[], opts: RbOptions = {}): { tree: RbTree; rotations: number; recolors: number } {
  let tree = EMPTY_RB;
  let rotations = 0;
  let recolors = 0;
  for (const k of keys) {
    const r = insertKey(tree, k, { ...opts, record: false });
    tree = r.tree;
    rotations += r.rotations.length;
    recolors += r.recolors;
  }
  return { tree, rotations, recolors };
}

/** Flip one node's colour: the deliberate rule-breaking tool of scene 1. */
export function recolor(t: RbTree, key: number): RbTree {
  const n = t.nodes[key];
  return { root: t.root, nodes: { ...t.nodes, [key]: { ...n, color: n.color === 'R' ? 'B' : 'R' } } };
}

export type RuleId = 1 | 2 | 3 | 4;

export interface RuleReport {
  rule: RuleId;
  ok: boolean;
  /** The first offender, named, when it fails. */
  detail: string | null;
  /** The nodes the detail names, to ring them. */
  nodes: number[];
}

/** The deepest node whose two sides, each consistent inside, count different numbers of black nodes. */
interface Mismatch {
  key: number;
  left: number;
  right: number;
}

/**
 * Black-height of every node: the black nodes on a path down to a nil leaf, counting the nil leaf and the
 * node itself when black; null where the paths below it disagree. Also the deepest disagreement, for naming.
 */
function blackWalk(t: RbTree): { bh: Map<number | null, number | null>; culprit: Mismatch | null } {
  const bh = new Map<number | null, number | null>();
  let culprit: Mismatch | null = null;
  const go = (k: number | null): number | null => {
    if (k === null) return 1;
    const l = go(t.nodes[k].left);
    const r = go(t.nodes[k].right);
    let h: number | null = null;
    if (l !== null && r !== null) {
      if (l === r) h = l + (t.nodes[k].color === 'B' ? 1 : 0);
      else culprit ??= { key: k, left: l, right: r };
    }
    bh.set(k, h);
    return h;
  };
  go(t.root);
  return { bh, culprit };
}

export const blackHeights = (t: RbTree): Map<number | null, number | null> => blackWalk(t).bh;

/**
 * The four rules recomputed from the shape and the colours alone. Rule 4 names the deepest node whose
 * two sides count different numbers of black nodes (nil leaves count as black).
 */
export function checkRules(t: RbTree): RuleReport[] {
  const colorsOk = Object.values(t.nodes).every((n) => n.color === 'R' || n.color === 'B');
  const r1: RuleReport = { rule: 1, ok: colorsOk, detail: colorsOk ? null : 'a node is neither red nor black', nodes: [] };
  const rootBlack = t.root === null || t.nodes[t.root].color === 'B';
  const r2: RuleReport = { rule: 2, ok: rootBlack, detail: rootBlack ? null : `the root ${t.root} is red`, nodes: rootBlack || t.root === null ? [] : [t.root] };
  let r3: RuleReport = { rule: 3, ok: true, detail: null, nodes: [] };
  for (const k of inOrder(t)) {
    const n = t.nodes[k];
    if (n.color !== 'R') continue;
    const redKid = [n.left, n.right].find((c) => c !== null && t.nodes[c].color === 'R');
    if (redKid !== undefined && redKid !== null) {
      r3 = { rule: 3, ok: false, detail: `${k} is red and its child ${redKid} is red`, nodes: [k, redKid] };
      break;
    }
  }
  const { culprit } = blackWalk(t);
  const r4: RuleReport = culprit
    ? { rule: 4, ok: false, detail: `below ${culprit.key} the paths differ: ${culprit.left} black on the left side, ${culprit.right} on the right`, nodes: [culprit.key] }
    : { rule: 4, ok: true, detail: null, nodes: [] };
  return [r1, r2, r3, r4];
}

/** Every rule problem as one list, with the BST order and key-set checks, empty when the tree is valid. */
export function checkRb(t: RbTree): string[] {
  const problems = checkRules(t).flatMap((r) => (r.ok ? [] : [`rule ${r.rule}: ${r.detail}`]));
  const keys = inOrder(t);
  if (keys.some((k, i) => i > 0 && k <= keys[i - 1])) problems.push('the keys are not in BST order');
  if (keys.length !== sizeOf(t)) problems.push('a stored node is not reachable from the root');
  return problems;
}

/** A node of the 2-3-4 view: a black node and its red children, and how deep it sits among the groups. */
export interface Group {
  /** Keys in order, 1 to 3. */
  keys: number[];
  /** The black node at the top of the group. */
  top: number;
  /** Groups above it: black nodes on the way down from the root, not counting this group's own. */
  depth: number;
  /** Child groups' tops. */
  children: number[];
}

/** Regroup: each black node together with its red children is one 2-, 3- or 4-node. */
export function groupsOf(t: RbTree): Group[] {
  const out: Group[] = [];
  const walk = (k: number | null, depth: number) => {
    if (k === null) return;
    const n = t.nodes[k];
    const reds = [n.left, n.right].filter((c): c is number => c !== null && t.nodes[c].color === 'R');
    const keys = [k, ...reds].sort((a, b) => a - b);
    const below: number[] = [];
    const sides: (number | null)[] = [];
    for (const side of [n.left, n.right]) {
      if (side !== null && t.nodes[side].color === 'R') sides.push(t.nodes[side].left, t.nodes[side].right);
      else sides.push(side);
    }
    for (const s of sides) if (s !== null) below.push(s);
    out.push({ keys, top: k, depth, children: below });
    for (const c of below) walk(c, depth + 1);
  };
  walk(t.root, 0);
  return out;
}
