import { describe, expect, it } from 'vitest';
import { TOKENS } from '../core/palette';
import { canvasFill, canvasInk, canvasStroke, cellFill, OUTLINE_EDGE, resolveSize, textReadable, TINT_EDGE } from './cellGridPaint';

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

describe('CellGrid canvas edges', () => {
  it('edges tint and outline cells in their tone, as the SVG cells are', () => {
    expect(canvasStroke({ tone: 'violet', fill: 'outline' })).toEqual({ color: TOKENS.violet, width: OUTLINE_EDGE });
    expect(canvasStroke({ tone: 'sky', fill: 'tint', intensity: 0.3 })).toEqual({ color: TOKENS.sky, width: TINT_EDGE });
    expect(canvasStroke({ fill: 'outline' })).toEqual({ color: TOKENS.line2, width: OUTLINE_EDGE });
    // An outline cell is the plain cell colour inside its edge.
    expect(canvasFill({ tone: 'violet', fill: 'outline' })).toBe(TOKENS.cell);
  });

  it('draws no edge on solid, empty or plain cells', () => {
    expect(canvasStroke({ tone: 'ok', fill: 'solid' })).toBeNull();
    expect(canvasStroke({ tone: 'ok', fill: 'none' })).toBeNull();
    expect(canvasStroke({})).toBeNull();
  });

  it('treats a toned cell with no fill as a tint, as the SVG cells do', () => {
    expect(cellFill({ tone: 'info' })).toBe('tint');
    expect(cellFill({ intensity: 0.5 })).toBe('tint');
    expect(cellFill({})).toBeUndefined();
    expect(canvasStroke({ tone: 'info', intensity: 0.6 })).toEqual({ color: TOKENS.info, width: TINT_EDGE });
  });
});
