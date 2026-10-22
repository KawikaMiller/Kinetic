/**
 * Triangle setup and rasterisation in screen space: the edge function, winding, barycentric
 * weights, the top-left fill rule, attribute interpolation (screen-linear and perspective-correct),
 * a z-buffer renderer that counts fragment-shader invocations, and alpha blending.
 * Screen space has y pointing down; pixel (x, y) covers [x, x+1) × [y, y+1) and is tested at its
 * centre. Used by the rasterization lesson (edge, area2, wind, isTopLeft, barycentric) and by
 * gpu-rendering-pipeline. 3D maths is core/raster3d. Pure; nothing mutates its inputs.
 */
import type { Vec3 } from './raster3d';

export interface ScreenPoint {
  x: number;
  y: number;
}
export type Triangle<V extends ScreenPoint = ScreenPoint> = readonly [V, V, V];

/** Twice the signed area of (a, b, p): positive when p is on the inside of a → b for a triangle in the winding `wind` returns. */
export const edgeFunction = (a: ScreenPoint, b: ScreenPoint, px: number, py: number) => (b.x - a.x) * (py - a.y) - (b.y - a.y) * (px - a.x);

/** Twice the triangle's signed area, in the winding we rasterise (positive = as given). */
export const area2 = (t: Triangle) => edgeFunction(t[0], t[1], t[2].x, t[2].y);

/** The same triangle in the winding we rasterise (area2 > 0); null when it has no area. */
export function wind<V extends ScreenPoint>(t: Triangle<V>): Triangle<V> | null {
  const a = area2(t);
  if (a === 0) return null;
  return a > 0 ? t : [t[0], t[2], t[1]];
}

/**
 * Top or left edge, for a triangle already wound (inside = edge function > 0). Top: exactly
 * horizontal with the inside below it (dy = 0, dx > 0). Left: the inside is to its right, which
 * in this winding means the edge runs upwards (dy < 0).
 */
export function isTopLeft(a: ScreenPoint, b: ScreenPoint): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return (dy === 0 && dx > 0) || dy < 0;
}

/** Edge i is the one opposite vertex i: w0 uses v1 → v2, w1 uses v2 → v0, w2 uses v0 → v1. */
export const EDGE_VERTICES = [[1, 2], [2, 0], [0, 1]] as const;

/** Barycentric weights at a point: each edge value over the area, summing to 1 (negative outside). */
export function barycentric(t: Triangle, px: number, py: number): [number, number, number] {
  const a = area2(t);
  return EDGE_VERTICES.map(([i, j]) => edgeFunction(t[i], t[j], px, py) / a) as [number, number, number];
}

export interface Fragment {
  x: number;
  y: number;
  /** Weights for the vertices in the order the triangle was given. */
  bary: [number, number, number];
}

/**
 * The pixels of a width × height grid whose centres the triangle covers, row by row, with their
 * barycentric weights. A centre exactly on an edge belongs to the triangle only for a top or left
 * edge, so two triangles sharing an edge never cover a pixel twice or leave a gap.
 */
export function coveredPixels<V extends ScreenPoint>(input: Triangle<V>, width: number, height: number): Fragment[] {
  const t = wind(input);
  if (!t) return [];
  const flipped = area2(input) < 0;
  const xs = t.map((v) => v.x);
  const ys = t.map((v) => v.y);
  const x0 = Math.max(0, Math.floor(Math.min(...xs) - 0.5));
  const x1 = Math.min(width - 1, Math.ceil(Math.max(...xs) - 0.5));
  const y0 = Math.max(0, Math.floor(Math.min(...ys) - 0.5));
  const y1 = Math.min(height - 1, Math.ceil(Math.max(...ys) - 0.5));
  const total = area2(t);
  const out: Fragment[] = [];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const w = EDGE_VERTICES.map(([i, j]) => edgeFunction(t[i], t[j], x + 0.5, y + 0.5));
      const inside = EDGE_VERTICES.every(([i, j], k) => w[k] > 0 || (w[k] === 0 && isTopLeft(t[i], t[j])));
      if (!inside) continue;
      const [b0, b1, b2] = w.map((v) => v / total);
      out.push({ x, y, bary: flipped ? [b0, b2, b1] : [b0, b1, b2] });
    }
  }
  return out;
}

/** Screen-linear interpolation of per-vertex attribute lists: exact for depth, visibly wrong for a texture on a slanted surface. */
export function interpolateLinear(attrs: readonly (readonly number[])[], bary: readonly [number, number, number]): number[] {
  return attrs[0].map((_, k) => bary[0] * attrs[0][k] + bary[1] * attrs[1][k] + bary[2] * attrs[2][k]);
}

/** Perspective-correct interpolation: attributes divided by the vertices' clip w, interpolated, then divided by the interpolated 1/w. */
export function interpolatePerspective(attrs: readonly (readonly number[])[], bary: readonly [number, number, number], w: Vec3): number[] {
  const inv = bary.map((b, i) => b / w[i]);
  const norm = inv[0] + inv[1] + inv[2];
  return attrs[0].map((_, k) => (inv[0] * attrs[0][k] + inv[1] * attrs[1][k] + inv[2] * attrs[2][k]) / norm);
}

/** A screen vertex with window depth (0 near, 1 far; smaller wins). */
export interface DepthVertex extends ScreenPoint {
  z: number;
}

export interface RenderOptions {
  /** Draw order as indices into the triangle list (default: as listed). */
  order?: readonly number[];
  /** Early depth test: the fragment shader runs only for fragments that pass the depth test. Without it the shader runs for every covered fragment and the test comes after. */
  earlyZ?: boolean;
}

export interface Rendered {
  width: number;
  height: number;
  /** Index of the visible triangle per pixel, row-major, -1 where none. */
  id: Int32Array;
  depth: Float64Array;
  /** Fragments produced by rasterisation (every covered pixel of every triangle). */
  coveredFragments: number;
  /** Fragment-shader runs: the cost the early depth test saves. */
  shaderInvocations: number;
}

/** Draw opaque triangles with a z-buffer (depth test: strictly less passes). The picture does not depend on the order; the invocation count does. */
export function renderTriangles(tris: readonly Triangle<DepthVertex>[], width: number, height: number, { order, earlyZ = false }: RenderOptions = {}): Rendered {
  const id = new Int32Array(width * height).fill(-1);
  const depth = new Float64Array(width * height).fill(Infinity);
  let coveredFragments = 0;
  let shaderInvocations = 0;
  for (const index of order ?? tris.map((_, i) => i)) {
    const tri = tris[index];
    for (const f of coveredPixels(tri, width, height)) {
      coveredFragments++;
      const z = interpolateLinear([[tri[0].z], [tri[1].z], [tri[2].z]], f.bary)[0];
      const slot = f.y * width + f.x;
      const passes = z < depth[slot];
      if (passes || !earlyZ) shaderInvocations++;
      if (passes) {
        depth[slot] = z;
        id[slot] = index;
      }
    }
  }
  return { width, height, id, depth, coveredFragments, shaderInvocations };
}

/** Source-over blending of a colour with alpha onto a destination: alpha·Cs + (1 - alpha)·Cd. Not commutative: swap the order and the result changes. */
export const blendOver = (src: Vec3, alpha: number, dst: Vec3): Vec3 => [0, 1, 2].map((i) => alpha * src[i] + (1 - alpha) * dst[i]) as unknown as Vec3;
