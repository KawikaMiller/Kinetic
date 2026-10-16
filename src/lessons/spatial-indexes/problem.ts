import { dist, inRect, type Pt, type Rect } from './data';
import type { QueryMode } from './query';

export interface XIndexCost {
  /** Indices of the points an index sorted on x alone has to look at. */
  candidates: number[];
  /** Indices of the true answer. */
  hits: number[];
  wasted: number;
  /** The vertical strip the index has to read, or null with no points. */
  strip: { x0: number; x1: number } | null;
}

/**
 * What a one-dimensional index on x must examine. For a rectangle it is every point in the x-range of the
 * rectangle; for a nearest neighbour it is every point within the true nearest distance of the query in x,
 * because x alone cannot rule out a point that close in x until its y has been read.
 */
export function xIndexCost(points: readonly Pt[], mode: QueryMode, q: Pt, rect: Rect): XIndexCost {
  if (points.length === 0) return { candidates: [], hits: [], wasted: 0, strip: null };
  if (mode === 'range') {
    const candidates = points.flatMap((p, i) => (p[0] >= rect.x0 && p[0] <= rect.x1 ? [i] : []));
    const hits = points.flatMap((p, i) => (inRect(p, rect) ? [i] : []));
    return { candidates, hits, wasted: candidates.length - hits.length, strip: { x0: rect.x0, x1: rect.x1 } };
  }
  const d = points.map((p) => dist(p, q));
  const best = Math.min(...d);
  const nearest = d.indexOf(best);
  const candidates = points.flatMap((p, i) => (Math.abs(p[0] - q[0]) <= best ? [i] : []));
  return { candidates, hits: [nearest], wasted: candidates.length - 1, strip: { x0: q[0] - best, x1: q[0] + best } };
}
