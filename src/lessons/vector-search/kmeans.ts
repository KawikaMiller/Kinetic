/**
 * vector-search: a small seeded k-means (Lloyd's algorithm) for the IVF index. Kept local on purpose: the lesson that teaches
 * k-means keeps its own, and no shared one exists yet (a Phase 2 request). Pure.
 */
import { mulberry32 } from '../../core/random';
import { sqDist, type Point } from './data';

export const MAX_ITERATIONS = 15;

export interface Clustering {
  centroids: Point[];
  /** Cell of every point. */
  assign: number[];
  iterations: number;
  /** Distance computations spent building it. */
  computations: number;
}

/** Start from `k` distinct points chosen by a seeded shuffle, then alternate assigning and averaging until nothing moves. */
export function kmeans(points: readonly Point[], k: number, seed: number, maxIterations = MAX_ITERATIONS): Clustering {
  const rnd = mulberry32(seed);
  const order = points.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const cells = Math.min(k, points.length);
  let centroids: Point[] = order.slice(0, cells).map((i) => points[i]);
  let assign = new Array<number>(points.length).fill(-1);
  let computations = 0;
  const nearest = (p: Point): number => {
    let best = 0;
    let bestD = Infinity;
    centroids.forEach((c, i) => {
      const d = sqDist(p, c);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  };
  let iterations = 0;
  let settled = false;
  while (!settled && iterations < maxIterations) {
    iterations++;
    const next = points.map(nearest);
    computations += points.length * centroids.length;
    settled = next.every((c, i) => c === assign[i]);
    assign = next;
    if (!settled) {
      centroids = centroids.map((old, i) => {
        const members = points.filter((_, p) => assign[p] === i);
        return members.length === 0 ? old : old.map((_, dim) => members.reduce((s, m) => s + m[dim], 0) / members.length);
      });
    }
  }
  if (!settled) {
    assign = points.map(nearest);
    computations += points.length * centroids.length;
  }
  return { centroids, assign, iterations, computations };
}
