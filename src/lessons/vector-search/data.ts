/**
 * vector-search: the datasets and the exact search everything else is judged against. Pure.
 *
 * Distances are Euclidean unless a function says otherwise. Recall is judged on distances, not ids, so a tie can never fail it: a
 * returned point is a true neighbour when it is no farther than the k-th true neighbour.
 */
import { blobs } from '../../core/fixtures/datasets';
import { sqDist } from '../../core/kmeans';
import { mulberry32 } from '../../core/random';

export type Point = readonly number[];

export const DOMAIN = 10;
export const POINTS_2D = 400;
export const CLUSTERS = 5;
export const MAX_K = 10;
export const DEFAULT_K = 5;
export const DEFAULT_SEED = 4;
/** A query where the greedy walk with a short candidate list gets stuck on the default index (the test proves it). */
export const DEFAULT_QUERY: Point = [8.2, 5.4];
const CENTERS = [[2, 2], [8, 2], [5, 5], [2, 8], [8, 8]] as const;
const SPREAD = 0.9;

const clamp = (v: number) => Math.min(DOMAIN, Math.max(0, v));

/**
 * Where a drag of the query handle leaves the stored query (which IVF, HNSW and the trade table all search with). As drawn, the handle
 * is the query. Scaled to unit length, the handle is drawn on the unit circle's scale, so the drag can only say which direction the query
 * points: the stored query keeps its length (capped so it stays inside the domain) and turns to that direction.
 */
export function dragQuery(stored: Point, dragged: Point, unit: boolean): Point {
  const x = clamp(dragged[0]);
  const y = clamp(dragged[1]);
  if (!unit) return [x, y];
  const reach = Math.hypot(x, y);
  if (reach === 0) return stored;
  const dir = [x / reach, y / reach];
  const length = Math.min(Math.hypot(stored[0], stored[1]), DOMAIN / Math.max(dir[0], dir[1]));
  return [dir[0] * length, dir[1] * length];
}

/** 400 points in 5 blobs inside [0, 10]^2. */
export const clusteredPoints = (seed: number): Point[] =>
  blobs({ seed, centers: CENTERS, n: POINTS_2D / CLUSTERS, spread: SPREAD }).map((p) => [clamp(p.x), clamp(p.y)]);

/** `n` points drawn uniformly from the unit cube in `d` dimensions. */
export function uniformPoints(seed: number, n: number, d: number): Point[] {
  const rnd = mulberry32(seed);
  return Array.from({ length: n }, () => Array.from({ length: d }, () => rnd()));
}

export const dist = (a: Point, b: Point): number => Math.sqrt(sqDist(a, b));

export interface Neighbour {
  id: number;
  d: number;
}

export interface Found {
  /** The k nearest, nearest first. */
  neighbours: Neighbour[];
  /** Distance computations made to find them. */
  computations: number;
}

/** Brute force: the distance to every point, sorted. N computations. */
export function bruteForce(points: readonly Point[], q: Point, k: number): Found {
  const all = points.map((p, id) => ({ id, d: dist(p, q) })).sort((a, b) => a.d - b.d || a.id - b.id);
  return { neighbours: all.slice(0, Math.min(k, points.length)), computations: points.length };
}

const TIE = 1e-12;

/** How many of the returned points are true neighbours: no farther than the k-th true one. */
export function hits(truth: readonly Neighbour[], returned: readonly Neighbour[]): number {
  if (truth.length === 0) return 0;
  const limit = truth[truth.length - 1].d + TIE;
  return returned.slice(0, truth.length).filter((r) => r.d <= limit).length;
}

/** recall@k: the share of the true k nearest that the search returned. */
export const recallAt = (truth: readonly Neighbour[], returned: readonly Neighbour[]): number => (truth.length === 0 ? 1 : hits(truth, returned) / truth.length);

/** The true neighbours the search missed. */
export const missed = (truth: readonly Neighbour[], returned: readonly Neighbour[]): Neighbour[] => {
  const limit = (truth.at(-1)?.d ?? 0) + TIE;
  const got = returned.filter((r) => r.d <= limit).map((r) => r.id);
  return truth.filter((t) => !got.includes(t.id));
};

/** A seeded set of `count` query points inside the same domain as the data. */
export function seededQueries(seed: number, count: number, dims: number, scale = 1): Point[] {
  const rnd = mulberry32(seed);
  return Array.from({ length: count }, () => Array.from({ length: dims }, () => rnd() * scale));
}
