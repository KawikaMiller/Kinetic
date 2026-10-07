import { describe, expect, it } from 'vitest';
import { dividerSlots, nearestSlot } from './divider';

/** 32 bits of 18px with 3px gaps and 12px between octets, wrapped into two rows of 16. */
const wrapped = Array.from({ length: 32 }, (_, i) => {
  const row = Math.floor(i / 16);
  const inRow = i % 16;
  const x = inRow * 21 + Math.floor(inRow / 8) * 9;
  return { x, y: row * 40, w: 18, h: 22 };
});

describe('divider slots', () => {
  it('has one slot per prefix length 0-32', () => {
    expect(dividerSlots(wrapped)).toHaveLength(33);
    expect(dividerSlots([])).toEqual([]);
  });

  it('sits between neighbours on a row, at the row start after a wrap, and after the last bit', () => {
    const slots = dividerSlots(wrapped);
    expect(slots[1].x).toBe((18 + 21) / 2);
    expect(slots[16]).toEqual({ x: -5, y: 40, h: 22 });
    expect(slots[32].x).toBe(wrapped[31].x + 18 + 5);
    expect(slots[0].x).toBe(-5);
  });

  it('every slot is its own nearest slot, and a pointer picks the slot on its row', () => {
    const slots = dividerSlots(wrapped);
    slots.forEach((s, k) => expect(nearestSlot(slots, s.x, s.y + s.h / 2)).toBe(k));
    // a pointer on the second row near the left picks slot 16, not slot 0 above it
    expect(nearestSlot(slots, -3, 50)).toBe(16);
  });
});
