/** Scene 3: a checker on a slanted quad, interpolated screen-linearly (wrong) or perspective-correct. */
import { identity4, lookAt, perspective, type Vec3 } from '../../core/raster3d';
import { matMul } from '../../core/vec';
import type { Mesh } from './mesh';
import { ASPECT, DEG, IMAGE, visibleFragments, type Matrices } from './render';

/** The quad lies on the floor y = -1, 10 wide and 8 deep, receding from the camera. Its texture coordinates are world metres from its near-left corner. */
export const QUAD_FLOOR_Y = -1;
export const QUAD_HALF_WIDTH = 5;
export const QUAD_NEAR_Z = 1;
export const QUAD_FAR_Z = -7;
/** How many checker squares fit in one world unit of u or v. */
export const SQUARES_PER_UNIT = 0.5;

const CORNERS: readonly Vec3[] = [
  [-QUAD_HALF_WIDTH, QUAD_FLOOR_Y, QUAD_NEAR_Z],
  [QUAD_HALF_WIDTH, QUAD_FLOOR_Y, QUAD_NEAR_Z],
  [QUAD_HALF_WIDTH, QUAD_FLOOR_Y, QUAD_FAR_Z],
  [-QUAD_HALF_WIDTH, QUAD_FLOOR_Y, QUAD_FAR_Z],
];

export const quad = (): Mesh => ({
  id: 'quad',
  name: 'slanted quad',
  vertices: CORNERS.map((pos) => ({ pos, uv: [pos[0] + QUAD_HALF_WIDTH, QUAD_NEAR_Z - pos[2]] as const, normal: [0, 1, 0] as Vec3 })),
  indices: [0, 1, 2, 0, 2, 3],
});

export const QUAD_CAMERA = { eye: [0, 1, 2] as Vec3, target: [0, -1, -5] as Vec3, fovDeg: 80, near: 0.1, far: 50 };

export function quadMatrices(): Matrices {
  const view = lookAt(QUAD_CAMERA.eye, QUAD_CAMERA.target, [0, 1, 0]);
  if (!view) throw new RangeError('the quad camera has a direction');
  return { model: identity4(), mvp: matMul(perspective(QUAD_CAMERA.fovDeg * DEG, ASPECT, QUAD_CAMERA.near, QUAD_CAMERA.far), view) };
}

export interface QuadPixel {
  /** Checker parity from the interpolated u and v: 0 or 1, or null where the quad is not. */
  parity: 0 | 1 | null;
  u: number;
  v: number;
}

export const parityAt = (u: number, v: number): 0 | 1 => ((Math.floor(u * SQUARES_PER_UNIT) + Math.floor(v * SQUARES_PER_UNIT)) % 2 === 0 ? 0 : 1);

export function quadImage(perspectiveCorrect: boolean, w = IMAGE.w, h = IMAGE.h): QuadPixel[] {
  const { winners } = visibleFragments(quad(), quadMatrices(), w, h, { perspectiveCorrect });
  return winners.map((f) => (f ? { parity: parityAt(f.u, f.v), u: f.u, v: f.v } : { parity: null, u: 0, v: 0 }));
}

/** The number of covered pixels whose checker colour differs between the two modes. */
export function bentPixels(w = IMAGE.w, h = IMAGE.h): { differing: number; covered: number } {
  const good = quadImage(true, w, h);
  const bad = quadImage(false, w, h);
  const covered = good.filter((p) => p.parity !== null).length;
  return { differing: good.filter((p, i) => p.parity !== bad[i].parity).length, covered };
}
