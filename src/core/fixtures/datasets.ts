/**
 * Seeded datasets for the ML lessons, so every lesson draws from the same honest,
 * reproducible data: the same seed always gives the same points. Points are `{ x, y, label }`,
 * which Plot2D's `Points` takes directly (map `label` to a tone).
 */
import { mulberry32, type Rnd } from '../random';

export interface LabeledPoint {
  x: number;
  y: number;
  /** Class index: 0/1 for two-class sets, 0..k-1 for blobs. */
  label: number;
}

/** A standard-normal sample (Box–Muller), from a seeded uniform source. */
export function gaussian(rnd: Rnd): number {
  const u = 1 - rnd(); // (0, 1]: log(0) is never taken
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd());
}

/** `n` points per centre, scattered normally with standard deviation `spread`. */
export function blobs(o: { seed: number; centers: readonly (readonly [number, number])[]; n: number; spread?: number }): LabeledPoint[] {
  const rnd = mulberry32(o.seed);
  const spread = o.spread ?? 1;
  return o.centers.flatMap(([cx, cy], label) =>
    Array.from({ length: o.n }, () => ({ x: cx + gaussian(rnd) * spread, y: cy + gaussian(rnd) * spread, label })),
  );
}

/**
 * Two interleaving half-circles (the classic "moons"): class 0 is the upper arc centred at
 * (0, 0), class 1 the lower arc centred at (1, 0.5). `noise` is a normal jitter's s.d.
 */
export function moons(o: { seed: number; n: number; noise?: number }): LabeledPoint[] {
  const rnd = mulberry32(o.seed);
  const noise = o.noise ?? 0.1;
  const out: LabeledPoint[] = [];
  for (let i = 0; i < o.n; i++) {
    const t = Math.PI * rnd();
    out.push({ x: Math.cos(t) + gaussian(rnd) * noise, y: Math.sin(t) + gaussian(rnd) * noise, label: 0 });
  }
  for (let i = 0; i < o.n; i++) {
    const t = Math.PI * rnd();
    out.push({ x: 1 - Math.cos(t) + gaussian(rnd) * noise, y: 0.5 - Math.sin(t) + gaussian(rnd) * noise, label: 1 });
  }
  return out;
}

/** `n` points on y = intercept + slope·x with normal noise, x uniform in `xRange`. */
export function lineWithNoise(o: {
  seed: number;
  n: number;
  slope: number;
  intercept: number;
  noise: number;
  xRange?: readonly [number, number];
}): { x: number; y: number }[] {
  const rnd = mulberry32(o.seed);
  const [lo, hi] = o.xRange ?? [0, 10];
  return Array.from({ length: o.n }, () => {
    const x = lo + rnd() * (hi - lo);
    return { x, y: o.intercept + o.slope * x + gaussian(rnd) * o.noise };
  });
}

/**
 * Classifier scores in (0, 1) for `positives` and `negatives`: each class's logit is normal
 * with s.d. 1, and the class means sit `separation` apart (0 = a coin flip, 3 = nearly
 * separable). Sorted by score, so a threshold sweep walks the array.
 */
export function twoClassScores(o: { seed: number; positives: number; negatives: number; separation: number }): { score: number; label: 0 | 1 }[] {
  const rnd = mulberry32(o.seed);
  const draw = (label: 0 | 1, centre: number) => ({ score: 1 / (1 + Math.exp(-(centre + gaussian(rnd)))), label });
  const pos = Array.from({ length: o.positives }, () => draw(1, o.separation / 2));
  const neg = Array.from({ length: o.negatives }, () => draw(0, -o.separation / 2));
  return [...pos, ...neg].sort((a, b) => a.score - b.score);
}
