/**
 * Huffman coding: frequency count, the merge-two-smallest build, code tables,
 * encode and decode. Pure; the frames and the Stage only read from here.
 */

export const MAX_CHARS = 40;
export const DEFAULT_TEXT = 'mississippi river';
export const ASCII_BITS = 8;
/** Printable ASCII, space to tilde: what the 8-bit ASCII comparison can honestly encode. */
const PRINTABLE = /^[\x20-\x7e]$/;

/**
 * Which tree goes first when two weights tie:
 * - `old`: the one created earlier (leaves before merged trees),
 * - `new`: the one created later (merged trees before leaves).
 * Both are valid Huffman choices; they can build different trees with the same total.
 */
export type TieBreak = 'old' | 'new';

export type ParseResult = { ok: true; text: string } | { ok: false; error: string };

/** The learner's message, or the sentence to show instead (the previous message is kept). */
export function parseMessage(raw: string): ParseResult {
  const chars = Array.from(raw);
  if (chars.length === 0) return { ok: false, error: 'Type at least one character to encode.' };
  if (chars.length > MAX_CHARS) return { ok: false, error: `Keep it to ${MAX_CHARS} characters (that's ${chars.length}).` };
  const bad = chars.find((c) => !PRINTABLE.test(c));
  if (bad !== undefined) {
    return { ok: false, error: `This demo encodes plain ASCII (letters, digits, punctuation, space), so the 8-bit comparison is fair; "${bad}" isn't one.` };
  }
  return { ok: true, text: raw };
}

export interface HNode {
  id: number;
  weight: number;
  /** Set on leaves only. */
  sym?: string;
  left?: number;
  right?: number;
}

export interface Merge {
  /** The two roots taken off the queue: `a` becomes the 0 child, `b` the 1 child. */
  a: number;
  b: number;
  parent: number;
  /** The forest's roots before this merge, in queue order (lightest first). */
  queueBefore: number[];
  /** The roots after it, in queue order. */
  queueAfter: number[];
}

export interface Huffman {
  text: string;
  nodes: HNode[];
  /** Leaf ids in queue order at the start. */
  leaves: number[];
  merges: Merge[];
  root: number;
  /** Symbol → code, '0'/'1' characters. A lone symbol gets '0'. */
  codes: Map<string, string>;
  /** Symbols in leaf order. */
  symbols: string[];
}

/** Counts per symbol, heaviest first, ties in character order. */
export function frequencies(text: string): { sym: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const c of Array.from(text)) counts.set(c, (counts.get(c) ?? 0) + 1);
  return [...counts].map(([sym, count]) => ({ sym, count })).sort((x, y) => y.count - x.count || (x.sym < y.sym ? -1 : 1));
}

/** Queue order: lightest first; equal weights by creation order, per the tie-break. */
function queueOrder(nodes: readonly HNode[], ids: readonly number[], tie: TieBreak): number[] {
  return [...ids].sort((x, y) => nodes[x].weight - nodes[y].weight || (tie === 'old' ? x - y : y - x));
}

export function buildHuffman(text: string, tie: TieBreak): Huffman {
  // Leaves are created lightest first (equal counts in reverse character-code order, from reversing
  // frequencies()), so ids carry creation order.
  const freq = frequencies(text).reverse();
  const nodes: HNode[] = freq.map((f, id) => ({ id, weight: f.count, sym: f.sym }));
  let queue = queueOrder(nodes, nodes.map((n) => n.id), tie);
  const leaves = queue.slice();
  const merges: Merge[] = [];
  while (queue.length > 1) {
    const [a, b, ...rest] = queue;
    const parent = nodes.length;
    nodes.push({ id: parent, weight: nodes[a].weight + nodes[b].weight, left: a, right: b });
    const after = queueOrder(nodes, [...rest, parent], tie);
    merges.push({ a, b, parent, queueBefore: queue, queueAfter: after });
    queue = after;
  }
  const root = queue[0];
  const codes = new Map<string, string>();
  const walk = (id: number, prefix: string) => {
    const n = nodes[id];
    if (n.sym !== undefined) codes.set(n.sym, prefix || '0');
    else {
      walk(n.left!, `${prefix}0`);
      walk(n.right!, `${prefix}1`);
    }
  };
  walk(root, '');
  return { text, nodes, leaves, merges, root, codes, symbols: leaves.map((id) => nodes[id].sym!) };
}

export function encode(h: Huffman, text = h.text): string {
  return Array.from(text).map((c) => h.codes.get(c)!).join('');
}

/** One decode step: which bit was read, and where the walk is now. */
export interface DecodeStep {
  bit: number;
  /** Node reached after this bit. */
  node: number;
  /** The symbol emitted when the bit lands on a leaf. */
  emitted?: string;
}

/** Walk bits through the tree; a lone-leaf tree reads every bit as its one symbol. */
export function decodeSteps(h: Huffman, bits: string): DecodeStep[] {
  const steps: DecodeStep[] = [];
  const single = h.nodes[h.root].sym !== undefined;
  let at = h.root;
  for (let i = 0; i < bits.length; i++) {
    if (!single) at = bits[i] === '0' ? h.nodes[at].left! : h.nodes[at].right!;
    const sym = h.nodes[at].sym;
    steps.push({ bit: i, node: at, emitted: sym });
    if (sym !== undefined) at = h.root;
  }
  return steps;
}

export const decode = (h: Huffman, bits: string) => decodeSteps(h, bits).flatMap((s) => (s.emitted === undefined ? [] : [s.emitted])).join('');

export function depthOf(h: Huffman, id: number): number {
  const parent = new Map<number, number>();
  for (const n of h.nodes) {
    if (n.left !== undefined) parent.set(n.left, n.id);
    if (n.right !== undefined) parent.set(n.right, n.id);
  }
  let d = 0;
  for (let x = id; parent.has(x); x = parent.get(x)!) d++;
  return d;
}

export interface Costs {
  /** Message characters. */
  n: number;
  distinct: number;
  huffman: number;
  /** ⌈log₂ distinct⌉ bits per symbol, at least 1. */
  fixedWidth: number;
  fixedBits: number;
  ascii: number;
  /** Shannon entropy of the symbol frequencies, bits per symbol. */
  entropy: number;
}

export function costs(h: Huffman): Costs {
  const n = Array.from(h.text).length;
  const distinct = h.symbols.length;
  const fixedWidth = Math.max(1, Math.ceil(Math.log2(distinct)));
  const entropy = frequencies(h.text).reduce((s, f) => s - (f.count / n) * Math.log2(f.count / n), 0);
  return { n, distinct, huffman: encode(h).length, fixedWidth, fixedBits: n * fixedWidth, ascii: n * ASCII_BITS, entropy };
}

/** How a symbol shows in the tree and tables: a space is ␣. */
export const showSym = (s: string) => (s === ' ' ? '␣' : s);

/** Optimal total code length for these weights: the sum of every merge's weight. */
export function mergeCost(weights: readonly number[]): number {
  const q = [...weights].sort((a, b) => a - b);
  let total = 0;
  while (q.length > 1) {
    const w = q.shift()! + q.shift()!;
    total += w;
    const at = q.findIndex((x) => x > w);
    q.splice(at < 0 ? q.length : at, 0, w);
  }
  return total;
}

/**
 * The best total if the commonest symbol is forced to a 1-bit code: it takes one half of the
 * code space, and every other symbol's code gets one bit longer than its best code on the rest.
 */
export function forcedOneBitCost(text: string): number {
  const [top, ...rest] = frequencies(text);
  const restWeight = rest.reduce((s, f) => s + f.count, 0);
  if (rest.length === 0) return top.count;
  return top.count + restWeight + mergeCost(rest.map((f) => f.count));
}
