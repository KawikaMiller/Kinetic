import type { Pt } from '../../core/graphLayout';
import { doubleTreeTour, heldKarp, primMst, type Edge } from '../../core/tsp';

/**
 * The non-metric star: centre O joined to the leaves L1 to L4 by distance 1; the leaf pairs (L1, L3), (L3, L2), (L2, L4)
 * cost 1.5 and the other three leaf pairs cost M. Vertex 0 is O and vertices 1 to 4 are L1 to L4.
 */

export const STAR_M = { min: 1.5, max: 200, step: 0.25, default: 2 } as const;
export const CENTRE_LEG = 1;
export const CHEAP_PAIR = 1.5;
/** The detour L1 to O to L2: a leaf pair costing more than this breaks the triangle inequality. */
export const DETOUR = 2 * CENTRE_LEG;

const CHEAP_PAIRS: readonly Edge[] = [[1, 3], [3, 2], [2, 4]];
const EXPENSIVE_PAIRS: readonly Edge[] = [[1, 2], [1, 4], [3, 4]];
export const STAR_NAMES: readonly string[] = ['O', 'L1', 'L2', 'L3', 'L4'];
export const STAR_AT: readonly Pt[] = [{ x: 280, y: 150 }, { x: 100, y: 50 }, { x: 460, y: 250 }, { x: 100, y: 250 }, { x: 460, y: 50 }];

export function starMatrix(m: number): number[][] {
  const d = Array.from({ length: 5 }, () => new Array<number>(5).fill(0));
  const set = (a: number, b: number, w: number) => {
    d[a][b] = w;
    d[b][a] = w;
  };
  for (let leaf = 1; leaf <= 4; leaf++) set(0, leaf, CENTRE_LEG);
  for (const [a, b] of CHEAP_PAIRS) set(a, b, CHEAP_PAIR);
  for (const [a, b] of EXPENSIVE_PAIRS) set(a, b, m);
  return d;
}

/** Every edge of the complete graph on five vertices, with its length. */
export function starEdges(m: number): { edge: Edge; weight: number }[] {
  const d = starMatrix(m);
  const out: { edge: Edge; weight: number }[] = [];
  for (let a = 0; a < 5; a++) for (let b = a + 1; b < 5; b++) out.push({ edge: [a, b], weight: d[a][b] });
  return out;
}

export interface StarFacts {
  m: number;
  doublingLength: number;
  doublingTour: number[];
  optimumLength: number;
  optimumTour: number[];
  mstWeight: number;
  ratio: number;
  /** M exceeds the detour: the triangle inequality fails on the expensive pairs. */
  violates: boolean;
}

export function starFacts(m: number): StarFacts {
  const d = starMatrix(m);
  const doubling = doubleTreeTour(d);
  const optimum = heldKarp(d);
  return {
    m,
    doublingLength: doubling.length,
    doublingTour: doubling.tour,
    optimumLength: optimum.length,
    optimumTour: optimum.tour,
    mstWeight: primMst(d).weight,
    ratio: doubling.length / optimum.length,
    violates: m > DETOUR,
  };
}

/** Clamp a typed or slid M into the slider's range on its step. */
export const clampM = (m: number): number => {
  const stepped = Math.round(m / STAR_M.step) * STAR_M.step;
  return Math.min(STAR_M.max, Math.max(STAR_M.min, stepped));
};

export function starBanner(f: StarFacts): string | null {
  if (!f.violates) return null;
  return `The guarantee no longer applies: d(L1, L2) = ${f.m} exceeds the detour d(L1, O) + d(O, L2) = ${DETOUR}, so shortcutting can lengthen the tour. Ratio here: ${f.ratio.toFixed(1)}.`;
}

export function starCaption(f: StarFacts): string {
  const holds = f.violates ? 'The triangle inequality fails' : f.m === DETOUR ? 'The triangle inequality holds with equality' : 'The triangle inequality holds';
  return `${holds} at M = ${f.m}. MST doubling costs ${f.doublingLength} against an optimum of ${f.optimumLength}: a ratio of ${f.ratio.toFixed(2)}.`;
}
