import { describe, expect, it } from 'vitest';
import { TOKENS } from '../core/palette';
import { canvasInk, resolveSize, textReadable } from './cellGridPaint';

describe('CellGrid sizes', () => {
  it('keeps the presets as they were', () => {
    expect(resolveSize('xs')).toEqual({ cell: 10, gap: 1, font: 0 });
    expect(resolveSize('sm')).toEqual({ cell: 22, gap: 2, font: 10 });
    expect(resolveSize('md')).toEqual({ cell: 34, gap: 3, font: 13 });
  });

  it('fills in a custom size: gap and font scale with the cell, tiny cells carry no text', () => {
    expect(resolveSize({ cell: 40 })).toEqual({ cell: 40, gap: 4, font: 15 });
    expect(resolveSize({ cell: 40, gap: 0, font: 14 })).toEqual({ cell: 40, gap: 0, font: 14 });
    expect(resolveSize({ cell: 12 }).font).toBe(0);
  });
});

describe('CellGrid canvas text', () => {
  it('draws text only when it lands at 8px or more on screen', () => {
    expect(textReadable(10, 1)).toBe(true);
    expect(textReadable(10, 0.8)).toBe(true);
    expect(textReadable(10, 0.79)).toBe(false);
    expect(textReadable(0, 3)).toBe(false);
  });

  it('inks text like the SVG cells: on-tone on solid fills, plain text on tints, muted on empty cells', () => {
    expect(canvasInk({ tone: 'ok', fill: 'solid' })).toBe(TOKENS.onOk);
    expect(canvasInk({ tone: 'sky', fill: 'solid' })).toBe(TOKENS.onSky);
    expect(canvasInk({ tone: 'dim', fill: 'solid' })).toBe(TOKENS.text);
    expect(canvasInk({ tone: 'info', fill: 'tint' })).toBe(TOKENS.text);
    expect(canvasInk({ fill: 'none' })).toBe(TOKENS.muted);
  });
});
