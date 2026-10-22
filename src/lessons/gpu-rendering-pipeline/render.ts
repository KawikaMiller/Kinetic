/**
 * The teaching pipeline in software: vertex shader, primitive assembly and clipping (core/raster3d),
 * rasterisation (core/raster), attribute interpolation, the depth test and a fragment shader callback.
 * Pure and deterministic. A toy: real GPUs add tiling, hierarchical depth tests and massive parallelism.
 */
import { coveredPixels, interpolateLinear, interpolatePerspective } from '../../core/raster';
import {
  clipTriangle, compose, fanTriangles, lookAt, ndcToScreen, normalize3, perspective, rotationX, rotationY, transform,
  type ClipVertex, type Mat4, type Vec3, type Vec4,
} from '../../core/raster3d';
import { lambert } from '../../core/raytrace';
import { matMul } from '../../core/vec';
import { triangleCount, type Mesh, type Vertex } from './mesh';

export const DEG = Math.PI / 180;
/** The fragment grid of scene 1 and the image of the other scenes share one 4:3 shape. */
export const GRID = { w: 24, h: 18 } as const;
export const IMAGE = { w: 96, h: 72 } as const;
export const ASPECT = IMAGE.w / IMAGE.h;
const LENS = { eye: [0, 1.2, 4.6] as Vec3, target: [0, 0, 0] as Vec3, fovDeg: 45, near: 0.5, far: 20 };
const MODEL_TILT_DEG = 25;
/** The direction toward the light, in world space. */
export const LIGHT: Vec3 = normalize3([0.5, 0.8, 0.6]) ?? [0, 1, 0];

export interface Matrices {
  model: Mat4;
  mvp: Mat4;
}

/** Model (a turn about y after a fixed tilt), view and projection for a mesh at the origin. */
export function matrices(turnDeg: number): Matrices {
  const view = lookAt(LENS.eye, LENS.target, [0, 1, 0]);
  if (!view) throw new RangeError('the lesson camera has a direction');
  const model = compose(rotationX(MODEL_TILT_DEG * DEG), rotationY(turnDeg * DEG));
  return { model, mvp: matMul(perspective(LENS.fovDeg * DEG, ASPECT, LENS.near, LENS.far), matMul(view, model)) };
}

/** What the vertex shader hands on: clip position and the attributes u, v and the world-space normal. */
export interface VertexOut {
  clip: Vec4;
  attrs: number[];
}
export function vertexShader(v: Vertex, m: Matrices): VertexOut {
  const n = transform(m.model, v.normal, 0);
  return { clip: transform(m.mvp, v.pos), attrs: [v.uv[0], v.uv[1], n[0], n[1], n[2]] };
}

export interface ScreenVertex {
  x: number;
  y: number;
  /** Window depth, 0 near to 1 far. */
  z: number;
  /** Clip w, kept for perspective-correct interpolation. */
  w: number;
  attrs: number[];
}
export type ScreenTri = [ScreenVertex, ScreenVertex, ScreenVertex];

function toScreen(v: ClipVertex, w: number, h: number): ScreenVertex {
  const cw = v.clip[3];
  const s = ndcToScreen([v.clip[0] / cw, v.clip[1] / cw, v.clip[2] / cw], w, h);
  return { x: s[0], y: s[1], z: s[2], w: cw, attrs: [...v.attrs] };
}

export interface Assembled {
  /** The three vertex-shader outputs. */
  outs: VertexOut[];
  /** The polygon left after clipping (empty when the triangle is wholly outside). */
  clipped: ClipVertex[];
  /** The polygon cut into screen triangles. */
  pieces: ScreenTri[];
}

/** Input assembly, vertex shader, clipping and the divide and viewport for triangle `t` of the mesh. */
export function assemble(mesh: Mesh, t: number, m: Matrices, w: number, h: number): Assembled {
  const outs = mesh.indices.slice(3 * t, 3 * t + 3).map((i) => vertexShader(mesh.vertices[i], m));
  const clipped = clipTriangle(outs.map((o) => ({ clip: o.clip, attrs: o.attrs })) as unknown as [ClipVertex, ClipVertex, ClipVertex]);
  const pieces = fanTriangles(clipped).map((tri) => tri.map((v) => toScreen(v, w, h)) as ScreenTri);
  return { outs, clipped, pieces };
}

export interface Fragment {
  x: number;
  y: number;
  depth: number;
  bary: [number, number, number];
  u: number;
  v: number;
  /** The Lambert term N·L from the interpolated normal. */
  nl: number;
}

/** The fragments rasterisation produces for one screen triangle, with interpolated attributes (perspective-correct unless asked otherwise). */
export function fragmentsOf(piece: ScreenTri, w: number, h: number, perspectiveCorrect = true): Fragment[] {
  const attrs = piece.map((v) => v.attrs);
  const ws: Vec3 = [piece[0].w, piece[1].w, piece[2].w];
  return coveredPixels(piece, w, h).map((f) => {
    const a = perspectiveCorrect ? interpolatePerspective(attrs, f.bary, ws) : interpolateLinear(attrs, f.bary);
    const n = normalize3([a[2], a[3], a[4]]) ?? [0, 1, 0];
    return { x: f.x, y: f.y, depth: interpolateLinear(piece.map((v) => [v.z]), f.bary)[0], bary: f.bary, u: a[0], v: a[1], nl: lambert(n, LIGHT) };
  });
}

export interface Winner extends Fragment {
  tri: number;
}
export interface Visible {
  winners: (Winner | null)[];
  /** Fragments rasterisation produced over every triangle drawn. */
  covered: number;
}
export interface DrawOptions {
  /** Draw only the first `upTo` triangles (default: all). */
  upTo?: number;
  perspectiveCorrect?: boolean;
}

/** Draw triangles in index order into a z-buffer (strictly nearer wins) and report the winner at each pixel. */
export function visibleFragments(mesh: Mesh, m: Matrices, w: number, h: number, { upTo = triangleCount(mesh), perspectiveCorrect = true }: DrawOptions = {}): Visible {
  const winners: (Winner | null)[] = new Array(w * h).fill(null);
  let covered = 0;
  for (let t = 0; t < Math.min(upTo, triangleCount(mesh)); t++) {
    for (const piece of assemble(mesh, t, m, w, h).pieces) {
      for (const f of fragmentsOf(piece, w, h, perspectiveCorrect)) {
        covered++;
        const slot = f.y * w + f.x;
        const best = winners[slot];
        if (!best || f.depth < best.depth) winners[slot] = { ...f, tri: t };
      }
    }
  }
  return { winners, covered };
}

/** Triangle `t`'s fragments with the depth test applied against the triangles drawn before it. */
export function depthTestOf(mesh: Mesh, m: Matrices, w: number, h: number, t: number): { fragment: Fragment; passed: boolean }[] {
  const before = visibleFragments(mesh, m, w, h, { upTo: t }).winners;
  return assemble(mesh, t, m, w, h).pieces.flatMap((piece) =>
    fragmentsOf(piece, w, h).map((fragment) => ({ fragment, passed: !before[fragment.y * w + fragment.x] || fragment.depth < (before[fragment.y * w + fragment.x]?.depth ?? Infinity) })),
  );
}

// ── the fragment shader stage ──

export interface ShaderInputs {
  u: number;
  v: number;
  nl: number;
  z: number;
  x: number;
  y: number;
  bx: number;
  by: number;
  bz: number;
}
export type Shader = (inputs: ShaderInputs) => [number, number, number];

export interface PixelResult {
  kind: 'background' | 'ok' | 'bad';
  rgb: readonly [number, number, number];
}
export interface ShadedImage {
  w: number;
  h: number;
  pixels: PixelResult[];
  /** Fragment shader runs: one per visible pixel (the depth test ran first). */
  shaded: number;
  badCount: number;
}

export const inputsOf = (f: Winner | Fragment, w: number, h: number): ShaderInputs => ({
  u: f.u, v: f.v, nl: f.nl, z: f.depth, x: (f.x + 0.5) / w, y: (f.y + 0.5) / h, bx: f.bary[0], by: f.bary[1], bz: f.bary[2],
});

/** Run the shader on the visible fragment of each pixel; a NaN or infinite channel marks the pixel bad. Colours are clamped to 0..1. */
export function shadeImage(mesh: Mesh, m: Matrices, shader: Shader, background: readonly [number, number, number], w = IMAGE.w, h = IMAGE.h, options: DrawOptions = {}): ShadedImage {
  const { winners } = visibleFragments(mesh, m, w, h, options);
  let shaded = 0;
  let badCount = 0;
  const pixels = winners.map((f): PixelResult => {
    if (!f) return { kind: 'background', rgb: background };
    shaded++;
    const out = shader(inputsOf(f, w, h));
    if (!out.every(Number.isFinite)) {
      badCount++;
      return { kind: 'bad', rgb: background };
    }
    return { kind: 'ok', rgb: out.map((c) => Math.min(1, Math.max(0, c))) as [number, number, number] };
  });
  return { w, h, pixels, shaded, badCount };
}
