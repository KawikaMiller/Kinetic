/**
 * Scenes 1 and 2: one 8 by 8 block of grey levels through the JPEG steps: subtract 128, 2D DCT-II, (zero or quantise
 * coefficients), inverse, add 128, round and clamp. All maths is core/dct and core/signal.
 */
import { JPEG_BLOCK, JPEG_LUMA_TABLE, dct2, dequantise, idct2, levelShift, quantise, scaleQuantTable, dctMatrix, zigzagOrder, type Grid } from '../../core/dct';
import { mulberry32 } from '../../core/random';
import { energy, mse, psnr } from '../../core/signal';

export const SIZE = JPEG_BLOCK;
export const CELLS = SIZE * SIZE;
export const PAINT_STEP = 32;
export const GREY_MAX = 255;
export const ENERGY_SHARE = 0.9;

export type SourceId = 'gradient' | 'edge' | 'checker' | 'texture' | 'textbook' | 'painted';
export const SOURCES: readonly { value: SourceId; label: string }[] = [
  { value: 'gradient', label: 'smooth gradient' },
  { value: 'edge', label: 'sharp edge' },
  { value: 'checker', label: 'checker' },
  { value: 'texture', label: 'textured patch' },
  { value: 'textbook', label: 'textbook block' },
  { value: 'painted', label: 'painted' },
];

const grid = (f: (y: number, x: number) => number): Grid => Array.from({ length: SIZE }, (_, y) => Array.from({ length: SIZE }, (_, x) => f(y, x)));
const TEXTURE_SEED = 5;
const TEXTURE_BASE = 128;
const TEXTURE_SPREAD = 60;
const texture = (): Grid => {
  const rnd = mulberry32(TEXTURE_SEED);
  return grid(() => Math.round(TEXTURE_BASE + (rnd() * 2 - 1) * TEXTURE_SPREAD));
};

/** The 8 by 8 example of the English Wikipedia JPEG article, as recalled; its DC after the shift is recomputed by the lesson's own transform (-415.375). */
export const TEXTBOOK: Grid = [
  [52, 55, 61, 66, 70, 61, 64, 73],
  [63, 59, 55, 90, 109, 85, 69, 72],
  [62, 59, 68, 113, 144, 104, 66, 73],
  [63, 58, 71, 122, 154, 106, 70, 69],
  [67, 61, 68, 104, 126, 88, 68, 70],
  [79, 65, 60, 70, 77, 68, 58, 75],
  [85, 71, 64, 59, 55, 61, 65, 83],
  [87, 79, 69, 68, 65, 76, 78, 94],
];

export function sourceBlock(id: SourceId, painted: Grid): Grid {
  switch (id) {
    case 'gradient': return grid((y, x) => 8 + 16 * (x + y));
    case 'edge': return grid((_, x) => (x < SIZE / 2 ? 40 : 216));
    case 'checker': return grid((y, x) => ((x + y) % 2 === 0 ? 224 : 32));
    case 'texture': return texture();
    case 'textbook': return TEXTBOOK.map((r) => [...r]);
    case 'painted': return painted.map((r) => [...r]);
  }
}

export interface BlockState {
  source: SourceId;
  painted: Grid;
  /** Coefficients the learner zeroed, row-major (index = row * 8 + column). */
  zeroed: boolean[];
}
export const initialBlock = (): BlockState => ({ source: 'textbook', painted: sourceBlock('gradient', []), zeroed: new Array<boolean>(CELLS).fill(false) });

/** Choosing a source clears the zeroed coefficients: they belonged to another block. Choosing 'painted' starts from the block shown. */
export function chooseSource(s: BlockState, source: SourceId): BlockState {
  const painted = source === 'painted' ? sourceBlock(s.source, s.painted) : s.painted;
  return { ...s, source, painted, zeroed: new Array<boolean>(CELLS).fill(false) };
}

/** A click on a painted cell: the next brightness in steps of 32, wrapping from the top back to 0. */
export function paintCell(s: BlockState, r: number, c: number): BlockState {
  const painted = s.painted.map((row, y) => row.map((v, x) => (y === r && x === c ? (v + PAINT_STEP) % (GREY_MAX + 1) : v)));
  return { ...s, source: 'painted', painted, zeroed: new Array<boolean>(CELLS).fill(false) };
}

export const toggleCoefficient = (s: BlockState, r: number, c: number): BlockState => ({ ...s, zeroed: s.zeroed.map((z, i) => (i === r * SIZE + c ? !z : z)) });

export const blockOf = (s: BlockState): Grid => sourceBlock(s.source, s.painted);

const flat = (g: Grid) => g.flat();
export const clampGrey = (v: number) => Math.min(GREY_MAX, Math.max(0, Math.round(v)));
/** Back to grey levels: add 128 back, round, clamp to 0..255. */
export const toGrey = (shifted: Grid): Grid => levelShift(shifted, -128).map((row) => row.map(clampGrey));

export interface BlockResult {
  block: Grid;
  coeffs: Grid;
  reconstructed: Grid;
  /** Fraction of the block's energy (sum of squares after the shift) left in the coefficients that were not zeroed. */
  keptEnergy: number;
  /** The least number of coefficients that together hold 90% of the energy. */
  holding90: number;
  mse: number;
  psnr: number;
  /** The largest error of any pixel. */
  maxError: number;
}

export function analyseBlock(s: BlockState): BlockResult {
  const block = blockOf(s);
  const coeffs = dct2(levelShift(block));
  const kept = coeffs.map((row, r) => row.map((v, c) => (s.zeroed[r * SIZE + c] ? 0 : v)));
  const reconstructed = toGrey(idct2(kept));
  const total = energy(flat(coeffs));
  const sorted = flat(coeffs).map((v) => v * v).sort((a, b) => b - a);
  let acc = 0;
  let holding90 = 0;
  while (holding90 < sorted.length && acc < ENERGY_SHARE * total) acc += sorted[holding90++];
  return {
    block, coeffs, reconstructed,
    keptEnergy: total === 0 ? 1 : energy(flat(kept)) / total,
    holding90: total === 0 ? 0 : holding90,
    mse: mse(flat(block), flat(reconstructed)),
    psnr: psnr(flat(block), flat(reconstructed)),
    maxError: Math.max(...flat(block).map((v, i) => Math.abs(v - flat(reconstructed)[i]))),
  };
}

/** The 64 basis patterns as one image: pattern (u, v) at row u, column v of the picture, each 8 by 8 pixels with a gap, values scaled to 0..1. */
export const PATTERN_GAP = 1;
export const BASIS_SIDE = SIZE * (SIZE + PATTERN_GAP) - PATTERN_GAP;
export function basisValue(u: number, v: number, y: number, x: number): number {
  const C = dctMatrix(SIZE);
  return C[u][y] * C[v][x];
}
/** Largest magnitude any basis value reaches: the DC pattern is flat at 1/8; the others reach up to 1/4. */
export const BASIS_PEAK = 2 / SIZE;

export function basisGrid(): number[][] {
  const out = Array.from({ length: BASIS_SIDE }, () => new Array<number>(BASIS_SIDE).fill(-1));
  for (let u = 0; u < SIZE; u++) for (let v = 0; v < SIZE; v++) for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    out[u * (SIZE + PATTERN_GAP) + y][v * (SIZE + PATTERN_GAP) + x] = 0.5 + (0.5 * basisValue(u, v, y, x)) / BASIS_PEAK;
  }
  return out;
}

// ── scene 2 ──

export const QUALITY = { min: 1, max: 100, step: 1 } as const;
export const DEFAULT_QUALITY = 50;
/** Scene 2 has no painted block of its own. */
export type QuantSource = Exclude<SourceId, 'painted'>;
export interface QuantState {
  source: QuantSource;
  quality: number;
}
export const initialQuant = (): QuantState => ({ source: 'textbook', quality: DEFAULT_QUALITY });

export interface QuantResult {
  table: Grid;
  coeffs: Grid;
  levels: Grid;
  reconstructed: Grid;
  block: Grid;
  nonZero: number;
  /** Position in the zig-zag scan of the last non-zero level (-1 when all are zero): everything after it is a run of zeros. */
  lastNonZero: number;
  mse: number;
  psnr: number;
  maxError: number;
}

export function quantiseBlock(s: QuantState): QuantResult {
  const block = sourceBlock(s.source, []);
  const table = scaleQuantTable(JPEG_LUMA_TABLE, s.quality);
  const coeffs = dct2(levelShift(block));
  const levels = quantise(coeffs, table);
  const reconstructed = toGrey(idct2(dequantise(levels, table)));
  const order = zigzagOrder(SIZE);
  const scan = order.map(([r, c]) => levels[r][c]);
  const lastNonZero = scan.reduce((last, v, i) => (v !== 0 ? i : last), -1);
  return {
    table, coeffs, levels, reconstructed, block,
    nonZero: flat(levels).filter((v) => v !== 0).length,
    lastNonZero,
    mse: mse(flat(block), flat(reconstructed)),
    psnr: psnr(flat(block), flat(reconstructed)),
    maxError: Math.max(...flat(block).map((v, i) => Math.abs(v - flat(reconstructed)[i]))),
  };
}
