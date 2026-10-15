import { describe, expect, it } from 'vitest';
import { mulberry32 } from './random';
import { INT32_MAX, INT32_MIN, INT64_MAX, asInt32, encodeVarint, int32Varint, int64Varint, readRecords, readVarint, tagOf, unzigzag32, zigzag32 } from './protobuf';

const hex = (bytes: number[]) => bytes.map((b) => b.toString(16).padStart(2, '0')).join(' ');

describe('varints (hand-worked and the protobuf docs)', () => {
  it.each([
    [0n, '00'], [1n, '01'], [127n, '7f'], [128n, '80 01'], [150n, '96 01'], [300n, 'ac 02'], [16383n, 'ff 7f'], [16384n, '80 80 01'],
  ])('%s → %s', (v, bytes) => {
    expect(hex(encodeVarint(v))).toBe(bytes);
  });

  it('matches an independent arithmetic reference for every value below 70,000', () => {
    const reference = (n: number): number[] => {
      const out: number[] = [];
      let rest = n;
      for (;;) {
        const low = rest % 128;
        rest = Math.floor(rest / 128);
        if (rest === 0) return [...out, low];
        out.push(low + 128);
      }
    };
    for (let n = 0; n < 70_000; n++) expect(encodeVarint(BigInt(n))).toEqual(reference(n));
  });

  it('uses bigint: 2^63 - 1 is 9 bytes with no precision loss, 2^64 - 1 is 10 bytes', () => {
    expect(hex(encodeVarint(INT64_MAX))).toBe('ff ff ff ff ff ff ff ff 7f');
    expect(hex(encodeVarint(2n ** 64n - 1n))).toBe('ff ff ff ff ff ff ff ff ff 01');
    expect(readVarint(encodeVarint(INT64_MAX), 0)).toEqual({ value: INT64_MAX, next: 9 });
  });

  it('refuses values a varint cannot hold, and reads nothing from truncated or over-long input', () => {
    expect(() => encodeVarint(-1n)).toThrow(RangeError);
    expect(() => encodeVarint(2n ** 64n)).toThrow(RangeError);
    expect(readVarint([0x80], 0)).toBeNull();
    expect(readVarint(Array(11).fill(0x80), 0)).toBeNull();
  });

  it('round-trips seeded values across the whole 64-bit range', () => {
    const rnd = mulberry32(5);
    for (let i = 0; i < 500; i++) {
      const bits = 1 + Math.floor(rnd() * 64);
      let v = 0n;
      for (let b = 0; b < bits; b++) v = (v << 1n) | (rnd() < 0.5 ? 0n : 1n);
      expect(readVarint(encodeVarint(v), 0)!.value).toBe(v);
    }
  });
});

describe('zigzag (the protobuf docs table)', () => {
  it.each([[0, 0], [-1, 1], [1, 2], [-2, 3], [2, 4], [INT32_MAX, 4294967294], [INT32_MIN, 4294967295]])('zigzag(%i) = %i', (n, z) => {
    expect(zigzag32(n)).toBe(z);
    expect(unzigzag32(z)).toBe(n);
  });
  it('agrees with 2n / -2n - 1 and inverts for seeded int32 values', () => {
    const rnd = mulberry32(8);
    for (let i = 0; i < 2000; i++) {
      const n = Math.floor(rnd() * 2 ** 32) - 2 ** 31;
      expect(zigzag32(n)).toBe(n >= 0 ? 2 * n : -2 * n - 1);
      expect(unzigzag32(zigzag32(n))).toBe(n);
    }
  });
});

describe('field tags: (field number << 3) | wire type', () => {
  it('matches hand-worked bytes', () => {
    expect(hex(tagOf(1, 0))).toBe('08');
    expect(hex(tagOf(2, 2))).toBe('12');
    expect(hex(tagOf(5, 2))).toBe('2a');
    expect(hex(tagOf(16, 0))).toBe('80 01');
  });
});

describe('signed values on the wire', () => {
  it('a negative int32 or int64 is sign-extended to 64 bits, so it takes ten bytes', () => {
    expect(int32Varint(-1)).toBe(2n ** 64n - 1n);
    expect(int64Varint(-1n)).toBe(2n ** 64n - 1n);
    expect(encodeVarint(int32Varint(-1))).toHaveLength(10);
    expect(encodeVarint(int32Varint(1))).toHaveLength(1);
  });

  it('asInt32 keeps the low 32 bits, so a sign-extended negative reads back and an int64 truncates', () => {
    expect(asInt32(int32Varint(-1))).toBe(-1);
    expect(asInt32(int32Varint(INT32_MIN))).toBe(INT32_MIN);
    expect(asInt32(int32Varint(INT32_MAX))).toBe(INT32_MAX);
    expect(asInt32(2n ** 32n + 5n)).toBe(5);
  });
});

describe('record reading', () => {
  it('reads 32- and 64-bit values by their fixed length, and refuses what it can\'t skip safely', () => {
    const r = readRecords([0x0d, 1, 2, 3, 4, 0x11, 1, 2, 3, 4, 5, 6, 7, 8, 0x08, 0x01]);
    expect(r.ok && r.records.map((x) => [x.field, x.wire, x.from, x.to])).toEqual([[1, 5, 0, 4], [2, 1, 5, 13], [1, 0, 14, 15]]);
    expect(readRecords([0x0b]).ok).toBe(false);
    expect(readRecords([0x12, 0x05, 1, 2]).ok).toBe(false);
    expect(readRecords([0x00, 0x01]).ok).toBe(false);
    expect(readRecords([0x0e]).ok).toBe(false);
    expect(readRecords([0x08]).ok).toBe(false);
    expect(readRecords([0x0d, 1, 2, 3]).ok).toBe(false);
  });
});
