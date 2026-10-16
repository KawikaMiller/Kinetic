import { parseBoundedInt } from '../../core/parse';
import { mulberry32 } from '../../core/random';
import type { P } from './hull';

/** The click-to-add plane is the integer grid 0..BOARD, so every coordinate is exact in the hull arithmetic. */
export const BOARD = 20;
export const MAX_POINTS = 40;

export interface AddResult {
  points: P[];
  /** Why nothing (or something different) happened, or null. */
  message: string | null;
}

const snap = (v: number) => Math.min(BOARD, Math.max(0, Math.round(v)));

/** Add a clicked point: snapped to the grid and clamped to the plane; a duplicate is merged; the 41st is refused. */
export function addPoint(points: readonly P[], raw: { x: number; y: number }): AddResult {
  const p = { x: snap(raw.x), y: snap(raw.y) };
  if (points.some((q) => q.x === p.x && q.y === p.y)) return { points: [...points], message: `(${p.x}, ${p.y}) is already there: duplicate points are merged into one.` };
  if (points.length >= MAX_POINTS) return { points: [...points], message: `The board keeps up to ${MAX_POINTS} points; clear some first.` };
  return { points: [...points, p], message: null };
}

const coordinate = (axis: string) => ({
  empty: `Type the ${axis} coordinate, a whole number from 0 to ${BOARD}.`,
  invalid: (typed: string) => `"${typed}" is not a whole number: type the ${axis} coordinate like 7.`,
  tooSmall: () => `The ${axis} coordinate cannot go below 0 on this board.`,
  tooBig: () => `The ${axis} coordinate cannot go above ${BOARD} on this board: huge values are refused, not clamped.`,
});

/** The typed x and y fields: whole numbers on the board, or the sentence saying why not. */
export function parseTypedPoint(xText: string, yText: string): { ok: true; point: P } | { ok: false; error: string } {
  const x = parseBoundedInt(xText, { min: 0, max: BOARD, messages: coordinate('x') });
  if (!x.ok) return x;
  const y = parseBoundedInt(yText, { min: 0, max: BOARD, messages: coordinate('y') });
  if (!y.ok) return y;
  return { ok: true, point: { x: x.value, y: y.value } };
}

/** The scatter preset: 16 seeded points on the grid. */
export function scatterPreset(seed = 3): P[] {
  const rnd = mulberry32(seed);
  const out: P[] = [];
  while (out.length < 16) {
    const p = { x: 2 + Math.floor(rnd() * 17), y: 2 + Math.floor(rnd() * 17) };
    if (!out.some((q) => q.x === p.x && q.y === p.y)) out.push(p);
  }
  return out;
}

/** A square with points on its edges: the collinear policy decides whether they are hull points. */
export const SQUARE_PRESET: P[] = [
  { x: 2, y: 2 }, { x: 10, y: 2 }, { x: 18, y: 2 }, { x: 18, y: 10 }, { x: 18, y: 18 }, { x: 10, y: 18 }, { x: 2, y: 18 }, { x: 2, y: 10 }, { x: 10, y: 10 }, { x: 6, y: 6 },
];

export const OPENING_POINTS = scatterPreset();
