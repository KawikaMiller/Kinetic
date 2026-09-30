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

/** Right-edge middle of field row `index`: where a nested reference (obj.inner → other) starts. */
export const heapFieldPort = (at: Pt, w: number, index: number): Pt => ({
  x: at.x + w - 10,
  y: at.y + HEAP.titleH + index * HEAP.fieldH + HEAP.fieldH / 2,
});
