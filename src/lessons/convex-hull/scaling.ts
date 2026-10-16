import { mulberry32 } from '../../core/random';
import { countOrientations, graham, type P } from './hull';

export type ScalingKind = 'circle' | 'disc';
export const SCALING_SIZES = [8, 16, 24, 32, 40, 48, 56, 64, 72, 80] as const;
const RADIUS = 10_000;
const DISC_SEED = 17;

/** n integer points around a big circle: far enough apart that rounding keeps them in convex position, so every point is on the hull. */
export const circlePoints = (n: number): P[] =>
  Array.from({ length: n }, (_, k) => ({ x: Math.round(RADIUS * Math.cos((2 * Math.PI * k) / n)), y: Math.round(RADIUS * Math.sin((2 * Math.PI * k) / n)) }));

/** n seeded uniform integer points in a disc: few of them reach the hull. */
export function discPoints(n: number): P[] {
  const rnd = mulberry32(DISC_SEED);
  const out: P[] = [];
  while (out.length < n) {
    const x = Math.round((rnd() * 2 - 1) * RADIUS);
    const y = Math.round((rnd() * 2 - 1) * RADIUS);
    if (x * x + y * y <= RADIUS * RADIUS && !out.some((p) => p.x === x && p.y === y)) out.push({ x, y });
  }
  return out;
}

export interface ScalingRow {
  n: number;
  /** Hull size h. */
  h: number;
  graham: number;
  andrew: number;
  jarvis: number;
}

const cache = new Map<ScalingKind, ScalingRow[]>();

/** Orientation tests for each algorithm at each size, from real runs. */
export function scaling(kind: ScalingKind): ScalingRow[] {
  const hit = cache.get(kind);
  if (hit) return hit;
  const rows = SCALING_SIZES.map((n) => {
    const pts = kind === 'circle' ? circlePoints(n) : discPoints(n);
    return {
      n,
      h: graham(pts).length,
      graham: countOrientations('graham', pts),
      andrew: countOrientations('andrew', pts),
      jarvis: countOrientations('jarvis', pts),
    };
  });
  cache.set(kind, rows);
  return rows;
}
