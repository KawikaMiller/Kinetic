import { describe, expect, it } from 'vitest';
import { byteRows, fieldAt, hexByte, printable, type ByteField } from './bytes';

describe('hexByte', () => {
  it('is two uppercase digits for every byte value', () => {
    for (let b = 0; b < 256; b++) {
      const h = hexByte(b);
      expect(h).toMatch(/^[0-9A-F]{2}$/);
      expect(parseInt(h, 16)).toBe(b);
    }
    expect(hexByte(0x10f)).toBe('0F'); // masked to one byte
  });
});

describe('byteRows', () => {
  it('rounds up, and is never 0', () => {
    expect(byteRows(0, 16)).toBe(1);
    expect(byteRows(16, 16)).toBe(1);
    expect(byteRows(17, 16)).toBe(2);
    expect(byteRows(20, 8)).toBe(3);
  });
});

describe('printable', () => {
  it('keeps printable ASCII and dots everything else', () => {
    expect(printable([0x48, 0x69, 0x00, 0x7f, 0x20, 0xff])).toBe('Hi.. .');
    const all = Array.from({ length: 256 }, (_, i) => i);
    expect(printable(all).length).toBe(256);
  });
});

describe('fieldAt', () => {
  const fields: ByteField[] = [
    { from: 0, to: 5, tone: 'info', label: 'dst MAC' },
    { from: 6, to: 11, tone: 'violet', label: 'src MAC' },
  ];
  it('finds the field covering a byte, inclusive', () => {
    expect(fieldAt(fields, 0)?.label).toBe('dst MAC');
    expect(fieldAt(fields, 5)?.label).toBe('dst MAC');
    expect(fieldAt(fields, 6)?.label).toBe('src MAC');
    expect(fieldAt(fields, 12)).toBeUndefined();
  });
});
