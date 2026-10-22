/**
 * The block transform behind JPEG: the orthonormal DCT-II and its inverse (DCT-III), 1D and 2D,
 * the zig-zag scan, the standard luminance quantisation table with the libjpeg quality rule,
 * and helpers that cut an image into blocks and put it back. Orthonormal means the transform
 * keeps energy (Parseval) and the inverse is just the transpose. Pure and deterministic.
 * Error measures (mse, psnr) are in core/signal.
 */
import { matMul, transpose } from './vec';

/** Rows of numbers: a block or a grey image. */
export type Grid = number[][];

/** JPEG transforms 8 by 8 blocks. */
export const JPEG_BLOCK = 8;
/** Grey levels are centred on this before the transform (8-bit samples). */
export const JPEG_LEVEL_SHIFT = 128;

const matrixCache = new Map<number, number[][]>();

/** The orthonormal DCT-II matrix: C[k][n] = a(k)·cos(pi (2n+1) k / 2N), a(0) = sqrt(1/N), a(k) = sqrt(2/N). C·transpose(C) = I. */
export function dctMatrix(n: number): number[][] {
  const cached = matrixCache.get(n);
  if (cached) return cached;
  const c = Array.from({ length: n }, (_, k) =>
    Array.from({ length: n }, (_, t) => (k === 0 ? Math.sqrt(1 / n) : Math.sqrt(2 / n)) * Math.cos((Math.PI * (2 * t + 1) * k) / (2 * n))),
  );
  matrixCache.set(n, c);
  return c;
}

/** 1D DCT-II (orthonormal). */
export function dct(x: readonly number[]): number[] {
  return dctMatrix(x.length).map((row) => row.reduce((s, c, t) => s + c * x[t], 0));
}

/** 1D inverse DCT, i.e. the orthonormal DCT-III: the transpose of the matrix applied to the coefficients. */
export function idct(coeffs: readonly number[]): number[] {
  const c = dctMatrix(coeffs.length);
  return coeffs.map((_, t) => c.reduce((s, row, k) => s + row[t] * coeffs[k], 0));
}

function assertSquare(g: Grid): number {
  const n = g.length;
  if (n === 0 || g.some((row) => row.length !== n)) throw new RangeError('the block must be square and non-empty');
  return n;
}

/** 2D DCT-II of a square block: C·X·transpose(C), rows and columns each transformed. */
export function dct2(block: Grid): Grid {
  const c = dctMatrix(assertSquare(block));
  return matMul(matMul(c, block), transpose(c));
}

/** The inverse of `dct2`: transpose(C)·Y·C. */
export function idct2(coeffs: Grid): Grid {
  const c = dctMatrix(assertSquare(coeffs));
  return matMul(matMul(transpose(c), coeffs), c);
}

/** ITU-T T.81 Annex K, Table K.1: the example luminance quantisation table, row-major. */
export const JPEG_LUMA_TABLE: readonly (readonly number[])[] = [
  [16, 11, 10, 16, 24, 40, 51, 61],
  [12, 12, 14, 19, 26, 58, 60, 55],
  [14, 13, 16, 24, 40, 57, 69, 56],
  [14, 17, 22, 29, 51, 87, 80, 62],
  [18, 22, 37, 56, 68, 109, 103, 77],
  [24, 35, 55, 64, 81, 104, 113, 92],
  [49, 64, 78, 87, 103, 121, 120, 101],
  [72, 92, 95, 98, 112, 121, 100, 103],
];

export const QUALITY_MIN = 1;
export const QUALITY_MAX = 100;
const Q_ENTRY_MIN = 1;
const Q_ENTRY_MAX = 255;

/**
 * The libjpeg quality rule's percentage (jpeg_quality_scaling): integer 5000/q below 50, 200-2q from 50 up. Quality is
 * clamped to 1..100 and rounded. libjpeg works in integers, so 5000/q truncates (q 13 gives 384, not 384.6).
 * From memory of jcparam.c, verify against the libjpeg source.
 */
export function qualityScale(quality: number): number {
  const q = Math.min(QUALITY_MAX, Math.max(QUALITY_MIN, Math.round(quality)));
  return q < 50 ? Math.floor(5000 / q) : 200 - 2 * q;
}

/** The table scaled for a quality (jpeg_add_quant_table, baseline): clamp(floor((T·scale + 50)/100), 1, 255) per entry, with the integer scale above. Quality 50 is the table itself. From memory, verify against libjpeg. */
export function scaleQuantTable(table: readonly (readonly number[])[], quality: number): Grid {
  const s = qualityScale(quality);
  return table.map((row) => row.map((t) => Math.min(Q_ENTRY_MAX, Math.max(Q_ENTRY_MIN, Math.floor((t * s + 50) / 100)))));
}

/** Round to the nearest integer, halves away from zero, never -0. */
export function roundHalfAway(v: number): number {
  const r = Math.round(Math.abs(v));
  return r === 0 ? 0 : v < 0 ? -r : r;
}

function zipGrids(a: Grid, b: Grid, f: (x: number, y: number) => number): Grid {
  if (a.length !== b.length || a.some((row, i) => row.length !== b[i].length)) throw new RangeError('the two grids differ in size');
  return a.map((row, i) => row.map((v, j) => f(v, b[i][j])));
}

/** Divide each coefficient by its table entry and round: this is the step that throws information away. */
export const quantise = (coeffs: Grid, table: Grid): Grid => zipGrids(coeffs, table, (c, q) => roundHalfAway(c / q));

/** Multiply back by the table entries (the decoder's half; the rounding error stays). */
export const dequantise = (levels: Grid, table: Grid): Grid => zipGrids(levels, table, (l, q) => l * q);

/** The JPEG zig-zag scan of an n by n block as [row, col] pairs: (0,0), (0,1), (1,0), (2,0), (1,1), (0,2) ... */
export function zigzagOrder(n: number): [number, number][] {
  const order: [number, number][] = [];
  for (let s = 0; s <= 2 * n - 2; s++) {
    const lo = Math.max(0, s - n + 1);
    const hi = Math.min(s, n - 1);
    if (s % 2 === 1) for (let r = lo; r <= hi; r++) order.push([r, s - r]);
    else for (let r = hi; r >= lo; r--) order.push([r, s - r]);
  }
  return order;
}

/** The block's entries in zig-zag order. */
export const zigzag = (block: Grid): number[] => zigzagOrder(assertSquare(block)).map(([r, c]) => block[r][c]);

/** The block that `zigzag` flattened. */
export function unzigzag(values: readonly number[], n: number): Grid {
  if (values.length !== n * n) throw new RangeError(`expected ${n * n} values, got ${values.length}`);
  const block = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  zigzagOrder(n).forEach(([r, c], i) => {
    block[r][c] = values[i];
  });
  return block;
}

/** Cut an image into size by size blocks, indexed [blockRow][blockCol]. Both dimensions must be multiples of size. */
export function splitBlocks(image: Grid, size = JPEG_BLOCK): Grid[][] {
  const h = image.length;
  const w = image[0]?.length ?? 0;
  if (h === 0 || w === 0 || h % size !== 0 || w % size !== 0) throw new RangeError(`image ${w} by ${h} is not a multiple of ${size}`);
  return Array.from({ length: h / size }, (_, by) =>
    Array.from({ length: w / size }, (_, bx) => Array.from({ length: size }, (_, r) => image[by * size + r].slice(bx * size, (bx + 1) * size))),
  );
}

/** Put blocks from `splitBlocks` back into one image. */
export function joinBlocks(blocks: readonly (readonly Grid[])[]): Grid {
  return blocks.flatMap((blockRow) => blockRow[0].map((_, r) => blockRow.flatMap((block) => block[r])));
}

/** Apply a block-to-block function to every block of an image. */
export const mapBlocks = (image: Grid, f: (block: Grid) => Grid, size = JPEG_BLOCK): Grid => joinBlocks(splitBlocks(image, size).map((row) => row.map(f)));

/** A block's grey levels shifted to be centred on 0 before the transform. */
export const levelShift = (block: Grid, by = JPEG_LEVEL_SHIFT): Grid => block.map((row) => row.map((v) => v - by));

/** The whole JPEG-style round trip for one block: shift, DCT, quantise, dequantise, inverse DCT, shift back (not clamped or rounded to integers). */
export function roundTripBlock(block: Grid, table: Grid): { levels: Grid; reconstructed: Grid } {
  const levels = quantise(dct2(levelShift(block)), table);
  return { levels, reconstructed: levelShift(idct2(dequantise(levels, table)), -JPEG_LEVEL_SHIFT) };
}
