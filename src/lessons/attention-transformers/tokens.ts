/**
 * Scenes 1 and 3: a six-token sentence with hand-built embeddings and hand-set projection weights.
 * Nothing here is learned: the numbers are lesson-authored so the attention patterns can be read
 * off. `attention` itself is core/nn's; the sinusoidal position code is the formula of Vaswani et al.
 */
import { attention, type AttentionMask } from '../../core/nn';
import { matMul } from '../../core/linalg';
import type { Mat } from '../../core/vec';

export const TOKENS = ['the', 'cat', 'sat', 'on', 'the', 'mat'] as const;
export const N = TOKENS.length;
export const EMBED_DIM = 4;

/** Hand-built, not learned: each row is one token's 4 numbers (the two "the" share a row). */
export const EMBEDDINGS: readonly (readonly number[])[] = [
  [0.9, 0.1, 0.0, 0.2],
  [0.1, 0.9, 0.3, 0.0],
  [0.0, 0.4, 0.9, 0.1],
  [0.3, 0.0, 0.2, 0.9],
  [0.9, 0.1, 0.0, 0.2],
  [0.1, 0.8, 0.0, 0.3],
];
export const EMBED_RANGE = { min: 0, max: 1.5, step: 0.1 } as const;

const identity = (n: number): Mat => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));

/** Hand-set projections for scene 1: queries and keys are the embedding doubled; values mix the dimensions in pairs. */
export const SCALE_QK = 2;
export const W_Q: Mat = identity(EMBED_DIM).map((row) => row.map((v) => v * SCALE_QK));
export const W_K: Mat = identity(EMBED_DIM).map((row) => row.map((v) => v * SCALE_QK));
export const W_V: Mat = [
  [1, 0, 0, 0.5],
  [0, 1, 0.5, 0],
  [0, 0.5, 1, 0],
  [0.5, 0, 0, 1],
];

export interface HeadSteps {
  Q: Mat;
  K: Mat;
  V: Mat;
  scores: Mat;
  weights: Mat;
  output: Mat;
}

/** One head by hand: project, score, softmax, mix. `embeddings` may have been edited. */
export function oneHead(embeddings: Mat, mask?: AttentionMask): HeadSteps {
  const [Q, K, V] = [matMul(embeddings, W_Q), matMul(embeddings, W_K), matMul(embeddings, W_V)];
  const { scores, weights, output } = attention(Q, K, V, { mask });
  return { Q, K, V, scores, weights, output };
}

// ── Scene 3: position, two heads, the mask ──────────────────────────────────

/** Width of a token vector in scene 3: two dimensions for position, four for the word. */
export const MODEL_DIM = 6;
const POSITION_DIMS = 2;

/** The sinusoidal position code: PE(pos, 2i) = sin(pos / 10000^(2i/d)), PE(pos, 2i + 1) = cos(...). */
export function positionCode(pos: number, d: number): number[] {
  return Array.from({ length: d }, (_, k) => {
    const i = Math.floor(k / 2);
    const angle = pos / 10000 ** ((2 * i) / d);
    return k % 2 === 0 ? Math.sin(angle) : Math.cos(angle);
  });
}

/** Token vectors for scene 3: the four hand-built numbers sit in dimensions 2..5, dimensions 0..1 start at zero. */
export const wordVectors = (embeddings: Mat): Mat => embeddings.map((row) => [0, 0, ...row]);

/**
 * Add the position code to each row, by the row's position: the two-number code (d = 2) goes into the two
 * dimensions reserved for it, so it never lands on top of a word's numbers.
 */
export function withPositions(x: Mat): Mat {
  return x.map((row, r) => {
    const pe = positionCode(r, POSITION_DIMS);
    return row.map((v, k) => (k < POSITION_DIMS ? v + pe[k] : v));
  });
}

export const HEAD_A_SHARPNESS = 8;
export const HEAD_B_SHARPNESS = 8;

/** Head A reads only the position dimensions: its query is the key's code turned back by one step, so token i looks at token i - 1. */
export function headAWeights(): { wq: Mat; wk: Mat; wv: Mat } {
  const [c, s] = [Math.cos(1), Math.sin(1)];
  const zero = (rows: number): Mat => Array.from({ length: rows }, () => [0, 0]);
  const wq: Mat = [[c * HEAD_A_SHARPNESS, s * HEAD_A_SHARPNESS], [-s * HEAD_A_SHARPNESS, c * HEAD_A_SHARPNESS], ...zero(MODEL_DIM - POSITION_DIMS)];
  const wk: Mat = [[1, 0], [0, 1], ...zero(MODEL_DIM - POSITION_DIMS)];
  const wv: Mat = [[0, 0], [0, 0], [1, 0], [0, 1], [0, 0], [0, 0]];
  return { wq, wk, wv };
}

/** Head B reads only the word dimensions: it looks at tokens whose word vector points the same way, like the other "the". */
export function headBWeights(): { wq: Mat; wk: Mat; wv: Mat } {
  const word = (scale: number): Mat => [[0, 0, 0, 0], [0, 0, 0, 0], ...identity(EMBED_DIM).map((row) => row.map((v) => v * scale))];
  const wv: Mat = [[0, 0], [0, 0], [0, 0], [0, 0], [1, 0], [0, 1]];
  return { wq: word(HEAD_B_SHARPNESS), wk: word(1), wv };
}

export interface TwoHeads {
  /** Inputs actually fed to the heads (word vectors, with or without the position code). */
  x: Mat;
  a: HeadSteps;
  b: HeadSteps;
  /** Both heads' outputs side by side: 4 numbers per token. */
  concat: Mat;
}

function runHead(x: Mat, { wq, wk, wv }: { wq: Mat; wk: Mat; wv: Mat }, mask?: AttentionMask): HeadSteps {
  const [Q, K, V] = [matMul(x, wq), matMul(x, wk), matMul(x, wv)];
  const { scores, weights, output } = attention(Q, K, V, { mask });
  return { Q, K, V, scores, weights, output };
}

/**
 * The scene-3 layer: head A (previous token), head B (same word), outputs concatenated.
 * `order` lists which original token sits in each position (the identity unless shuffled), and
 * position codes follow positions, not tokens.
 */
export function twoHeads(embeddings: Mat, o: { positions: boolean; causal: boolean; order?: readonly number[] }): TwoHeads {
  const order = o.order ?? embeddings.map((_, i) => i);
  const words = wordVectors(order.map((i) => embeddings[i]));
  const x = o.positions ? withPositions(words) : words;
  const mask: AttentionMask | undefined = o.causal ? 'causal' : undefined;
  const a = runHead(x, headAWeights(), mask);
  const b = runHead(x, headBWeights(), mask);
  return { x, a, b, concat: a.output.map((row, i) => [...row, ...b.output[i]]) };
}

/** A seeded permutation of 0..n-1 that is never the identity (Fisher-Yates from a seed, retried by offset). */
export function shuffled(n: number, seed: number): number[] {
  let s = seed >>> 0;
  const next = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
  for (;;) {
    const order = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    if (order.some((v, i) => v !== i)) return order;
  }
}

export interface ShuffleRow {
  /** The word at this position after shuffling. */
  token: string;
  /** Does this token's output equal the output it had before the shuffle? */
  same: boolean;
}

/**
 * The shuffle test: feed the tokens in a different order. If attention alone knew nothing about order,
 * each token's output would be the same row as before (just in a new place). Compared token by token.
 */
export function shuffleTest(embeddings: Mat, o: { positions: boolean; causal: boolean; twoHeads: boolean }, order: readonly number[]): ShuffleRow[] {
  const layer = { positions: o.positions, causal: o.causal };
  const outputs = (t: TwoHeads) => (o.twoHeads ? t.concat : t.b.output);
  const before = outputs(twoHeads(embeddings, layer));
  const after = outputs(twoHeads(embeddings, { ...layer, order }));
  return order.map((original, position) => ({
    token: TOKENS[original],
    same: after[position].every((v, k) => Math.abs(v - before[original][k]) < 1e-9),
  }));
}
