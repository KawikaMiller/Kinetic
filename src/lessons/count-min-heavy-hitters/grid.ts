/**
 * count-min-heavy-hitters, scene 1: the small readable grid. Twelve named items, a seeded Zipf stream over them, and the exact counts
 * beside the sketch. Pure.
 */
import { zipfSampler } from '../../core/distributions';
import { mulberry32 } from '../../core/random';
import { cellsOf, estimate, itemKey, makeFamily, newSketch, update, type Sketch } from './sketch';

export const GRID_W = 16;
export const GRID_D = 4;
/** The lowest hash seed for which the first burst of 30 items overcounts at least two items (the test proves it), so the grid shows a collision from the start. */
export const GRID_SEED = 20;
export const STREAM_BURST = 30;
export const MAX_ITEMS = 300;
export const MAX_ITEM_LENGTH = 40;
export const WORD_SKEW = 1.2;
export const WORDS = ['apple', 'banana', 'cherry', 'date', 'elder', 'fig', 'grape', 'honey', 'iris', 'jade', 'kiwi', 'lime'] as const;

/** `count` items drawn Zipf over the twelve words; burst number `burst` draws a different batch. */
export function wordStream(count: number, seed: number, burst: number): string[] {
  const draw = zipfSampler(WORDS.length, WORD_SKEW);
  const rnd = mulberry32(seed * 1_000 + burst);
  return Array.from({ length: count }, () => WORDS[draw(rnd) - 1]);
}

export type Cleaned = { ok: true; item: string } | { ok: false; error: string };

/** A typed item: trimmed, and refused when empty. */
export function cleanItem(typed: string): Cleaned {
  const item = typed.trim();
  if (item.length === 0) return { ok: false, error: 'Type an item first: an empty one is not counted.' };
  if (item.length > MAX_ITEM_LENGTH) return { ok: false, error: `Keep an item to ${MAX_ITEM_LENGTH} characters or fewer.` };
  return { ok: true, item };
}

export interface GridModel {
  sketch: Sketch;
  truth: Map<string, number>;
  /** Distinct items per cell, keyed "row:col": a cell with two or more is polluted by a collision. */
  occupants: Map<string, Set<string>>;
}

export const cellKey = (row: number, col: number): string => `${row}:${col}`;

export function buildGrid(items: readonly string[]): GridModel {
  const sketch = newSketch(GRID_W, GRID_D, makeFamily(GRID_SEED, GRID_D));
  const truth = new Map<string, number>();
  const occupants = new Map<string, Set<string>>();
  for (const item of items) {
    const key = itemKey(item);
    update(sketch, key);
    truth.set(item, (truth.get(item) ?? 0) + 1);
    for (const c of cellsOf(sketch, key)) {
      const k = cellKey(c.row, c.col);
      if (!occupants.has(k)) occupants.set(k, new Set());
      occupants.get(k)!.add(item);
    }
  }
  return { sketch, truth, occupants };
}

export interface Inspection {
  item: string;
  truth: number;
  estimate: number;
  cells: { row: number; col: number; value: number }[];
  /** The cell the minimum comes from (the first row on a tie). */
  min: { row: number; col: number };
}

export function inspect(model: GridModel, item: string): Inspection {
  const key = itemKey(item);
  const cells = cellsOf(model.sketch, key).map((c) => ({ ...c, value: model.sketch.counts[c.row * model.sketch.w + c.col] }));
  const min = cells.reduce((a, b) => (b.value < a.value ? b : a));
  return { item, truth: model.truth.get(item) ?? 0, estimate: estimate(model.sketch, key), cells, min: { row: min.row, col: min.col } };
}

export const polluted = (model: GridModel, row: number, col: number): boolean => (model.occupants.get(cellKey(row, col))?.size ?? 0) > 1;

/** Distinct items, most frequent first (ties by name). */
export const itemsByCount = (model: GridModel): string[] => [...model.truth].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([item]) => item);

/** Items the sketch estimates below their true count. Collisions only add, so this stays 0. */
export const undercounted = (model: GridModel): number => [...model.truth.keys()].filter((item) => {
  const look = inspect(model, item);
  return look.estimate < look.truth;
}).length;
