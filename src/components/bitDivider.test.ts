import { describe, expect, it } from 'vitest';
import { dividerKeyTarget, dividerSlots, nearestSlot } from './bitDivider';

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

describe('dividerKeyTarget', () => {
  it('moves by one, by a byte, or to the ends, clamped', () => {
    expect(dividerKeyTarget('ArrowRight', 24, 32)).toBe(25);
    expect(dividerKeyTarget('ArrowUp', 24, 32)).toBe(25);
    expect(dividerKeyTarget('ArrowLeft', 24, 32)).toBe(23);
    expect(dividerKeyTarget('ArrowDown', 24, 32)).toBe(23);
    expect(dividerKeyTarget('PageUp', 24, 32)).toBe(32);
    expect(dividerKeyTarget('PageUp', 28, 32)).toBe(32);
    expect(dividerKeyTarget('PageDown', 3, 32)).toBe(0);
    expect(dividerKeyTarget('Home', 24, 32)).toBe(0);
    expect(dividerKeyTarget('End', 24, 32)).toBe(32);
    expect(dividerKeyTarget('ArrowLeft', 0, 32)).toBe(0);
    expect(dividerKeyTarget('Enter', 24, 32)).toBeNull();
  });
});
