/**
 * A bigram chain over words, pure: a tiny corpus becomes a Markov chain whose state is the current
 * word, and a seeded walk writes sentences from it. The chain forgets everything except the word it
 * is on, which is the whole point.
 */
import { mulberry32, type Rnd } from '../../core/random';
import type { Result } from '../../core/result';

/** The most words the lesson reads, and the longest word. */
export const MAX_WORDS = 60;
export const MAX_WORD_LENGTH = 20;
/** A generated sentence stops at the end marker or after this many words. */
export const MAX_SENTENCE = 12;
export const SENTENCES_SHOWN = 5;

export const START = '^';
export const END = '$';

export interface Corpus {
  id: string;
  label: string;
  text: string;
}

/** Invented sentences, written for this lesson. */
export const CORPORA: readonly Corpus[] = [
  { id: 'pets', label: 'Cats and dogs', text: 'the cat sat on the mat. the dog sat on the rug. the cat saw the dog. a dog saw a cat on the mat.' },
  { id: 'weather', label: 'Weather talk', text: 'it is sunny today. it is cloudy today. it will be rainy tomorrow. tomorrow it will be sunny.' },
];
export const DEFAULT_CORPUS = CORPORA[0].text;

/** Sentences of lower-cased words from the text, or the reason it is refused (too many words, a word too long). */
export function parseCorpus(text: string): Result<string[][]> {
  const sentences = text
    .split(/[.!?]+/)
    .map((s) => s.toLowerCase().split(/\s+/).map((w) => w.replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, '')).filter(Boolean))
    .filter((s) => s.length > 0);
  const words = sentences.flat();
  const long = words.find((w) => Array.from(w).length > MAX_WORD_LENGTH);
  if (long !== undefined) return { ok: false, error: `"${long.slice(0, 24)}" has ${Array.from(long).length} letters: the longest word allowed is ${MAX_WORD_LENGTH}.` };
  if (words.length > MAX_WORDS) return { ok: false, error: `That is ${words.length} words: the limit is ${MAX_WORDS}.` };
  if (words.length === 0) return { ok: false, error: 'Type at least one word.' };
  return { ok: true, value: sentences };
}

export interface WordChain {
  /** After each word (and the start marker), how often each next word (or the end marker) followed. */
  next: Map<string, Map<string, number>>;
  /** Distinct words, most frequent first. */
  words: string[];
  /** How often each word occurs. */
  counts: Map<string, number>;
  /** The sentences the chain was built from. */
  sentences: string[][];
}

export function buildChain(sentences: readonly string[][]): WordChain {
  const next = new Map<string, Map<string, number>>();
  const counts = new Map<string, number>();
  for (const sentence of sentences) {
    const seq = [START, ...sentence, END];
    for (let i = 0; i + 1 < seq.length; i++) {
      const row = next.get(seq[i]) ?? new Map<string, number>();
      row.set(seq[i + 1], (row.get(seq[i + 1]) ?? 0) + 1);
      next.set(seq[i], row);
    }
    for (const w of sentence) counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  const words = [...counts.keys()].sort((a, b) => counts.get(b)! - counts.get(a)! || (a < b ? -1 : 1));
  return { next, words, counts, sentences: sentences.map((s) => [...s]) };
}

/** P(next | word) as sorted entries, most likely first; the end marker is shown as "(end)". */
export function nextWords(chain: WordChain, word: string): { word: string; count: number; probability: number }[] {
  const row = chain.next.get(word);
  if (!row) return [];
  const total = [...row.values()].reduce((s, c) => s + c, 0);
  return [...row]
    .map(([w, count]) => ({ word: w === END ? '(end)' : w, count, probability: count / total }))
    .sort((a, b) => b.count - a.count || (a.word < b.word ? -1 : 1));
}

function pickNext(row: Map<string, number>, rnd: Rnd): string {
  const total = [...row.values()].reduce((s, c) => s + c, 0);
  let u = rnd() * total;
  for (const [w, c] of row) {
    u -= c;
    if (u < 0) return w;
  }
  return [...row.keys()].at(-1)!;
}

/** One sentence from the chain: start, then next words until the end marker or MAX_SENTENCE words. */
export function generateSentence(chain: WordChain, rnd: Rnd): string[] {
  const out: string[] = [];
  let at = START;
  while (out.length < MAX_SENTENCE) {
    const row = chain.next.get(at);
    if (!row) break;
    const w = pickNext(row, rnd);
    if (w === END) break;
    out.push(w);
    at = w;
  }
  return out;
}

/** Several seeded sentences. */
export function generateSentences(chain: WordChain, seed: number, count = SENTENCES_SHOWN): string[][] {
  const rnd = mulberry32(seed);
  return Array.from({ length: count }, () => generateSentence(chain, rnd));
}

export const sentenceText = (s: readonly string[]): string => s.join(' ');

/** Whether the corpus contains this exact sentence. */
export const inCorpus = (chain: WordChain, s: readonly string[]): boolean => chain.sentences.some((c) => sentenceText(c) === sentenceText(s));

/**
 * Two places in the corpus where the most frequent word is reached by different histories: the Markov
 * property says the next word is drawn from the same row for both. Null when no word follows two different words.
 */
export function sameWordTwoHistories(chain: WordChain): { word: string; histories: [string[], string[]] } | null {
  for (const word of chain.words) {
    const seen = new Map<string, string[]>();
    for (const s of chain.sentences) {
      s.forEach((w, i) => {
        if (w !== word) return;
        const before = i === 0 ? START : s[i - 1];
        if (!seen.has(before)) seen.set(before, s.slice(0, i + 1));
      });
    }
    const hist = [...seen.values()];
    if (hist.length >= 2) return { word, histories: [hist[0], hist[1]] };
  }
  return null;
}
