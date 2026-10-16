/**
 * Shannon entropy for the information lessons (entropy-information, lz-compression): the entropy
 * of a distribution, the surprise of one outcome, and the order-0 entropy of a text (its own
 * character counts treated as independent draws). Pure. Bits throughout.
 */
import { frequencies } from './huffman';

/** One term of the entropy, -p log2 p, with the convention 0 log 0 = 0. */
export const entropyTerm = (p: number): number => (p > 0 ? 0 - p * Math.log2(p) : 0);

/** Entropy in bits of a probability distribution: the average surprise. */
export const entropy = (probs: readonly number[]): number => probs.reduce((s, p) => s + entropyTerm(p), 0);

/** H(p) for a coin that lands heads with probability p. */
export const binaryEntropy = (p: number): number => entropy([p, 1 - p]);

/** The surprise of an outcome of probability p: -log2 p bits (unbounded for an impossible outcome). */
export const surprise = (p: number): number => (p > 0 ? 0 - Math.log2(p) : Infinity);

export interface SymbolStat {
  sym: string;
  count: number;
  probability: number;
  /** -log2 of the probability: how surprising this symbol is in this text. */
  surprise: number;
}

export interface TextEntropy {
  /** Characters (code points). */
  n: number;
  /** Distinct characters, heaviest first (ties in character order), as `frequencies` orders them. */
  symbols: SymbolStat[];
  /** Order-0 entropy in bits per character: the average surprise under the text's own frequencies. */
  bitsPerChar: number;
  /** n x bitsPerChar: the order-0 bound on the text's length in bits. */
  totalBits: number;
  /** Whether any character is outside ASCII (so 8 bits per character is not what UTF-8 spends on it). */
  nonAscii: boolean;
}

/** Order-0 entropy of a text from its character counts; null for an empty text (no symbols). */
export function textEntropy(text: string): TextEntropy | null {
  const chars = Array.from(text);
  if (chars.length === 0) return null;
  const n = chars.length;
  const symbols = frequencies(text).map(({ sym, count }) => ({ sym, count, probability: count / n, surprise: surprise(count / n) }));
  const bitsPerChar = entropy(symbols.map((s) => s.probability));
  return { n, symbols, bitsPerChar, totalBits: n * bitsPerChar, nonAscii: chars.some((c) => (c.codePointAt(0) ?? 0) > 127) };
}

/** Order-0 entropy of the text in bits per character (0 for an empty text). */
export const orderZeroBitsPerChar = (text: string): number => textEntropy(text)?.bitsPerChar ?? 0;

/** n x H: the order-0 bound on the text, in bits (0 for an empty text). */
export const orderZeroBits = (text: string): number => textEntropy(text)?.totalBits ?? 0;
