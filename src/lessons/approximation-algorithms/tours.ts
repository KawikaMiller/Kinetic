import { mulberry32 } from '../../core/random';
import { christofidesTour, distanceMatrix, doubleTreeTour, heldKarp, primMst, type ChristofidesResult, type Edge, type Mst, type Point } from '../../core/tsp';

/** Metric TSP on a plane of PLANE x PLANE: the spanning tree, MST doubling, Christofides and the exact optimum. */

export const PLANE = 10;
export const POINT_LIMITS = { min: 5, max: 10 } as const;
/** The adversary moves one point by this much in x and y at most per step: a quarter of a grid line on the 10 x 10 plane. */
export const ADVERSARY_UNIT = 0.25;
export const ADVERSARY_STEPS = 300;
export const ADVERSARY_SEED = 7;
/** The two proved ceilings the ratio meter draws. */
export const BOUND_DOUBLING = 2;
export const BOUND_CHRISTOFIDES = 1.5;

/** The lesson's 7-point map M7: all distances distinct, so every tie-break is moot. */
export const M7: readonly Point[] = [
  { x: 1.4, y: 7.2 }, { x: 10, y: 5 }, { x: 6.2, y: 3.2 }, { x: 8.8, y: 0.7 }, { x: 8.1, y: 8.6 }, { x: 6.8, y: 8.7 }, { x: 4.2, y: 2.4 },
];

export type TourKind = 'mst' | 'doubling' | 'christofides' | 'optimum';

export interface Tours {
  dist: number[][];
  mst: Mst;
  doubling: { tour: number[]; length: number };
  christofides: ChristofidesResult;
  optimum: { tour: number[]; length: number };
  /** Tour length over the optimum (1 when the optimum is 0, e.g. all points coincide). */
  ratioDoubling: number;
  ratioChristofides: number;
}

const over = (length: number, optimum: number) => (optimum === 0 ? 1 : length / optimum);

export function toursOf(points: readonly Point[]): Tours {
  const dist = distanceMatrix(points);
  const mst = primMst(dist);
  const doubling = doubleTreeTour(dist);
  const christofides = christofidesTour(dist);
  const optimum = heldKarp(dist);
  return {
    dist, mst, doubling, christofides, optimum,
    ratioDoubling: over(doubling.length, optimum.length),
    ratioChristofides: over(christofides.length, optimum.length),
  };
}

const closedEdges = (tour: readonly number[]): Edge[] => tour.map((v, i) => [v, tour[(i + 1) % tour.length]] as const);

/** The edges to draw for one of the four constructions. */
export function edgesOf(t: Tours, kind: TourKind): readonly Edge[] {
  if (kind === 'mst') return t.mst.edges;
  return closedEdges(t[kind].tour);
}

export const lengthOf = (t: Tours, kind: TourKind): number => (kind === 'mst' ? t.mst.weight : t[kind].length);

/** A point inside the plane, nudged to stay on it. */
export const clampToPlane = (p: Point): Point => ({ x: Math.min(PLANE, Math.max(0, p.x)), y: Math.min(PLANE, Math.max(0, p.y)) });

export interface AdversaryResult {
  points: Point[];
  startRatio: number;
  bestRatio: number;
  accepted: number;
}

/** A seeded hill climb that moves one point by at most ADVERSARY_UNIT per step and keeps a move only when MST doubling gets worse. */
export function adversary(start: readonly Point[], seed: number, steps = ADVERSARY_STEPS): AdversaryResult {
  const rnd = mulberry32(seed);
  let points = [...start];
  const startRatio = toursOf(points).ratioDoubling;
  let best = startRatio;
  let accepted = 0;
  for (let s = 0; s < steps; s++) {
    const i = Math.floor(rnd() * points.length);
    const dx = (Math.floor(rnd() * 3) - 1) * ADVERSARY_UNIT;
    const dy = (Math.floor(rnd() * 3) - 1) * ADVERSARY_UNIT;
    const moved = clampToPlane({ x: points[i].x + dx, y: points[i].y + dy });
    const candidate = points.map((p, k) => (k === i ? moved : p));
    const ratio = toursOf(candidate).ratioDoubling;
    if (ratio > best) {
      best = ratio;
      points = candidate;
      accepted++;
    }
  }
  return { points, startRatio, bestRatio: best, accepted };
}

export function adversaryText(r: AdversaryResult, n: number): string {
  const reached = r.bestRatio >= BOUND_DOUBLING ? `reaches the bound of ${BOUND_DOUBLING}` : `does not reach the bound of ${BOUND_DOUBLING} with ${n} points`;
  return `The adversary moved points ${r.accepted} times and raised the doubling ratio from ${r.startRatio.toFixed(2)} to ${r.bestRatio.toFixed(2)}: this climb ${reached}.`;
}

export function toursCaption(t: Tours): string {
  return `Optimum ${t.optimum.length.toFixed(2)}; spanning tree ${t.mst.weight.toFixed(2)} (a tour minus one edge is a spanning tree, so it cannot exceed the optimum); MST doubling ${t.doubling.length.toFixed(2)}, ratio ${t.ratioDoubling.toFixed(2)}; Christofides ${t.christofides.length.toFixed(2)}, ratio ${t.ratioChristofides.toFixed(2)}.`;
}
