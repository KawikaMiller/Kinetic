import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseHex } from '../core/contrast';
import { TOKENS } from '../core/palette';
import { paintPixels, rgbText, tokenRgb, type Rgb } from './canvasImage';

describe('tokenRgb', () => {
  it('is the token hex scaled to 0..1', () => {
    const [r, g, b] = parseHex(TOKENS.hi);
    expect(tokenRgb('hi')).toEqual([r / 255, g / 255, b / 255]);
  });
});

describe('rgbText', () => {
  it('rounds each channel to 0..255', () => {
    expect(rgbText([1, 0.5, 0])).toBe('(255, 128, 0)');
    expect(rgbText([0, 0, 0.999])).toBe('(0, 0, 255)');
  });
});

describe('paintPixels', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('is null without a DOM', () => {
    expect(paintPixels(2, 2, () => [0, 0, 0], 1)).toBeNull();
  });

  it('draws one filled unit square per pixel, row by row, in the colour asked for', () => {
    const fills: string[] = [];
    const rects: number[][] = [];
    const ctx = {
      scale: () => undefined,
      set fillStyle(v: string) {
        fills.push(v);
      },
      fillRect: (...r: number[]) => rects.push(r),
    };
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => ctx, toDataURL: () => 'data:x' }) });
    const colour = (i: number): Rgb => [i / 5, 0, 1];
    expect(paintPixels(3, 2, colour, 2)).toBe('data:x');
    expect(rects).toEqual([[0, 0, 1, 1], [1, 0, 1, 1], [2, 0, 1, 1], [0, 1, 1, 1], [1, 1, 1, 1], [2, 1, 1, 1]]);
    expect(fills[0]).toBe('rgb(0 0 255)');
    expect(fills[5]).toBe('rgb(255 0 255)');
  });
});
