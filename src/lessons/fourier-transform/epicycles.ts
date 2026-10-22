/**
 * Scene 2: a closed shape as N complex samples x + iy. Its DFT gives rotating circles: coefficient c_k = X[k] / N
 * turns k times per period (signed, so the circles near the top of the spectrum turn backwards), and adding them tip to
 * tail redraws the shape. Circles are ordered by size.
 */
import { cAbs, cx, fft, type Complex } from '../../core/signal';

export const SAMPLES = 64;
const PATH_POINTS = 256;

export type ShapeId = 'circle' | 'square' | 'star' | 'letter';
export const SHAPES: readonly { value: ShapeId; label: string }[] = [
  { value: 'circle', label: 'circle' },
  { value: 'square', label: 'square' },
  { value: 'star', label: 'star' },
  { value: 'letter', label: 'letter L' },
];

type Pt = readonly [number, number];
const STAR_POINTS = 5;
const STAR_INNER = 0.45;
const starVertices = (): Pt[] =>
  Array.from({ length: 2 * STAR_POINTS }, (_, i) => {
    const r = i % 2 === 0 ? 1 : STAR_INNER;
    const a = Math.PI / 2 + (Math.PI * i) / STAR_POINTS;
    return [r * Math.cos(a), r * Math.sin(a)] as Pt;
  });
const LETTER_L: Pt[] = [[-0.7, 1], [-0.2, 1], [-0.2, -0.4], [0.9, -0.4], [0.9, -1], [-0.7, -1]];
const SQUARE: Pt[] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];

/** The shape's corners in drawing order; the circle is not a polygon (see `shapeSamples`). */
export function vertices(id: ShapeId): Pt[] {
  switch (id) {
    case 'circle': return [];
    case 'square': return SQUARE;
    case 'star': return starVertices();
    case 'letter': return LETTER_L;
  }
}

/** `count` points spaced evenly along the closed polygon's perimeter, starting at its first corner. */
export function polygonSamples(corners: readonly Pt[], count: number): Complex[] {
  const lengths = corners.map((p, i) => Math.hypot(corners[(i + 1) % corners.length][0] - p[0], corners[(i + 1) % corners.length][1] - p[1]));
  const perimeter = lengths.reduce((a, b) => a + b, 0);
  return Array.from({ length: count }, (_, n) => {
    let d = (n / count) * perimeter;
    let edge = 0;
    while (d > lengths[edge] && edge < corners.length - 1) {
      d -= lengths[edge];
      edge++;
    }
    const [a, b] = [corners[edge], corners[(edge + 1) % corners.length]];
    const u = lengths[edge] === 0 ? 0 : d / lengths[edge];
    return cx(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u);
  });
}

export function shapeSamples(id: ShapeId, count = SAMPLES): Complex[] {
  if (id === 'circle') return Array.from({ length: count }, (_, n) => cx(Math.cos((2 * Math.PI * n) / count), Math.sin((2 * Math.PI * n) / count)));
  return polygonSamples(vertices(id), count);
}

export interface Circle {
  /** Signed turns per period. */
  freq: number;
  coef: Complex;
  radius: number;
}

/** The circles of a shape, largest first (ties by frequency), with k above N/2 read as the negative frequency k - N. */
export function circlesOf(z: readonly Complex[]): Circle[] {
  const n = z.length;
  return fft(z)
    .map((X, k): Circle => ({ freq: k < n / 2 ? k : k - n, coef: cx(X.re / n, X.im / n), radius: cAbs(cx(X.re / n, X.im / n)) }))
    .sort((a, b) => b.radius - a.radius || a.freq - b.freq);
}

/** The sum of the first `used` circles at time t (in periods). */
export function pointAt(circles: readonly Circle[], used: number, t: number): Complex {
  let re = 0;
  let im = 0;
  for (const c of circles.slice(0, used)) {
    const a = 2 * Math.PI * c.freq * t;
    re += c.coef.re * Math.cos(a) - c.coef.im * Math.sin(a);
    im += c.coef.re * Math.sin(a) + c.coef.im * Math.cos(a);
  }
  return cx(re, im);
}

/** The tip of each circle in the chain at time t: the running sums, starting at the origin. */
export function chainAt(circles: readonly Circle[], used: number, t: number): Complex[] {
  const tips: Complex[] = [cx(0, 0)];
  for (let i = 1; i <= used; i++) tips.push(pointAt(circles, i, t));
  return tips;
}

export const pathOf = (circles: readonly Circle[], used: number, points = PATH_POINTS): Complex[] =>
  Array.from({ length: points + 1 }, (_, i) => pointAt(circles, used, i / points));

/** Root-mean-square distance between the shape's samples and the sum of the first `used` circles at the same times. */
export function shapeError(z: readonly Complex[], circles: readonly Circle[], used: number): number {
  const n = z.length;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const p = pointAt(circles, used, i / n);
    sum += (p.re - z[i].re) ** 2 + (p.im - z[i].im) ** 2;
  }
  return Math.sqrt(sum / n);
}
