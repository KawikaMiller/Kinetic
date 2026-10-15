/**
 * vector-search, scene 4: what more dimensions do to "nearest". Everything is computed from seeded uniform data, never drawn. Pure.
 */
import { bruteForce, dist, recallAt, seededQueries, uniformPoints } from './data';
import { buildIvf, searchIvf } from './ivf';

export const DIMS = [2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64, 96, 128, 192, 256] as const;
export const CURSE_POINTS = 500;
export const CURSE_QUERIES = 20;
export const CURSE_NLIST = 16;
/** A quarter of the cells are probed. */
export const CURSE_NPROBE = CURSE_NLIST / 4;
export const CURSE_K = 10;
export const MIN_DIM = DIMS[0];
export const MAX_DIM = DIMS[DIMS.length - 1];

/** (farthest - nearest) / nearest distance from a random query, averaged over CURSE_QUERIES queries. It falls toward 0 as d grows. */
export function concentrationRatio(seed: number, d: number): number {
  const points = uniformPoints(seed, CURSE_POINTS, d);
  const queries = seededQueries(seed + 1, CURSE_QUERIES, d);
  const ratios = queries.map((q) => {
    const ds = points.map((p) => dist(p, q));
    const near = Math.min(...ds);
    return (Math.max(...ds) - near) / near;
  });
  return ratios.reduce((a, b) => a + b, 0) / ratios.length;
}

/** recall@10 of IVF with CURSE_NLIST cells and a quarter of them probed, on the same seeded data in d dimensions, averaged over the queries. */
export function ivfRecallAt(seed: number, d: number): number {
  const points = uniformPoints(seed, CURSE_POINTS, d);
  const ivf = buildIvf(points, CURSE_NLIST, seed);
  const queries = seededQueries(seed + 1, CURSE_QUERIES, d);
  const recalls = queries.map((q) => recallAt(bruteForce(points, q, CURSE_K).neighbours, searchIvf(ivf, q, CURSE_K, CURSE_NPROBE).neighbours));
  return recalls.reduce((a, b) => a + b, 0) / recalls.length;
}

export interface CurseRow {
  d: number;
  ratio: number;
  recall: number;
}

const cache = new Map<number, CurseRow[]>();

/** Both readouts for every dimension in DIMS, computed once per seed. */
export function curseRows(seed: number): CurseRow[] {
  let rows = cache.get(seed);
  if (!rows) {
    rows = DIMS.map((d) => ({ d, ratio: concentrationRatio(seed, d), recall: ivfRecallAt(seed, d) }));
    cache.set(seed, rows);
  }
  return rows;
}
