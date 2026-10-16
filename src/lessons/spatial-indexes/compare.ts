import { mulberry32 } from '../../core/random';
import { DOMAIN, type Pt, type Rect } from './data';
import { buildKd, kdRange, knn } from './kdtree';
import { buildQuad, quadKnn, quadRange } from './quadtree';

export const COMPARE_QUERIES = 40;
export const COMPARE_K = 3;
export const COMPARE_RANGE_SIDE = 20;
export const COMPARE_SEED = 5;

export interface Row {
  id: 'scan' | 'kd' | 'quad';
  label: string;
  /** Coordinate comparisons spent building. */
  build: number;
  /** Average per query: nodes or cells visited (the scan has none) and points distance-checked. */
  nnNodes: number;
  nnChecks: number;
  rangeNodes: number;
  rangeChecks: number;
  /** Tree nodes or cells in the index. A k-d tree's nodes are the points themselves (no extra storage); a quadtree's cells are extra storage; the scan has none. */
  treeNodes: number;
}

export interface Workload {
  nn: Pt[];
  ranges: Rect[];
}

export function makeWorkload(seed = COMPARE_SEED, queries = COMPARE_QUERIES): Workload {
  const rnd = mulberry32(seed);
  const nn = Array.from({ length: queries }, () => [rnd() * DOMAIN, rnd() * DOMAIN]);
  const ranges = Array.from({ length: queries }, () => {
    const x0 = rnd() * (DOMAIN - COMPARE_RANGE_SIDE);
    const y0 = rnd() * (DOMAIN - COMPARE_RANGE_SIDE);
    return { x0, y0, x1: x0 + COMPARE_RANGE_SIDE, y1: y0 + COMPARE_RANGE_SIDE };
  });
  return { nn, ranges };
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** One table on one dataset: the scan, the k-d tree and the quadtree, in one unit each (see the column notes on screen). */
export function compareStructures(points: readonly Pt[], capacity: number, w: Workload = makeWorkload()): Row[] {
  const kd = buildKd(points);
  const quad = buildQuad(points, capacity);
  const n = points.length;
  return [
    { id: 'scan', label: 'Linear scan', build: 0, nnNodes: 0, nnChecks: n, rangeNodes: 0, rangeChecks: n, treeNodes: 0 },
    {
      id: 'kd',
      label: 'k-d tree',
      build: kd.buildComparisons,
      nnNodes: mean(w.nn.map((q) => knn(kd, q, COMPARE_K).visited.length)),
      nnChecks: mean(w.nn.map((q) => knn(kd, q, COMPARE_K).visited.length)),
      rangeNodes: mean(w.ranges.map((r) => kdRange(kd, r).visited.length)),
      rangeChecks: mean(w.ranges.map((r) => kdRange(kd, r).visited.length)),
      treeNodes: kd.nodes.length,
    },
    {
      id: 'quad',
      label: `Quadtree (bucket ${capacity})`,
      build: quad.comparisons,
      nnNodes: mean(w.nn.map((q) => quadKnn(quad, q, COMPARE_K).visited.length)),
      nnChecks: mean(w.nn.map((q) => quadKnn(quad, q, COMPARE_K).checks)),
      rangeNodes: mean(w.ranges.map((r) => quadRange(quad, r).visited.length)),
      rangeChecks: mean(w.ranges.map((r) => quadRange(quad, r).checks)),
      treeNodes: quad.nodes.length,
    },
  ];
}
