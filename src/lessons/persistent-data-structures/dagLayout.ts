import type { Store } from './model';

/** Horizontal pitch of one leaf column, and the least gap between two nodes of a level, in px. */
export const COLUMN_PX = 30;
export const LEVEL_PX = 56;
export const PAD_X = 26;
export const PAD_TOP = 34;
export const PAD_BOTTOM = 34;
/** Extra space between two cells' variants, as a fraction of a column. */
const CELL_GAP = 0.45;

export interface Placed {
  x: number;
  y: number;
  level: number;
}

export interface DagLayout {
  at: Map<number, Placed>;
  width: number;
  height: number;
}

/** Cell index of every leaf, found by walking each version's tree (a shared leaf sits at one index in every version). */
function leafCells(s: Store): Map<number, number> {
  const cell = new Map<number, number>();
  const walk = (id: number, index: number) => {
    const kids = s.nodes[id].kids;
    if (!kids) {
      cell.set(id, index);
      return;
    }
    kids.forEach((k, d) => walk(k, index * s.b + d));
  };
  for (const v of s.versions) walk(v.root, 0);
  return cell;
}

/**
 * Place every node of every version: leaves in columns grouped by the cell they hold (older variants
 * first), each internal node above the middle of its children, one row per level. Nodes of one level
 * are pushed apart when two would land closer than a column, so nothing overlaps and an edge never
 * runs through another node.
 */
export function dagLayout(s: Store): DagLayout {
  const cell = leafCells(s);
  const leaves = [...cell.keys()].sort((a, b) => (cell.get(a) as number) - (cell.get(b) as number) || a - b);
  const x = new Map<number, number>();
  let cursor = 0;
  leaves.forEach((id, i) => {
    x.set(id, cursor);
    const next = leaves[i + 1];
    cursor += next !== undefined && cell.get(next) !== cell.get(id) ? 1 + CELL_GAP : 1;
  });
  const level = new Map<number, number>();
  const mark = (id: number, depth: number) => {
    level.set(id, depth);
    for (const k of s.nodes[id].kids ?? []) mark(k, depth + 1);
  };
  for (const v of s.versions) mark(v.root, 0);
  for (let l = s.depth - 1; l >= 0; l--) {
    const row = s.nodes.filter((n) => level.get(n.id) === l);
    for (const n of row) x.set(n.id, (n.kids as readonly number[]).reduce((sum, k) => sum + (x.get(k) as number), 0) / (n.kids as readonly number[]).length);
    row.sort((a, b) => (x.get(a.id) as number) - (x.get(b.id) as number) || a.id - b.id);
    for (let i = 1; i < row.length; i++) {
      const gap = (x.get(row[i].id) as number) - (x.get(row[i - 1].id) as number);
      if (gap < 1) x.set(row[i].id, (x.get(row[i - 1].id) as number) + 1);
    }
  }
  const at = new Map<number, Placed>();
  let maxX = 0;
  for (const n of s.nodes) {
    const l = level.get(n.id) as number;
    const px = PAD_X + (x.get(n.id) as number) * COLUMN_PX;
    maxX = Math.max(maxX, px);
    at.set(n.id, { x: px, y: PAD_TOP + l * LEVEL_PX, level: l });
  }
  return { at, width: maxX + PAD_X, height: PAD_TOP + s.depth * LEVEL_PX + PAD_BOTTOM };
}
