/**
 * Entropy and information, pure: the entropy of a distribution, the biased coin and its block codes,
 * the order-0 entropy of a typed text, the bits of a uniformly generated password, and the cost of a
 * wrong belief (cross-entropy and its excess over the entropy, the KL divergence). The question-tree
 * scene has its own file, `questions.ts`.
 */
import { averageLength, buildHuffman, frequencies, type SymbolWeight } from '../../core/huffman';

/** One term of the entropy, -p log2 p, with the convention 0 log 0 = 0. */
export const entropyTerm = (p: number): number => (p > 0 ? 0 - p * Math.log2(p) : 0);

/** Entropy in bits of a probability distribution: the average surprise. */
export const entropy = (probs: readonly number[]): number => probs.reduce((s, p) => s + entropyTerm(p), 0);

/** H(p) for a coin that lands heads with probability p. */
export const binaryEntropy = (p: number): number => entropy([p, 1 - p]);

/** The surprise of an outcome of probability p: -log2 p bits (unbounded for an impossible outcome). */
export const surprise = (p: number): number => (p > 0 ? 0 - Math.log2(p) : Infinity);

// ── The biased coin and block codes ──────────────────────────────────

/** The largest block length the block-coding panel codes (2^4 = 16 outcomes). */
export const MAX_BLOCK = 4;
export const BLOCK_LENGTHS: readonly number[] = [1, 2, 3, 4];

/** The chance of each of the 2^k outcomes of k flips that have a positive chance, as Huffman weights. */
export function blockOutcomes(p: number, k: number): SymbolWeight[] {
  const out: SymbolWeight[] = [];
  for (let mask = 0; mask < 2 ** k; mask++) {
    const bits = mask.toString(2).padStart(k, '0');
    const heads = [...bits].filter((b) => b === '1').length;
    const weight = p ** heads * (1 - p) ** (k - heads);
    if (weight > 0) out.push({ sym: bits, weight });
  }
  return out;
}

/**
 * Bits per flip of the best symbol code over blocks of k flips: the Huffman code over the outcomes
 * that can happen, its expected length divided by k. A certain outcome (p of 0 or 1) is one symbol,
 * and a lone symbol still needs a 1-bit codeword, so the figure is 1 / k there while the entropy is 0.
 */
export function blockBitsPerFlip(p: number, k: number): number {
  return averageLength(buildHuffman(blockOutcomes(p, k), 'old')) / k;
}

/** The pinned values from the spec at p = 0.1 live in the tests; the panel recomputes them live. */
export const COIN_PRESETS: readonly number[] = [0.5, 0.25, 0.1, 0.01];
export const COIN_DEFAULT = 0.5;
/** Slider resolution for p: fine enough to reach the pinned 0.01 and 0.99 ends. */
export const COIN_STEP = 0.01;

// ── Typed text ───────────────────────────────────────────────────────

/** The most characters of text the lesson reads, counted by code point. */
export const MAX_TEXT = 500;

/** The text cut to MAX_TEXT code points (so a pasted essay cannot stall the page). */
export const clampText = (text: string, max = MAX_TEXT): string => Array.from(text).slice(0, max).join('');

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

export const TEXT_PRESETS: readonly { id: string; label: string; text: string }[] = [
  { id: 'a', label: 'aaaaaaaa', text: 'aaaaaaaa' },
  { id: 'ab', label: 'abababab', text: 'abababab' },
  { id: 'mississippi', label: 'mississippi', text: 'mississippi' },
  { id: 'password', label: 'password', text: 'password' },
];
export const TEXT_DEFAULT = TEXT_PRESETS[2].text;
/** Bits per character of plain ASCII, the comparison the scene prints. */
export const ASCII_BITS = 8;
/** How many symbols the frequency table lists before folding the rest into one line. */
export const TABLE_ROWS = 8;

// ── Passwords ────────────────────────────────────────────────────────

export const LENGTH_BOUNDS = { min: 1, max: 64 } as const;
/** The spec asks for 2-256, but its own diceware example needs a 7,776-symbol alphabet, so the field reaches 8,192. */
export const ALPHABET_BOUNDS = { min: 2, max: 8192 } as const;
/** The word-list size of the diceware scheme: 6^5 lists of five dice rolls. A standard figure, from memory. */
export const DICEWARE_WORDS = 6 ** 5;

/** Bits of a secret made of `length` symbols each drawn uniformly and independently from `alphabet`. */
export const generatedBits = (length: number, alphabet: number): number => length * Math.log2(alphabet);

export const GENERATORS: readonly { id: string; label: string; length: number; alphabet: number; note: string }[] = [
  { id: 'chars62', label: '12 letters and digits', length: 12, alphabet: 62, note: '12 characters from 62 letters and digits' },
  { id: 'diceware', label: '4 words from a 7,776-word list', length: 4, alphabet: DICEWARE_WORDS, note: '4 words from a 7,776-word list' },
  { id: 'pin', label: '6-digit PIN', length: 6, alphabet: 10, note: '6 digits' },
];
export const GENERATOR_DEFAULT = GENERATORS[0];

/** The 2^bits possibilities as a short power of ten (for 71.45 bits: "3.7e21"). Always finite: bits is at most 64 x log2 8192 = 832. */
export const possibilities = (bits: number): string => (2 ** bits).toExponential(1).replace('e+', 'e');

// ── Cross-entropy ────────────────────────────────────────────────────

/** The believed-versus-true scene's default true distribution. */
export const TRUE_DIST: readonly number[] = [0.5, 0.25, 0.25];
export const BELIEF_LABELS: readonly string[] = ['x', 'y', 'z'];

/**
 * H(p, q) = -sum p log2 q: the average bits per outcome of a code built for q when outcomes come
 * from p. Infinite when q gives an outcome that happens (p > 0) a chance of zero.
 */
export function crossEntropy(p: readonly number[], q: readonly number[]): number {
  let total = 0;
  for (let i = 0; i < p.length; i++) {
    if (p[i] === 0) continue;
    if (q[i] <= 0) return Infinity;
    total += 0 - p[i] * Math.log2(q[i]);
  }
  return total;
}

/** The extra bits a wrong belief costs per outcome, H(p, q) - H(p), also called the KL divergence. */
export const excessBits = (p: readonly number[], q: readonly number[]): number => crossEntropy(p, q) - entropy(p);

/**
 * Sets belief i to v and rescales the others so the belief still sums to 1, keeping their ratio
 * (shared out equally when they were both zero).
 */
export function setBelief(q: readonly number[], i: number, v: number): number[] {
  const to = Math.min(1, Math.max(0, v));
  const others = q.map((x, j) => (j === i ? 0 : x));
  const rest = others.reduce((s, x) => s + x, 0);
  return q.map((x, j) => {
    if (j === i) return to;
    return rest > 0 ? (x / rest) * (1 - to) : (1 - to) / (q.length - 1);
  });
}

export const BELIEF_PRESETS: readonly { id: string; label: string; q: readonly number[] }[] = [
  { id: 'right', label: 'q = p', q: TRUE_DIST },
  { id: 'uniform', label: 'uniform', q: [1 / 3, 1 / 3, 1 / 3] },
  { id: 'wrong', label: 'confidently wrong', q: [0.05, 0.05, 0.9] },
  { id: 'zero', label: 'rules out z', q: [0.5, 0.5, 0] },
];
