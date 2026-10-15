/**
 * vector-search, scene 5: brute force, IVF and HNSW side by side on one dataset, from real runs over seeded queries. Pure.
 */
import { MAX_K, bruteForce, recallAt, seededQueries, DOMAIN, type Point } from './data';
import { buildHnsw, extraNumbers as hnswNumbers, searchHnsw } from './hnsw';
import { buildIvf, extraNumbers as ivfNumbers, searchIvf } from './ivf';

export const COMPARE_QUERIES = 60;

export interface Settings {
  nlist: number;
  nprobe: number;
  m: number;
  efConstruction: number;
  efSearch: number;
  seed: number;
}

export interface CompareRow {
  name: 'Brute force' | 'IVF' | 'HNSW';
  /** Mean recall@10 over the queries. */
  recall: number;
  /** Mean distance computations per query. */
  computations: number;
  /** Numbers stored beyond the points themselves. */
  extra: number;
  /** Distance computations spent building. */
  build: number;
}

const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(xs.length, 1);

export function compareIndexes(points: readonly Point[], s: Settings): CompareRow[] {
  const queries = seededQueries(s.seed + 7, COMPARE_QUERIES, 2, DOMAIN);
  const truth = queries.map((q) => bruteForce(points, q, MAX_K).neighbours);
  const ivf = buildIvf(points, s.nlist, s.seed);
  const hnsw = buildHnsw(points, s.m, s.efConstruction, s.seed);
  const ivfRuns = queries.map((q) => searchIvf(ivf, q, MAX_K, s.nprobe));
  const hnswRuns = queries.map((q) => searchHnsw(hnsw, q, MAX_K, s.efSearch));
  return [
    { name: 'Brute force', recall: 1, computations: points.length, extra: 0, build: 0 },
    { name: 'IVF', recall: mean(ivfRuns.map((r, i) => recallAt(truth[i], r.neighbours))), computations: mean(ivfRuns.map((r) => r.computations)), extra: ivfNumbers(ivf), build: ivf.computations },
    { name: 'HNSW', recall: mean(hnswRuns.map((r, i) => recallAt(truth[i], r.neighbours))), computations: mean(hnswRuns.map((r) => r.computations)), extra: hnswNumbers(hnsw), build: hnsw.computations },
  ];
}
