/** Scene 5: two translucent triangles blended with src-alpha, one-minus-src-alpha, and the order that changes the colour. */
import { coveredPixels, blendOver, type Triangle } from '../../core/raster';
import type { Vec3 } from '../../core/raster3d';
import { tokenRgb } from '../../components/canvasImage';

export const BLEND_GRID = { w: 32, h: 24 } as const;
export const BACKGROUND: Vec3 = [...tokenRgb('bg2')];
export const COLOUR_A: Vec3 = [...tokenRgb('pink')];
export const COLOUR_B: Vec3 = [...tokenRgb('sky')];
export const ALPHA_RANGE = { min: 0, max: 1, step: 0.1 } as const;

const A: Triangle = [{ x: 2, y: 3 }, { x: 24, y: 8 }, { x: 8, y: 21 }];
const B: Triangle = [{ x: 28, y: 2 }, { x: 22, y: 22 }, { x: 6, y: 9 }];

export type BlendOrder = 'a-then-b' | 'b-then-a';
export interface BlendState {
  order: BlendOrder;
  alphaA: number;
  alphaB: number;
}
export const initialBlend = (): BlendState => ({ order: 'a-then-b', alphaA: 0.6, alphaB: 0.6 });

export type Region = 'a-only' | 'both' | 'b-only' | 'none';
export interface BlendStep {
  /** Which triangle was drawn. */
  triangle: 'A' | 'B';
  alpha: number;
  before: Vec3;
  after: Vec3;
}
export interface BlendResult {
  pixels: Vec3[];
  region: Region[];
  steps: (BlendStep[])[];
}

const coverage = (t: Triangle) => new Set(coveredPixels(t, BLEND_GRID.w, BLEND_GRID.h).map((f) => f.y * BLEND_GRID.w + f.x));
const coverA = coverage(A);
const coverB = coverage(B);
const regionOf = (i: number): Region => (coverA.has(i) && coverB.has(i) ? 'both' : coverA.has(i) ? 'a-only' : coverB.has(i) ? 'b-only' : 'none');

/** Draw both triangles in the chosen order onto the background, recording each pixel's blend steps. */
export function blend(s: BlendState): BlendResult {
  const draws = s.order === 'a-then-b'
    ? ([['A', coverA, COLOUR_A, s.alphaA], ['B', coverB, COLOUR_B, s.alphaB]] as const)
    : ([['B', coverB, COLOUR_B, s.alphaB], ['A', coverA, COLOUR_A, s.alphaA]] as const);
  const n = BLEND_GRID.w * BLEND_GRID.h;
  const pixels: Vec3[] = new Array(n).fill(BACKGROUND);
  const steps: BlendStep[][] = Array.from({ length: n }, () => []);
  for (const [triangle, cover, colour, alpha] of draws) {
    cover.forEach((slot) => {
      const before = pixels[slot];
      pixels[slot] = blendOver(colour, alpha, before);
      steps[slot].push({ triangle, alpha, before, after: pixels[slot] });
    });
  }
  const region = pixels.map((_, i) => regionOf(i));
  return { pixels, region, steps };
}

/** A pixel in a region to read numbers from: the one nearest the middle of the region. */
export function probePixel(region: Region): number {
  const n = BLEND_GRID.w * BLEND_GRID.h;
  const slots = Array.from({ length: n }, (_, i) => i).filter((i) => regionOf(i) === region);
  const centre = slots.reduce((sx, i) => sx + (i % BLEND_GRID.w), 0) / slots.length;
  const middle = slots.reduce((sy, i) => sy + Math.floor(i / BLEND_GRID.w), 0) / slots.length;
  return slots.reduce((best, i) => {
    const d = (i % BLEND_GRID.w - centre) ** 2 + (Math.floor(i / BLEND_GRID.w) - middle) ** 2;
    const db = (best % BLEND_GRID.w - centre) ** 2 + (Math.floor(best / BLEND_GRID.w) - middle) ** 2;
    return d < db ? i : best;
  }, slots[0]);
}
