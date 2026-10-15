/**
 * Huffman coding for the lesson: the message rules, its tree (built by core/huffman), and the
 * cost comparison against fixed-width and ASCII codes. Pure; the frames and the Stage only read from here.
 */
import { buildHuffman as buildFromWeights, encode as encodeText, frequencies, mergeCost, textWeights, type Huffman as HuffmanTree, type TieBreak } from '../../core/huffman';

export const MAX_CHARS = 40;
export const DEFAULT_TEXT = 'mississippi river';
export const ASCII_BITS = 8;
/** Printable ASCII, space to tilde: what the 8-bit ASCII comparison can honestly encode. */
const PRINTABLE = /^[\x20-\x7e]$/;

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

/** The tree for a message: core/huffman's tree plus the text it was built from. */
export interface Huffman extends HuffmanTree {
  text: string;
}

export const buildHuffman = (text: string, tie: TieBreak): Huffman => ({ ...buildFromWeights(textWeights(text), tie), text });

/** The bits for the message the tree was built from (or another message over the same symbols). */
export const encode = (h: Huffman, text = h.text) => encodeText(h, text);

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
