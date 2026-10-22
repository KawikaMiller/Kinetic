/** Scene 4: draw order and the early depth test, on core/raster's z-buffer renderer (which counts fragment-shader runs). */
import { mulberry32, shuffle } from '../../core/random';
import { renderTriangles, type DepthVertex, type Rendered, type Triangle } from '../../core/raster';

export const OVERDRAW_GRID = { w: 48, h: 36 } as const;
const tri = (z: number, a: [number, number], b: [number, number], c: [number, number]): Triangle<DepthVertex> => [
  { x: a[0], y: a[1], z }, { x: b[0], y: b[1], z }, { x: c[0], y: c[1], z },
];
/** Four flat triangles that overlap, listed from the farthest (depth 0.8) to the nearest (0.2). */
export const LAYOUT: readonly Triangle<DepthVertex>[] = [
  tri(0.8, [2, 3], [44, 8], [14, 33]),
  tri(0.6, [10, 2], [40, 22], [4, 28]),
  tri(0.4, [20, 10], [46, 30], [8, 34]),
  tri(0.2, [26, 3], [34, 26], [14, 22]),
];

export type OrderKind = 'back-to-front' | 'front-to-back' | 'shuffled';
export const ORDERS: readonly { value: OrderKind; label: string }[] = [
  { value: 'back-to-front', label: 'back to front' },
  { value: 'front-to-back', label: 'front to back' },
  { value: 'shuffled', label: 'shuffled' },
];
/** The seed of the shuffled order, shown on screen. */
export const SHUFFLE_SEED = 7;

const depthOf = (t: Triangle<DepthVertex>) => (t[0].z + t[1].z + t[2].z) / 3;

/** The draw order as indices into `tris`: by mean depth, or a seeded shuffle. */
export function orderFor(tris: readonly Triangle<DepthVertex>[], kind: OrderKind, seed = SHUFFLE_SEED): number[] {
  const ids = tris.map((_, i) => i);
  if (kind === 'shuffled') return shuffle(ids, mulberry32(seed));
  return ids.sort((a, b) => (kind === 'back-to-front' ? depthOf(tris[b]) - depthOf(tris[a]) : depthOf(tris[a]) - depthOf(tris[b])));
}

export interface OverdrawState {
  order: OrderKind;
  earlyZ: boolean;
}
export const initialOverdraw = (): OverdrawState => ({ order: 'back-to-front', earlyZ: false });

export interface OverdrawResult {
  rendered: Rendered;
  drawOrder: number[];
  /** Pixels showing some triangle: the shader runs this many times at the least. */
  visible: number;
  /** Shader runs whose result was overwritten by a nearer triangle. */
  wasted: number;
}

export function overdraw(s: OverdrawState): OverdrawResult {
  const drawOrder = orderFor(LAYOUT, s.order);
  const rendered = renderTriangles(LAYOUT, OVERDRAW_GRID.w, OVERDRAW_GRID.h, { order: drawOrder, earlyZ: s.earlyZ });
  const visible = rendered.id.reduce((n, id) => n + (id >= 0 ? 1 : 0), 0);
  return { rendered, drawOrder, visible, wasted: rendered.shaderInvocations - visible };
}
