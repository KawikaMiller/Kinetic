import { attention, createAttentionHead } from '../../core/nn';
import { mulberry32 } from '../../core/random';
import { matMul } from '../../core/vec';

/**
 * The one exact claim of llm-serving: decoding with a KV cache equals recomputing attention from scratch.
 * A tiny seeded single-head causal attention decodes token by token two ways. This page does not run a language model.
 */

export const TOKENS = 6;
export const INPUT_DIM = 4;
export const KEY_DIM = 4;
export const VALUE_DIM = 4;
export const EQUAL_TOLERANCE = 1e-9;

export type Row = readonly number[];

export interface DecodeStep {
  step: number;
  /** Output row of the new token under the full recomputation. */
  recomputed: Row;
  /** Output row of the new token under the cache. */
  cached: Row;
  /** Largest absolute difference between the two rows. */
  diff: number;
  /** Key/value projections computed so far by each method. */
  recomputeProjections: number;
  cacheProjections: number;
}

export interface DecodeRun {
  steps: DecodeStep[];
  maxDiff: number;
  /** The first step (1-based) whose difference exceeds the tolerance, or null. */
  firstDivergence: number | null;
}

export interface HeadSetup {
  inputs: number[][];
  wq: number[][];
  wk: number[][];
  wv: number[][];
}

/** Seeded token vectors and the head's three projection matrices. */
export function makeSetup(seed: number, tokens = TOKENS): HeadSetup {
  const rnd = mulberry32(seed);
  const inputs = Array.from({ length: tokens }, () => Array.from({ length: INPUT_DIM }, () => rnd() * 2 - 1));
  const head = createAttentionHead({ inputs: INPUT_DIM, keyDim: KEY_DIM, valueDim: VALUE_DIM, seed });
  return { inputs, ...head.matrices() };
}

const project = (x: Row, w: number[][]): number[] => matMul([x as number[]], w)[0];

const maxAbsDiff = (a: Row, b: Row): number => a.reduce((worst, v, i) => Math.max(worst, Math.abs(v - b[i])), 0);

/**
 * Decode every token of the setup. `recompute` projects queries, keys and values of the whole prefix at every step and runs masked attention on it;
 * the cache projects only the new token's and appends. With `forgetValues` the cache appends each decoded
 * token's key but not its value vector (the first token is stored by the prompt pass), and a never-written value slot reads as zeros.
 */
export function decode(setup: HeadSetup, { forgetValues = false }: { forgetValues?: boolean } = {}): DecodeRun {
  const { inputs, wq, wk, wv } = setup;
  const cachedKeys: number[][] = [];
  const cachedValues: number[][] = [];
  const steps: DecodeStep[] = [];
  let recomputeProjections = 0;
  let cacheProjections = 0;
  for (let t = 0; t < inputs.length; t += 1) {
    const prefix = inputs.slice(0, t + 1);
    recomputeProjections += prefix.length;
    const recomputed = attention(matMul(prefix, wq), matMul(prefix, wk), matMul(prefix, wv), { mask: 'causal' }).output[t];

    cacheProjections += 1;
    cachedKeys.push(project(inputs[t], wk));
    if (!forgetValues || t === 0) cachedValues.push(project(inputs[t], wv));
    const values = cachedKeys.map((_, i) => cachedValues[i] ?? new Array<number>(VALUE_DIM).fill(0));
    const cached = attention([project(inputs[t], wq)], cachedKeys, values).output[0];

    steps.push({ step: t + 1, recomputed, cached, diff: maxAbsDiff(recomputed, cached), recomputeProjections, cacheProjections });
  }
  const maxDiff = steps.reduce((worst, s) => Math.max(worst, s.diff), 0);
  const first = steps.find((s) => s.diff > EQUAL_TOLERANCE);
  return { steps, maxDiff, firstDivergence: first ? first.step : null };
}

/** Projections for n tokens: recomputing every prefix is n(n + 1)/2, the cache is n. */
export const recomputeCount = (n: number): number => (n * (n + 1)) / 2;
export const cacheCount = (n: number): number => n;
