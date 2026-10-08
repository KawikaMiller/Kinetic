// What the pool picture draws, as plain data: one cell per connection slot (or per open connection with no pool).
import { LEAK_FLAG_MS, type SlotState, type World } from './model';

/** Cells in a row when there is no pool and connections are drawn as they open. */
export const DIRECT_COLS = 25;

export interface CellView {
  state: SlotState;
  /** A leaked connection that leak detection has flagged. */
  flagged: boolean;
}

export interface PoolView {
  cols: number;
  /** Rows of cells; a row may be shorter than `cols` (no pool). */
  rows: (CellView | null)[][];
  /** Requests waiting at each instance. */
  queues: number[];
}

export function poolView(w: World, dbMax: number, usePool: boolean): PoolView {
  if (usePool) {
    return {
      cols: Math.max(1, ...w.pools.map((p) => p.slots.length)),
      rows: w.pools.map((p) => p.slots.map((s) => ({ state: s.state, flagged: s.state === 'leaked' && s.heldMs > LEAK_FLAG_MS }))),
      queues: w.pools.map((p) => p.queue.length),
    };
  }
  const rowCount = Math.ceil(dbMax / DIRECT_COLS);
  const cells = Array.from({ length: rowCount * DIRECT_COLS }, (_, i): CellView | null => (w.direct[i] ? { state: w.direct[i].state, flagged: false } : null));
  return { cols: DIRECT_COLS, rows: Array.from({ length: rowCount }, (_, r) => cells.slice(r * DIRECT_COLS, (r + 1) * DIRECT_COLS)), queues: [] };
}
