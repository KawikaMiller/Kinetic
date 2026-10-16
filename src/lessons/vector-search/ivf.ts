/**
 * vector-search, scene 2: an IVF index. K-means cuts the points into `nlist` cells; a query finds the `nprobe` nearest cells by their
 * centroids and scans only the points inside them. Pure.
 */
import { initShuffled, kmeans, type Clustering } from '../../core/kmeans';
import { mulberry32 } from '../../core/random';
import { dist, type Found, type Neighbour, type Point } from './data';

/** Lloyd passes the index build is allowed; a build that has not settled by then is finished with one more assignment. */
export const KMEANS_MAX_ITERATIONS = 15;

export const MIN_NLIST = 4;
export const MAX_NLIST = 32;
export const DEFAULT_NLIST = 8;
/** One cell: the default query sits near a border, so a miss shows from the start (the test proves it). */
export const DEFAULT_NPROBE = 1;

export interface Ivf extends Clustering<Point> {
  points: readonly Point[];
  /** Point ids in each cell. */
  members: number[][];
}

export function buildIvf(points: readonly Point[], nlist: number, seed: number): Ivf {
  const c = kmeans(points, initShuffled(points, nlist, mulberry32(seed)), { maxIterations: KMEANS_MAX_ITERATIONS, empty: 'keep' });
  const members = c.centroids.map((_, cell) => c.assign.flatMap((a, id) => (a === cell ? [id] : [])));
  return { ...c, points, members };
}

export interface IvfResult extends Found {
  /** The cells scanned, nearest centroid first. */
  cells: number[];
  /** Points whose distance was computed (the members of the probed cells). */
  scanned: number[];
}

/** Search: rank the centroids (nlist computations), scan the members of the nearest `nprobe` cells, keep the k nearest. */
export function searchIvf(ivf: Ivf, q: Point, k: number, nprobe: number): IvfResult {
  const probe = Math.min(Math.max(1, nprobe), ivf.centroids.length);
  const cells = ivf.centroids.map((c, cell) => ({ cell, d: dist(c, q) })).sort((a, b) => a.d - b.d || a.cell - b.cell).slice(0, probe).map((x) => x.cell);
  const scanned = cells.flatMap((c) => ivf.members[c]);
  const neighbours: Neighbour[] = scanned.map((id) => ({ id, d: dist(ivf.points[id], q) })).sort((a, b) => a.d - b.d || a.id - b.id).slice(0, k);
  return { neighbours, computations: ivf.centroids.length + scanned.length, cells, scanned };
}

/** Numbers the index stores beyond the points: the centroids' coordinates and one cell id per point. */
export const extraNumbers = (ivf: Ivf): number => ivf.centroids.length * (ivf.centroids[0]?.length ?? 0) + ivf.points.length;
