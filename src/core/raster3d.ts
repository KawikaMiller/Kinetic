/**
 * The 3D side of a software renderer: vec3 helpers, 4 by 4 model/view/projection matrices,
 * the perspective divide, the viewport, clipping in clip space and depth-buffer arithmetic.
 * Used by 3d-transforms-projection and gpu-rendering-pipeline (rasterisation is core/raster,
 * rays are core/raytrace). Pure; nothing mutates its inputs.
 *
 * Conventions, stated once on screen by the lessons: right-handed, the camera looks down -z,
 * OpenGL-style clip space (NDC z from -1 at the near plane to +1 at the far plane), screen y
 * pointing down. Matrices are core/vec `Mat` (row-major, column vectors: p' = M·p).
 * Direct3D and Vulkan differ in the z range and y direction.
 */
import { apply, det, identity, inverse, matMul, type Mat } from './vec';

export type Vec3 = readonly [number, number, number];
export type Vec4 = readonly [number, number, number, number];
/** A 4 by 4 matrix in core/vec's row-major layout. */
export type Mat4 = Mat;

// ── vec3 (fixed-size tuples: core/vec's helpers work on any length and return plain arrays) ──

export const add3 = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub3 = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale3 = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot3 = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross3 = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const length3 = (a: Vec3) => Math.sqrt(dot3(a, a));
export const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** The unit vector in a's direction; null for the zero vector. */
export function normalize3(a: Vec3): Vec3 | null {
  const n = length3(a);
  return n === 0 ? null : scale3(a, 1 / n);
}

/** The direction d mirrored about the unit normal n: d - 2(d·n)n. */
export const reflect3 = (d: Vec3, n: Vec3): Vec3 => sub3(d, scale3(n, 2 * dot3(d, n)));

// ── model matrices ──

export const identity4 = (): Mat4 => identity(4);

export const translation = ([x, y, z]: Vec3): Mat4 => [[1, 0, 0, x], [0, 1, 0, y], [0, 0, 1, z], [0, 0, 0, 1]];
export const scaling = ([x, y, z]: Vec3): Mat4 => [[x, 0, 0, 0], [0, y, 0, 0], [0, 0, z, 0], [0, 0, 0, 1]];

/** Right-handed rotation about +x by `rad`: +y turns toward +z. */
export function rotationX(rad: number): Mat4 {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [[1, 0, 0, 0], [0, c, -s, 0], [0, s, c, 0], [0, 0, 0, 1]];
}
/** Right-handed rotation about +y: +z turns toward +x, so +x turns toward -z. */
export function rotationY(rad: number): Mat4 {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [[c, 0, s, 0], [0, 1, 0, 0], [-s, 0, c, 0], [0, 0, 0, 1]];
}
/** Right-handed rotation about +z: +x turns toward +y. */
export function rotationZ(rad: number): Mat4 {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [[c, -s, 0, 0], [s, c, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
}

/** The product left to right, so `compose(T, R, S)` is T·R·S and applies S first (a model matrix: scale, rotate, then translate). */
export const compose = (...ms: Mat4[]): Mat4 => ms.reduce((acc, m) => matMul(acc, m), identity4());

/** The 4 by 4 determinant (the volume scale factor; a rigid view matrix has 1). */
export function det4(m: Mat4): number {
  let total = 0;
  for (let col = 0; col < 4; col++) {
    const minor = [1, 2, 3].map((r) => [0, 1, 2, 3].filter((c) => c !== col).map((c) => m[r][c]));
    total += (col % 2 === 0 ? 1 : -1) * m[0][col] * det(minor);
  }
  return total;
}

/** The inverse, or null when the matrix is singular. */
export const inverse4 = (m: Mat4): Mat4 | null => inverse(m);

/** M·(x, y, z, w): w = 1 for a position (translation applies), w = 0 for a direction (it does not). */
export const transform = (m: Mat4, p: Vec3, w = 1): Vec4 => apply(m, [p[0], p[1], p[2], w]) as unknown as Vec4;

// ── camera and projection ──

/**
 * The view matrix for a camera at `eye` looking at `target` with `up` roughly up: it moves the
 * eye to the origin looking down -z. Null when there is no direction to look in (eye on the
 * target) or `up` is parallel to it (no sideways axis).
 */
export function lookAt(eye: Vec3, target: Vec3, up: Vec3): Mat4 | null {
  const forward = normalize3(sub3(target, eye));
  if (!forward) return null;
  const side = normalize3(cross3(forward, up));
  if (!side) return null;
  const upward = cross3(side, forward);
  return [
    [side[0], side[1], side[2], -dot3(side, eye)],
    [upward[0], upward[1], upward[2], -dot3(upward, eye)],
    [-forward[0], -forward[1], -forward[2], dot3(forward, eye)],
    [0, 0, 0, 1],
  ];
}

/** OpenGL perspective projection: vertical field of view in radians, width/height, positive near < far. Throws RangeError for values that have no frustum. */
export function perspective(fovY: number, aspect: number, near: number, far: number): Mat4 {
  if (!(fovY > 0 && fovY < Math.PI)) throw new RangeError('field of view must be between 0 and 180 degrees');
  if (!(aspect > 0)) throw new RangeError('aspect must be positive');
  if (!(near > 0 && far > near)) throw new RangeError('need 0 < near < far');
  const f = 1 / Math.tan(fovY / 2);
  return [
    [f / aspect, 0, 0, 0],
    [0, f, 0, 0],
    [0, 0, (far + near) / (near - far), (2 * far * near) / (near - far)],
    [0, 0, -1, 0],
  ];
}

/** OpenGL orthographic projection of the box [left, right] × [bottom, top] × [-near, -far] in eye space onto the NDC cube. */
export function ortho(left: number, right: number, bottom: number, top: number, near: number, far: number): Mat4 {
  if (right === left || top === bottom || far === near) throw new RangeError('the orthographic box has no volume');
  return [
    [2 / (right - left), 0, 0, -(right + left) / (right - left)],
    [0, 2 / (top - bottom), 0, -(top + bottom) / (top - bottom)],
    [0, 0, -2 / (far - near), -(far + near) / (far - near)],
    [0, 0, 0, 1],
  ];
}

/** Window-space depth, 0 at the near plane and 1 at the far plane, from NDC z. */
export const windowDepth = (ndcZ: number) => (ndcZ + 1) / 2;

/** NDC to pixels: x right, y down (so NDC +y is up the screen), depth 0..1. */
export const ndcToScreen = (ndc: Vec3, width: number, height: number): Vec3 => [((ndc[0] + 1) / 2) * width, ((1 - ndc[1]) / 2) * height, windowDepth(ndc[2])];

export interface Projected {
  /** After M·p, before the divide. */
  clip: Vec4;
  /** clip w: for a perspective matrix, the distance in front of the camera. */
  w: number;
  /** clip / w: for w < 0 (behind the camera) this is the mirrored, stretched result a missing clip step would draw. Null only when w is 0. */
  ndc: Vec3 | null;
  screen: Vec3 | null;
  /** Inside all six clip planes: -w <= x, y, z <= w. */
  inFrustum: boolean;
  /** w <= 0: at or behind the camera plane. */
  behind: boolean;
}

/** One point through the whole pipeline: clip = mvp·p, the perspective divide, the viewport. */
export function projectToScreen(mvp: Mat4, p: Vec3, width: number, height: number): Projected {
  const clip = transform(mvp, p);
  const w = clip[3];
  const ndc: Vec3 | null = w === 0 ? null : [clip[0] / w, clip[1] / w, clip[2] / w];
  return { clip, w, ndc, screen: ndc && ndcToScreen(ndc, width, height), inFrustum: isInsideFrustum(clip), behind: w <= 0 };
}

/** NDC back to the space `inverseMvp` came from (eye space for an inverse projection): multiply, then divide by w. Null when w is 0. */
export function unproject(inverseMvp: Mat4, ndc: Vec3): Vec3 | null {
  const q = transform(inverseMvp, ndc);
  return q[3] === 0 ? null : [q[0] / q[3], q[1] / q[3], q[2] / q[3]];
}

// ── clipping ──

export type ClipPlane = 'left' | 'right' | 'bottom' | 'top' | 'near' | 'far';
export const CLIP_PLANES: readonly ClipPlane[] = ['left', 'right', 'bottom', 'top', 'near', 'far'];

/** Signed distance to a clip plane, in clip units: non-negative is the inside (w+x >= 0 for left, w-z >= 0 for far, ...). */
export function planeDistance(plane: ClipPlane, c: Vec4): number {
  switch (plane) {
    case 'left': return c[3] + c[0];
    case 'right': return c[3] - c[0];
    case 'bottom': return c[3] + c[1];
    case 'top': return c[3] - c[1];
    case 'near': return c[3] + c[2];
    case 'far': return c[3] - c[2];
  }
}

/** Inside every clip plane. */
export const isInsideFrustum = (c: Vec4, planes: readonly ClipPlane[] = CLIP_PLANES) => planes.every((p) => planeDistance(p, c) >= 0);

/** A vertex in clip space with attributes (colour, uv, ...) that interpolate linearly there, which is what clipping needs. */
export interface ClipVertex {
  clip: Vec4;
  attrs: readonly number[];
  /** True for a vertex clipping created on a plane (the lesson lists these). */
  created?: boolean;
}

const lerpClipVertex = (a: ClipVertex, b: ClipVertex, t: number): ClipVertex => ({
  clip: [0, 1, 2, 3].map((i) => a.clip[i] + (b.clip[i] - a.clip[i]) * t) as unknown as Vec4,
  attrs: a.attrs.map((v, i) => v + (b.attrs[i] - v) * t),
  created: true,
});

/**
 * Sutherland-Hodgman against each plane in turn, in clip space (before the divide, so a vertex
 * behind the camera never reaches it). A polygon fully inside comes back unchanged, one fully
 * outside comes back empty, and a straddling one gains vertices on the planes (`created`).
 * Pass a subset of planes to see what skipping the rest does.
 */
export function clipPolygon(polygon: readonly ClipVertex[], planes: readonly ClipPlane[] = CLIP_PLANES): ClipVertex[] {
  let poly = [...polygon];
  for (const plane of planes) {
    const input = poly;
    poly = [];
    input.forEach((current, i) => {
      const next = input[(i + 1) % input.length];
      const dc = planeDistance(plane, current.clip);
      const dn = planeDistance(plane, next.clip);
      const currentInside = dc >= 0;
      if (currentInside) poly.push(current);
      if (currentInside !== dn >= 0) poly.push(lerpClipVertex(current, next, dc / (dc - dn)));
    });
    if (poly.length === 0) break;
  }
  return poly;
}

export const clipTriangle = (tri: readonly [ClipVertex, ClipVertex, ClipVertex], planes?: readonly ClipPlane[]): ClipVertex[] => clipPolygon(tri, planes);

/** A convex polygon as triangles sharing its first vertex. */
export function fanTriangles<T>(polygon: readonly T[]): [T, T, T][] {
  return polygon.slice(2).map((v, i) => [polygon[0], polygon[i + 1], v]);
}

// ── depth precision ──

/** A common depth-buffer width; real hardware varies and many engines use float depth with reversed z. */
export const DEPTH_BITS = 24;

/** NDC z of a point `distance` in front of a perspective camera: (f+n)/(f-n) - 2fn / ((f-n)·distance). */
export const ndcDepthAt = (distance: number, near: number, far: number) => (far + near) / (far - near) - (2 * far * near) / ((far - near) * distance);

/** The integer a `bits`-wide depth buffer stores for an NDC z (window depth rounded to the nearest of 2^bits - 1 steps). */
export function quantiseDepth(ndcZ: number, bits = DEPTH_BITS): number {
  const steps = 2 ** bits - 1;
  return Math.round(Math.min(1, Math.max(0, windowDepth(ndcZ))) * steps);
}

/**
 * How far apart two surfaces at `distance` must be to land in different depth-buffer steps:
 * one step divided by the slope of window depth, (far-near)·d² / (far·near·(2^bits - 1)).
 * For far >> d >> near this is about d² / (near·2^bits): pushing near out is what helps.
 */
export const depthResolution = (distance: number, near: number, far: number, bits = DEPTH_BITS) => ((far - near) * distance * distance) / (far * near * (2 ** bits - 1));
