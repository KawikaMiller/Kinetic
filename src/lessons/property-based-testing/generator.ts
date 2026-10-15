/**
 * Seeded input generators. Case k of a run has its own random stream derived from
 * (seed, k), so any case can be replayed alone and a shrink never disturbs the next case.
 */
import { fmix32 } from '../../core/hash';
import { mulberry32 } from '../../core/random';

export const SEED_MAX = 2 ** 31 - 1;
export const DEFAULT_CASES = 100;
export const MAX_LENGTH = 20;
export const DEFAULT_MAX_LENGTH = 12;

export type RangeId = 'tiny' | 'hundred' | 'million' | 'edge';

/** A value distribution: uniform on [lo, hi], except that with probability `share` it draws from `edge` instead. */
export interface ValueDist {
  lo: number;
  hi: number;
  edge: readonly number[];
  share: number;
}

/** The values a bug-hunter reaches for first. All lie inside the edge range's [lo, hi]. */
export const EDGE_VALUES: readonly number[] = [0, 1, -1, 2, -2, 1_000_000, -1_000_000];
export const EDGE_SHARE = 0.7;

export const RANGES: readonly { id: RangeId; label: string; dist: ValueDist }[] = [
  { id: 'tiny', label: '−5..5', dist: { lo: -5, hi: 5, edge: [], share: 0 } },
  { id: 'hundred', label: '0..100', dist: { lo: 0, hi: 100, edge: [], share: 0 } },
  { id: 'million', label: '0..1,000,000', dist: { lo: 0, hi: 1_000_000, edge: [], share: 0 } },
  { id: 'edge', label: 'edge-biased', dist: { lo: -1_000_000, hi: 1_000_000, edge: EDGE_VALUES, share: EDGE_SHARE } },
];

export const distOf = (id: RangeId): ValueDist => RANGES.find((r) => r.id === id)!.dist;

export interface GenConfig {
  range: RangeId;
  /** Case lengths are uniform on 0..maxLength, unless `fixedLength` pins them. */
  maxLength: number;
  fixedLength?: number;
  seed: number;
}

/** Scene 4 opens on 8-value arrays from the widest range: the case where a repeat is a one-in-thousands event. */
export const OPENING_LENGTH = 8;
export const OPENING_GENERATOR: GenConfig = { range: 'million', maxLength: OPENING_LENGTH, fixedLength: OPENING_LENGTH, seed: 1 };

/** The random stream of case k. */
export const caseRng = (seed: number, k: number) => mulberry32(fmix32((seed ^ fmix32(k + 1)) >>> 0));

export function drawValue(dist: ValueDist, rnd: () => number): number {
  if (dist.edge.length > 0 && rnd() < dist.share) return dist.edge[Math.floor(rnd() * dist.edge.length)];
  return dist.lo + Math.floor(rnd() * (dist.hi - dist.lo + 1));
}

/** Input of case k (1-based). */
export function generate(config: GenConfig, k: number): number[] {
  const rnd = caseRng(config.seed, k);
  const length = config.fixedLength ?? Math.floor(rnd() * (config.maxLength + 1));
  const dist = distOf(config.range);
  return Array.from({ length }, () => drawValue(dist, rnd));
}

/**
 * Probability that `length` independent draws from `dist` are all different. Exact: split the
 * draws into those that land on an edge value and those that land elsewhere, and count the
 * ordered ways to pick distinct values in each group.
 */
export function distinctProbability(dist: ValueDist, length: number): number {
  const size = dist.hi - dist.lo + 1;
  const edges = dist.edge.length;
  if (length > size) return 0;
  const others = size - edges;
  const pOther = (1 - dist.share * (edges > 0 ? 1 : 0)) / size;
  const pEdge = edges > 0 ? dist.share / edges + pOther : 0;
  let total = 0;
  for (let j = 0; j <= Math.min(length, edges); j++) {
    let term = binomial(length, j);
    for (let i = 0; i < j; i++) term *= (edges - i) * pEdge;
    for (let i = 0; i < length - j; i++) term *= Math.max(0, others - i) * pOther;
    total += term;
  }
  return total;
}

function binomial(n: number, k: number): number {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

/** Probability that one case of this configuration contains a repeated value. */
export function repeatProbability(config: GenConfig): number {
  const dist = distOf(config.range);
  if (config.fixedLength !== undefined) return 1 - distinctProbability(dist, config.fixedLength);
  const lengths = config.maxLength + 1;
  let sum = 0;
  for (let l = 0; l <= config.maxLength; l++) sum += 1 - distinctProbability(dist, l);
  return sum / lengths;
}

/** Probability that at least one of `cases` independent cases repeats a value. */
export const repeatWithin = (config: GenConfig, cases: number): number => 1 - (1 - repeatProbability(config)) ** cases;
