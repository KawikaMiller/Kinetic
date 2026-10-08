import type { ReactNode } from 'react';
import { alpha, TOKENS, type TokenName } from '../core/palette';
import type { Tone } from '../core/tone';

// Pure sizing and canvas-paint rules for CellGrid, kept apart from the component.

export interface GridCellSpec {
  tone?: Tone;
  /** solid = filled with the tone; tint = a wash of it with a tone edge; outline = edge only; none = empty. */
  fill?: 'solid' | 'tint' | 'outline' | 'none';
  /**
   * The cell's text. In canvas mode only strings and numbers are drawn, and only while
   * they render at MIN_TEXT_PX or more on screen.
   */
  text?: ReactNode;
  /** 0..1: how strongly a tint (or a heatmap cell) is washed toward its tone. Default 0.18. */
  intensity?: number;
}

/** Canvas-mode cell text is drawn only when it lands at least this big on screen. */
export const MIN_TEXT_PX = 8;

/** A cell size: `cell` px squares `gap` apart, text at `font` px (0 = no text). */
export interface CellSize {
  cell: number;
  gap?: number;
  font?: number;
}

export const SIZES = {
  xs: { cell: 10, gap: 1, font: 0 },
  sm: { cell: 22, gap: 2, font: 10 },
  md: { cell: 34, gap: 3, font: 13 },
} as const;
export type SizePreset = keyof typeof SIZES;
/** A custom size's defaults: gap and font scale with the cell, and cells under 16px carry no text. */
const GAP_RATIO = 0.09;
const FONT_RATIO = 0.38;
const MIN_TEXT_CELL = 16;

/** A size preset or custom size with its defaults filled in. */
export function resolveSize(size: SizePreset | CellSize): { cell: number; gap: number; font: number } {
  if (typeof size === 'string') return SIZES[size];
  const cell = size.cell;
  return {
    cell,
    gap: size.gap ?? Math.max(1, Math.round(cell * GAP_RATIO)),
    font: size.font ?? (cell >= MIN_TEXT_CELL ? Math.round(cell * FONT_RATIO) : 0),
  };
}

/** How strongly a tint is washed toward its tone when the spec doesn't say. */
export const DEFAULT_TINT = 0.18;

/** Whether text of `font` drawing units is readable at `scale` screen px per unit (MIN_TEXT_PX or more). */
export const textReadable = (font: number, scale: number) => font > 0 && font * scale >= MIN_TEXT_PX;

/** A cell's fill on the canvas, matching the SVG rules in kit.css (.cellgrid-cell rect). */
export function canvasFill(sp: GridCellSpec): string {
  if (sp.fill === 'none') return 'transparent';
  if (!sp.tone) return TOKENS.cell;
  const tone = TOKENS[sp.tone];
  if (sp.fill === 'solid') return tone;
  if (sp.fill === 'outline') return TOKENS.cell;
  return alpha(tone, sp.intensity ?? DEFAULT_TINT);
}

/** Edge widths of tint and outline cells, as in kit.css (.cellgrid-cell.is-tint / .is-outline rect). */
export const TINT_EDGE = 1;
export const OUTLINE_EDGE = 1.5;

/**
 * A canvas cell's edge, matching the SVG rules in kit.css: tint and outline cells are edged in
 * their tone (--line-2 without one); other cells get no edge on the canvas, which keeps a big
 * crowd of plain or solid cells from turning into a mesh.
 */
export function canvasStroke(sp: GridCellSpec): { color: string; width: number } | null {
  const fill = cellFill(sp);
  if (fill !== 'tint' && fill !== 'outline') return null;
  return { color: sp.tone ? TOKENS[sp.tone] : TOKENS.line2, width: fill === 'outline' ? OUTLINE_EDGE : TINT_EDGE };
}

/** The fill a spec draws with: its own, else a tint when it has a tone or an intensity (as CellGrid's SVG cells). */
export function cellFill(sp: GridCellSpec): GridCellSpec['fill'] {
  return sp.fill ?? (sp.intensity !== undefined || sp.tone ? 'tint' : undefined);
}

/** Text colour on a canvas cell, matching the SVG rules in kit.css (.cellgrid-cell text). */
export function canvasInk(sp: GridCellSpec): string {
  if (sp.fill === 'none') return TOKENS.muted;
  if (sp.fill !== 'solid' || !sp.tone) return TOKENS.text;
  if (sp.tone === 'dim') return TOKENS.text;
  if (sp.tone === 'muted') return TOKENS.bg;
  return TOKENS[`on${sp.tone[0].toUpperCase()}${sp.tone.slice(1)}` as TokenName];
}

