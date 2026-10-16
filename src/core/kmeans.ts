/**
 * Seeded k-means (Lloyd's algorithm) on points of any dimension, shared by clustering-kmeans (the
 * lesson that teaches it, which records every half-step) and vector-search (the IVF index, which
 * only wants the result and what it cost). Pure: a seeded `Rnd` in, the same run out.
 *
 * `lloydPasses` is the one loop. Each pass assigns every point to its nearest centroid, then, if
 * anything moved, recomputes the centroids; `kmeans` runs it to the end and reports the iteration
 * and distance-computation counts, and a lesson that animates it reads the passes one by one.
 */
import type { Rnd } from './random';
import type { Vec } from './vec';

/** Squared Euclidean distance (no square root: the order is the same and it is cheaper). */
export function sqDist(a: Vec, b: Vec): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return sum;
}

/** Index of the nearest centroid; a tie goes to the lower index. */
export function nearest(p: Vec, centroids: readonly Vec[]): number {
  let best = 0;
  let bestD = Infinity;
  centroids.forEach((c, j) => {
    const d = sqDist(p, c);
    if (d < bestD) {
      bestD = d;
      best = j;
    }
  });
  return best;
}

export const assignAll = (points: readonly Vec[], centroids: readonly Vec[]): number[] => points.map((p) => nearest(p, centroids));

/** Sum of squared distances from each point to the centroid of its cluster. */
export const inertia = (points: readonly Vec[], centroids: readonly Vec[], assign: readonly number[]): number =>
  points.reduce((sum, p, i) => sum + sqDist(p, centroids[assign[i]]), 0);

// ── Starts ───────────────────────────────────────────────────────────

/** Forgy: k distinct points picked uniformly at random (a partial forward shuffle). */
export function initRandom<P extends Vec>(points: readonly P[], k: number, rnd: Rnd): P[] {
  const idx = points.map((_, i) => i);
  for (let i = 0; i < k; i++) {
    const j = i + Math.floor(rnd() * (idx.length - i));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx.slice(0, k).map((i) => points[i]);
}

/**
 * The first `min(k, n)` points of a full seeded shuffle (Fisher-Yates from the end): the start the
 * IVF index has always used, kept as it is so its cells stay put.
 */
export function initShuffled<P extends Vec>(points: readonly P[], k: number, rnd: Rnd): P[] {
  const order = points.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order.slice(0, Math.min(k, points.length)).map((i) => points[i]);
}

/**
 * k-means++: the first centre uniformly at random, then each next one with probability
 * proportional to D², its squared distance to the nearest centre chosen so far. If every
 * remaining D² is 0 (fewer distinct points than k), it falls back to a uniform pick.
 */
export function initPlusPlus<P extends Vec>(points: readonly P[], k: number, rnd: Rnd): P[] {
  const centres: P[] = [points[Math.floor(rnd() * points.length)]];
  while (centres.length < k) {
    const d2 = points.map((p) => Math.min(...centres.map((c) => sqDist(p, c))));
    const total = d2.reduce((s, v) => s + v, 0);
    if (total === 0) {
      centres.push(points[Math.floor(rnd() * points.length)]);
      continue;
    }
    let r = rnd() * total;
    let pick = d2.length - 1;
    for (let i = 0; i < d2.length; i++) {
      r -= d2[i];
      if (r < 0) {
        pick = i;
        break;
      }
    }
    centres.push(points[pick]);
  }
  return centres;
}

// ── Lloyd's algorithm ────────────────────────────────────────────────

/** What happens to a cluster nobody joined: it stays where it was, or is reseeded on the point farthest from its own centre. */
export type EmptyCluster = 'keep' | 'reseed';

export interface Reseed {
  cluster: number;
  point: number;
}

export interface CentroidUpdate<P extends Vec> {
  centroids: P[];
  reseeded: Reseed[];
}

/** The update half-step: each centroid moves to the mean of its points; an empty one follows `empty`. */
export function updateCentroids<P extends Vec>(
  points: readonly P[],
  assign: readonly number[],
  centroids: readonly P[],
  empty: EmptyCluster = 'reseed',
): CentroidUpdate<P> {
  const dims = centroids[0]?.length ?? 0;
  const sums = centroids.map(() => new Array<number>(dims).fill(0));
  const counts = centroids.map(() => 0);
  points.forEach((p, i) => {
    counts[assign[i]]++;
    for (let d = 0; d < dims; d++) sums[assign[i]][d] += p[d];
  });
  // The mean of points of one length has that length, so a tuple type survives.
  const next = sums.map((s, j) => (counts[j] ? s.map((v) => v / counts[j]) : centroids[j])) as P[];
  const reseeded: Reseed[] = [];
  if (empty === 'reseed') {
    const used = new Set<number>();
    counts.forEach((n, j) => {
      if (n) return;
      let far = -1;
      points.forEach((p, i) => {
        if (used.has(i)) return;
        if (far < 0 || sqDist(p, next[assign[i]]) > sqDist(points[far], next[assign[far]])) far = i;
      });
      if (far < 0) return;
      used.add(far);
      next[j] = points[far];
      reseeded.push({ cluster: j, point: far });
    });
  }
  return { centroids: next, reseeded };
}

export const DEFAULT_MAX_ITERATIONS = 100;

export interface LloydOptions {
  maxIterations?: number;
  empty?: EmptyCluster;
}

export interface LloydPass<P extends Vec> {
  /** 1-based pass number. */
  iteration: number;
  /** The centroids this pass assigned against. */
  centroids: P[];
  assign: number[];
  /** Points whose cluster differs from the previous pass (all of them on the first). */
  changed: number;
  /** True when nothing moved: the run is over and `update` is null. */
  settled: boolean;
  /** The next centroids, when something moved. */
  update: CentroidUpdate<P> | null;
}

/** Runs Lloyd's algorithm from `start`, one assign pass at a time, until a pass changes nothing or `maxIterations` passes ran. */
export function* lloydPasses<P extends Vec>(
  points: readonly P[],
  start: readonly P[],
  { maxIterations = DEFAULT_MAX_ITERATIONS, empty = 'reseed' }: LloydOptions = {},
): Generator<LloydPass<P>> {
  let centroids = [...start];
  let previous: number[] | null = null;
  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    const assign = assignAll(points, centroids);
    const changed = previous ? assign.filter((c, i) => c !== previous![i]).length : points.length;
    const settled = changed === 0;
    const update = settled ? null : updateCentroids(points, assign, centroids, empty);
    yield { iteration, centroids, assign, changed, settled, update };
    if (!update) return;
    centroids = update.centroids;
    previous = assign;
  }
}

export interface Clustering<P extends Vec> {
  centroids: P[];
  /** Cell of every point. */
  assign: number[];
  /** Assign passes run, the final one that found nothing moving included. */
  iterations: number;
  /** Distance computations spent building it: points x centroids per assign pass. */
  computations: number;
}

/**
 * Lloyd's algorithm to the end. A run that hits `maxIterations` unsettled is finished with one
 * more assignment against its last centroids (and that pass is counted), so `assign` always agrees
 * with `centroids`.
 */
export function kmeans<P extends Vec>(points: readonly P[], start: readonly P[], { maxIterations = DEFAULT_MAX_ITERATIONS, empty = 'keep' }: LloydOptions = {}): Clustering<P> {
  let centroids = [...start];
  let assign: number[] = [];
  let iterations = 0;
  let settled = false;
  for (const pass of lloydPasses(points, start, { maxIterations, empty })) {
    iterations = pass.iteration;
    assign = pass.assign;
    settled = pass.settled;
    centroids = pass.update?.centroids ?? pass.centroids;
  }
  let computations = iterations * points.length * start.length;
  if (!settled) {
    assign = assignAll(points, centroids);
    computations += points.length * centroids.length;
  }
  return { centroids, assign, iterations, computations };
}
