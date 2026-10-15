/**
 * What the compression scenes measure, pure: the order-0 entropy bound, a symbol-only Huffman size, the
 * size of the lesson's own fixed-Huffman DEFLATE block, and the code-length editor's rules (Kraft
 * sum, canonical codes, the prefix property).
 */
import { averageLength, buildHuffman, canonicalCodes, frequencies, kraftSum, textWeights } from '../../core/huffman';
import { mulberry32 } from '../../core/random';
import { deflateTokens, encodeFixedBlock, type Block } from './deflate';
import { parseLz77, type ParseOptions, type Token } from './lz77';

/** Bits in a plain byte of text. */
export const BITS_PER_BYTE = 8;

/** Order-0 entropy of the text in bits per character: -sum p log2 p over its characters (0 for an empty text). */
export function orderZeroBitsPerChar(text: string): number {
  const n = Array.from(text).length;
  if (n === 0) return 0;
  return frequencies(text).reduce((s, { count }) => s - (count / n) * Math.log2(count / n), 0);
}

/** n x H: the order-0 bound on the text, in bits. */
export const orderZeroBits = (text: string): number => Array.from(text).length * orderZeroBitsPerChar(text);

/** Bits of the text under one Huffman code over its own characters, not counting the table that describes it. */
export function huffmanOnlyBits(text: string): number {
  const n = Array.from(text).length;
  if (n === 0) return 0;
  return averageLength(buildHuffman(textWeights(text), 'old')) * n;
}

export interface Compressed {
  tokens: Token[];
  /** The tokens as DEFLATE can carry them (matches under 3 characters are literals). */
  sent: Token[];
  block: Block;
}

/** Parse, then encode with the fixed code: the lesson's whole compressor. */
export function compress(text: string, options: ParseOptions): Compressed {
  const tokens = parseLz77(text, options);
  const sent = deflateTokens(tokens, text);
  return { tokens, sent, block: encodeFixedBlock(sent) };
}

/** The bits a plain, uncompressed copy of the text takes. */
export const rawBits = (text: string): number => Array.from(text).length * BITS_PER_BYTE;

export const bytesOf = (bits: number): number => Math.ceil(bits / BITS_PER_BYTE);

// ── Presets ──────────────────────────────────────────────────────────

const RANDOM_LETTERS_SEED = 11;
const RANDOM_LETTERS_LENGTH = 40;
const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
const randomLetters = (): string => {
  const rnd = mulberry32(RANDOM_LETTERS_SEED);
  return Array.from({ length: RANDOM_LETTERS_LENGTH }, () => LETTERS[Math.floor(rnd() * LETTERS.length)]).join('');
};

export const TEXT_PRESETS: readonly { id: string; label: string; text: string }[] = [
  { id: 'abracadabra', label: 'abracadabra x2', text: 'abracadabra abracadabra' },
  { id: 'aaaa', label: 'aaaaaaaaaa', text: 'aaaaaaaaaa' },
  { id: 'ab50', label: 'ab x 50', text: 'ab'.repeat(50) },
  { id: 'json', label: 'JSON line x 3', text: '{"id":1,"ok":true},'.repeat(3) },
  { id: 'random', label: 'random letters', text: randomLetters() },
];
export const DEFAULT_TEXT = TEXT_PRESETS[0].text;

// ── Code lengths (scene 3) ───────────────────────────────────────────

export const CODE_SYMBOLS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;
export const CODE_LENGTH_BOUNDS = { min: 1, max: 8 } as const;

export type KraftState = 'oversubscribed' | 'complete' | 'incomplete';
export const kraftState = (lengths: readonly number[]): KraftState => {
  const k = kraftSum(lengths);
  return k > 1 ? 'oversubscribed' : k === 1 ? 'complete' : 'incomplete';
};

/** The Kraft sum as a count out of 2^8, exact (lengths are at most 8): 256 is a complete code. */
export const kraftOutOf256 = (lengths: readonly number[]): number => lengths.reduce((s, l) => s + 2 ** (CODE_LENGTH_BOUNDS.max - l), 0);

/** Canonical codes for the lengths, or null for an oversubscribed set (no prefix code exists). */
export function assignCodes(lengths: readonly number[]): (string | null)[] | null {
  return kraftState(lengths) === 'oversubscribed' ? null : canonicalCodes(lengths);
}

/** True when no code is a prefix of another. */
export function isPrefixFree(codes: readonly (string | null)[]): boolean {
  const used = codes.filter((c): c is string => c !== null);
  return used.every((a, i) => used.every((b, j) => i === j || !b.startsWith(a)));
}

/** The RFC 1951 section 3.2.2 example: lengths for A..H. */
export const RFC_LENGTHS: readonly number[] = [3, 3, 3, 3, 3, 2, 4, 4];

export const LENGTH_PRESETS: readonly { id: string; label: string; lengths: readonly number[] }[] = [
  { id: 'rfc', label: 'RFC 1951 example', lengths: RFC_LENGTHS },
  { id: 'flat', label: 'all 3 bits', lengths: [3, 3, 3, 3, 3, 3, 3, 3] },
  { id: 'over', label: 'oversubscribed', lengths: [2, 2, 2, 2, 2, 3, 3, 3] },
  { id: 'under', label: 'incomplete', lengths: [3, 3, 3, 3, 4, 4, 4, 4] },
];
