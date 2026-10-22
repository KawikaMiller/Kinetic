/**
 * Scenes 3 and 4: a whole 64 by 64 grey image cut into 64 blocks. Quality sets the reconstruction, an estimated size from
 * the entropy of JPEG-style (zero-run, size) symbols, and the error. The size is an estimate from symbol entropy, not a
 * real JPEG file: no headers, no Huffman table cost, baseline grey only.
 */
import {
  JPEG_BLOCK, JPEG_LUMA_TABLE, dct2, dequantise, idct2, joinBlocks, levelShift, quantise, scaleQuantTable, splitBlocks, zigzagOrder, type Grid,
} from '../../core/dct';
import { mulberry32 } from '../../core/random';
import { mse, psnr } from '../../core/signal';
import { toGrey } from './blocks';

export const SIDE = 64;
export const BLOCKS = (SIDE / JPEG_BLOCK) ** 2;
export const RAW_BYTES = SIDE * SIDE;
export const IMAGE_SEED = 12;

/** Gradient, a bright disc (a sharp edge), a dark stripe and a patch of noise. */
export function syntheticImage(seed: number = IMAGE_SEED): Grid {
  const rnd = mulberry32(seed);
  return Array.from({ length: SIDE }, (_, y) => Array.from({ length: SIDE }, (_, x) => {
    let v = 40 + 1.2 * (x + y);
    if ((x - 40) ** 2 + (y - 24) ** 2 < 14 ** 2) v = 235;
    if (x >= 8 && x < 12) v = 20;
    if (x >= 4 && x < 28 && y >= 40 && y < 60) v = 128 + (rnd() - 0.5) * 80;
    return Math.min(255, Math.max(0, Math.round(v)));
  }));
}

const flat = (g: Grid) => g.flat();

export interface Encoded {
  levels: Grid[][];
  reconstructed: Grid;
}

/** The JPEG-style round trip of every block at a quality. */
export function encodeImage(image: Grid, quality: number): Encoded {
  const table = scaleQuantTable(JPEG_LUMA_TABLE, quality);
  const levels = splitBlocks(image).map((row) => row.map((b) => quantise(dct2(levelShift(b)), table)));
  const reconstructed = joinBlocks(levels.map((row) => row.map((l) => toGrey(idct2(dequantise(l, table))))));
  return { levels, reconstructed };
}

/** Bits needed for a magnitude: 0 for 0, else floor(log2 |v|) + 1 (JPEG's size category). */
export const sizeCategory = (v: number) => (v === 0 ? 0 : Math.floor(Math.log2(Math.abs(v))) + 1);

const ZERO_RUN_MAX = 15;
const ORDER = zigzagOrder(JPEG_BLOCK);

/** Total bits of a symbol list when each symbol costs -log2 of its share: n times the entropy. */
function symbolBits(symbols: readonly string[]): number {
  const counts = new Map<string, number>();
  symbols.forEach((s) => counts.set(s, (counts.get(s) ?? 0) + 1));
  let bits = 0;
  counts.forEach((c) => {
    bits += c * Math.log2(symbols.length / c);
  });
  return bits;
}

export interface SizeEstimate {
  /** Bits of the symbols (zero-order entropy) and of the amplitudes that follow them. */
  symbolBits: number;
  amplitudeBits: number;
  bytes: number;
  acSymbols: number;
}

/**
 * The size of the levels: DC as a difference from the previous block's DC (size category), AC as (zero run, size) symbols
 * in zig-zag order with a run limit of 15 and an end-of-block symbol for trailing zeros. Each symbol costs its zero-order
 * entropy over all blocks, and each non-zero value adds its size in amplitude bits.
 */
export function estimateSize(levels: readonly (readonly Grid[])[]): SizeEstimate {
  const dc: string[] = [];
  const ac: string[] = [];
  let amplitudeBits = 0;
  let previous = 0;
  for (const row of levels) for (const block of row) {
    const diff = block[0][0] - previous;
    previous = block[0][0];
    dc.push(`dc${sizeCategory(diff)}`);
    amplitudeBits += sizeCategory(diff);
    let run = 0;
    for (let i = 1; i < ORDER.length; i++) {
      const v = block[ORDER[i][0]][ORDER[i][1]];
      if (v === 0) {
        run++;
        continue;
      }
      while (run > ZERO_RUN_MAX) {
        ac.push('zrl');
        run -= ZERO_RUN_MAX + 1;
      }
      ac.push(`${run}/${sizeCategory(v)}`);
      amplitudeBits += sizeCategory(v);
      run = 0;
    }
    if (run > 0) ac.push('eob');
  }
  const bitsOfSymbols = symbolBits(dc) + symbolBits(ac);
  return { symbolBits: bitsOfSymbols, amplitudeBits, bytes: (bitsOfSymbols + amplitudeBits) / 8, acSymbols: ac.length };
}

export interface QualityPoint {
  quality: number;
  bytes: number;
  psnr: number;
  mse: number;
}

export function measure(image: Grid, quality: number): { point: QualityPoint; encoded: Encoded } {
  const encoded = encodeImage(image, quality);
  const point = { quality, bytes: estimateSize(encoded.levels).bytes, psnr: psnr(flat(image), flat(encoded.reconstructed)), mse: mse(flat(image), flat(encoded.reconstructed)) };
  return { point, encoded };
}

/** The rate-distortion curve: size against PSNR for q = 5, 10, ... 95. */
export const CURVE_QUALITIES = Array.from({ length: 19 }, (_, i) => 5 * (i + 1));
export const rateDistortion = (image: Grid): QualityPoint[] => CURVE_QUALITIES.map((q) => measure(image, q).point);

// ── generation loss ──

export const SAVES = { min: 1, max: 10 } as const;
export const SHIFT = { min: 0, max: 7 } as const;

/** The image moved `n` pixels right and down, wrapping round the edges. */
export const shiftImage = (image: Grid, n: number): Grid => image.map((_, y) => image[0].map((__, x) => image[(((y - n) % SIDE) + SIDE) % SIDE][(((x - n) % SIDE) + SIDE) % SIDE]));

export interface Generations {
  /** The image after each save (index 0 is save 1). */
  saved: Grid[];
  /** Pixels the save changed: those where its output differs from the image that went in (after the shift). */
  changed: number[];
  /** PSNR of each save against the original moved by the same total shift. */
  psnr: number[];
}

export function generations(image: Grid, quality: number, saves: number, shift: number): Generations {
  const saved: Grid[] = [];
  const changed: number[] = [];
  const psnrs: number[] = [];
  let current = image;
  for (let i = 1; i <= saves; i++) {
    const input = shiftImage(current, shift);
    current = encodeImage(input, quality).reconstructed;
    saved.push(current);
    const out = flat(current);
    changed.push(flat(input).filter((v, k) => v !== out[k]).length);
    psnrs.push(psnr(flat(shiftImage(image, i * shift)), flat(current)));
  }
  return { saved, changed, psnr: psnrs };
}
