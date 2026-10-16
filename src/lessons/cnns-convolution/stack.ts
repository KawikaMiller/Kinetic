/**
 * Scene 4: stacking 3 x 3 convolutions and 2 x 2 pools. The receptive field of an output cell comes
 * from the recurrence r_out = r_in + (k - 1) * jump (jump *= stride); a perturbation test (really
 * change one input pixel and run the stack) finds the same cells.
 */
import { conv2d } from '../../core/linalg';
import { mulberry32 } from '../../core/random';
import { maxPool, type Kernel } from './convolve';

export type LayerKind = 'conv' | 'pool';
export const INPUT_SIZE = 16;
export const MAX_LAYERS = 4;
export const LAYER_SPEC: Record<LayerKind, { k: number; stride: number; label: string }> = {
  conv: { k: 3, stride: 1, label: 'conv 3 x 3' },
  pool: { k: 2, stride: 2, label: 'pool 2 x 2' },
};
export const KERNEL_SEED = 9;
export const IMAGE_SEED = 5;
/** The pixel value the perturbation test writes: far above anything else, so every cell it reaches moves. */
export const PERTURBATION = 1000;

export interface LayerRow {
  kind: LayerKind;
  /** Side of this layer's output. */
  side: number;
  /** Receptive field of one output cell on the input, per side. */
  field: number;
  /** Input pixels between neighbouring output cells. */
  jump: number;
}

/** The recurrence, layer by layer; stops (and reports it) when a layer would have no output. */
export function describeStack(layers: readonly LayerKind[], input = INPUT_SIZE): LayerRow[] {
  const rows: LayerRow[] = [];
  let [side, field, jump] = [input, 1, 1];
  for (const kind of layers) {
    const { k, stride } = LAYER_SPEC[kind];
    side = Math.floor((side - k) / stride) + 1;
    if (side < 1) throw new RangeError(`${LAYER_SPEC[kind].label} leaves nothing of a ${input} x ${input} input here`);
    field += (k - 1) * jump;
    jump *= stride;
    rows.push({ kind, side, field, jump });
  }
  return rows;
}

/** Can one more layer of this kind be added (room in the stack and an output left)? */
export function canAdd(layers: readonly LayerKind[], kind: LayerKind): boolean {
  if (layers.length >= MAX_LAYERS) return false;
  try {
    describeStack([...layers, kind]);
    return true;
  } catch {
    return false;
  }
}

export interface Box {
  top: number;
  left: number;
  size: number;
}

/** The input pixels one output cell sees: a field x field box starting at cell * jump. */
export function receptiveBox(layers: readonly LayerKind[], row: number, col: number): Box {
  const last = describeStack(layers).at(-1);
  if (!last) return { top: row, left: col, size: 1 };
  return { top: row * last.jump, left: col * last.jump, size: last.field };
}

/** Output cells (as "row,col") whose receptive field holds the input pixel: by the recurrence, no run needed. */
export function reachedByRecurrence(layers: readonly LayerKind[], pixelRow: number, pixelCol: number): Set<string> {
  const side = describeStack(layers).at(-1)?.side ?? INPUT_SIZE;
  const reached = new Set<string>();
  for (let r = 0; r < side; r++) {
    for (let c = 0; c < side; c++) {
      const box = receptiveBox(layers, r, c);
      if (pixelRow >= box.top && pixelRow < box.top + box.size && pixelCol >= box.left && pixelCol < box.left + box.size) reached.add(`${r},${c}`);
    }
  }
  return reached;
}

/** One positive 3 x 3 kernel per conv layer, so a raised pixel always raises every cell it reaches. */
export function stackKernels(layers: readonly LayerKind[], seed = KERNEL_SEED): Kernel[] {
  const rnd = mulberry32(seed);
  return layers.filter((l) => l === 'conv').map(() => Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => 0.5 + rnd())));
}

/** A seeded input in [0, 1). */
export function stackInput(seed = IMAGE_SEED, size = INPUT_SIZE): number[][] {
  const rnd = mulberry32(seed);
  return Array.from({ length: size }, () => Array.from({ length: size }, () => rnd()));
}

/** Run the stack: valid convolutions with ReLU, 2 x 2 max pools. */
export function runStack(layers: readonly LayerKind[], kernels: readonly Kernel[], image: number[][]): number[][] {
  let map = image;
  let k = 0;
  for (const kind of layers) {
    if (kind === 'conv') map = conv2d(map, kernels[k++]).map((row) => row.map((v) => Math.max(v, 0)));
    else map = maxPool(map);
  }
  return map;
}

/** Output cells that change when input pixel (row, col) is set to PERTURBATION: found by running the stack twice. */
export function reachedByPerturbation(layers: readonly LayerKind[], kernels: readonly Kernel[], image: number[][], row: number, col: number): Set<string> {
  const before = runStack(layers, kernels, image);
  const bumped = image.map((r, y) => r.map((v, x) => (y === row && x === col ? PERTURBATION : v)));
  const after = runStack(layers, kernels, bumped);
  const changed = new Set<string>();
  after.forEach((r, y) => r.forEach((v, x) => (Math.abs(v - before[y][x]) > 1e-9 ? changed.add(`${y},${x}`) : null)));
  return changed;
}
