/** Text is a list of Unicode code points (not graphemes): one array slot per code point, so an emoji is one slot. */
export const codePoints = (s: string): string[] => [...s];

export const hasLoneSurrogate = (s: string): boolean => /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(s);

// ── plain array ───────────────────────────────────────────────────────────

export interface ArrayText {
  chars: string[];
  /** Characters shifted to make or close a gap. */
  moves: number;
  /** Characters written. */
  writes: number;
}

export const arrayCreate = (items: readonly string[]): ArrayText => ({ chars: [...items], moves: 0, writes: 0 });

/** Insert at a position: every character after it shifts by the length of the insert (n - at moves), then the new ones are written. */
export function arrayInsert(a: ArrayText, at: number, items: readonly string[]): void {
  a.moves += a.chars.length - at;
  a.writes += items.length;
  a.chars.splice(at, 0, ...items);
}

/** Delete [from, to): the characters after it shift left (n - to moves). */
export function arrayDelete(a: ArrayText, from: number, to: number): void {
  a.moves += a.chars.length - to;
  a.chars.splice(from, to - from);
}

// ── gap buffer ────────────────────────────────────────────────────────────

export interface GapBuffer {
  buf: (string | null)[];
  /** The gap is buf[start, end). The cursor sits at `start`. */
  start: number;
  end: number;
  /** Characters moved across the gap as it travelled. */
  moves: number;
  writes: number;
  /** Characters copied when the buffer doubled. */
  copies: number;
  grows: number;
}

export const GAP_START_CAPACITY = 16;

export function gapCreate(items: readonly string[], capacity = GAP_START_CAPACITY): GapBuffer {
  const cap = Math.max(capacity, items.length + 1);
  const buf: (string | null)[] = new Array<string | null>(cap).fill(null);
  items.forEach((c, i) => {
    buf[i] = c;
  });
  return { buf, start: items.length, end: cap, moves: 0, writes: 0, copies: 0, grows: 0 };
}

export const gapLength = (g: GapBuffer) => g.buf.length - (g.end - g.start);
export const gapText = (g: GapBuffer): string[] => [...g.buf.slice(0, g.start), ...g.buf.slice(g.end)] as string[];

/** Move the gap so the cursor is at `pos`: exactly |pos - cursor| characters cross it. */
export function gapMoveTo(g: GapBuffer, pos: number): void {
  while (g.start > pos) {
    g.buf[--g.end] = g.buf[--g.start];
    g.buf[g.start] = null;
    g.moves++;
  }
  while (g.start < pos) {
    g.buf[g.start++] = g.buf[g.end];
    g.buf[g.end++] = null;
    g.moves++;
  }
}

/** Double the buffer until the gap holds `need` characters and one spare slot (a gap of size zero cannot move), copying the text over (counted). */
function gapEnsure(g: GapBuffer, need: number): void {
  while (g.end - g.start < need + 1) {
    const cap = g.buf.length * 2;
    const next: (string | null)[] = new Array<string | null>(cap).fill(null);
    for (let i = 0; i < g.start; i++) next[i] = g.buf[i];
    const tail = g.buf.length - g.end;
    for (let i = 0; i < tail; i++) next[cap - tail + i] = g.buf[g.end + i];
    g.copies += gapLength(g);
    g.grows++;
    g.end = cap - tail;
    g.buf = next;
  }
}

/** A broken gap buffer that forgets to move the gap before an insert at a new cursor. */
export type GapBug = 'no-move' | null;

export function gapInsert(g: GapBuffer, at: number, items: readonly string[], bug: GapBug = null): void {
  if (bug !== 'no-move') gapMoveTo(g, at);
  gapEnsure(g, items.length);
  for (const c of items) {
    g.buf[g.start++] = c;
    g.writes++;
  }
}

/** Delete [from, to): move the gap to `from`, then widen it over the deleted characters. */
export function gapDelete(g: GapBuffer, from: number, to: number): void {
  gapMoveTo(g, from);
  for (let i = 0; i < to - from; i++) g.buf[g.end++] = null;
}

export function gapInvariantViolations(g: GapBuffer, expected: readonly string[], cursor: number): string[] {
  const bad: string[] = [];
  if (gapText(g).join('') !== expected.join('')) bad.push('before + after is not the content');
  if (g.start !== cursor) bad.push('the cursor is not at the gap');
  if (g.buf.length < gapLength(g)) bad.push('capacity is below the content length');
  if (g.buf.slice(g.start, g.end).some((c) => c !== null)) bad.push('the gap holds characters');
  return bad;
}

/** Backspace: the gap just widens backwards over the character before the cursor, so no character moves. */
export function gapBackspace(g: GapBuffer): void {
  if (g.start === 0) return;
  g.start--;
  g.buf[g.start] = null;
}

// ── rope ──────────────────────────────────────────────────────────────────

export const LEAF_MAX = 8;

export interface RopeNode {
  id: number;
  /** A leaf's characters, or null for an internal node. */
  leaf: string[] | null;
  left: number | null;
  right: number | null;
  /** Length of the left subtree (a leaf's weight is its own length). */
  weight: number;
  /** Length of the whole subtree. */
  len: number;
  depth: number;
}

/** Nodes are never changed once made, so a split or concatenation shares everything it does not rebuild. */
export interface Rope {
  nodes: RopeNode[];
  root: number | null;
  /** Nodes read while walking. */
  reads: number;
  /** Nodes created. */
  created: number;
  /** Characters copied into new leaves. */
  copied: number;
  /** Times the whole tree was rebuilt from its leaves by the depth rule. */
  rebuilds: number;
}

export type RopeBug = 'stale-weight' | null;

export const ropeCreate = (): Rope => ({ nodes: [], root: null, reads: 0, created: 0, copied: 0, rebuilds: 0 });
const lenOf = (r: Rope, id: number | null) => (id === null ? 0 : r.nodes[id].len);

function newLeaf(r: Rope, chars: string[]): number {
  const id = r.nodes.length;
  r.nodes.push({ id, leaf: chars, left: null, right: null, weight: chars.length, len: chars.length, depth: 1 });
  r.created++;
  r.copied += chars.length;
  return id;
}

/** Join two ropes under a new root: O(1). Either side may be empty (null). */
export function ropeConcat(r: Rope, a: number | null, b: number | null, weightOverride?: number): number | null {
  if (a === null) return b;
  if (b === null) return a;
  const id = r.nodes.length;
  r.nodes.push({ id, leaf: null, left: a, right: b, weight: weightOverride ?? lenOf(r, a), len: lenOf(r, a) + lenOf(r, b), depth: 1 + Math.max(r.nodes[a].depth, r.nodes[b].depth) });
  r.created++;
  return id;
}

/** A balanced rope over pieces of at most LEAF_MAX characters: pair neighbours level by level. */
export function ropeBuild(r: Rope, items: readonly string[]): number | null {
  const ids: number[] = [];
  for (let i = 0; i < items.length; i += LEAF_MAX) ids.push(newLeaf(r, items.slice(i, i + LEAF_MAX)));
  return pairUp(r, ids);
}

function pairUp(r: Rope, ids: number[]): number | null {
  let level: (number | null)[] = ids;
  while (level.length > 1) {
    const next: (number | null)[] = [];
    for (let i = 0; i < level.length; i += 2) next.push(i + 1 < level.length ? ropeConcat(r, level[i], level[i + 1]) : level[i]);
    level = next;
  }
  return level.length ? level[0] : null;
}

/** The character at an index: walk down, going left when i < weight and otherwise subtracting the weight and going right. */
export function ropeIndex(r: Rope, i: number): { char: string; path: number[] } {
  let id = r.root!;
  let k = i;
  const path: number[] = [];
  for (;;) {
    const n = r.nodes[id];
    r.reads++;
    path.push(id);
    if (n.leaf) return { char: n.leaf[k], path };
    if (k < n.weight) id = n.left!;
    else {
      k -= n.weight;
      id = n.right!;
    }
  }
}

/** Cut at index i: returns the two halves, building new nodes only along the cut. */
export function ropeSplit(r: Rope, id: number | null, i: number, bug: RopeBug = null): [number | null, number | null] {
  if (id === null) return [null, null];
  const n = r.nodes[id];
  if (i <= 0) return [null, id];
  if (i >= n.len) return [id, null];
  r.reads++;
  if (n.leaf) return [newLeaf(r, n.leaf.slice(0, i)), newLeaf(r, n.leaf.slice(i))];
  if (i < n.weight) {
    const [a, b] = ropeSplit(r, n.left, i, bug);
    return [a, ropeConcat(r, b, n.right, bug === 'stale-weight' && b !== null ? n.weight : undefined)];
  }
  const [a, b] = ropeSplit(r, n.right, i - n.weight, bug);
  return [ropeConcat(r, n.left, a), b];
}

export function ropeInsert(r: Rope, at: number, items: readonly string[], bug: RopeBug = null): void {
  const [a, b] = ropeSplit(r, r.root, at, bug);
  r.root = ropeConcat(r, ropeConcat(r, a, ropeBuild(r, items)), b);
}

export function ropeDelete(r: Rope, from: number, to: number, bug: RopeBug = null): void {
  const [a, rest] = ropeSplit(r, r.root, from, bug);
  const [, b] = ropeSplit(r, rest, to - from, bug);
  r.root = ropeConcat(r, a, b);
}

export const ropeDepth = (r: Rope): number => (r.root === null ? 0 : r.nodes[r.root].depth);

export function ropeLeaves(r: Rope, id: number | null = r.root): number[] {
  if (id === null) return [];
  const n = r.nodes[id];
  return n.leaf ? [id] : [...ropeLeaves(r, n.left), ...ropeLeaves(r, n.right)];
}

/** The simplified rule: rebuild from the leaves once the depth passes twice the depth of a perfectly balanced tree over them. */
export const depthBound = (leaves: number): number => 2 * Math.max(1, Math.ceil(Math.log2(Math.max(1, leaves))));

export function needsRebalance(r: Rope): boolean {
  if (r.root === null) return false;
  // the leaves number at least len / LEAF_MAX, and the bound only grows with them: a shallow tree needs no leaf count
  if (ropeDepth(r) <= depthBound(Math.ceil(r.nodes[r.root].len / LEAF_MAX))) return false;
  return ropeDepth(r) > depthBound(ropeLeaves(r).length);
}

/** Rebuild from the existing leaves (shared, not copied): only the internal nodes are new. */
export function ropeRebalance(r: Rope): void {
  r.root = pairUp(r, ropeLeaves(r));
  r.rebuilds++;
}

/** Every node reachable from the root: the live tree, as opposed to the nodes older versions still own. */
export function ropeReachable(r: Rope): Set<number> {
  const out = new Set<number>();
  const walk = (id: number | null) => {
    if (id === null || out.has(id)) return;
    out.add(id);
    walk(r.nodes[id].left);
    walk(r.nodes[id].right);
  };
  walk(r.root);
  return out;
}

export const ropeText = (r: Rope, id: number | null = r.root): string[] => {
  if (id === null) return [];
  const n = r.nodes[id];
  return n.leaf ? n.leaf : [...ropeText(r, n.left), ...ropeText(r, n.right)];
};

/** Touches, in the one unit of the comparison: a character copied, or a node read or created. */
export const ropeTouches = (r: Rope): number => r.reads + r.created + r.copied;
export const arrayTouches = (a: ArrayText): number => a.moves + a.writes;
export const gapTouches = (g: GapBuffer): number => g.moves + g.writes + g.copies;

export function ropeInvariantViolations(r: Rope, expected: readonly string[]): string[] {
  const bad: string[] = [];
  const walk = (id: number | null) => {
    if (id === null) return;
    const n = r.nodes[id];
    if (n.leaf) {
      if (n.leaf.length > LEAF_MAX) bad.push(`leaf ${id} is over ${LEAF_MAX} characters`);
      if (n.weight !== n.leaf.length || n.len !== n.leaf.length) bad.push(`leaf ${id} has the wrong weight`);
      return;
    }
    if (n.weight !== lenOf(r, n.left)) bad.push(`node ${id} weight ${n.weight} is not its left length ${lenOf(r, n.left)}`);
    if (n.len !== lenOf(r, n.left) + lenOf(r, n.right)) bad.push(`node ${id} has the wrong length`);
    walk(n.left);
    walk(n.right);
  };
  walk(r.root);
  if (ropeText(r).join('') !== expected.join('')) bad.push('the leaves do not concatenate to the content');
  return bad;
}
