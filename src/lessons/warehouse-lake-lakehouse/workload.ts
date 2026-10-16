/**
 * warehouse-lake-lakehouse, scene 1: what a mix of operations costs on a row-oriented and a column-oriented store.
 * A deliberately simpler model than columnar-storage's pages (it shares no code with it): one unit, value-equivalents.
 *   cost = values read + SEEK_VALUES x places visited
 * A row store keeps a row's values together: one place for a point operation and one sequential run for a scan.
 * A column store keeps each column together: a point operation visits one place per column, and a scan visits one
 * place per column it needs and reads only those columns.
 */

export type Store = 'row' | 'column';
export type OpKind = 'point-read' | 'point-write' | 'scan';

export const COLUMN_COUNT = 6;
export const ROW_COUNT = 1000;
/** A visit to a separate place costs as much as reading this many values (an illustrative constant). */
export const SEEK_VALUES = 8;

export const COLUMN_NAMES = ['order', 'customer', 'country', 'product', 'qty', 'amount'] as const;

export interface Op {
  id: string;
  label: string;
  kind: OpKind;
  /** Columns a scan needs; a point operation always touches all of them. */
  columns: number;
}

/** The five operations of the preset mix, in the order they arrive. */
export const MIX: Op[] = [
  { id: 'place', label: 'Place an order', kind: 'point-write', columns: COLUMN_COUNT },
  { id: 'lookup', label: 'Look up one order', kind: 'point-read', columns: COLUMN_COUNT },
  { id: 'fix', label: 'Correct an order', kind: 'point-write', columns: COLUMN_COUNT },
  { id: 'revenue', label: 'Revenue by country this quarter', kind: 'scan', columns: 2 },
  { id: 'top', label: 'Top products by quantity', kind: 'scan', columns: 2 },
];

export const isScan = (op: Op): boolean => op.kind === 'scan';

export interface Cost {
  values: number;
  places: number;
  /** values + SEEK_VALUES x places. */
  cost: number;
}

/** What one operation costs on a store holding `rows` rows of `cols` columns. */
export function opCost(op: Op, store: Store, rows: number = ROW_COUNT, cols: number = COLUMN_COUNT): Cost {
  let values: number;
  let places: number;
  if (op.kind === 'scan') {
    const needed = Math.min(op.columns, cols);
    values = store === 'row' ? rows * cols : rows * needed;
    places = store === 'row' ? 1 : needed;
  } else {
    values = cols;
    places = store === 'row' ? 1 : cols;
  }
  return { values, places, cost: values + SEEK_VALUES * places };
}

export interface Placement {
  /** Where point reads and writes go. */
  points: Store;
  /** Where scans go. */
  scans: Store;
}

export const storeOf = (op: Op, p: Placement): Store => (isScan(op) ? p.scans : p.points);

export interface MixCost {
  perOp: { op: Op; store: Store; cost: Cost }[];
  values: number;
  places: number;
  cost: number;
}

/** The whole mix under a placement: each operation priced on the store its class was sent to. */
export function mixCost(mix: readonly Op[], p: Placement, rows: number = ROW_COUNT, cols: number = COLUMN_COUNT): MixCost {
  const perOp = mix.map((op) => ({ op, store: storeOf(op, p), cost: opCost(op, storeOf(op, p), rows, cols) }));
  return {
    perOp,
    values: perOp.reduce((n, o) => n + o.cost.values, 0),
    places: perOp.reduce((n, o) => n + o.cost.places, 0),
    cost: perOp.reduce((n, o) => n + o.cost.cost, 0),
  };
}

export const PLACEMENTS: Placement[] = [
  { points: 'row', scans: 'row' },
  { points: 'row', scans: 'column' },
  { points: 'column', scans: 'row' },
  { points: 'column', scans: 'column' },
];

/** The placement with the lowest cost, and whether another placement ties it (first in PLACEMENTS order wins a tie). */
export function bestPlacement(mix: readonly Op[], rows: number = ROW_COUNT, cols: number = COLUMN_COUNT): Placement {
  return PLACEMENTS.reduce((best, p) => (mixCost(mix, p, rows, cols).cost < mixCost(mix, best, rows, cols).cost ? p : best), PLACEMENTS[0]);
}

export const samePlacement = (a: Placement, b: Placement): boolean => a.points === b.points && a.scans === b.scans;
export const sharesStore = (p: Placement): boolean => p.points === p.scans;
