import { DEFAULT_CONSTRAINTS, LIMITS, MAX_CONSTRAINTS, TOL, type Constraint } from './lp2d';
import { polygon } from './simplex';

/** Editing the constraint list of scene 1, and the geometry the plot needs: pure, so the refusals and the drag maths are tested. */

/** The plot shows x and y from 0 to this. */
export const WINDOW = 10;
const FAR = 1000;
const HANDLE_MARGIN = 0.5;

export interface Row extends Constraint {
  /** A stable key for the card, so removing one never shuffles the others' state. */
  id: number;
}

export const initialRows = (): Row[] => DEFAULT_CONSTRAINTS.map((k, i) => ({ ...k, id: i }));
export const constraintsOf = (rows: readonly Row[]): Constraint[] => rows.map(({ a, b, c }) => ({ a, b, c }));

export const TOO_MANY_TEXT = `at most ${MAX_CONSTRAINTS} constraints: the picture stops being readable, remove one first`;
export const NOT_A_LINE_TEXT = 'a = 0 and b = 0 is not a line';

export type Edit = { ok: true; rows: Row[] } | { ok: false; text: string };

/** Change one constraint's numbers; refused when a and b would both be 0. */
export function changeRow(rows: readonly Row[], index: number, patch: Partial<Constraint>): Edit {
  const next = { ...rows[index], ...patch };
  if (next.a === 0 && next.b === 0) return { ok: false, text: NOT_A_LINE_TEXT };
  return { ok: true, rows: rows.map((r, i) => (i === index ? next : r)) };
}

/** Add a constraint (x + y <= 10 to start from); refused past the limit. */
export function addRow(rows: readonly Row[]): Edit {
  if (rows.length >= MAX_CONSTRAINTS) return { ok: false, text: TOO_MANY_TEXT };
  const id = rows.reduce((m, r) => Math.max(m, r.id), -1) + 1;
  return { ok: true, rows: [...rows, { id, a: 1, b: 1, c: 10 }] };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const snap = (v: number, step: number) => Math.round(v / step) * step;

/** Where the constraint's drag handle sits: the point of its line nearest the middle of the plot, kept inside the plot. */
export function handlePoint(k: Constraint): [number, number] {
  const mid = WINDOW / 2;
  const norm = k.a * k.a + k.b * k.b;
  const t = (k.a * mid + k.b * mid - k.c) / norm;
  return [clamp(mid - t * k.a, HANDLE_MARGIN, WINDOW - HANDLE_MARGIN), clamp(mid - t * k.b, HANDLE_MARGIN, WINDOW - HANDLE_MARGIN)];
}

/** Dragging the handle to (x, y) slides the line, keeping its direction, so that it passes through (x, y): c snaps to the slider's step and range. */
export function draggedBound(k: Constraint, x: number, y: number): number {
  return clamp(snap(k.a * x + k.b * y, LIMITS.bound.step), LIMITS.bound.min, LIMITS.bound.max);
}

/** Two far points of the constraint's line, for the plot to clip. */
export function lineEnds(k: Constraint): [[number, number], [number, number]] {
  if (Math.abs(k.b) >= Math.abs(k.a)) return [[-FAR, (k.c + k.a * FAR) / k.b], [FAR, (k.c - k.a * FAR) / k.b]];
  return [[(k.c + k.b * FAR) / k.a, -FAR], [(k.c - k.b * FAR) / k.a, FAR]];
}

/** The feasible region cut to the plot window, as polygon corners (empty when nothing is feasible there). */
export function regionPolygon(constraints: readonly Constraint[]): [number, number][] {
  const window: Constraint[] = [{ a: 1, b: 0, c: WINDOW }, { a: 0, b: 1, c: WINDOW }];
  return polygon([...constraints, ...window], 0, 0).map((v) => [v.x, v.y]);
}

/** The objective line cx x + cy y = level, for the plot to clip; null for the zero objective. */
export function objectiveEnds(cx: number, cy: number, level: number): [[number, number], [number, number]] | null {
  if (Math.abs(cx) < TOL && Math.abs(cy) < TOL) return null;
  return lineEnds({ a: cx, b: cy, c: level });
}
