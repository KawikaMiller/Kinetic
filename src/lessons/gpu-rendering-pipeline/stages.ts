/** Scene 1: what each pipeline stage does to one triangle, computed from the software pipeline. */
import { meshOf, triangleCount, type MeshId } from './mesh';
import { GRID, assemble, depthTestOf, matrices, visibleFragments, type Assembled, type Fragment } from './render';

export type StageId = 'input' | 'vertex' | 'primitive' | 'raster' | 'fragment' | 'depth' | 'blend' | 'framebuffer';
export interface StageInfo {
  id: StageId;
  label: string;
  /** The two programmable stages take plain lane tones, so a lane never reads as pass or fail. */
  lane: 'amber' | 'pink' | null;
}
export const STAGES: readonly StageInfo[] = [
  { id: 'input', label: 'Input assembly', lane: null },
  { id: 'vertex', label: 'Vertex shader', lane: 'amber' },
  { id: 'primitive', label: 'Primitive assembly and clipping', lane: null },
  { id: 'raster', label: 'Rasterisation', lane: null },
  { id: 'fragment', label: 'Fragment shader', lane: 'pink' },
  { id: 'depth', label: 'Depth test', lane: null },
  { id: 'blend', label: 'Blending', lane: null },
  { id: 'framebuffer', label: 'Framebuffer', lane: null },
];

export interface PipelineState {
  mesh: MeshId;
  turnDeg: number;
  /** Which triangle of the mesh the stepper follows (0-based). */
  triangle: number;
  stage: number;
  /** The fragment cell the learner picked, as x + y * GRID.w, or null. */
  picked: number | null;
}
export const TURN_RANGE = { min: 0, max: 345, step: 15 } as const;
/** The first triangle of the cube's +z face, which faces the camera at the default turn. */
export const DEFAULT_TRIANGLE = 8;
export const initialPipeline = (): PipelineState => ({ mesh: 'cube', turnDeg: 30, triangle: DEFAULT_TRIANGLE, stage: 0, picked: null });

export const lastTriangle = (mesh: MeshId) => triangleCount(meshOf(mesh)) - 1;
/** Switching mesh keeps the stage and turn and clamps the triangle into the new mesh's range. */
export const withMesh = (s: PipelineState, mesh: MeshId): PipelineState => ({ ...s, mesh, triangle: Math.min(s.triangle, lastTriangle(mesh)), picked: null });
export const withStage = (s: PipelineState, stage: number): PipelineState => ({ ...s, stage: Math.min(STAGES.length - 1, Math.max(0, stage)) });

export interface Analysis {
  vertexCount: number;
  indexCount: number;
  triangles: number;
  indices: number[];
  assembled: Assembled;
  /** True when clipping changed the triangle (it crossed a clip plane). */
  wasClipped: boolean;
  fragments: Fragment[];
  tested: { fragment: Fragment; passed: boolean }[];
  passed: number;
  /** Pixels (x + y * GRID.w) showing this triangle after it was drawn on top of the ones before it. */
  onTopSlots: number[];
  /** Pixels showing any of triangles 0..t. */
  drawnSlots: number[];
}

export function analyse(s: PipelineState): Analysis {
  const mesh = meshOf(s.mesh);
  const m = matrices(s.turnDeg);
  const assembled = assemble(mesh, s.triangle, m, GRID.w, GRID.h);
  const tested = depthTestOf(mesh, m, GRID.w, GRID.h, s.triangle);
  const winners = visibleFragments(mesh, m, GRID.w, GRID.h, { upTo: s.triangle + 1 }).winners;
  return {
    vertexCount: mesh.vertices.length,
    indexCount: mesh.indices.length,
    triangles: triangleCount(mesh),
    indices: mesh.indices.slice(3 * s.triangle, 3 * s.triangle + 3),
    assembled,
    wasClipped: assembled.clipped.some((v) => v.created) || assembled.clipped.length !== 3,
    fragments: tested.map((t) => t.fragment),
    tested,
    passed: tested.filter((t) => t.passed).length,
    onTopSlots: winners.flatMap((w, i) => (w?.tri === s.triangle ? [i] : [])),
    drawnSlots: winners.flatMap((w, i) => (w ? [i] : [])),
  };
}
