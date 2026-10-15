/**
 * vector-search, scene 5: brute force, IVF and HNSW side by side on one dataset, from real runs over seeded queries. Pure.
 */
import { bruteForce, recallAt, seededQueries, DOMAIN, type Neighbour, type Point } from './data';
import { buildHnsw, extraNumbers as hnswNumbers, reachableFromStart, searchHnsw, type Hnsw } from './hnsw';
import { buildIvf, extraNumbers as ivfNumbers, searchIvf } from './ivf';

/** The seeded queries every recall in this lesson's tables and sweeps is a mean over, so the HNSW sweep and the trade table can agree. */
export const EVAL_QUERIES = 40;
export const evalQueries = (seed: number): Point[] => seededQueries(seed + 3, EVAL_QUERIES, 2, DOMAIN);

export interface Settings {
  k: number;
  nlist: number;
  nprobe: number;
  m: number;
  efConstruction: number;
  efSearch: number;
  seed: number;
}

export interface CompareRow {
  name: 'Brute force' | 'IVF' | 'HNSW';
  /** Mean recall@k over the queries. */
  recall: number;
  /** Mean distance computations per query. */
  computations: number;
  /** Numbers stored beyond the points themselves. */
  extra: number;
  /** Distance computations spent building. */
  build: number;
  /** HNSW only: the mean share of points a layer-0 search can reach from where it starts (the rest no efSearch can find). */
  reachable?: number;
}

const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(xs.length, 1);

/** One efSearch of the HNSW sweep: mean computations and mean recall@k over the evaluation queries. The scene's curve and the table row both come from here. */
export function hnswMeanAt(h: Hnsw, queries: readonly Point[], truths: readonly Neighbour[][], k: number, efSearch: number): { computations: number; recall: number; reachable: number } {
  const runs = queries.map((q) => searchHnsw(h, q, k, efSearch));
  return {
    computations: mean(runs.map((r) => r.computations)),
    recall: mean(runs.map((r, i) => recallAt(truths[i], r.neighbours))),
    reachable: mean(runs.map((r) => reachableFromStart(h, r.start) / h.points.length)),
  };
}

export function compareIndexes(points: readonly Point[], s: Settings): CompareRow[] {
  const queries = evalQueries(s.seed);
  const truth = queries.map((q) => bruteForce(points, q, s.k).neighbours);
  const ivf = buildIvf(points, s.nlist, s.seed);
  const hnsw = buildHnsw(points, s.m, s.efConstruction, s.seed);
  const ivfRuns = queries.map((q) => searchIvf(ivf, q, s.k, s.nprobe));
  const hnswRow = hnswMeanAt(hnsw, queries, truth, s.k, s.efSearch);
  return [
    { name: 'Brute force', recall: 1, computations: points.length, extra: 0, build: 0 },
    { name: 'IVF', recall: mean(ivfRuns.map((r, i) => recallAt(truth[i], r.neighbours))), computations: mean(ivfRuns.map((r) => r.computations)), extra: ivfNumbers(ivf), build: ivf.computations },
    { name: 'HNSW', recall: hnswRow.recall, computations: hnswRow.computations, extra: hnswNumbers(hnsw), build: hnsw.computations, reachable: hnswRow.reachable },
  ];
}
