import { mulberry32 } from '../../core/random';
import { buildKd, knn } from './kdtree';
import type { Pt } from './data';

export const HD_SEED = 11;
export const HD_POINTS = 2000;
export const HD_QUERIES = 60;
export const HD_MIN_DIM = 2;
export const HD_MAX_DIM = 16;

export const uniformPoints = (seed: number, n: number, dims: number): Pt[] => {
  const rnd = mulberry32(seed);
  return Array.from({ length: n }, () => Array.from({ length: dims }, () => rnd()));
};

export interface DimRun {
  dims: number;
  /** Average share of the tree's nodes a 1-nearest-neighbour search visited, 0 to 1. */
  fraction: number;
}

/** Real k-d searches on uniform random points in `dims` dimensions; the share of nodes visited is measured, not drawn. */
export function visitedFraction(dims: number, seed = HD_SEED, n = HD_POINTS, queries = HD_QUERIES): DimRun {
  const tree = buildKd(uniformPoints(seed, n, dims), dims);
  const probe = uniformPoints(seed + 1, queries, dims);
  const total = probe.reduce((s, q) => s + knn(tree, q, 1).visited.length, 0);
  return { dims, fraction: total / queries / n };
}

let cache: DimRun[] | null = null;
/** The curve for every dimension from HD_MIN_DIM to HD_MAX_DIM, computed once. */
export function dimensionCurve(): DimRun[] {
  cache ??= Array.from({ length: HD_MAX_DIM - HD_MIN_DIM + 1 }, (_, i) => visitedFraction(HD_MIN_DIM + i));
  return cache;
}
