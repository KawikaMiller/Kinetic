/**
 * Toy byte-pair encoding (Gage 1994; Sennrich et al. 2016 for words and merges: from memory, verify), written for
 * this lesson. Training counts adjacent symbol pairs over a word list and merges the most frequent pair, ties broken
 * lexicographically (the papers do not fix a rule). The encoder applies the learned merges in the order they were
 * learned, never by re-counting the new text. No tokenizer here is any real model's.
 *
 * Two alphabets: characters (anything outside the training text becomes `<unk>`) and UTF-8 bytes (nothing is unknown).
 * A byte symbol is its two hex digits; a merged symbol is the concatenation of its parts, so its bytes are recoverable.
 */

export const END = '</w>';
export const UNKNOWN = '<unk>';
export type Mode = 'chars' | 'bytes';

export interface Pair {
  left: string;
  right: string;
}

export interface WordCount {
  word: string;
  count: number;
}

const SEP = '\u0001';
const keyOf = (left: string, right: string) => `${left}${SEP}${right}`;
export const pairKey = (p: Pair) => keyOf(p.left, p.right);
export const pairText = (p: Pair) => `${p.left} ${p.right}`;
const pairOf = (key: string): Pair => {
  const [left, right] = key.split(SEP);
  return { left, right };
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const hex = (byte: number) => byte.toString(16).padStart(2, '0');

/** The starting symbols of a word: its characters (or UTF-8 bytes as hex) and the end-of-word marker. */
export function baseSymbols(word: string, mode: Mode): string[] {
  const parts = mode === 'chars' ? Array.from(word) : Array.from(encoder.encode(word), hex);
  return [...parts, END];
}

/** Bytes of a symbol string made of hex pairs (a byte-mode symbol, without the end marker). */
export function symbolBytes(symbol: string): Uint8Array {
  const digits = symbol.replace(END, '');
  return Uint8Array.from({ length: digits.length / 2 }, (_, i) => parseInt(digits.slice(2 * i, 2 * i + 2), 16));
}

/** What a symbol looks like to a reader: itself in character mode; in byte mode its text when its bytes are valid UTF-8, else null. */
export function symbolPreview(symbol: string, mode: Mode): string | null {
  if (mode === 'chars') return symbol;
  const ending = symbol.endsWith(END);
  const bytes = symbolBytes(symbol);
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return ending ? `${text}${END}` : text;
  } catch {
    return null;
  }
}

// ── Training ────────────────────────────────────────────────────────────────

export interface TrainWord {
  symbols: string[];
  count: number;
}

export interface BpeState {
  mode: Mode;
  words: TrainWord[];
  /** Adjacent-pair counts, kept up to date as pairs merge (not recounted from the words). */
  counts: Map<string, number>;
  merges: Pair[];
}

function addPairs(counts: Map<string, number>, symbols: readonly string[], count: number, sign: 1 | -1) {
  for (let i = 0; i + 1 < symbols.length; i++) {
    const key = keyOf(symbols[i], symbols[i + 1]);
    const next = (counts.get(key) ?? 0) + sign * count;
    if (next === 0) counts.delete(key);
    else counts.set(key, next);
  }
}

export function initialState(words: readonly WordCount[], mode: Mode): BpeState {
  const trained = words.map(({ word, count }) => ({ symbols: baseSymbols(word, mode), count }));
  const counts = new Map<string, number>();
  for (const w of trained) addPairs(counts, w.symbols, w.count, 1);
  return { mode, words: trained, counts, merges: [] };
}

export interface PairCount extends Pair {
  count: number;
}

/** Pairs from most to least frequent; ties go to the lexicographically smaller (left, then right). */
export function rankedPairs(state: BpeState): PairCount[] {
  return [...state.counts]
    .map(([key, count]) => ({ ...pairOf(key), count }))
    .sort((a, b) => b.count - a.count || (a.left < b.left ? -1 : a.left > b.left ? 1 : a.right < b.right ? -1 : a.right > b.right ? 1 : 0));
}

export const bestPair = (state: BpeState): PairCount | null => rankedPairs(state)[0] ?? null;

/** Replace each non-overlapping occurrence of the pair, scanning left to right. */
export function mergeInto(symbols: readonly string[], pair: Pair): string[] {
  const out: string[] = [];
  for (let i = 0; i < symbols.length; i++) {
    if (i + 1 < symbols.length && symbols[i] === pair.left && symbols[i + 1] === pair.right) {
      out.push(pair.left + pair.right);
      i++;
    } else out.push(symbols[i]);
  }
  return out;
}

/** Merge a pair everywhere (a new state; the old one is untouched). The pair must exist. */
export function applyMerge(state: BpeState, pair: Pair): BpeState {
  if (!state.counts.has(pairKey(pair))) throw new RangeError(`the pair "${pairText(pair)}" does not occur`);
  const counts = new Map(state.counts);
  const words = state.words.map((w) => {
    const merged = mergeInto(w.symbols, pair);
    if (merged.length === w.symbols.length) return w;
    addPairs(counts, w.symbols, w.count, -1);
    addPairs(counts, merged, w.count, 1);
    return { symbols: merged, count: w.count };
  });
  return { mode: state.mode, words, counts, merges: [...state.merges, pair] };
}

/** Total symbols in the corpus: each word's symbols times how often it occurs. */
export const totalSymbols = (state: BpeState): number => state.words.reduce((sum, w) => sum + w.symbols.length * w.count, 0);

export interface TrainResult {
  merges: PairCount[];
  /** Total corpus symbols after each merge (entry 0 is before any). */
  totals: number[];
}

/** Learn up to `limit` merges (fewer when the words run out of pairs). */
export function trainMerges(words: readonly WordCount[], mode: Mode, limit: number): TrainResult {
  let state = initialState(words, mode);
  const merges: PairCount[] = [];
  const totals = [totalSymbols(state)];
  for (let i = 0; i < limit; i++) {
    const best = bestPair(state);
    if (!best) break;
    merges.push(best);
    state = applyMerge(state, best);
    totals.push(totalSymbols(state));
  }
  return { merges, totals };
}

// ── Vocabulary and encoding ─────────────────────────────────────────────────

/** Distinct words of a text with how often each occurs, in order of first appearance. */
export function countWords(text: string): WordCount[] {
  const seen = new Map<string, number>();
  for (const word of text.split(/\s+/).filter(Boolean)) seen.set(word, (seen.get(word) ?? 0) + 1);
  return [...seen].map(([word, count]) => ({ word, count }));
}

export interface Tokenizer {
  mode: Mode;
  /** Symbol of each id: the base alphabet, then one new symbol per merge in the order learned. */
  vocabulary: readonly string[];
  baseSize: number;
  merges: readonly Pair[];
  /** The first `count` merges only (a smaller vocabulary): the slider's view of the same list. */
  withMerges(count: number): Tokenizer;
  idOf(symbol: string): number;
  /** A word (no spaces) as tokens: base symbols, then each merge applied in learned order. */
  encodeWord(word: string): string[];
  /** Text as tokens. A single space separates words; every word, even an empty one, ends with the marker. */
  encode(text: string): string[];
  decode(tokens: readonly string[]): string;
}

const baseAlphabet = (words: readonly WordCount[], mode: Mode): string[] => {
  if (mode === 'bytes') return Array.from({ length: 256 }, (_, b) => hex(b));
  const chars = new Set<string>();
  for (const { word } of words) for (const ch of Array.from(word)) chars.add(ch);
  return [...chars].sort((a, b) => (a.codePointAt(0)! - b.codePointAt(0)!));
};

export function createTokenizer(words: readonly WordCount[], mode: Mode, limit: number): Tokenizer {
  const { merges } = trainMerges(words, mode, limit);
  return buildTokenizer(mode, baseAlphabet(words, mode), merges);
}

function buildTokenizer(mode: Mode, alphabet: readonly string[], merges: readonly Pair[]): Tokenizer {
  const base = mode === 'chars' ? [UNKNOWN, ...alphabet, END] : [...alphabet, END];
  const vocabulary = [...base, ...merges.map((m) => m.left + m.right)];
  const ids = new Map<string, number>();
  vocabulary.forEach((s, i) => {
    if (!ids.has(s)) ids.set(s, i);
  });
  const known = new Set(alphabet);
  const cache = new Map<string, string[]>();

  const encodeWord = (word: string): string[] => {
    const hit = cache.get(word);
    if (hit) return hit.slice();
    let symbols = baseSymbols(word, mode).map((s) => (s === END || mode === 'bytes' || known.has(s) ? s : UNKNOWN));
    for (const merge of merges) if (symbols.length > 1) symbols = mergeInto(symbols, merge);
    cache.set(word, symbols);
    return symbols.slice();
  };

  return {
    mode,
    vocabulary,
    baseSize: base.length,
    merges,
    withMerges: (count) => buildTokenizer(mode, alphabet, merges.slice(0, Math.max(0, Math.min(count, merges.length)))),
    idOf: (symbol) => ids.get(symbol) ?? ids.get(UNKNOWN) ?? -1,
    encodeWord,
    encode: (text) => (text === '' ? [] : text.split(' ').flatMap(encodeWord)),
    decode(tokens) {
      const pieces = tokens.join('').split(END);
      pieces.pop();
      const words = pieces.map((piece) => (mode === 'chars' ? piece : decoder.decode(symbolBytes(piece))));
      return words.join(' ');
    },
  };
}
