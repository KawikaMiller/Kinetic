import type { Pt } from '../../core/geometry';

/** Axis-aligned box in SVG scene coordinates; (x, y) is the top-left corner. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Default sizes, shared so a lesson's layout maths and the drawn shapes agree. */
export const SLOT = { w: 150, h: 30, nameW: 58 } as const;
export const HEAP = { titleH: 24, fieldH: 22 } as const;

export const rectCenter = (r: Rect): Pt => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

/** Where the line from the rect's centre toward `toward` crosses its border. */
export function rectEdgeToward(r: Rect, toward: Pt): Pt {
  const c = rectCenter(r);
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  if (dx === 0 && dy === 0) return c;
  const scale = Math.min(dx === 0 ? Infinity : r.w / 2 / Math.abs(dx), dy === 0 ? Infinity : r.h / 2 / Math.abs(dy));
  return { x: c.x + dx * scale, y: c.y + dy * scale };
}

/** The value box of a VarSlot at `at` (its top-left), where a reference arrow starts. */
export function slotValueRect(at: Pt, o: { w?: number; h?: number; nameW?: number } = {}): Rect {
  const { w = SLOT.w, h = SLOT.h, nameW = SLOT.nameW } = o;
  return { x: at.x + nameW, y: at.y, w: w - nameW, h };
}

/** Centre of a VarSlot's value box: pass it as a RefArrow's `from`. */
export const slotPort = (at: Pt, o: { w?: number; h?: number; nameW?: number } = {}): Pt => rectCenter(slotValueRect(at, o));

/** Height of a HeapObject with `fieldCount` rows. */
export const heapHeight = (fieldCount: number) => HEAP.titleH + Math.max(1, fieldCount) * HEAP.fieldH;

/** The whole HeapObject box: pass it as a RefArrow's `to`. */
export const heapRect = (at: Pt, w: number, fieldCount: number): Rect => ({ x: at.x, y: at.y, w, h: heapHeight(fieldCount) });

/** Which side of a HeapObject a field's reference leaves from. */
export type PortSide = 'left' | 'right';

/** Horizontal inset of a right-side port from the box's right edge. */
const RIGHT_PORT_INSET = 10;

/**
 * Middle of field row `index`, where a nested reference (obj.inner → other) starts: just
 * inside the right edge by default, or on the left border for a reference that heads left
 * (so the arrow doesn't cross its own box). Match the field's `port` side.
 */
export const heapFieldPort = (at: Pt, w: number, index: number, side: PortSide = 'right'): Pt => ({
  x: side === 'left' ? at.x : at.x + w - RIGHT_PORT_INSET,
  y: at.y + HEAP.titleH + index * HEAP.fieldH + HEAP.fieldH / 2,
});

/** Sideways bow for arrow `index` of `count` arrows into one box, so they don't draw on top of each other. */
export const fanBend = (index: number, count: number, spread = 22) => (count <= 1 ? 0 : (index - (count - 1) / 2) * spread);

/**
 * Stack boxes of the given heights with a gap: the top y of each. `down` (default) starts at
 * `start` and grows downward; `up` treats `start` as the bottom edge and grows upward, like a
 * call stack. `end` is where the next box would start (the running y after the last gap).
 */
export function stackBoxes(heights: readonly number[], o: { start: number; gap: number; direction?: 'down' | 'up' }): { tops: number[]; end: number } {
  const up = o.direction === 'up';
  let cursor = o.start;
  const tops = heights.map((h) => {
    const top = up ? cursor - h : cursor;
    cursor = up ? top - o.gap : cursor + h + o.gap;
    return top;
  });
  return { tops, end: cursor };
}
