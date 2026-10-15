/**
 * Toy embeddings: a lesson-authored vocabulary of hand-made 8-dimensional vectors with named
 * dimensions (not a trained model), cosine nearest neighbours, phrase averaging, analogy
 * arithmetic, PCA (core/linalg), keyword overlap and a brute-force document search.
 */
import { pca, pcaProject, type Pca } from '../../core/linalg';
import { add, cosine, norm, scale, sub, type Vec } from '../../core/vec';

export const DIMS = ['animal', 'food', 'vehicle', 'repair', 'size', 'young', 'cat ↔ dog', 'sweet'] as const;
export const DIM_NOTE: Record<(typeof DIMS)[number], string> = {
  animal: 'how much it is an animal',
  food: 'how much it is food',
  vehicle: 'how much it is a vehicle',
  repair: 'how much it is about fixing things',
  size: 'small (−1) to big (+1)',
  young: 'how young',
  'cat ↔ dog': 'dog-like (−1) to cat-like (+1)',
  sweet: 'sour or salty (−1) to sweet (+1)',
};

export type Group = 'animals' | 'food' | 'vehicles' | 'repair' | 'describing';
export const GROUPS: readonly Group[] = ['animals', 'food', 'vehicles', 'repair', 'describing'];

export interface Word {
  word: string;
  group: Group;
  v: Vec;
}

//              animal food vehicle repair size young cat↔dog sweet
const RAW: [string, Group, number[]][] = [
  ['dog', 'animals', [1, 0, 0, 0, 0.3, 0, -1, 0]],
  ['puppy', 'animals', [1, 0, 0, 0, -0.4, 1, -1, 0]],
  ['wolf', 'animals', [1, 0, 0, 0, 0.6, 0, -0.9, 0]],
  ['cat', 'animals', [1, 0, 0, 0, -0.2, 0, 1, 0]],
  ['kitten', 'animals', [1, 0, 0, 0, -0.9, 1, 1, 0]],
  ['lion', 'animals', [1, 0, 0, 0, 0.9, 0, 0.9, 0]],
  ['tiger', 'animals', [1, 0, 0, 0, 0.95, 0, 0.85, 0]],
  ['cub', 'animals', [1, 0, 0, 0, -0.3, 1, 0.5, 0]],
  ['horse', 'animals', [1, 0, 0.3, 0, 0.9, 0, 0, 0]],
  ['foal', 'animals', [1, 0, 0.2, 0, 0.2, 1, 0, 0]],
  ['cow', 'animals', [1, 0.3, 0, 0, 0.9, 0, 0, 0]],
  ['calf', 'animals', [1, 0.2, 0, 0, 0.2, 1, 0, 0]],
  ['mouse', 'animals', [1, 0, 0, 0, -1, 0, 0, 0]],
  ['hamster', 'animals', [1, 0, 0, 0, -0.9, 0.1, 0, 0]],
  ['rabbit', 'animals', [1, 0, 0, 0, -0.6, 0, 0, 0.1]],
  ['chicken', 'animals', [0.8, 0.5, 0, 0, -0.5, 0, 0, 0]],
  ['chick', 'animals', [0.9, 0.1, 0, 0, -0.9, 1, 0, 0.1]],
  ['fish', 'animals', [0.8, 0.4, 0, 0, -0.4, 0, 0, 0]],
  ['bread', 'food', [0, 1, 0, 0, 0, 0, 0, 0.1]],
  ['cake', 'food', [0, 1, 0, 0, 0, 0, 0, 1]],
  ['cookie', 'food', [0, 1, 0, 0, -0.5, 0, 0, 0.9]],
  ['candy', 'food', [0, 0.9, 0, 0, -0.7, 0, 0, 1]],
  ['honey', 'food', [0, 0.9, 0, 0, -0.3, 0, 0, 0.9]],
  ['apple', 'food', [0, 1, 0, 0, -0.4, 0, 0, 0.6]],
  ['banana', 'food', [0, 1, 0, 0, -0.2, 0, 0, 0.6]],
  ['soup', 'food', [0, 1, 0, 0, 0, 0, 0, -0.3]],
  ['cheese', 'food', [0, 1, 0, 0, 0, 0, 0, -0.2]],
  ['pizza', 'food', [0, 1, 0, 0, 0.2, 0, 0, -0.1]],
  ['salt', 'food', [0, 0.8, 0, 0, -0.8, 0, 0, -1]],
  ['lemon', 'food', [0, 1, 0, 0, -0.4, 0, 0, -0.6]],
  ['steak', 'food', [0.3, 1, 0, 0, 0.2, 0, 0, -0.3]],
  ['milk', 'food', [0.2, 0.9, 0, 0, 0, 0.3, 0.2, 0.3]],
  ['car', 'vehicles', [0, 0, 1, 0.1, 0.3, 0, 0, 0]],
  ['vehicle', 'vehicles', [0, 0, 1, 0, 0.2, 0, 0, 0]],
  ['truck', 'vehicles', [0, 0, 1, 0.1, 0.9, 0, 0, 0]],
  ['bus', 'vehicles', [0, 0, 1, 0, 1, 0, 0, 0]],
  ['train', 'vehicles', [0, 0, 1, 0, 0.95, 0, 0, 0.05]],
  ['plane', 'vehicles', [0, 0, 0.95, 0, 0.9, 0, 0, 0.1]],
  ['van', 'vehicles', [0, 0, 1, 0.1, 0.6, 0, 0, 0]],
  ['bicycle', 'vehicles', [0, 0, 0.9, 0, -0.4, 0, 0, 0]],
  ['bike', 'vehicles', [0, 0, 0.9, 0, -0.3, 0, 0, 0]],
  ['scooter', 'vehicles', [0, 0, 0.8, 0, -0.6, 0.2, 0, 0]],
  ['tractor', 'vehicles', [0, 0, 0.9, 0.1, 0.8, 0, 0, 0]],
  ['repair', 'repair', [0, 0, 0.2, 1, 0, 0, 0, 0]],
  ['fix', 'repair', [0, 0, 0.1, 1, 0, 0, 0, 0]],
  ['fixing', 'repair', [0, 0, 0.1, 1, 0, 0, 0, 0]],
  ['mechanic', 'repair', [0, 0, 0.5, 0.9, 0, 0, 0, 0]],
  ['garage', 'repair', [0, 0, 0.6, 0.7, 0.4, 0, 0, 0]],
  ['tool', 'repair', [0, 0, 0.1, 0.9, -0.3, 0, 0, 0]],
  ['wrench', 'repair', [0, 0, 0.2, 0.9, -0.4, 0, 0, 0]],
  ['tyre', 'repair', [0, 0, 0.8, 0.5, 0, 0, 0, 0]],
  ['engine', 'repair', [0, 0, 0.8, 0.6, 0.3, 0, 0, 0]],
  ['broken', 'repair', [0, 0, 0.1, 0.8, 0, 0, 0, -0.2]],
  ['service', 'repair', [0, 0, 0.3, 0.8, 0, 0, 0, 0]],
  ['big', 'describing', [0, 0, 0, 0, 1, 0, 0, 0]],
  ['small', 'describing', [0, 0, 0, 0, -1, 0, 0, 0]],
  ['baby', 'describing', [0.3, 0, 0, 0, -0.6, 1, 0, 0]],
  ['young', 'describing', [0, 0, 0, 0, -0.2, 1, 0, 0]],
  ['sweet', 'describing', [0, 0.3, 0, 0, 0, 0, 0, 1]],
  ['sour', 'describing', [0, 0.3, 0, 0, 0, 0, 0, -1]],
];

export const VOCAB: readonly Word[] = RAW.map(([word, group, v]) => ({ word, group, v }));
const BY_WORD = new Map(VOCAB.map((w) => [w.word, w]));
export const lookup = (word: string) => BY_WORD.get(word) ?? null;

// ── Neighbours ───────────────────────────────────────────────────────

export interface Neighbour {
  word: Word;
  cos: number;
}

export const TOP_K = 5;

/** The words with the highest cosine to `v`, best first (ties alphabetical), skipping `exclude`. */
export function neighbours(v: Vec, k = TOP_K, exclude: readonly string[] = []): Neighbour[] {
  if (norm(v) === 0) return [];
  return VOCAB.filter((w) => !exclude.includes(w.word))
    .map((w) => ({ word: w, cos: cosine(v, w.v) }))
    .sort((a, b) => b.cos - a.cos || a.word.word.localeCompare(b.word.word))
    .slice(0, k);
}

// ── Phrases ──────────────────────────────────────────────────────────

/** Lower-case runs of the letters a-z; anything else (digits, punctuation, emoji, markup) separates words. */
export const tokenize = (text: string) => text.toLowerCase().split(/[^a-z]+/).filter(Boolean);

export type Phrase =
  | { ok: true; vector: number[]; known: string[]; unknown: string[] }
  | { ok: false; reason: string; unknown: string[] };

/** The phrase's vector is the mean of its known words' vectors (repeats count again); unknown words are listed and ignored. */
export function phraseVector(text: string): Phrase {
  const tokens = tokenize(text);
  const known = tokens.filter((t) => BY_WORD.has(t));
  const unknown = [...new Set(tokens.filter((t) => !BY_WORD.has(t)))];
  if (!tokens.length) return { ok: false, reason: 'Type a word or a short phrase.', unknown };
  if (!known.length) return { ok: false, reason: 'None of these words are in this toy vocabulary.', unknown };
  const sum = known.reduce<number[]>((s, t) => add(s, BY_WORD.get(t)!.v), new Array(DIMS.length).fill(0));
  return { ok: true, vector: scale(sum, 1 / known.length), known, unknown };
}

// ── Analogies ────────────────────────────────────────────────────────

export interface Analogy {
  id: string;
  /** a − b + c */
  a: string;
  b: string;
  c: string;
  /** The answer a person would expect. */
  expected: string;
}

export const ANALOGIES: readonly Analogy[] = [
  { id: 'kitten', a: 'puppy', b: 'dog', c: 'cat', expected: 'kitten' },
  { id: 'calf', a: 'cow', b: 'big', c: 'small', expected: 'calf' },
];

/** a − b + c, and the nearest words to it, leaving out the three input words (as the classic word2vec demo does). */
export function analogy(x: Analogy) {
  const vector = add(sub(lookup(x.a)!.v, lookup(x.b)!.v), lookup(x.c)!.v);
  const top = neighbours(vector, TOP_K, [x.a, x.b, x.c]);
  return { vector, top, holds: top[0]?.word.word === x.expected };
}

// ── PCA ──────────────────────────────────────────────────────────────

export const project = (p: Pca, v: Vec): [number, number] => {
  const [x, y] = pcaProject(p, v);
  return [x, y];
};

export const MAP = pca(VOCAB.map((w) => w.v));
export const MAP_POINTS: readonly [number, number][] = VOCAB.map((w) => project(MAP, w.v));

/** A pair that sits close together on the 2-D map but points in clearly different directions in 8-D. */
export function misleadingPair(maxCos = 0.3): { a: Word; b: Word; dist2d: number; cos: number } {
  let best: { a: Word; b: Word; dist2d: number; cos: number } | null = null;
  for (let i = 0; i < VOCAB.length; i++) {
    for (let j = i + 1; j < VOCAB.length; j++) {
      const c = cosine(VOCAB[i].v, VOCAB[j].v);
      if (c > maxCos) continue;
      const [p, q] = [MAP_POINTS[i], MAP_POINTS[j]];
      const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
      if (!best || d < best.dist2d) best = { a: VOCAB[i], b: VOCAB[j], dist2d: d, cos: c };
    }
  }
  return best!;
}

// ── Keywords vs meaning ──────────────────────────────────────────────

/** Shared words ÷ all distinct words (Jaccard), over every token typed, known or not. */
export function keywordOverlap(a: string, b: string): { shared: string[]; score: number } {
  const [sa, sb] = [new Set(tokenize(a)), new Set(tokenize(b))];
  const shared = [...sa].filter((t) => sb.has(t));
  const all = new Set([...sa, ...sb]);
  return { shared, score: all.size ? shared.length / all.size : 0 };
}

export const DOCUMENTS: readonly string[] = [
  'my car needs a new tyre',
  'easy cake and cookie recipes',
  'how to fix a broken bicycle',
  'caring for a new puppy',
  'lion and tiger facts',
  'cheap bus and train travel',
  'kitten and cat health',
  'garage mechanic service prices',
];

export interface Ranked {
  doc: string;
  index: number;
  /** null when the document has no known word (it can't be ranked). */
  cos: number | null;
}

/** Every document scored against the query by cosine, best first: brute force over all of them. */
export function rankDocuments(query: readonly number[], docs: readonly string[] = DOCUMENTS): Ranked[] {
  return docs
    .map((doc, index) => {
      const p = phraseVector(doc);
      return { doc, index, cos: p.ok && norm(query) > 0 ? cosine(query, p.vector) : null };
    })
    .sort((x, y) => (y.cos ?? -Infinity) - (x.cos ?? -Infinity) || x.index - y.index);
}
