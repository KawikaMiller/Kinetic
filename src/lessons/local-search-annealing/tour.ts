import { mulberry32, shuffle, type Rnd } from '../../core/random';
import { IMPROVE_EPSILON, distanceMatrix, heldKarp, randomPoints, tourLength, twoOpt, type DistMatrix, type Point } from '../../core/tsp';

/** 2-opt and annealed 2-opt on a seeded map: the pure logic of scene 4. */

export const PLANE = 10;
export const MAP_POINTS = { min: 6, max: 12, default: 9 } as const;
export const DEFAULT_MAP_SEED = 5;
export const CROSSED_SQUARE: readonly Point[] = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }];
/** Visits the corners 0, 2, 1, 3: the two diagonals cross. */
export const CROSSED_TOUR: readonly number[] = [0, 2, 1, 3];

/** The annealed variant's schedule, in units of tour length on the 10 x 10 plane. */
export const ANNEAL = { t0: 2, alpha: 0.997, steps: 3000 } as const;
export const MAP_BATCH = 100;

export interface TourMap {
  points: readonly Point[];
  dist: number[][];
  start: number[];
}

/** `n` seeded points on the plane and a seeded random order to start from. */
export function seededMap(seed: number, n: number): TourMap {
  const rnd = mulberry32(seed);
  const points = randomPoints(rnd, n, PLANE);
  return { points, dist: distanceMatrix(points), start: shuffle(Array.from({ length: n }, (_, i) => i), rnd) };
}

export function crossedSquareMap(): TourMap {
  return { points: CROSSED_SQUARE, dist: distanceMatrix(CROSSED_SQUARE), start: [...CROSSED_TOUR] };
}

/** Reverse positions i + 1 to j, the 2-opt move of core/tsp. */
export const reverseSegment = (tour: readonly number[], i: number, j: number): number[] => [
  ...tour.slice(0, i + 1), ...tour.slice(i + 1, j + 1).reverse(), ...tour.slice(j + 1),
];

/** New length minus old length for reversing positions i + 1 to j (the edges (i, i+1) and (j, j+1) are replaced). */
export function reversalDelta(dist: DistMatrix, tour: readonly number[], i: number, j: number): number {
  const n = tour.length;
  const [a, b, c, d] = [tour[i], tour[i + 1], tour[j], tour[(j + 1) % n]];
  return dist[a][c] + dist[b][d] - dist[a][b] - dist[c][d];
}

/** A random valid 2-opt move (i, j): j at least two after i, and not the pair that shares the first vertex. */
function randomMove(rnd: Rnd, n: number): [number, number] {
  for (;;) {
    const i = Math.floor(rnd() * (n - 2));
    const j = i + 2 + Math.floor(rnd() * (n - i - 2));
    if (!(i === 0 && j === n - 1)) return [i, j];
  }
}

export interface Annealed {
  /** The tour after the random reversals, before the 2-opt polish. */
  annealed: number[];
  tour: number[];
  length: number;
  /** Reversals accepted, and how many of them made the tour longer. */
  accepted: number;
  uphill: number;
  /** The running length after every accepted reversal, for the tests. */
  running: number[];
}

/** Random segment reversals under the Metropolis rule with geometric cooling, then a 2-opt polish to a local optimum. */
export function annealedTwoOpt(dist: DistMatrix, start: readonly number[], seed: number): Annealed {
  const rnd = mulberry32(seed);
  let tour = [...start];
  let length = tourLength(dist, tour);
  let t: number = ANNEAL.t0;
  let accepted = 0;
  let uphill = 0;
  const running: number[] = [];
  for (let k = 0; k < ANNEAL.steps && tour.length >= 4; k++) {
    const [i, j] = randomMove(rnd, tour.length);
    const delta = reversalDelta(dist, tour, i, j);
    if (delta <= 0 || rnd() < Math.exp(-delta / t)) {
      tour = reverseSegment(tour, i, j);
      length += delta;
      accepted++;
      if (delta > IMPROVE_EPSILON) uphill++;
      running.push(length);
    }
    t *= ANNEAL.alpha;
  }
  const polished = twoOpt(dist, tour);
  return { annealed: tour, tour: polished.tour, length: polished.length, accepted, uphill, running };
}

export interface MapBatch {
  maps: number;
  meanRatioPlain: number;
  meanRatioAnnealed: number;
  optimalPlain: number;
  optimalAnnealed: number;
}

const OPTIMAL_TOLERANCE = 1e-9;

/** `MAP_BATCH` seeded maps of `n` points: plain 2-opt from a random tour against annealed 2-opt, each against the Held-Karp optimum. */
export function compareOnMaps(n: number, firstSeed = 1, count = MAP_BATCH): MapBatch {
  let plain = 0;
  let annealed = 0;
  let optimalPlain = 0;
  let optimalAnnealed = 0;
  for (let s = 0; s < count; s++) {
    const seed = firstSeed + s;
    const map = seededMap(seed, n);
    const best = heldKarp(map.dist).length;
    const a = twoOpt(map.dist, map.start).length / best;
    const b = annealedTwoOpt(map.dist, map.start, seed).length / best;
    plain += a;
    annealed += b;
    if (a <= 1 + OPTIMAL_TOLERANCE) optimalPlain++;
    if (b <= 1 + OPTIMAL_TOLERANCE) optimalAnnealed++;
  }
  return { maps: count, meanRatioPlain: plain / count, meanRatioAnnealed: annealed / count, optimalPlain, optimalAnnealed };
}
