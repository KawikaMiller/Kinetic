/**
 * Where BitStrip's divider can sit over its measured bits: one slot before each bit and one
 * after the last, so slot k means "k bits on the left" (a prefix length). The strip wraps between groups on a
 * phone, so a slot at a row break sits at the start of the new row. Pure, so it's tested.
 */
import type { Rect } from '../core/useMeasure';

export interface Slot {
  x: number;
  y: number;
  h: number;
}

/** Gap kept between the divider line and a bit at a row's start or end. */
const EDGE = 5;

export function dividerSlots(bits: readonly Rect[]): Slot[] {
  if (!bits.length) return [];
  const slots: Slot[] = [];
  for (let k = 0; k <= bits.length; k++) {
    const before = bits[k - 1];
    const after = bits[k];
    if (before && after && before.y === after.y) {
      slots.push({ x: (before.x + before.w + after.x) / 2, y: after.y, h: after.h });
    } else if (after) {
      slots.push({ x: after.x - EDGE, y: after.y, h: after.h });
    } else {
      slots.push({ x: before.x + before.w + EDGE, y: before.y, h: before.h });
    }
  }
  return slots;
}

/** The slot nearest a pointer: rows first (vertical distance outside a row's band), then x. */
export function nearestSlot(slots: readonly Slot[], px: number, py: number): number {
  let best = 0;
  let bestD = Infinity;
  slots.forEach((s, k) => {
    const dy = py < s.y ? s.y - py : py > s.y + s.h ? py - (s.y + s.h) : 0;
    const d = dy * 1000 + Math.abs(px - s.x);
    if (d < bestD) {
      bestD = d;
      best = k;
    }
  });
  return best;
}

/** PageUp/PageDown move the divider a byte at a time. */
export const DIVIDER_PAGE = 8;

/**
 * Where a key moves a divider at slot `at` over `n` bits: arrows by one (Left/Down down,
 * Right/Up up), PageDown/PageUp by DIVIDER_PAGE, Home/End to the ends; clamped to 0..n.
 * null for any other key.
 */
export function dividerKeyTarget(key: string, at: number, n: number): number | null {
  const step: Record<string, number> = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, PageDown: -DIVIDER_PAGE, PageUp: DIVIDER_PAGE };
  if (key === 'Home') return 0;
  if (key === 'End') return n;
  if (!(key in step)) return null;
  return Math.max(0, Math.min(n, at + step[key]));
}
