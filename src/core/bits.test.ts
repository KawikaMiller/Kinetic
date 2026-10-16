import { describe, expect, it } from 'vitest';
import { bitLength, chunkGroups, flipBit, fromBits, fromBitsSigned, placeValue, toBits, type Bit } from './bits';

const str = (bits: readonly Bit[]) => bits.join('');

describe('bits', () => {
  it('round-trips every 16-bit unsigned value', () => {
    for (let v = 0; v < 2 ** 16; v++) {
      if (fromBits(toBits(v, 16)) !== v) throw new Error(`round trip failed for ${v}`);
    }
  });

  it('reads every signed 8-bit value back through two’s complement', () => {
    for (let v = -128; v <= 127; v++) expect(fromBitsSigned(toBits(v, 8))).toBe(v);
    expect(str(toBits(-1, 8))).toBe('11111111');
    expect(str(toBits(-128, 8))).toBe('10000000');
    expect(str(toBits(127, 8))).toBe('01111111');
  });

  it('wraps values outside the width', () => {
    expect(str(toBits(256, 8))).toBe('00000000');
    expect(str(toBits(257, 8))).toBe('00000001');
    expect(str(toBits(-129, 8))).toBe('01111111');
  });

  it('keeps the lowest bit at the full 53-bit width', () => {
    const max = Number.MAX_SAFE_INTEGER; // 2^53 - 1: all ones
    expect(str(toBits(max, 53))).toBe('1'.repeat(53));
    expect(fromBits(toBits(max, 53))).toBe(max);
    expect(toBits(max - 1, 53).at(-1)).toBe(0);
  });

  it('rejects widths it cannot represent exactly', () => {
    expect(() => toBits(1, 0)).toThrow(RangeError);
    expect(() => toBits(1, 54)).toThrow(RangeError);
    expect(() => toBits(1, 2.5)).toThrow(RangeError);
  });

  it('flips exactly one bit without mutating the input', () => {
    const bits = toBits(0b1010, 4);
    expect(str(flipBit(bits, 0))).toBe('0010');
    expect(str(flipBit(bits, 3))).toBe('1011');
    expect(str(bits)).toBe('1010');
  });

  it('gives MSB-first place values', () => {
    expect([0, 1, 2, 3].map((i) => placeValue(i, 4))).toEqual([8, 4, 2, 1]);
  });

  it('chunks from the MSB end, leaving a short last group', () => {
    expect(chunkGroups(8, 4).map((g) => [g.from, g.to])).toEqual([[0, 3], [4, 7]]);
    expect(chunkGroups(8, 3).map((g) => [g.from, g.to])).toEqual([[0, 2], [3, 5], [6, 7]]);
    expect(chunkGroups(24, 6, { label: (i) => `#${i}` }).map((g) => g.label)).toEqual(['#0', '#1', '#2', '#3']);
  });

  it('chunks from the LSB end with align right, leaving a short first group', () => {
    expect(chunkGroups(12, 8, { align: 'right' }).map((g) => [g.from, g.to])).toEqual([[0, 3], [4, 11]]);
    expect(chunkGroups(16, 8, { align: 'right' }).map((g) => [g.from, g.to])).toEqual([[0, 7], [8, 15]]);
    expect(chunkGroups(3, 8, { align: 'right' }).map((g) => [g.from, g.to])).toEqual([[0, 2]]);
    // Every group ends on a whole multiple of `size` counted from the LSB, for every width.
    for (let width = 1; width <= 53; width++) {
      const groups = chunkGroups(width, 8, { align: 'right' });
      expect(groups[0].from).toBe(0);
      expect(groups[groups.length - 1].to).toBe(width - 1);
      groups.forEach((g, i) => {
        expect((width - 1 - g.to) % 8).toBe(0);
        if (i > 0) expect(g.from).toBe(groups[i - 1].to + 1);
      });
    }
  });
});

describe('bitLength', () => {
  it('matches the length of the binary spelling for every value to 2^16, as number and bigint', () => {
    for (let x = 1; x <= 65536; x++) {
      const want = x.toString(2).length;
      expect(bitLength(x), `${x}`).toBe(want);
      expect(bitLength(BigInt(x)), `${x}n`).toBe(want);
    }
  });

  it('is exact at and around every power of two up to 2^53, where log2 would round', () => {
    for (let k = 1; k <= 53; k++) {
      const p = 2 ** k;
      expect(bitLength(p), `2^${k}`).toBe(k + 1);
      expect(bitLength(p - 1), `2^${k}-1`).toBe(k);
      expect(bitLength(BigInt(p)), `2^${k}n`).toBe(k + 1);
    }
    expect(bitLength(Number.MAX_SAFE_INTEGER)).toBe(53);
  });

  it('counts a bigint past 64 bits', () => {
    expect(bitLength(10n ** 30n)).toBe(100);
    expect(bitLength(2n ** 200n - 1n)).toBe(200);
    expect(bitLength(2n ** 200n)).toBe(201);
  });

  it('is 0 for zero, for negatives, and floors a fraction', () => {
    expect(bitLength(0)).toBe(0);
    expect(bitLength(0n)).toBe(0);
    expect(bitLength(-5)).toBe(0);
    expect(bitLength(-5n)).toBe(0);
    expect(bitLength(0.9)).toBe(0);
    expect(bitLength(255.9)).toBe(8);
    expect(bitLength(NaN)).toBe(0);
  });
});