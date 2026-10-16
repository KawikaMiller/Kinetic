import { mulberry32 } from '../../core/random';
import { parseBoundedInt, type FieldParse } from '../../core/parse';

/** The map is the square [0, DOMAIN] x [0, DOMAIN]. */
export const DOMAIN = 100;
export const DEFAULT_SEED = 7;
export const DEFAULT_N = 300;
export const MAX_N = 500;
/** Share of the points that sit in clusters; the rest are uniform scatter. */
const CLUSTER_SHARE = 0.7;
const CLUSTER_COUNT = 4;
const CLUSTER_SPREAD = 7;

export type Pt = readonly number[];
export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const round2 = (v: number) => Math.round(v * 100) / 100;
const clampDomain = (v: number) => Math.min(DOMAIN, Math.max(0, v));

/** Approximately normal (sum of three uniforms), centred on 0 with a spread of 0.5. */
const bell = (rnd: () => number) => rnd() + rnd() + rnd() - 1.5;

/** Seeded toy map data: clusters plus scatter, coordinates to 0.01 (so exact duplicates can happen). */
export function makePoints(seed: number, n: number): Pt[] {
  const rnd = mulberry32(seed);
  const centres = Array.from({ length: CLUSTER_COUNT }, () => [15 + rnd() * 70, 15 + rnd() * 70]);
  return Array.from({ length: n }, () => {
    if (rnd() < CLUSTER_SHARE) {
      const c = centres[Math.floor(rnd() * CLUSTER_COUNT)];
      return [round2(clampDomain(c[0] + bell(rnd) * 2 * CLUSTER_SPREAD)), round2(clampDomain(c[1] + bell(rnd) * 2 * CLUSTER_SPREAD))];
    }
    return [round2(rnd() * DOMAIN), round2(rnd() * DOMAIN)];
  });
}

/** A rectangle dragged inside-out is normalised so x0 <= x1 and y0 <= y1. */
export const normaliseRect = (a: readonly [number, number], b: readonly [number, number]): Rect => ({
  x0: Math.min(a[0], b[0]),
  y0: Math.min(a[1], b[1]),
  x1: Math.max(a[0], b[0]),
  y1: Math.max(a[1], b[1]),
});

export const inRect = (p: Pt, r: Rect) => p[0] >= r.x0 && p[0] <= r.x1 && p[1] >= r.y0 && p[1] <= r.y1;
export const dist = (a: Pt, b: Pt) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
  return Math.sqrt(s);
};

/** The point-count field: 0 to MAX_N, whole numbers; above MAX_N is refused, not clamped. */
export const parseCount = (text: string): FieldParse<number> =>
  parseBoundedInt(text, {
    min: 0,
    max: MAX_N,
    messages: {
      empty: `Type a number of points from 0 to ${MAX_N}.`,
      invalid: (typed) => `"${typed}" isn't a count. Use a whole number from 0 to ${MAX_N}.`,
      tooSmall: () => 'A count cannot be negative.',
      tooBig: () => `The drawing keeps up to ${MAX_N} points; a bigger number is refused, not cut down.`,
    },
  });

/** The k smallest distances by a plain scan: the reference every index is held to (distances, so ties cannot fail). */
export function scanNearest(points: readonly Pt[], q: Pt, k: number): number[] {
  return points.map((p) => dist(p, q)).sort((a, b) => a - b).slice(0, k);
}

export const scanRange = (points: readonly Pt[], r: Rect): Pt[] => points.filter((p) => inRect(p, r));
