import { mulberry32 } from '../../core/random';

/**
 * Closest pair of points by divide and conquer: split at the median x, solve both halves,
 * then only check the strip of half-width δ around the split line. Each point in the strip
 * is compared only with the points above it that are less than δ higher (at most 7), so the
 * strip checks are linear per level: T(n) = 2T(n/2) + O(n), the merge-sort case.
 *
 * This version re-sorts each strip by y, so its own combine is O(n log n) and the whole run
 * O(n log² n); the textbook version merges y-sorted halves, keeping the combine linear. The
 * checks counted here are the same either way.
 */

export interface Pt {
  x: number;
  y: number;
}

export const POINT_SPAN = 100;
/** Subproblems this small are solved by comparing every pair. */
export const BASE_SIZE = 3;

export function seededPoints(seed: number, n: number): Pt[] {
  const rnd = mulberry32(seed);
  const at = () => Math.round((2 + rnd() * (POINT_SPAN - 4)) * 10) / 10;
  return Array.from({ length: n }, () => ({ x: at(), y: at() }));
}

const dist = (p: Pt, q: Pt) => Math.hypot(p.x - q.x, p.y - q.y);

export interface Pair {
  i: number;
  j: number;
  d: number;
}

export interface CombineStep {
  level: number;
  /** Indices (into the input) of this subproblem's points. */
  members: number[];
  midX: number;
  /** δ = the better of the two halves' answers, before the strip. */
  delta: number;
  strip: number[];
  checks: number;
  best: Pair;
}

export interface ClosestRun {
  best: Pair;
  steps: CombineStep[];
  /** Strip checks made at each recursion level (level 0 is the whole set). */
  stripChecks: number[];
  /** Pair comparisons in base cases. */
  baseChecks: number;
  levels: number;
}

const NONE: Pair = { i: -1, j: -1, d: Infinity };
const better = (a: Pair, b: Pair) => (b.d < a.d ? b : a);

export function closestPair(points: readonly Pt[]): ClosestRun {
  const byX = points.map((_, i) => i).sort((a, b) => points[a].x - points[b].x || points[a].y - points[b].y);
  const steps: CombineStep[] = [];
  const stripChecks: number[] = [];
  let baseChecks = 0;
  let levels = 0;

  const rec = (ids: number[], level: number): Pair => {
    levels = Math.max(levels, level + 1);
    if (ids.length <= BASE_SIZE) {
      let best = NONE;
      for (let a = 0; a < ids.length; a++) {
        for (let b = a + 1; b < ids.length; b++) {
          baseChecks++;
          best = better(best, { i: ids[a], j: ids[b], d: dist(points[ids[a]], points[ids[b]]) });
        }
      }
      return best;
    }
    const mid = ids.length >> 1;
    const midX = (points[ids[mid - 1]].x + points[ids[mid]].x) / 2;
    const left = rec(ids.slice(0, mid), level + 1);
    const right = rec(ids.slice(mid), level + 1);
    const deltaPair = better(left, right);
    const delta = deltaPair.d;
    const strip = ids.filter((i) => Math.abs(points[i].x - midX) < delta).sort((a, b) => points[a].y - points[b].y);
    let best = deltaPair;
    let checks = 0;
    for (let s = 0; s < strip.length; s++) {
      for (let t = s + 1; t < strip.length && points[strip[t]].y - points[strip[s]].y < delta; t++) {
        checks++;
        best = better(best, { i: strip[s], j: strip[t], d: dist(points[strip[s]], points[strip[t]]) });
      }
    }
    stripChecks[level] = (stripChecks[level] ?? 0) + checks;
    steps.push({ level, members: ids, midX, delta, strip, checks, best });
    return best;
  };

  const best = rec(byX, 0);
  for (let l = 0; l < levels; l++) stripChecks[l] ??= 0;
  return { best, steps, stripChecks, baseChecks, levels };
}

/** Every pair compared: the reference answer. */
export function bruteClosest(points: readonly Pt[]): number {
  let d = Infinity;
  for (let a = 0; a < points.length; a++) for (let b = a + 1; b < points.length; b++) d = Math.min(d, dist(points[a], points[b]));
  return d;
}
