/**
 * Reading a growth class off measured visit counts. Nothing here knows which pattern it is looking at: it uses
 * the numbers alone (a ratio test for exponential growth, the log-log slope for a polynomial).
 */
import type { Point } from './engines';

/** A ratio of consecutive counts at or above this, held over the last RATIO_RUN steps, reads as exponential. */
export const EXPONENTIAL_RATIO = 1.3;
export const RATIO_RUN = 3;
/** A log-log slope below this reads as linear, otherwise as a polynomial of about that degree. */
export const LINEAR_SLOPE = 1.25;
/** At least this many finished points are needed to say anything. */
export const MIN_POINTS = 4;

export type Growth =
  | { kind: 'linear'; slope: number }
  | { kind: 'polynomial'; slope: number }
  | { kind: 'exponential'; ratio: number }
  | { kind: 'unknown' };

/** The class of a series of consecutive n, from the points before the first one that hit the budget. */
export function classifyGrowth(points: readonly Point[]): Growth {
  const finished = points.slice(0, points.findIndex((p) => p.gaveUp) < 0 ? points.length : points.findIndex((p) => p.gaveUp));
  if (finished.length < MIN_POINTS) return { kind: 'unknown' };
  const ratios = finished.slice(1).map((p, i) => p.visits / finished[i].visits);
  const lastRatios = ratios.slice(-RATIO_RUN);
  if (lastRatios.every((r) => r >= EXPONENTIAL_RATIO)) return { kind: 'exponential', ratio: lastRatios[lastRatios.length - 1] };
  const first = finished[0];
  const last = finished[finished.length - 1];
  const slope = Math.log(last.visits / first.visits) / Math.log(last.n / first.n);
  return slope < LINEAR_SLOPE ? { kind: 'linear', slope } : { kind: 'polynomial', slope };
}

/** The class's name: linear, polynomial, exponential. */
export const growthKind = (g: Growth): string => (g.kind === 'unknown' ? 'unknown' : g.kind);

/** The number that decided it, in words. */
export function growthDetail(g: Growth): string {
  switch (g.kind) {
    case 'linear':
      return `log-log slope ${g.slope.toFixed(2)}`;
    case 'polynomial':
      return `log-log slope ${g.slope.toFixed(2)}, about n^${Math.round(g.slope)}`;
    case 'exponential':
      return `each extra letter multiplies it by ${g.ratio.toFixed(2)}`;
    case 'unknown':
      return 'not enough finished runs to tell';
  }
}

/** The class in words, with the number that decided it. */
export const growthText = (g: Growth): string => (g.kind === 'unknown' ? growthDetail(g) : `${growthKind(g)} (${growthDetail(g)})`);
