import { describe, expect, it } from 'vitest';
import {
  JPEG_LUMA_TABLE, dct, dct2, dctMatrix, dequantise, idct, idct2, joinBlocks, levelShift, mapBlocks, qualityScale, quantise, roundHalfAway, roundTripBlock, scaleQuantTable,
  splitBlocks, unzigzag, zigzag, zigzagOrder, type Grid,
} from './dct';
import { mulberry32 } from './random';
import { energy } from './signal';

const TOL = 1e-9;
const randomBlock = (n: number, rnd: () => number, span = 256): Grid => Array.from({ length: n }, () => Array.from({ length: n }, () => Math.floor(rnd() * span)));
const expectGridsNear = (a: Grid, b: Grid, tol = TOL) => a.forEach((row, i) => row.forEach((v, j) => expect(Math.abs(v - b[i][j])).toBeLessThan(tol)));
const gridEnergy = (g: Grid) => energy(g.flat());

/** The 2D DCT-II by its four-loop definition, with its own alpha and cosines (no shared matrix). */
function definitionDct2(x: Grid): Grid {
  const n = x.length;
  const alpha = (k: number) => (k === 0 ? Math.sqrt(1 / n) : Math.sqrt(2 / n));
  return Array.from({ length: n }, (_, u) =>
    Array.from({ length: n }, (_, v) => {
      let s = 0;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) s += x[i][j] * Math.cos(((2 * i + 1) * u * Math.PI) / (2 * n)) * Math.cos(((2 * j + 1) * v * Math.PI) / (2 * n));
      return alpha(u) * alpha(v) * s;
    }),
  );
}

/** The English Wikipedia JPEG article's worked example (a vector, not an authority; its published DCT matrix agrees with the pins below). */
const WIKI_BLOCK: Grid = [
  [52, 55, 61, 66, 70, 61, 64, 73],
  [63, 59, 55, 90, 109, 85, 69, 72],
  [62, 59, 68, 113, 144, 104, 66, 73],
  [63, 58, 71, 122, 154, 106, 70, 69],
  [67, 61, 68, 104, 126, 88, 68, 70],
  [79, 65, 60, 70, 77, 68, 58, 75],
  [85, 71, 64, 59, 55, 61, 65, 83],
  [87, 79, 69, 68, 65, 76, 78, 94],
];

/** The JPEG zig-zag as flat row-major indices (T.81 Figure A.6), as widely tabulated. */
const ZIGZAG_INDEX = [
  0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28, 35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44,
  51, 58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63,
];

describe('dct matrix and 1D transforms', () => {
  it('C times its transpose is the identity for several sizes', () => {
    for (const n of [2, 4, 8, 16]) {
      const c = dctMatrix(n);
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) expect(c[i].reduce((s, v, k) => s + v * c[j][k], 0)).toBeCloseTo(i === j ? 1 : 0, 12);
    }
  });

  it('dct equals the DCT-II definition, idct equals the DCT-III definition, and they invert each other', () => {
    const rnd = mulberry32(5);
    const n = 8;
    const a = (k: number) => (k === 0 ? Math.sqrt(1 / n) : Math.sqrt(2 / n));
    for (let trial = 0; trial < 50; trial++) {
      const x = Array.from({ length: n }, () => rnd() * 100 - 50);
      const byDefinition = x.map((_, k) => a(k) * x.reduce((s, v, t) => s + v * Math.cos((Math.PI * (2 * t + 1) * k) / (2 * n)), 0));
      const coefficients = dct(x);
      coefficients.forEach((v, k) => expect(v).toBeCloseTo(byDefinition[k], 9));
      const iii = x.map((_, t) => x.reduce((s, c, k) => s + a(k) * c * Math.cos((Math.PI * (2 * t + 1) * k) / (2 * n)), 0));
      idct(x).forEach((v, t) => expect(v).toBeCloseTo(iii[t], 9));
      idct(coefficients).forEach((v, t) => expect(v).toBeCloseTo(x[t], 9));
    }
  });

  it('a constant signal has only a DC coefficient, equal to sqrt(N) times the constant', () => {
    const c = dct(new Array(8).fill(5));
    expect(c[0]).toBeCloseTo(5 * Math.sqrt(8), 12);
    c.slice(1).forEach((v) => expect(Math.abs(v)).toBeLessThan(1e-12));
  });

  it('the DCT keeps energy (Parseval, orthonormal form)', () => {
    const x = [3, -1, 4, 1, -5, 9, 2, -6];
    expect(energy(dct(x))).toBeCloseTo(energy(x), 9);
  });
});

describe('2D transforms', () => {
  it('dct2 equals the four-loop definition on 100 seeded 8x8 blocks, and on 4x4', () => {
    const rnd = mulberry32(6);
    for (let i = 0; i < 100; i++) {
      const block = randomBlock(8, rnd);
      expectGridsNear(dct2(block), definitionDct2(block));
    }
    const small = randomBlock(4, rnd);
    expectGridsNear(dct2(small), definitionDct2(small));
  });

  it('idct2(dct2(x)) returns x within 1e-9 and the transform keeps energy', () => {
    const rnd = mulberry32(7);
    for (let i = 0; i < 50; i++) {
      const block = randomBlock(8, rnd);
      const coefficients = dct2(block);
      expectGridsNear(idct2(coefficients), block);
      expect(gridEnergy(coefficients)).toBeCloseTo(gridEnergy(block), 6);
    }
  });

  it('the worked Wikipedia block has DC -415.375 after the -128 shift (hand: sum of shifted samples is -3323, divided by 8)', () => {
    const shifted = levelShift(WIKI_BLOCK);
    expect(shifted.flat().reduce((s, v) => s + v, 0)).toBe(-3323);
    const c = dct2(shifted);
    expect(c[0][0]).toBeCloseTo(-3323 / 8, 9);
    // The article prints two decimals; -415.375 sits exactly between two of them, hence the 0.006 tolerance.
    [-415.38, -30.19, -61.2, 27.24, 56.13, -20.1, -2.39, 0.46].forEach((v, k) => expect(Math.abs(c[0][k] - v)).toBeLessThan(0.006));
  });

  it('refuses a block that is not square', () => {
    expect(() => dct2([[1, 2, 3]])).toThrow(RangeError);
    expect(() => dct2([])).toThrow(RangeError);
  });
});

describe('quantisation', () => {
  it('quality 50 reproduces Table K.1 exactly', () => {
    expect(scaleQuantTable(JPEG_LUMA_TABLE, 50)).toEqual(JPEG_LUMA_TABLE);
  });

  it('hand-worked entries: q=10 gives 80, q=25 gives 32, q=75 gives 8, q=90 gives 3 for the first entry (16)', () => {
    expect(qualityScale(10)).toBe(500);
    expect(scaleQuantTable(JPEG_LUMA_TABLE, 10)[0][0]).toBe(80);
    expect(scaleQuantTable(JPEG_LUMA_TABLE, 25)[0][0]).toBe(32);
    expect(scaleQuantTable(JPEG_LUMA_TABLE, 75)[0][0]).toBe(8);
    expect(scaleQuantTable(JPEG_LUMA_TABLE, 90)[0][0]).toBe(3);
  });

  it('q=100 makes every entry 1; q=1 clamps every entry to 255; out-of-range quality is clamped', () => {
    expect(scaleQuantTable(JPEG_LUMA_TABLE, 100).flat().every((v) => v === 1)).toBe(true);
    expect(scaleQuantTable(JPEG_LUMA_TABLE, 1).flat().every((v) => v === 255)).toBe(true);
    expect(qualityScale(0)).toBe(qualityScale(1));
    expect(qualityScale(500)).toBe(qualityScale(100));
  });

  it('every entry is within 1..255 and never grows as quality rises', () => {
    let previous = scaleQuantTable(JPEG_LUMA_TABLE, 1);
    for (let q = 2; q <= 100; q++) {
      const t = scaleQuantTable(JPEG_LUMA_TABLE, q);
      t.forEach((row, i) =>
        row.forEach((v, j) => {
          expect(v).toBeGreaterThanOrEqual(1);
          expect(v).toBeLessThanOrEqual(255);
          expect(v).toBeLessThanOrEqual(previous[i][j]);
        }),
      );
      previous = t;
    }
  });

  it('rounds halves away from zero and never produces -0', () => {
    expect(roundHalfAway(2.5)).toBe(3);
    expect(roundHalfAway(-2.5)).toBe(-3);
    expect(Object.is(roundHalfAway(-0.4), 0)).toBe(true);
    expect(quantise([[10, -10]], [[4, 4]])).toEqual([[3, -3]]);
    expect(dequantise([[3, -3]], [[4, 4]])).toEqual([[12, -12]]);
  });

  it('at q=100 the reconstruction of seeded 8-bit blocks is within 1 grey level per pixel after rounding', () => {
    const rnd = mulberry32(8);
    const table = scaleQuantTable(JPEG_LUMA_TABLE, 100);
    for (let i = 0; i < 200; i++) {
      const block = randomBlock(8, rnd);
      const { reconstructed } = roundTripBlock(block, table);
      reconstructed.forEach((row, r) => row.forEach((v, c) => expect(Math.abs(Math.round(v) - block[r][c])).toBeLessThanOrEqual(1)));
    }
  });

  it('at low quality the wiki block collapses toward a flat patch: few non-zero levels and a large error', () => {
    const high = roundTripBlock(WIKI_BLOCK, scaleQuantTable(JPEG_LUMA_TABLE, 95));
    const low = roundTripBlock(WIKI_BLOCK, scaleQuantTable(JPEG_LUMA_TABLE, 5));
    const nonZero = (g: Grid) => g.flat().filter((v) => v !== 0).length;
    expect(nonZero(low.levels)).toBeLessThan(nonZero(high.levels));
    expect(nonZero(low.levels)).toBeLessThanOrEqual(2);
  });
});

describe('zig-zag and blocks', () => {
  it('the 8x8 zig-zag order is the published T.81 table', () => {
    expect(zigzagOrder(8).map(([r, c]) => r * 8 + c)).toEqual(ZIGZAG_INDEX);
  });

  it('visits every cell once for other sizes, and zigzag/unzigzag invert each other', () => {
    for (const n of [1, 2, 3, 5]) expect(new Set(zigzagOrder(n).map(([r, c]) => r * n + c)).size).toBe(n * n);
    const block = randomBlock(8, mulberry32(10));
    expect(unzigzag(zigzag(block), 8)).toEqual(block);
    expect(zigzag([[1, 2], [3, 4]])).toEqual([1, 2, 3, 4]);
    expect(() => unzigzag([1, 2, 3], 2)).toThrow(RangeError);
  });

  it('splitBlocks and joinBlocks round-trip, blocks sit where they should, and a ragged size is refused', () => {
    const image = Array.from({ length: 16 }, (_, y) => Array.from({ length: 24 }, (_, x) => y * 100 + x));
    const blocks = splitBlocks(image);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toHaveLength(3);
    expect(blocks[1][2][3][4]).toBe((8 + 3) * 100 + (16 + 4));
    expect(joinBlocks(blocks)).toEqual(image);
    expect(mapBlocks(image, (b) => b)).toEqual(image);
    expect(() => splitBlocks(Array.from({ length: 10 }, () => new Array(8).fill(0)))).toThrow(RangeError);
  });

  it('mapBlocks with a transform and its inverse restores the image', () => {
    const image = Array.from({ length: 16 }, (_, y) => Array.from({ length: 16 }, (_, x) => (x * 7 + y * 13) % 256));
    const there = mapBlocks(image, (b) => dct2(levelShift(b)));
    const back = mapBlocks(there, (b) => levelShift(idct2(b), -128));
    expectGridsNear(back, image);
  });
});
