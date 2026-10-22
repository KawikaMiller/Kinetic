/**
 * 3d-transforms-projection: the pure model. Every number the lesson prints comes from here and from
 * core/raster3d. Convention (stated once on screen): right-handed, the camera looks down -z,
 * OpenGL clip space (NDC z from -1 to 1), screen y down.
 */
import { matMul } from '../../core/vec';
import {
  CLIP_PLANES, DEPTH_BITS, clipTriangle, compose, depthResolution, lookAt, ndcDepthAt, ndcToScreen, ortho, perspective, planeDistance,
  projectToScreen, quantiseDepth, rotationY, scaling, transform, translation,
  type ClipPlane, type ClipVertex, type Mat4, type Projected, type Vec3, type Vec4,
} from '../../core/raster3d';

export const VIEW_W = 200;
export const VIEW_H = 150;
export const DEG = Math.PI / 180;

// ── the cube ──

/** Corner i has x from bit 0, y from bit 1 and z from bit 2 of i (a set bit is +1). */
export const CORNERS: readonly Vec3[] = [0, 1, 2, 3, 4, 5, 6, 7].map((i): Vec3 => [i & 1 ? 1 : -1, i & 2 ? 1 : -1, i & 4 ? 1 : -1]);
/** The 12 edges: corner pairs that differ in exactly one coordinate. */
export const EDGES: readonly (readonly [number, number])[] = CORNERS.flatMap((a, i) =>
  CORNERS.flatMap((b, j) => (j > i && b.filter((v, k) => v !== a[k]).length === 1 ? [[i, j] as const] : [])),
);
export const cornerName = (i: number) => `(${CORNERS[i].map((v) => (v > 0 ? '+1' : '-1')).join(', ')})`;

// ── scene 1: one vertex through every space ──

/** The fixed camera of scene 1 (the sliders move the model, not the camera). */
export const POINT_CAMERA = { eye: [0, 1.5, 6] as Vec3, target: [0, 0, 0] as Vec3, fovDeg: 60, near: 0.5, far: 50 } as const;

export type VertexKind = 'point' | 'direction';
export interface PointState {
  vertex: number;
  scale: number;
  turnDeg: number;
  moveX: number;
  moveZ: number;
  kind: VertexKind;
}
export const POINT_RANGES = {
  scale: { min: 0.5, max: 2, step: 0.25 },
  turnDeg: { min: 0, max: 180, step: 15 },
  moveX: { min: -3, max: 3, step: 0.5 },
  moveZ: { min: -6, max: 2, step: 0.5 },
} as const;
export const initialPoint = (): PointState => ({ vertex: 7, scale: 1.5, turnDeg: 30, moveX: 2, moveZ: -2, kind: 'point' });

export type SpaceId = 'local' | 'world' | 'camera' | 'clip' | 'ndc' | 'screen';
export interface SpaceStep {
  id: SpaceId;
  title: string;
  /** The matrix that took the previous stage's vector here; null for the start, the divide and the viewport. */
  matrix: Mat4 | null;
  matrixName: string;
  /** What this stage does to the previous vector, in words. */
  rule: string;
  /** The vector in this space; null when a direction has no position here. */
  value: Vec4 | null;
}

export function modelMatrix(s: PointState): Mat4 {
  return compose(translation([s.moveX, 0, s.moveZ]), rotationY(s.turnDeg * DEG), scaling([s.scale, s.scale, s.scale]));
}

export const viewMatrix = (): Mat4 => {
  const v = lookAt(POINT_CAMERA.eye, POINT_CAMERA.target, [0, 1, 0]);
  if (!v) throw new RangeError('the lesson camera always has a direction');
  return v;
};
export const projectionMatrix = (aspect = VIEW_W / VIEW_H): Mat4 => perspective(POINT_CAMERA.fovDeg * DEG, aspect, POINT_CAMERA.near, POINT_CAMERA.far);

/** The vertex after every stage. A direction (w = 0) has no position, so it stops after camera space. */
export function pipeline(s: PointState): SpaceStep[] {
  const [x, y, z] = CORNERS[s.vertex];
  const w = s.kind === 'point' ? 1 : 0;
  const local: Vec4 = [x, y, z, w];
  const M = modelMatrix(s);
  const V = viewMatrix();
  const P = projectionMatrix();
  const world = transform(M, [x, y, z], w);
  const camera = transform(V, [world[0], world[1], world[2]], w);
  const steps: SpaceStep[] = [
    { id: 'local', title: 'Local (model) space', matrix: null, matrixName: '', rule: 'The cube as its modeller drew it, corners at plus or minus 1.', value: local },
    { id: 'world', title: 'World space', matrix: M, matrixName: 'M', rule: 'M = translate · rotate-y · scale: scale first, then turn, then move.', value: world },
    { id: 'camera', title: 'Camera (view) space', matrix: V, matrixName: 'V', rule: 'V = lookAt moves the eye to the origin, looking down -z.', value: camera },
  ];
  if (s.kind === 'direction') {
    const gone = (id: SpaceId, title: string, rule: string): SpaceStep => ({ id, title, matrix: null, matrixName: '', rule, value: null });
    return [
      ...steps,
      gone('clip', 'Clip space', 'A direction has no place on the screen, so nothing is projected.'),
      gone('ndc', 'NDC', 'No position, no divide.'),
      gone('screen', 'Screen pixels', 'No pixel.'),
    ];
  }
  const clip = transform(P, [camera[0], camera[1], camera[2]], 1);
  const projected = projectToScreen(matMul(P, matMul(V, M)), [x, y, z], VIEW_W, VIEW_H);
  const ndc: Vec4 | null = projected.ndc ? [projected.ndc[0], projected.ndc[1], projected.ndc[2], 1] : null;
  const screen: Vec4 | null = projected.screen ? [projected.screen[0], projected.screen[1], projected.screen[2], 1] : null;
  return [
    ...steps,
    { id: 'clip', title: 'Clip space', matrix: P, matrixName: 'P', rule: 'P squeezes the view frustum into a cube and stores the distance in w.', value: clip },
    { id: 'ndc', title: 'Normalised device coordinates', matrix: null, matrixName: '', rule: 'Divide x, y and z by w. This step is not a matrix: it is what makes far things small.', value: ndc },
    { id: 'screen', title: 'Screen pixels', matrix: null, matrixName: '', rule: `The viewport maps x and y to ${VIEW_W} by ${VIEW_H} pixels (y down) and z to a depth from 0 to 1.`, value: screen },
  ];
}

/** The eight corners through the whole model, view and projection of scene 1. */
export const projectCube = (s: PointState): Projected[] => {
  const mvp = matMul(projectionMatrix(), matMul(viewMatrix(), modelMatrix(s)));
  return CORNERS.map((c) => projectToScreen(mvp, c, VIEW_W, VIEW_H));
};

/** The perspective divide written out: each of x, y, z over w. */
export const divideRows = (clip: Vec4) => (['x', 'y', 'z'] as const).map((name, i) => ({ name, num: clip[i], den: clip[3], result: clip[i] / clip[3] }));

/** The viewport written out: NDC x and y to pixels (y flipped), NDC z to a depth from 0 to 1. */
export const viewportRows = (ndc: Vec4) => [
  { name: 'x pixel', formula: `(x + 1) / 2 · ${VIEW_W}`, result: ((ndc[0] + 1) / 2) * VIEW_W },
  { name: 'y pixel', formula: `(1 - y) / 2 · ${VIEW_H}`, result: ((1 - ndc[1]) / 2) * VIEW_H },
  { name: 'depth', formula: '(z + 1) / 2', result: (ndc[2] + 1) / 2 },
];

/** What translation does to each kind: the same move, applied to the vertex as a point and as a direction. */
export function translationEffect(s: PointState): { point: number; direction: number } {
  const moved = (kind: VertexKind) => {
    const base = pipeline({ ...s, moveX: 0, moveZ: 0, kind }).find((p) => p.id === 'world')?.value;
    const shifted = pipeline({ ...s, kind }).find((p) => p.id === 'world')?.value;
    if (!base || !shifted) return 0;
    return Math.hypot(shifted[0] - base[0], shifted[1] - base[1], shifted[2] - base[2]);
  };
  return { point: moved('point'), direction: moved('direction') };
}

// ── scene 2: the camera and the frustum ──

export type AspectId = '4:3' | '1:1' | '16:9';
export const ASPECTS: readonly { id: AspectId; value: number }[] = [
  { id: '4:3', value: 4 / 3 },
  { id: '1:1', value: 1 },
  { id: '16:9', value: 16 / 9 },
];
export const CANVAS_ASPECT = VIEW_W / VIEW_H;
export type ProjectionKind = 'perspective' | 'orthographic';

export interface CameraState {
  /** Top-down positions (x, z) in world units. The camera is level at CAMERA_HEIGHT, so the top-down trapezoid is exact. */
  eye: readonly [number, number];
  target: readonly [number, number];
  fovDeg: number;
  aspect: AspectId;
  near: number;
  far: number;
  projection: ProjectionKind;
  /** The last refusal or clamp, said on screen; null when the last edit was accepted. */
  note: string | null;
}
export const CAMERA_HEIGHT = 0.8;
/** Half the height of the orthographic box in world units. */
export const ORTHO_HALF_HEIGHT = 3;
/** The cube of scene 2 is turned so that its footprint is not a square on the axes. */
export const CUBE_TURN_DEG = 25;
export const FOV_RANGE = { min: 20, max: 120, step: 1 } as const;
export const NEAR_RANGE = { min: 0.1, max: 8, step: 0.1 } as const;
export const FAR_RANGE = { min: 4, max: 40, step: 1 } as const;
/** Smallest gap kept between the near and far planes. */
export const MIN_PLANE_GAP = 0.1;
/** Smallest top-down distance between the eye and the target: closer than this there is no direction to look in. */
export const MIN_LOOK_DISTANCE = 0.05;
export const PLOT_LIMIT = 12;

export const initialCamera = (): CameraState => ({ eye: [0, 6], target: [0, 0], fovDeg: 60, aspect: '4:3', near: 1, far: 12, projection: 'perspective', note: null });

export interface CameraPreset {
  id: string;
  label: string;
  apply: (s: CameraState) => CameraState;
}
export const CAMERA_PRESETS: readonly CameraPreset[] = [
  { id: 'wide', label: 'wide angle 100°', apply: (s) => ({ ...s, ...initialCamera(), fovDeg: 100 }) },
  { id: 'tele', label: 'telephoto 20°', apply: (s) => ({ ...s, ...initialCamera(), fovDeg: 20, eye: [0, 11], far: 24 }) },
  { id: 'ortho', label: 'orthographic', apply: (s) => ({ ...s, ...initialCamera(), projection: 'orthographic' }) },
  { id: 'inside', label: 'camera inside the cube', apply: (s) => ({ ...s, ...initialCamera(), eye: [0, 0], target: [0, -5] }) },
];

const aspectValue = (id: AspectId) => ASPECTS.find((a) => a.id === id)?.value ?? CANVAS_ASPECT;
const clampTo = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Moves the eye or the target, refusing a spot that leaves no direction to look in. Plot y is -z, so "up the page" is forward. */
export function moveHandle(s: CameraState, which: 'eye' | 'target', plotPoint: readonly [number, number]): CameraState {
  const next: [number, number] = [clampTo(plotPoint[0], -PLOT_LIMIT, PLOT_LIMIT), clampTo(-plotPoint[1], -PLOT_LIMIT, PLOT_LIMIT)];
  const other = which === 'eye' ? s.target : s.eye;
  if (Math.hypot(next[0] - other[0], next[1] - other[1]) < MIN_LOOK_DISTANCE) {
    return { ...s, note: 'look-at needs a direction: the camera cannot sit on its target, so the handle stayed where it was.' };
  }
  return { ...s, [which]: next, note: null };
}

export function setNear(s: CameraState, near: number): CameraState {
  const limit = s.far - MIN_PLANE_GAP;
  if (near >= limit) return { ...s, near: Math.max(NEAR_RANGE.min, Math.round((limit - MIN_PLANE_GAP) * 10) / 10), note: `near must stay below far minus ${MIN_PLANE_GAP}: the near plane stopped at ${Math.max(NEAR_RANGE.min, Math.round((limit - MIN_PLANE_GAP) * 10) / 10)}.` };
  return { ...s, near, note: null };
}
export function setFar(s: CameraState, far: number): CameraState {
  const limit = s.near + MIN_PLANE_GAP;
  if (far <= limit) return { ...s, far: Math.round((limit + MIN_PLANE_GAP) * 10) / 10, note: `far must stay above near plus ${MIN_PLANE_GAP}: the far plane stopped at ${Math.round((limit + MIN_PLANE_GAP) * 10) / 10}.` };
  return { ...s, far, note: null };
}

export interface CameraView {
  view: Mat4;
  proj: Mat4;
  mvp: Mat4;
  aspect: number;
  /** Top-down corners of the frustum: near-left, near-right, far-right, far-left, as plot points (x, -z). */
  trapezoid: [number, number][];
  /** The eight cube corners through the camera. */
  projected: Projected[];
  outside: number;
  behind: number;
  /** The image is stretched because the projection's aspect differs from the canvas. */
  stretched: boolean;
}

export const cubeModel = (): Mat4 => rotationY(CUBE_TURN_DEG * DEG);

export function projectionOf(s: CameraState): Mat4 {
  const a = aspectValue(s.aspect);
  return s.projection === 'perspective'
    ? perspective(s.fovDeg * DEG, a, s.near, s.far)
    : ortho(-ORTHO_HALF_HEIGHT * a, ORTHO_HALF_HEIGHT * a, -ORTHO_HALF_HEIGHT, ORTHO_HALF_HEIGHT, s.near, s.far);
}

/** Half the width of the frustum cross-section `d` in front of the eye. */
export const halfWidthAt = (s: CameraState, d: number) => (s.projection === 'perspective' ? d * Math.tan((s.fovDeg * DEG) / 2) : ORTHO_HALF_HEIGHT) * aspectValue(s.aspect);

export function cameraView(s: CameraState): CameraView {
  const view = lookAt([s.eye[0], CAMERA_HEIGHT, s.eye[1]], [s.target[0], CAMERA_HEIGHT, s.target[1]], [0, 1, 0]);
  if (!view) throw new RangeError('moveHandle keeps the eye off the target');
  const aspect = aspectValue(s.aspect);
  const proj = projectionOf(s);
  const mvp = matMul(proj, matMul(view, cubeModel()));
  const fx = s.target[0] - s.eye[0];
  const fz = s.target[1] - s.eye[1];
  const len = Math.hypot(fx, fz);
  const fwd: [number, number] = [fx / len, fz / len];
  const side: [number, number] = [-fwd[1], fwd[0]];
  const corner = (d: number, sign: number): [number, number] => {
    const hw = halfWidthAt(s, d) * sign;
    return [s.eye[0] + fwd[0] * d + side[0] * hw, -(s.eye[1] + fwd[1] * d + side[1] * hw)];
  };
  const projected = CORNERS.map((c) => projectToScreen(mvp, c, VIEW_W, VIEW_H));
  return {
    view, proj, mvp, aspect,
    trapezoid: [corner(s.near, -1), corner(s.near, 1), corner(s.far, 1), corner(s.far, -1)],
    projected,
    outside: projected.filter((p) => !p.inFrustum).length,
    behind: projected.filter((p) => p.behind).length,
    stretched: Math.abs(aspect - CANVAS_ASPECT) > 1e-9,
  };
}

/** The cube's footprint corners in world x, -z (four distinct points: the top and bottom corners share them). */
export function footprint(): { point: [number, number]; vertices: [number, number] }[] {
  const m = cubeModel();
  return [0, 1, 3, 2].map((i) => {
    const w = transform(m, CORNERS[i]);
    return { point: [w[0], -w[2]] as [number, number], vertices: [i, i + 4] as [number, number] };
  });
}

/** An edge whose corners are both inside the frustum is drawn plain, any other is dim, and one with a corner behind the camera cannot be drawn. */
export function edgeStateOf(pa: Projected, pb: Projected): 'plain' | 'dim' | 'hidden' {
  if (pa.behind || pb.behind || !pa.screen || !pb.screen) return 'hidden';
  return pa.inFrustum && pb.inFrustum ? 'plain' : 'dim';
}
export const edgeState = (view: CameraView, a: number, b: number) => edgeStateOf(view.projected[a], view.projected[b]);

// ── scene 3: clipping and the point behind you ──

export const CLIP_SCENE = { fovDeg: 60, near: 1, far: 20, aspect: VIEW_W / VIEW_H } as const;
export const APEX_RANGE = { min: -8, max: 3, step: 0.5 } as const;
export const DEFAULT_APEX_Z = 2;
export interface ClipState {
  clipping: boolean;
  apexZ: number;
}
export const initialClip = (): ClipState => ({ clipping: true, apexZ: DEFAULT_APEX_Z });

/** The triangle in eye space: a base 4 units in front of the camera and an apex at height 1.2 and depth `apexZ` (positive z is behind the camera). */
export const clipTriangleCorners = (apexZ: number): [Vec3, Vec3, Vec3] => [[-1.5, -1, -4], [1.5, -1, -4], [0, 1.2, apexZ]];
const CLIP_NAMES = ['A', 'B', 'C'];

export interface ClipRow {
  name: string;
  clip: Vec4;
  created: boolean;
  planes: ClipPlane[];
  /** Screen position after the divide; for w < 0 this is the mirrored result. */
  screen: [number, number] | null;
  behind: boolean;
}
export interface ClipResult {
  rows: ClipRow[];
  /** Screen polygon of the output, in output order. */
  polygon: [number, number][];
  /** How many vertices of the input are at or behind the camera plane. */
  behindInput: number;
  /** Planes that cut the triangle. */
  cutBy: ClipPlane[];
}

const toScreen = (clip: Vec4): [number, number] | null => {
  const w = clip[3];
  if (w === 0) return null;
  const s = ndcToScreen([clip[0] / w, clip[1] / w, clip[2] / w], VIEW_W, VIEW_H);
  return [s[0], s[1]];
};

export function clipScene(s: ClipState): ClipResult {
  const P = perspective(CLIP_SCENE.fovDeg * DEG, CLIP_SCENE.aspect, CLIP_SCENE.near, CLIP_SCENE.far);
  const tri = clipTriangleCorners(s.apexZ).map((p, i): ClipVertex => ({ clip: transform(P, p), attrs: [i] })) as [ClipVertex, ClipVertex, ClipVertex];
  const out = clipTriangle(tri, s.clipping ? CLIP_PLANES : []);
  const rows = out.map((v, i): ClipRow => ({
    name: v.created ? `new ${i + 1}` : CLIP_NAMES[v.attrs[0]],
    clip: v.clip,
    created: !!v.created,
    planes: v.created ? CLIP_PLANES.filter((p) => Math.abs(planeDistance(p, v.clip)) < 1e-9) : [],
    screen: toScreen(v.clip),
    behind: v.clip[3] <= 0,
  }));
  const cutBy = CLIP_PLANES.filter((p) => tri.some((v) => planeDistance(p, v.clip) < 0));
  return {
    rows,
    polygon: rows.flatMap((r) => (r.screen ? [r.screen] : [])),
    behindInput: tri.filter((v) => v.clip[3] <= 0).length,
    cutBy,
  };
}

/** Side view (depth in front on x, height on y): each triangle edge split at the near plane into the kept part and the clipped-away part. */
export interface SideSegment {
  from: [number, number];
  to: [number, number];
  kept: boolean;
}
export function sideSegments(apexZ: number): SideSegment[] {
  const [a, b, c] = clipTriangleCorners(apexZ);
  const near = CLIP_SCENE.near;
  const depth = (p: Vec3) => -p[2];
  const out: SideSegment[] = [];
  for (const [p, q] of [[a, b], [b, c], [c, a]] as const) {
    const dp = depth(p);
    const dq = depth(q);
    const piece = (from: Vec3, to: Vec3, kept: boolean) => out.push({ from: [depth(from), from[1]], to: [depth(to), to[1]], kept });
    if (dp >= near && dq >= near) piece(p, q, true);
    else if (dp < near && dq < near) piece(p, q, false);
    else {
      const t = (near - dp) / (dq - dp);
      const mid: Vec3 = [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
      piece(p, mid, dp >= near);
      piece(mid, q, dq >= near);
    }
  }
  return out;
}

// ── scene 4: depth precision ──

export const NEAR_CHOICES = [0.001, 0.003, 0.01, 0.03, 0.1, 0.3, 1] as const;
export const FAR_CHOICES = [10, 100, 1000, 10000] as const;
export const GAP_CHOICES = [0.001, 0.003, 0.01, 0.03, 0.1, 0.3, 1] as const;
export const DISTANCE_RANGE = { min: 5, max: 100, step: 5 } as const;
export interface DepthState {
  nearIndex: number;
  farIndex: number;
  gapIndex: number;
  distance: number;
}
export const initialDepth = (): DepthState => ({ nearIndex: 2, farIndex: 2, gapIndex: 2, distance: 50 });

export const DEPTH_IMAGE = { w: 100, h: 75 } as const;
/** How much the distance to the two slanted surfaces varies across the picture (a fraction of the distance, left to right and top to bottom). */
const TILT_X = 0.4;
const TILT_Y = 0.2;

/** The distance to the back surface at pixel (x, y): it slants away so that rounding falls differently from pixel to pixel. */
export const surfaceDistance = (distance: number, x: number, y: number) => distance * (1 + TILT_X * ((x + 0.5) / DEPTH_IMAGE.w - 0.5) + TILT_Y * ((y + 0.5) / DEPTH_IMAGE.h - 0.5));

export interface DepthResult {
  near: number;
  far: number;
  gap: number;
  distance: number;
  /** One step of the 24-bit buffer, in distance units, at the chosen distance. */
  resolution: number;
  /** Per pixel: 0 the nearer surface wins, 1 both surfaces store the same depth value (z-fight), 2 outside the near and far planes (clipped, not drawn). */
  tied: Uint8Array;
  /** Share of the drawn (not clipped) pixels that z-fight. */
  tiedShare: number;
  /** Share of all pixels outside the near and far planes. */
  clippedShare: number;
  /** The depth value both surfaces store at the centre pixel. */
  centre: { front: number; back: number };
}

export function depthScene(s: DepthState): DepthResult {
  const near = NEAR_CHOICES[s.nearIndex];
  const far = FAR_CHOICES[s.farIndex];
  const gap = GAP_CHOICES[s.gapIndex];
  const tied = new Uint8Array(DEPTH_IMAGE.w * DEPTH_IMAGE.h);
  const store = (d: number) => quantiseDepth(ndcDepthAt(d, near, far), DEPTH_BITS);
  for (let y = 0; y < DEPTH_IMAGE.h; y++) {
    for (let x = 0; x < DEPTH_IMAGE.w; x++) {
      const d = surfaceDistance(s.distance, x, y);
      const drawn = d >= near && d + gap <= far;
      tied[y * DEPTH_IMAGE.w + x] = !drawn ? 2 : store(d) === store(d + gap) ? 1 : 0;
    }
  }
  const drawnCount = tied.filter((v) => v !== 2).length;
  const cx = DEPTH_IMAGE.w >> 1;
  const cy = DEPTH_IMAGE.h >> 1;
  const dc = surfaceDistance(s.distance, cx, cy);
  return {
    near, far, gap, distance: s.distance,
    resolution: depthResolution(s.distance, near, far),
    tied,
    tiedShare: drawnCount === 0 ? 0 : tied.filter((v) => v === 1).length / drawnCount,
    clippedShare: 1 - drawnCount / tied.length,
    centre: { front: store(Math.min(far, Math.max(near, dc))), back: store(Math.min(far, Math.max(near, dc + gap))) },
  };
}
