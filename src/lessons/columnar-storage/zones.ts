/**
 * columnar-storage: row groups with a min and max per column (zone maps), and a filtered sum that skips the groups
 * the filter cannot match. Metadata sits in the footer and is not counted as bytes read (stated on screen).
 */
import { FIELD_BYTES, type Row, type Table } from './table';

export const GROUP_ROWS = 4;
/** One column chunk: the values of one column for one row group. */
export const CHUNK_BYTES = GROUP_ROWS * FIELD_BYTES;
/** The filter `WHERE qty > T` sums price, so a group that is read costs a qty chunk and a price chunk. */
export const CHUNKS_PER_GROUP = 2;
export const THRESHOLD_MIN = 0;
export const THRESHOLD_MAX = 12;
export const DEFAULT_THRESHOLD = 8;

export interface Group {
  index: number;
  rows: Row[];
  qtyMin: number;
  qtyMax: number;
}

export function rowGroups(rows: Table): Group[] {
  const groups: Group[] = [];
  for (let from = 0; from < rows.length; from += GROUP_ROWS) {
    const chunk = rows.slice(from, from + GROUP_ROWS);
    const qtys = chunk.map((r) => r.qty);
    groups.push({ index: groups.length, rows: chunk, qtyMin: Math.min(...qtys), qtyMax: Math.max(...qtys) });
  }
  return groups;
}

/** How a group is judged: by its max (right), by its min (the broken rule the tests must reject), or never skipped. */
export type SkipRule = 'max' | 'min' | 'off';

/** `WHERE qty > t` can match a group only if its largest quantity is above t, so a group whose max is at most t is skipped. */
export function skipped(g: Group, t: number, rule: SkipRule): boolean {
  if (rule === 'off') return false;
  return (rule === 'max' ? g.qtyMax : g.qtyMin) <= t;
}

export interface FilterRun {
  sum: number;
  skippedGroups: number[];
  readGroups: number[];
  bytesRead: number;
  bytesSkipped: number;
}

/** SELECT SUM(price) WHERE qty > t over the row groups, skipping by the rule. */
export function filteredSum(rows: Table, t: number, rule: SkipRule): FilterRun {
  const groups = rowGroups(rows);
  const skippedGroups = groups.filter((g) => skipped(g, t, rule)).map((g) => g.index);
  const readGroups = groups.filter((g) => !skippedGroups.includes(g.index));
  const sum = readGroups.reduce((s, g) => s + g.rows.filter((r) => r.qty > t).reduce((a, r) => a + r.price, 0), 0);
  return {
    sum,
    skippedGroups,
    readGroups: readGroups.map((g) => g.index),
    bytesRead: readGroups.length * CHUNKS_PER_GROUP * CHUNK_BYTES,
    bytesSkipped: skippedGroups.length * CHUNKS_PER_GROUP * CHUNK_BYTES,
  };
}
