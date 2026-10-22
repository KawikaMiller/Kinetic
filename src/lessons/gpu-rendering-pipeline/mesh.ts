/** Two small meshes with vertex and index buffers: a cube (24 vertices, 36 indices) and an icosphere (80 triangles). */
import { add3, normalize3, scale3, type Vec3 } from '../../core/raster3d';

export interface Vertex {
  pos: Vec3;
  /** Surface coordinates, the attribute the checker and the texture read. */
  uv: readonly [number, number];
  normal: Vec3;
}
export type MeshId = 'cube' | 'icosphere';
export interface Mesh {
  id: string;
  name: string;
  vertices: Vertex[];
  /** Three indices per triangle. */
  indices: number[];
}
export const triangleCount = (m: Mesh) => m.indices.length / 3;
export const MESH_IDS: readonly MeshId[] = ['cube', 'icosphere'];

/** Face normal, then the two in-plane axes: each face is a unit square of side 2 centred on the normal. */
const FACES: readonly (readonly [Vec3, Vec3, Vec3])[] = [
  [[1, 0, 0], [0, 0, -1], [0, 1, 0]],
  [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
  [[0, 1, 0], [1, 0, 0], [0, 0, -1]],
  [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
  [[0, 0, 1], [1, 0, 0], [0, 1, 0]],
  [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
];

export function cube(): Mesh {
  const vertices: Vertex[] = [];
  const indices: number[] = [];
  for (const [n, s, t] of FACES) {
    const base = vertices.length;
    for (const [su, tv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      vertices.push({ pos: add3(n, add3(scale3(s, su), scale3(t, tv))), uv: [(su + 1) / 2, (tv + 1) / 2], normal: n });
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return { id: 'cube', name: 'cube', vertices, indices };
}

const PHI = (1 + Math.sqrt(5)) / 2;
const ICO_VERTICES: Vec3[] = [
  [-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0],
  [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI],
  [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1],
];
const ICO_FACES: [number, number, number][] = [
  [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
  [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
];

const unit = (p: Vec3): Vec3 => normalize3(p) ?? [0, 1, 0];
const mid = (a: Vec3, b: Vec3): Vec3 => unit(scale3(add3(a, b), 0.5));

/** Longitude and latitude as surface coordinates in 0..1. */
const sphereUv = (p: Vec3): [number, number] => [Math.atan2(p[2], p[0]) / (2 * Math.PI) + 0.5, Math.asin(Math.max(-1, Math.min(1, p[1]))) / Math.PI + 0.5];

/** An icosahedron with each face split in four (80 triangles) pushed out to the unit sphere. Triangles do not share vertices, so a triangle on the texture seam can carry u past 1 instead of wrapping. */
export function icosphere(): Mesh {
  const vertices: Vertex[] = [];
  const indices: number[] = [];
  const addTriangle = (a: Vec3, b: Vec3, c: Vec3) => {
    const uvs = [a, b, c].map(sphereUv);
    const lowest = Math.min(...uvs.map((uv) => uv[0]));
    const wraps = Math.max(...uvs.map((uv) => uv[0])) - lowest > 0.5;
    [a, b, c].forEach((p, i) => {
      const [u, v] = uvs[i];
      indices.push(vertices.length);
      vertices.push({ pos: p, uv: [wraps && u < 0.5 ? u + 1 : u, v], normal: p });
    });
  };
  for (const [i, j, k] of ICO_FACES) {
    const [a, b, c] = [unit(ICO_VERTICES[i]), unit(ICO_VERTICES[j]), unit(ICO_VERTICES[k])];
    const [ab, bc, ca] = [mid(a, b), mid(b, c), mid(c, a)];
    addTriangle(a, ab, ca);
    addTriangle(b, bc, ab);
    addTriangle(c, ca, bc);
    addTriangle(ab, bc, ca);
  }
  return { id: 'icosphere', name: 'icosphere', vertices, indices };
}

export const meshOf = (id: MeshId): Mesh => (id === 'cube' ? cube() : icosphere());
