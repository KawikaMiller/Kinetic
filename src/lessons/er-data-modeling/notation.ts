// Crow's-foot notation as geometry. At each end of a relationship line, next to an entity:
// the inner mark is the maximum (a bar for one, a three-pronged "crow's foot" for many) and the
// outer mark is the minimum (a bar for "at least one", a circle for "zero allowed").

import type { Pt } from '../../core/geometry';
import type { End, Entity } from './model';

export const CARD = { w: 172, headerH: 30, rowH: 20, padBottom: 8 } as const;

export const cardHeight = (e: Entity) => CARD.headerH + e.attrs.length * CARD.rowH + CARD.padBottom;
export const cardRect = (e: Entity) => ({ x: e.at.x, y: e.at.y, w: CARD.w, h: cardHeight(e) });

/** Distances from the entity edge along the line. */
const INNER = 10;
const OUTER = 22;
const FOOT = 16;
const HALF = 8;
const CIRCLE_R = 5;

export type Mark = { kind: 'line'; from: Pt; to: Pt } | { kind: 'circle'; at: Pt; r: number };

/**
 * The marks for one end. `edge` is where the line meets the entity; `away` points from the entity
 * toward the other end (any length).
 */
export function endMarks(edge: Pt, away: Pt, end: Pick<End, 'min' | 'max'>): Mark[] {
  const len = Math.hypot(away.x, away.y) || 1;
  const d = { x: away.x / len, y: away.y / len };
  const n = { x: -d.y, y: d.x };
  const along = (t: number) => ({ x: edge.x + d.x * t, y: edge.y + d.y * t });
  const bar = (t: number): Mark => {
    const c = along(t);
    return { kind: 'line', from: { x: c.x + n.x * HALF, y: c.y + n.y * HALF }, to: { x: c.x - n.x * HALF, y: c.y - n.y * HALF } };
  };
  const marks: Mark[] = [];
  if (end.max === 'N') {
    const tip = along(FOOT);
    for (const s of [-1, 0, 1]) marks.push({ kind: 'line', from: tip, to: { x: edge.x + n.x * HALF * s, y: edge.y + n.y * HALF * s } });
  } else {
    marks.push(bar(INNER));
  }
  marks.push(end.min === 1 ? bar(OUTER) : { kind: 'circle', at: along(OUTER + CIRCLE_R), r: CIRCLE_R });
  return marks;
}
