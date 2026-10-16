/**
 * Scenes 1 and 2: sliding a 3 x 3 kernel over an 8 x 8 image, the stepper's nine products, ReLU and
 * 2 x 2 max pooling, and shifting the image. Convolution here is deep-learning convolution (the
 * kernel is not flipped) from core/linalg; the flipped version is a toggle.
 */
import { conv2d } from '../../core/linalg';
import { mulberry32 } from '../../core/random';
import { SIZE, type Image } from './barsData';

export type Kernel = number[][];
export const KERNEL_SIZE = 3;
/** Painting steps an image cell cycles through. */
export const INTENSITIES = [0, 0.5, 1] as const;
export const STRIDES = [1, 2] as const;
export const PADS = [0, 1] as const;
export const KERNEL_LIMIT = 9;

export interface ConvOptions {
  stride: number;
  pad: number;
  relu: boolean;
  /** True convolution: the kernel is rotated 180 degrees first. */
  flip: boolean;
}
export const DEFAULT_OPTIONS: ConvOptions = { stride: 1, pad: 0, relu: false, flip: false };

/** floor((n + 2p - k) / s) + 1: the side of the output. */
export const outputSize = (n: number, k: number, p: number, s: number): number => Math.floor((n + 2 * p - k) / s) + 1;

/** Why a stride, padding or kernel size cannot be used on an n x n image, or null when it can. */
export function refuse(n: number, k: number, p: number, s: number): string | null {
  if (!Number.isInteger(s) || s < 1) return 'The stride has to be a whole number, 1 or more.';
  if (!Number.isInteger(p) || p < 0 || p > 1) return 'Padding is 0 (valid) or 1 (same) here.';
  if (k > n + 2 * p) return `A ${k} x ${k} kernel does not fit a ${n + 2 * p} x ${n + 2 * p} padded image.`;
  return null;
}

export const flipKernel = (k: Kernel): Kernel => k.map((_, y) => k.map((__, x) => k[k.length - 1 - y][k.length - 1 - x]));

const relu = (map: number[][]): number[][] => map.map((row) => row.map((v) => Math.max(v, 0)));

/** The feature map: conv2d of the image with the (optionally flipped) kernel, then optional ReLU. */
export function convolve(image: Image, kernel: Kernel, o: ConvOptions): number[][] {
  const reason = refuse(image.length, kernel.length, o.pad, o.stride);
  if (reason) throw new RangeError(reason);
  const map = conv2d(image, o.flip ? flipKernel(kernel) : kernel, { stride: o.stride, pad: o.pad });
  return o.relu ? relu(map) : map;
}

/** The image with `pad` rings of zeros around it (what the window really slides over). */
export function padded(image: Image, pad: number): Image {
  const n = image.length + 2 * pad;
  return Array.from({ length: n }, (_, y) => Array.from({ length: n }, (_, x) => image[y - pad]?.[x - pad] ?? 0));
}

export interface WindowStep {
  /** Output cell this window fills. */
  oy: number;
  ox: number;
  /** Top-left of the window on the padded image. */
  top: number;
  left: number;
  /** kernel[y][x] times the pixel under it. */
  products: number[][];
  sum: number;
  /** The feature-map value: the sum, or max(sum, 0) with ReLU. */
  value: number;
}

/** One step per output cell, in reading order: the nine products, their sum and the value written. */
export function windowSteps(image: Image, kernel: Kernel, o: ConvOptions): WindowStep[] {
  const used = o.flip ? flipKernel(kernel) : kernel;
  const grid = padded(image, o.pad);
  const side = outputSize(image.length, used.length, o.pad, o.stride);
  const steps: WindowStep[] = [];
  for (let oy = 0; oy < side; oy++) {
    for (let ox = 0; ox < side; ox++) {
      const [top, left] = [oy * o.stride, ox * o.stride];
      const products = used.map((row, ky) => row.map((w, kx) => w * grid[top + ky][left + kx]));
      const sum = products.flat().reduce((a, b) => a + b, 0);
      steps.push({ oy, ox, top, left, products, sum, value: o.relu ? Math.max(sum, 0) : sum });
    }
  }
  return steps;
}

// ── Images ──────────────────────────────────────────────────────────────────

const blank = (): Image => Array.from({ length: SIZE }, () => new Array<number>(SIZE).fill(0));
const draw = (cells: readonly (readonly [number, number])[]): Image => {
  const image = blank();
  for (const [y, x] of cells) image[y][x] = 1;
  return image;
};
const line = (n: number) => Array.from({ length: n }, (_, i) => i);

export type ImagePresetId = 'vbar' | 'hbar' | 'ell' | 'diagonal' | 'noise';
export const NOISE_LEVELS = [0.2, 0.5, 1] as const;
export const NOISE_SEED = 4;

export const IMAGE_PRESETS: { id: ImagePresetId; label: string }[] = [
  { id: 'vbar', label: 'Vertical bar' },
  { id: 'hbar', label: 'Horizontal bar' },
  { id: 'ell', label: 'An L' },
  { id: 'diagonal', label: 'Diagonal' },
  { id: 'noise', label: 'Noise' },
];

/** Seeded noise on the painting steps: `level` is the share of pixels that are lit (half or full). */
function noiseImage(level: number): Image {
  const rnd = mulberry32(NOISE_SEED);
  return blank().map((row) => row.map(() => (rnd() < level ? (rnd() < 0.5 ? 0.5 : 1) : 0)));
}

export function presetImage(id: ImagePresetId, noiseLevel: number = NOISE_LEVELS[0]): Image {
  switch (id) {
    case 'vbar':
      return draw(line(SIZE).map((y) => [y, 3] as const));
    case 'hbar':
      return draw(line(SIZE).map((x) => [3, x] as const));
    case 'ell':
      return draw([...line(6).map((y) => [1 + y, 2] as const), ...line(4).map((x) => [6, 2 + x] as const)]);
    case 'diagonal':
      return draw(line(SIZE).map((i) => [i, i] as const));
    case 'noise':
      return noiseImage(noiseLevel);
  }
}

/** The paint cycle: 0 -> 0.5 -> 1 -> 0. */
export const nextIntensity = (v: number): number => INTENSITIES[(INTENSITIES.indexOf(v as (typeof INTENSITIES)[number]) + 1) % INTENSITIES.length];

export const paintCell = (image: Image, y: number, x: number): Image =>
  image.map((row, r) => (r === y ? row.map((v, c) => (c === x ? nextIntensity(v) : v)) : row));

// ── Kernels ─────────────────────────────────────────────────────────────────

export type KernelPresetId = 'identity' | 'blur' | 'sharpen' | 'sobelX' | 'sobelY';

/** The box blur is written to three decimals (1/9 is not a plain decimal the field can hold). */
export const BOX = 0.111;

export const KERNEL_PRESETS: { id: KernelPresetId; label: string; kernel: Kernel }[] = [
  { id: 'identity', label: 'Identity', kernel: [[0, 0, 0], [0, 1, 0], [0, 0, 0]] },
  { id: 'blur', label: 'Box blur (about 1/9)', kernel: [[BOX, BOX, BOX], [BOX, BOX, BOX], [BOX, BOX, BOX]] },
  { id: 'sharpen', label: 'Sharpen', kernel: [[0, -1, 0], [-1, 5, -1], [0, -1, 0]] },
  { id: 'sobelX', label: 'Vertical edge (Sobel x)', kernel: [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]] },
  { id: 'sobelY', label: 'Horizontal edge (Sobel y)', kernel: [[-1, -2, -1], [0, 0, 0], [1, 2, 1]] },
];
export const kernelOf = (id: KernelPresetId): Kernel => KERNEL_PRESETS.find((p) => p.id === id)!.kernel.map((r) => [...r]);

// ── Scene 2: pooling and shifting ───────────────────────────────────────────

export const POOL = 2;

/** 2 x 2 max pooling with stride 2 (a map with an odd side loses its last row and column). */
export function maxPool(map: number[][]): number[][] {
  const side = Math.floor(map.length / POOL);
  return Array.from({ length: side }, (_, y) =>
    Array.from({ length: side }, (_, x) => Math.max(...[0, 1].flatMap((dy) => [0, 1].map((dx) => map[y * POOL + dy][x * POOL + dx])))),
  );
}

/** Move the picture `dx` columns right (negative: left); what slides off is lost, what slides in is 0. */
export const shiftImage = (image: Image, dx: number): Image => image.map((row) => row.map((_, x) => row[x - dx] ?? 0));

export const POOL_SCENE_KERNEL: Kernel = kernelOf('sobelX');
export const SHIFTS = [-2, -1, 0, 1, 2] as const;
export const BAR_COLUMNS = [2, 3, 4, 5] as const;
export const POOL_SCENE_OPTIONS: ConvOptions = { stride: 1, pad: 0, relu: true, flip: false };

/** A vertical bar one pixel wide at column `column`. */
export const barAt = (column: number): Image => draw(line(SIZE).map((y) => [y, column] as const));

export interface ShiftReport {
  original: { image: Image; map: number[][]; pooled: number[][] };
  shifted: { image: Image; map: number[][]; pooled: number[][] };
  /** Does shifting the feature map of the original by dx give the feature map of the shifted image, away from the edges the shift reveals? */
  mapShifted: boolean;
  /** Cells where the two pooled maps differ. */
  pooledChanged: number;
}

export function shiftReport(image: Image, dx: number): ShiftReport {
  const make = (im: Image) => {
    const map = convolve(im, POOL_SCENE_KERNEL, POOL_SCENE_OPTIONS);
    return { image: im, map, pooled: maxPool(map) };
  };
  const original = make(image);
  const shifted = make(shiftImage(image, dx));
  // Only outputs whose source column exists in the original: the shift filled the rest with zeros.
  const side = original.map.length;
  let mapShifted = true;
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const from = x - dx;
      if (from < 0 || from >= side) continue;
      if (Math.abs(shifted.map[y][x] - original.map[y][from]) > 1e-9) mapShifted = false;
    }
  }
  const pooledChanged = original.pooled.flat().filter((v, i) => Math.abs(v - shifted.pooled.flat()[i]) > 1e-9).length;
  return { original, shifted, mapShifted, pooledChanged };
}

/** A bar column and shift that leave the pooled map unchanged, and one that changes it, found by running every combination. */
export function shiftPresets(): { unchanged: { column: number; shift: number }; changed: { column: number; shift: number } } {
  const all = BAR_COLUMNS.flatMap((column) => [1, -1, 2, -2].map((shift) => ({ column, shift, changed: shiftReport(barAt(column), shift).pooledChanged })));
  return { unchanged: all.find((c) => c.changed === 0)!, changed: all.find((c) => c.changed > 0)! };
}

/** Numbers learned by a layer: its kernels' weights and one bias each. Pooling learns none. */
export const convParams = (kernels: number, k: number): number => kernels * (k * k + 1);
export const denseParams = (inputs: number, outputs: number): number => inputs * outputs + outputs;
