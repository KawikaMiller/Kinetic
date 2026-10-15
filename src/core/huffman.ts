/**
 * Huffman coding: the merge-two-smallest build over any weights, code tables, encode and decode,
 * code lengths, and canonical codes (the DEFLATE rule: ship lengths, not trees). Extracted from
 * huffman-coding; the entropy and compression lessons build on it. Pure.
 */

/**
 * Which tree goes first when two weights tie:
 * - `old`: the one created earlier (leaves before merged trees),
 * - `new`: the one created later (merged trees before leaves).
 * Both are valid Huffman choices; they can build different trees with the same total.
 */
export type TieBreak = 'old' | 'new';

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

/** A symbol and its weight (a count or a probability). */
export interface SymbolWeight {
  sym: string;
  weight: number;
}

/** Counts per symbol, heaviest first, ties in character order. */
export function frequencies(text: string): { sym: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const c of Array.from(text)) counts.set(c, (counts.get(c) ?? 0) + 1);
  return [...counts].map(([sym, count]) => ({ sym, count })).sort((x, y) => y.count - x.count || (x.sym < y.sym ? -1 : 1));
}

/** The text's symbols in the order `buildHuffman` creates leaves: lightest first (equal counts in reverse character order). */
export const textWeights = (text: string): SymbolWeight[] =>
  frequencies(text).reverse().map((f) => ({ sym: f.sym, weight: f.count }));

/** Queue order: lightest first; equal weights by creation order, per the tie-break. */
function queueOrder(nodes: readonly HNode[], ids: readonly number[], tie: TieBreak): number[] {
  return [...ids].sort((x, y) => nodes[x].weight - nodes[y].weight || (tie === 'old' ? x - y : y - x));
}

/**
 * Builds the Huffman tree over the given symbols by repeatedly merging the two lightest roots.
 * Leaf ids follow the order given, which is the creation order the tie-break consults, so list equal
 * weights in the order they should count as "older" first (`textWeights` does this for a text).
 * Weights are positive; they can be counts or probabilities.
 */
export function buildHuffman(entries: readonly SymbolWeight[], tie: TieBreak): Huffman {
  if (entries.length === 0) throw new RangeError('Huffman needs at least one symbol');
  if (entries.some((e) => !(e.weight > 0))) throw new RangeError('Huffman weights must be positive');
  const nodes: HNode[] = entries.map((e, id) => ({ id, weight: e.weight, sym: e.sym }));
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
  return { nodes, leaves, merges, root, codes, symbols: leaves.map((id) => nodes[id].sym!) };
}

/** The bits for a text: every character's code, joined. Every character must be in the code table. */
export function encode(h: Huffman, text: string): string {
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

/** Each symbol's code length in bits. */
export function codeLengths(h: Huffman): Map<string, number> {
  return new Map([...h.codes].map(([sym, code]) => [sym, code.length]));
}

/** Expected bits per symbol: sum of weight times code length, over the total weight. */
export function averageLength(h: Huffman): number {
  const leaves = h.leaves.map((id) => h.nodes[id]);
  const total = leaves.reduce((s, n) => s + n.weight, 0);
  return leaves.reduce((s, n) => s + n.weight * h.codes.get(n.sym!)!.length, 0) / total;
}

/** The longest code length canonicalCodes accepts (DEFLATE uses at most 15). */
export const MAX_CODE_LENGTH = 32;

/** Kraft sum, the sum over used symbols of 2^-length: above 1 no prefix code exists, exactly 1 is complete. A length of 0 means unused. */
export const kraftSum = (lengths: readonly number[]): number => lengths.reduce((s, l) => s + (l > 0 ? 2 ** -l : 0), 0);

/**
 * Canonical codes from code lengths, by the DEFLATE rule (RFC 1951, section 3.2.2): shorter codes come
 * first, and codes of one length are consecutive in symbol order, counting up. Only the lengths need
 * to be stored or sent. A length of 0 means the symbol is unused (its entry is null). Throws for
 * a length set that is oversubscribed (Kraft sum above 1), which no prefix code can have.
 */
export function canonicalCodes(lengths: readonly number[]): (string | null)[] {
  if (lengths.some((l) => !Number.isInteger(l) || l < 0 || l > MAX_CODE_LENGTH)) {
    throw new RangeError(`code lengths are whole numbers from 0 to ${MAX_CODE_LENGTH}`);
  }
  if (kraftSum(lengths) > 1 + 1e-12) throw new RangeError('code lengths are oversubscribed: no prefix code has them');
  const max = Math.max(0, ...lengths);
  const countOf = Array.from({ length: max + 2 }, () => 0);
  for (const l of lengths) if (l > 0) countOf[l]++;
  const next: number[] = [0, 0];
  for (let bits = 2; bits <= max; bits++) next[bits] = (next[bits - 1] + countOf[bits - 1]) * 2;
  return lengths.map((l) => (l > 0 ? (next[l]++).toString(2).padStart(l, '0') : null));
}
