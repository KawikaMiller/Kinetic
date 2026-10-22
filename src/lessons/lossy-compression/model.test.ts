import { describe, expect, it } from 'vitest';
import { JPEG_LUMA_TABLE, dct2, dctMatrix, idct2, levelShift, scaleQuantTable, type Grid } from '../../core/dct';
import { mulberry32, type Rnd } from '../../core/random';
import { energy } from '../../core/signal';
import {
  BASIS_PEAK, BASIS_SIDE, CELLS, PAINT_STEP, SIZE, TEXTBOOK, analyseBlock, basisGrid, basisValue, chooseSource, initialBlock, initialQuant, paintCell, quantiseBlock, sourceBlock,
  toggleCoefficient, type SourceId,
} from './blocks';
import { BLOCKS, CURVE_QUALITIES, RAW_BYTES, SIDE, estimateSize, generations, measure, rateDistortion, shiftImage, sizeCategory, syntheticImage, encodeImage } from './image';

const close = (a: number, b: number, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));
const randomBlock = (rnd: Rnd): Grid => Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => Math.floor(rnd() * 256)));

/** The 2D DCT-II straight from its four-loop definition, with its own trigonometry. */
function naiveDct2(block: Grid): Grid {
  const alpha = (k: number) => (k === 0 ? Math.sqrt(1 / SIZE) : Math.sqrt(2 / SIZE));
  return Array.from({ length: SIZE }, (_, u) => Array.from({ length: SIZE }, (_, v) => {
    let sum = 0;
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      sum += block[y][x] * Math.cos(((2 * y + 1) * u * Math.PI) / (2 * SIZE)) * Math.cos(((2 * x + 1) * v * Math.PI) / (2 * SIZE));
    }
    return alpha(u) * alpha(v) * sum;
  }));
}

describe('the transform behind the lesson', () => {
  it('dct2 equals the naive four-loop definition on 100 seeded blocks, the matrix is orthogonal and the inverse returns the block', () => {
    const rnd = mulberry32(3);
    const C = dctMatrix(SIZE);
    const product = C.map((row) => C.map((_, j) => row.reduce((s, v, k) => s + v * C[j][k], 0)));
    product.forEach((row, i) => row.forEach((v, j) => expect(close(v, i === j ? 1 : 0)).toBe(true)));
    for (let i = 0; i < 100; i++) {
      const block = randomBlock(rnd);
      const a = dct2(levelShift(block));
      const b = naiveDct2(levelShift(block));
      a.forEach((row, r) => row.forEach((v, c) => expect(close(v, b[r][c], 1e-9)).toBe(true)));
      idct2(a).forEach((row, r) => row.forEach((v, c) => expect(close(v, levelShift(block)[r][c], 1e-9)).toBe(true)));
      expect(close(energy(a.flat()), energy(levelShift(block).flat()), 1e-9)).toBe(true);
    }
  });

  it('the textbook block has a DC coefficient of -415.375 after the shift, recomputed by the naive definition (recalled values, not an authority)', () => {
    expect(naiveDct2(levelShift(TEXTBOOK))[0][0]).toBeCloseTo(-415.375, 9);
    expect(dct2(levelShift(TEXTBOOK))[0][0]).toBeCloseTo(-415.375, 9);
    expect(TEXTBOOK[0].slice(0, 4)).toEqual([52, 55, 61, 66]);
  });

  it('the libjpeg quality rule: 50 is the table, 10 starts at 80, 90 at 3 and 100 makes every entry 1', () => {
    expect(scaleQuantTable(JPEG_LUMA_TABLE, 50)).toEqual(JPEG_LUMA_TABLE.map((r) => [...r]));
    expect(scaleQuantTable(JPEG_LUMA_TABLE, 10)[0][0]).toBe(80);
    expect(scaleQuantTable(JPEG_LUMA_TABLE, 90)[0][0]).toBe(3);
    expect(scaleQuantTable(JPEG_LUMA_TABLE, 13)[0][0]).toBe(61); // integer 5000/13 = 384, hand-worked: (16*384+50)/100 = 61
    expect(scaleQuantTable(JPEG_LUMA_TABLE, 100).flat().every((v) => v === 1)).toBe(true);
  });
});

describe('scene 1: a block in frequency space', () => {
  it('the basis patterns are the rows of the DCT matrix multiplied: pattern (u, v) at (y, x) is C[u][y] · C[v][x], and they are orthonormal', () => {
    const C = dctMatrix(SIZE);
    for (const [u, v] of [[0, 0], [1, 2], [7, 7], [3, 0]]) for (const [y, x] of [[0, 0], [2, 5], [7, 7]]) expect(basisValue(u, v, y, x)).toBeCloseTo(C[u][y] * C[v][x], 12);
    let dot = 0;
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) dot += basisValue(1, 2, y, x) * basisValue(1, 2, y, x);
    expect(dot).toBeCloseTo(1, 12);
    const g = basisGrid();
    expect(g).toHaveLength(BASIS_SIDE);
    g.flat().forEach((v) => expect(v >= -1 && v <= 1).toBe(true));
    expect(BASIS_PEAK).toBe(0.25);
  });

  it('zeroing nothing reproduces the block exactly; the kept energy equals the spatial energy of the unrounded reconstruction (Parseval)', () => {
    for (const source of ['gradient', 'edge', 'checker', 'texture', 'textbook'] as SourceId[]) {
      const s = chooseSource(initialBlock(), source);
      const r = analyseBlock(s);
      expect(r.reconstructed).toEqual(r.block);
      expect(r.keptEnergy).toBe(1);
      expect(r.mse).toBe(0);
      expect(r.psnr).toBe(Infinity);
      let z = s;
      for (const [row, col] of [[0, 0], [1, 1], [0, 3], [4, 2], [7, 7], [2, 5]]) z = toggleCoefficient(z, row, col);
      const out = analyseBlock(z);
      const kept = dct2(levelShift(out.block)).map((rw, rr) => rw.map((v, c) => (z.zeroed[rr * SIZE + c] ? 0 : v)));
      expect(close(out.keptEnergy, energy(idct2(kept).flat()) / energy(levelShift(out.block).flat()), 1e-9)).toBe(true);
      expect(out.keptEnergy).toBeLessThan(1);
    }
  });

  it('the energy count is the fewest coefficients holding 90% of it, checked by brute force on seeded blocks', () => {
    const rnd = mulberry32(9);
    for (let i = 0; i < 30; i++) {
      const block = randomBlock(rnd);
      const s = { ...initialBlock(), source: 'painted' as const, painted: block };
      const r = analyseBlock(s);
      const sq = dct2(levelShift(block)).flat().map((v) => v * v).sort((a, b) => b - a);
      const total = sq.reduce((a, b) => a + b, 0);
      let n = 0;
      let acc = 0;
      while (acc < 0.9 * total) acc += sq[n++];
      expect(r.holding90).toBe(n);
      expect(sq.slice(0, r.holding90 - 1).reduce((a, b) => a + b, 0)).toBeLessThan(0.9 * total);
    }
  });

  it('a smooth gradient needs fewer coefficients than a checker, and an all-zero block says no energy rather than dividing by zero', () => {
    const grad = analyseBlock(chooseSource(initialBlock(), 'gradient'));
    const checker = analyseBlock(chooseSource(initialBlock(), 'checker'));
    expect(grad.holding90).toBeLessThan(checker.holding90);
    const flatBlock = { ...initialBlock(), source: 'painted' as const, painted: Array.from({ length: SIZE }, () => new Array<number>(SIZE).fill(128)) };
    const r = analyseBlock(flatBlock);
    expect(r.holding90).toBe(0);
    expect(r.keptEnergy).toBe(1);
    expect(Number.isNaN(r.mse)).toBe(false);
  });

  it('painting cycles through brightness in steps of 32 and returns to 0, only ever 8 by 8, and choosing a source clears the zeroed coefficients', () => {
    let s = initialBlock();
    const start = chooseSource(s, 'painted').painted[0][0];
    s = chooseSource(s, 'painted');
    for (let i = 0; i < 256 / PAINT_STEP; i++) s = paintCell(s, 0, 0);
    expect(s.painted[0][0]).toBe(start);
    expect(s.painted).toHaveLength(SIZE);
    s.painted.forEach((row) => expect(row).toHaveLength(SIZE));
    s.painted.flat().forEach((v) => expect(Number.isInteger(v) && v >= 0 && v <= 255).toBe(true));
    const z = toggleCoefficient(s, 2, 2);
    expect(z.zeroed.filter(Boolean)).toHaveLength(1);
    expect(chooseSource(z, 'edge').zeroed.some(Boolean)).toBe(false);
    expect(paintCell(z, 1, 1).zeroed.some(Boolean)).toBe(false);
    expect(CELLS).toBe(64);
  });
});

describe('scene 2: quantise', () => {
  it('quality 50 uses the standard table, the zig-zag last non-zero level is where the zeros start, and low quality collapses toward a flat block', () => {
    const s = initialQuant();
    expect(s.quality).toBe(50);
    const r = quantiseBlock(s);
    expect(r.table).toEqual(JPEG_LUMA_TABLE.map((row) => [...row]));
    expect(r.nonZero).toBeGreaterThan(5);
    expect(r.lastNonZero).toBeGreaterThanOrEqual(r.nonZero - 1);
    const low = quantiseBlock({ ...s, quality: 1 });
    expect(low.nonZero).toBeLessThanOrEqual(2);
    expect(low.psnr).toBeLessThan(r.psnr);
    expect(new Set(low.reconstructed.flat()).size).toBeLessThanOrEqual(3);
  });

  it('non-zero levels fall as quality falls, and the error at quality 10 is above the error at quality 100 (the error itself is not monotone block by block), for every source', () => {
    for (const source of ['gradient', 'edge', 'checker', 'texture', 'textbook'] as const) {
      let lastNonZero = Infinity;
      for (const quality of [100, 90, 75, 50, 25, 10]) {
        const r = quantiseBlock({ source, quality });
        expect(r.nonZero).toBeLessThanOrEqual(lastNonZero);
        lastNonZero = r.nonZero;
      }
      expect(quantiseBlock({ source, quality: 10 }).mse).toBeGreaterThan(quantiseBlock({ source, quality: 100 }).mse);
    }
  });

  it('every source is an 8 by 8 block of grey levels', () => {
    for (const source of ['gradient', 'edge', 'checker', 'texture', 'textbook'] as const) {
      const b = sourceBlock(source, []);
      expect(b).toHaveLength(8);
      b.flat().forEach((v) => expect(Number.isInteger(v) && v >= 0 && v <= 255).toBe(true));
    }
  });
});

describe('scenes 3 and 4: the whole image', () => {
  it('the image is 64 by 64 in 64 blocks, with grey levels in 0..255', () => {
    const img = syntheticImage();
    expect([img.length, img[0].length, BLOCKS, RAW_BYTES]).toEqual([SIDE, SIDE, 64, 4096]);
    img.flat().forEach((v) => expect(Number.isInteger(v) && v >= 0 && v <= 255).toBe(true));
  });

  it('the estimated size falls and the PSNR falls as quality falls, on 50 seeded images', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const img = syntheticImage(seed);
      let bytes = Infinity;
      let db = Infinity;
      for (const q of [95, 80, 65, 50, 35, 20, 10, 5]) {
        const m = measure(img, q).point;
        expect(m.bytes, `seed ${seed} q ${q}`).toBeLessThan(bytes);
        expect(m.psnr, `seed ${seed} q ${q}`).toBeLessThan(db);
        bytes = m.bytes;
        db = m.psnr;
      }
    }
  });

  it('the size is computed, not typed: it follows the symbols (quality 50 is not half of quality 100) and a flat image costs almost nothing', () => {
    const img = syntheticImage();
    const half = measure(img, 50).point.bytes;
    const full = measure(img, 100).point.bytes;
    expect(half / full).not.toBeCloseTo(0.5, 1);
    const flat = Array.from({ length: SIDE }, () => new Array<number>(SIDE).fill(100));
    expect(estimateSize(encodeImage(flat, 50).levels).bytes).toBeLessThan(80);
    expect(sizeCategory(0)).toBe(0);
    expect([1, -1, 2, 3, -4, 7, 8, 255].map(sizeCategory)).toEqual([1, 1, 2, 2, 3, 3, 4, 8]);
  });

  it('the rate-distortion curve has 19 points, size rises with quality and every point is the same measure the slider uses', () => {
    const img = syntheticImage();
    const curve = rateDistortion(img);
    expect(curve.map((p) => p.quality)).toEqual(CURVE_QUALITIES);
    curve.slice(1).forEach((p, i) => expect(p.bytes).toBeGreaterThan(curve[i].bytes));
    expect(curve[9].bytes).toBe(measure(img, curve[9].quality).point.bytes);
  });

  it('at quality 100 the reconstruction error of the lesson image is small (measured here, not claimed for every image)', () => {
    const m = measure(syntheticImage(), 100);
    expect(m.point.psnr).toBeGreaterThan(45);
  });

  it('generation loss: with an aligned grid the second save changes strictly fewer pixels than the first; shifted by 3 it changes more (measured on 20 seeded images)', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const img = syntheticImage(seed);
      const aligned = generations(img, 50, 2, 0).changed;
      const shifted = generations(img, 50, 2, 3).changed;
      expect(aligned[1], `seed ${seed}`).toBeLessThan(aligned[0]);
      expect(shifted[1], `seed ${seed}`).toBeGreaterThan(aligned[1]);
      expect(shifted[1]).toBeGreaterThan(aligned[0] / 4);
    }
  });

  it('the loss settles when aligned and keeps going when shifted, over ten saves', () => {
    const img = syntheticImage();
    const aligned = generations(img, 50, 10, 0);
    const shifted = generations(img, 50, 10, 3);
    expect(aligned.changed[9]).toBeLessThan(aligned.changed[0] / 10);
    expect(shifted.changed[9]).toBeGreaterThan(aligned.changed[9] * 5);
    expect(shifted.psnr[9]).toBeLessThan(aligned.psnr[9]);
  });

  it('shifting wraps round the edges and is undone by shifting back', () => {
    const img = syntheticImage();
    expect(shiftImage(shiftImage(img, 5), SIDE - 5)).toEqual(img);
    expect(shiftImage(img, 0)).toEqual(img);
    expect(shiftImage(img, 3)[3][3]).toBe(img[0][0]);
  });
});
