/**
 * Scene 5: what long context costs, all computed from the numbers typed. The constants are illustrative.
 * Attention weights: n^2 per head per layer. Score cost: 2 n^2 d floating-point operations for Q K^T, which is n^2 d multiply-adds (a count of
 * operations, not a time). Parameters of the blocks: about 12 L d^2 (attention 4 d^2 plus a feed-forward
 * at four times the width, 8 d^2, per layer; embeddings and biases ignored).
 */
import { power } from '../../core/format';

export interface CostInput {
  /** Sequence length. */
  n: number;
  /** Model width. */
  d: number;
  heads: number;
  layers: number;
}

export const COST_DEFAULT: CostInput = { n: 4096, d: 1024, heads: 16, layers: 24 };
export const LIMITS = {
  n: { min: 1, max: 1_000_000 },
  d: { min: 1, max: 100_000 },
  heads: { min: 1, max: 256 },
  layers: { min: 1, max: 200 },
} as const;
/** The attention matrix is drawn up to this size and no further. */
export const DRAW_LIMIT = 64;
/** From memory (verify): the feed-forward width is commonly four times the model width. */
export const FEED_FORWARD_RATIO = 4;

export interface Costs {
  /** Attention weights in one head of one layer. */
  weightsPerHead: number;
  /** Attention weights over every head and layer. */
  weightsTotal: number;
  /** Floating-point operations for Q K^T in one layer, 2 n^2 d: n^2 d multiply-adds, one multiply and one add each (all heads together, head width d / heads). */
  scoreFlops: number;
  /** Block parameters, about 12 L d^2. */
  parameters: number;
}

export function costs({ n, d, heads, layers }: CostInput): Costs {
  const weightsPerHead = n * n;
  return {
    weightsPerHead,
    weightsTotal: weightsPerHead * heads * layers,
    scoreFlops: 2 * n * n * d,
    parameters: (4 + 2 * FEED_FORWARD_RATIO) * layers * d * d,
  };
}

/** A count in full up to a billion, then as m x 10^e with 3 significant figures: 1,000,000,000,000 reads 1 x 10¹². Never "Infinity". */
export function count(x: number): string {
  if (!Number.isFinite(x)) return 'beyond a double';
  if (x < 1e9) return Math.round(x).toLocaleString('en-US');
  const exponent = Math.floor(Math.log10(x));
  const mantissa = Number((x / 10 ** exponent).toPrecision(3));
  return `${mantissa} × ${power(exponent, 10)}`;
}

/** The two growth curves of the log-log plot: quadratic attention against linear parts, as functions of n. */
export const quadratic = (n: number): number => n * n;
export const linear = (n: number): number => n;
