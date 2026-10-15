/** Captions and readouts built from the model's numbers, so tests can pin the sentences. */
import { CODE_SYMBOLS, assignCodes, bytesOf, kraftOutOf256, kraftState, rawBits, type Compressed } from './model';

const noun = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const SPACE = 256;

// ── Scene 3 ──────────────────────────────────────────────────────────

export function canonicalCaption(lengths: readonly number[]): string {
  const state = kraftState(lengths);
  const sum = kraftOutOf256(lengths);
  const codes = assignCodes(lengths);
  const kraft = `Kraft sum ${sum}/${SPACE}`;
  if (state === 'oversubscribed' || !codes) {
    return `${kraft} is above 1: these lengths promise more code space than exists, so no prefix code has them and the rule refuses to assign any.`;
  }
  const list = codes.map((c, i) => `${CODE_SYMBOLS[i]} = ${c}`).join(', ');
  const rule = 'Shorter codes come first, and codes of one length count up in symbol order.';
  if (state === 'complete') return `${kraft} = 1: a complete code, with no code space left over. ${rule} ${list}.`;
  return `${kraft} is below 1: a prefix code exists, but ${SPACE - sum}/${SPACE} of the code space is unused, so some bit strings decode to nothing. ${rule} ${list}.`;
}

// ── Scene 4 ──────────────────────────────────────────────────────────

/** The block against a plain copy: saved bits, or bits added, in one sentence. */
export function sizeVerdict(text: string, c: Compressed): { text: string; added: boolean } {
  const raw = rawBits(text);
  const bits = c.block.totalBits;
  if (bits <= raw) return { text: `${raw - bits} bits saved against ${raw} for plain bytes`, added: false };
  return { text: `${bits - raw} bits added: ${bits} against ${raw} for plain bytes`, added: true };
}

export const sizeText = (bits: number): string => `${bits} bits (${noun(bytesOf(bits), 'byte')})`;

/** What the stream's own inflate check says; `state` is where the browser's async answer stands. */
export type InflateState = 'unavailable' | 'checking' | 'same' | 'different';
export function inflateText(state: InflateState): string {
  switch (state) {
    case 'unavailable': return 'This browser has no deflate-raw stream, so the check is skipped. The tests decode the same bytes with Node’s zlib.';
    case 'checking': return 'Checking with the browser’s own inflate…';
    case 'same': return 'The browser’s own inflate read our bytes and returned the same text.';
    case 'different': return 'The browser’s own inflate returned different text: the stream is wrong.';
  }
}

export function inflateStateOf(available: boolean, result: string | null | undefined, text: string): InflateState {
  if (!available) return 'unavailable';
  if (result === undefined) return 'checking';
  return result === text ? 'same' : 'different';
}

// ── Scene 5 ──────────────────────────────────────────────────────────

export interface Comparison {
  label: string;
  raw: number;
  huffman: number;
  entropy: number;
  deflate: number;
  /** Bytes from the browser's own compressor, once known (null where unavailable). */
  real: number | null | undefined;
}

export function comparisonCaption(c: Comparison): string {
  if (c.raw === 0) return 'No characters yet: type something, or pick one of the examples.';
  const bound = c.entropy;
  const lead = `${c.label}: plain bytes take ${c.raw} bits, one Huffman code over the characters ${c.huffman.toFixed(1)}, the order-0 bound ${bound.toFixed(1)}, and our fixed-Huffman DEFLATE ${c.deflate}.`;
  if (c.deflate < bound - 1e-9) return `${lead} DEFLATE is under the order-0 bound by ${(bound - c.deflate).toFixed(1)} bits: it exploits repeats, which a character-by-character model cannot see.`;
  if (c.deflate > c.raw) return `${lead} DEFLATE is larger than the plain bytes by ${c.deflate - c.raw} bits: there are no repeats to point back to, and the block adds its own header and end code.`;
  return `${lead} DEFLATE is ${(c.deflate - bound).toFixed(1)} bits above the order-0 bound here: the fixed code spends at least 8 bits on a literal, and the block adds 10 bits of header and end code.`;
}
