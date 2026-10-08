import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import { randomOrder } from './randomOrder';
import {
  INT32_MAX, INT32_MIN, INT64_MAX, INT64_MIN, SCHEMA, decode, emptyOrder, encode, encodeVarint, jsonBytes, presentFields, readRecords,
  readVarint, reserialize, tagOf, toJson, unzigzag32, zigzag32, type Order, type Reader, type Writer,
} from './model';

const hex = (bytes: number[]) => bytes.map((b) => b.toString(16).padStart(2, '0')).join(' ');
const order = (o: Partial<Order>): Order => ({ ...emptyOrder(), ...o });
const SAME: Reader = { numbers: SCHEMA.numbers, deltaType: 'sint32' };
const OLDER: Reader = { numbers: { id: 1, item: 2, qty: 3, delta: 4 }, deltaType: 'sint32' };

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

describe('encoding known messages', () => {
  it('field 1 = 150 is 08 96 01 (the protobuf docs example)', () => {
    expect(hex(encode(order({ id: 150n })).bytes)).toBe('08 96 01');
  });
  it('the string "testing" in field 2 is 12 07 74 65 73 74 69 6e 67 (the docs example)', () => {
    expect(hex(encode(order({ item: 'testing' })).bytes)).toBe('12 07 74 65 73 74 69 6e 67');
  });
  it('a packed repeated int32 with 3, 270, 86942 is tag, length 6, then the varints (docs: 22 06 03 8e 02 9e a7 05 for field 4)', () => {
    const e = encode(order({ tags: [3, 270, 86942] }));
    expect(hex(e.bytes)).toBe('2a 06 03 8e 02 9e a7 05');
    expect(e.bytes[0] & 7).toBe(2);
    const as4: Writer = { ...SCHEMA, numbers: { ...SCHEMA.numbers, tags: 4 } };
    expect(hex(encode(order({ tags: [3, 270, 86942] }), as4).bytes)).toBe('22 06 03 8e 02 9e a7 05');
  });
  it('int32 -1 is 10 bytes, sint32 -1 is 1 byte', () => {
    const asInt: Writer = { ...SCHEMA, deltaType: 'int32' };
    expect(hex(encode(order({ delta: -1 }), asInt).bytes)).toBe('20 ff ff ff ff ff ff ff ff ff 01');
    expect(encode(order({ delta: -1 }), asInt).bytes).toHaveLength(11);
    expect(hex(encode(order({ delta: -1 })).bytes)).toBe('20 01');
    expect(hex(encode(order({ qty: -1 })).bytes)).toBe('18 ff ff ff ff ff ff ff ff ff 01');
  });
  it('a negative int64 is also 10 bytes; INT64_MIN is 80 80 … 01', () => {
    expect(hex(encode(order({ id: -1n })).bytes)).toBe('08 ff ff ff ff ff ff ff ff ff 01');
    expect(hex(encode(order({ id: INT64_MIN })).bytes)).toBe('08 80 80 80 80 80 80 80 80 80 01');
  });
  it('the lesson\'s default message is 24 bytes, in field-number order', () => {
    const m = order({ id: 150n, item: 'testing', qty: 3, delta: -1, tags: [3, 270, 86942] });
    expect(hex(encode(m).bytes)).toBe('08 96 01 12 07 74 65 73 74 69 6e 67 18 03 20 01 2a 06 03 8e 02 9e a7 05');
  });
  it('proto3 defaults take 0 bytes: an empty message is empty, and so are zero and empty-string fields', () => {
    expect(encode(emptyOrder()).bytes).toEqual([]);
    expect(presentFields(emptyOrder())).toEqual([]);
    expect(encode(order({ id: 0n, item: '', qty: 0, delta: 0, tags: [] })).bytes).toEqual([]);
    expect(presentFields(order({ qty: 3, tags: [0] }))).toEqual(['qty', 'tags']);
  });
  it('a packed list keeps zeros (each element is a 1-byte varint)', () => {
    expect(hex(encode(order({ tags: [0, 0] })).bytes)).toBe('2a 02 00 00');
  });
  it('strings are UTF-8 bytes, so length is bytes not characters', () => {
    expect(hex(encode(order({ item: 'é😀' })).bytes)).toBe('12 06 c3 a9 f0 9f 98 80');
  });
  it('segments tile the bytes exactly and label tag, length and value bytes', () => {
    const e = encode(order({ id: 150n, item: 'hi', tags: [1, 2] }));
    expect(e.segments.map((s) => `${s.field}:${s.role}:${s.from}-${s.to}`)).toEqual([
      'id:tag:0-0', 'id:value:1-2', 'item:tag:3-3', 'item:length:4-4', 'item:value:5-6', 'tags:tag:7-7', 'tags:length:8-8', 'tags:value:9-9', 'tags:value:10-10',
    ]);
    expect(e.segments.flatMap((s) => Array.from({ length: s.to - s.from + 1 }, (_, i) => s.from + i))).toEqual(e.bytes.map((_, i) => i));
    expect(e.varints.map((v) => v.label)).toEqual(['id', 'tags[0]', 'tags[1]']);
  });
  it('writes fields in field-number order even when the writer renumbers', () => {
    const w: Writer = { ...SCHEMA, numbers: { ...SCHEMA.numbers, qty: 6 } };
    expect(hex(encode(order({ qty: 3, tags: [1] }), w).bytes)).toBe('2a 01 01 30 03');
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

describe('decoding', () => {
  const rnd = mulberry32(2026);
  it('decode(encode(m)) = m for 500 seeded messages, with sint32 and with int32', () => {
    for (let i = 0; i < 500; i++) {
      const m = randomOrder(rnd);
      for (const deltaType of ['sint32', 'int32'] as const) {
        const d = decode(encode(m, { ...SCHEMA, deltaType }).bytes, { ...SAME, deltaType });
        expect(d.ok && d.decoded.order).toEqual(m);
        expect(d.ok && d.decoded.unknown).toEqual([]);
      }
    }
  });

  it('covers the extremes: INT64_MIN/MAX and INT32_MIN/MAX', () => {
    for (const m of [order({ id: INT64_MAX, qty: INT32_MAX, delta: INT32_MIN }), order({ id: INT64_MIN, qty: INT32_MIN, delta: INT32_MAX })]) {
      const d = decode(encode(m).bytes, SAME);
      expect(d.ok && d.decoded.order).toEqual(m);
    }
  });

  it('an older reader skips unknown field 5 by its length and keeps it: re-serialising gives the same bytes', () => {
    const rnd2 = mulberry32(77);
    for (let i = 0; i < 200; i++) {
      const m = { ...randomOrder(rnd), tags: [1 + Math.floor(rnd2() * 1000), 270] };
      const bytes = encode(m).bytes;
      const d = decode(bytes, OLDER);
      expect(d.ok).toBe(true);
      if (!d.ok) continue;
      expect(d.decoded.unknown.map((u) => [u.field, u.wire])).toEqual([[5, 2]]);
      expect(d.decoded.order).toEqual({ ...m, tags: [] });
      expect(reserialize(bytes, d.decoded, OLDER)).toEqual(bytes);
    }
  });

  it('a skipped field leaves the fields after it readable (the length says where it ends)', () => {
    const bytes = [0x2a, 0x03, 0x01, 0x02, 0x03, 0x30, 0x07];
    const d = decode(bytes, { numbers: { qty: 6 }, deltaType: 'sint32' });
    expect(d.ok && d.decoded.order.qty).toBe(7);
    expect(d.ok && d.decoded.unknown).toEqual([{ field: 5, wire: 2, from: 0, to: 4 }]);
  });

  it('renumbering is silent data loss: a reader that still knows qty = 3 reads 0 and skips the new field 6', () => {
    const w: Writer = { ...SCHEMA, numbers: { ...SCHEMA.numbers, qty: 6 } };
    const bytes = encode(order({ id: 150n, qty: 3 }), w).bytes;
    const d = decode(bytes, SAME);
    expect(d.ok && d.decoded.order.qty).toBe(0);
    expect(d.ok && d.decoded.unknown.map((u) => u.field)).toEqual([6]);
  });

  it('a field with the wrong wire type for its number is treated as unknown, not misread', () => {
    const d = decode([0x1a, 0x01, 0x05], SAME);
    expect(d.ok && d.decoded.order.qty).toBe(0);
    expect(d.ok && d.decoded.unknown).toEqual([{ field: 3, wire: 2, from: 0, to: 2 }]);
  });

  it('repeated int32 accepts packed and unpacked, in either order', () => {
    const d = decode([0x28, 0x01, 0x2a, 0x02, 0x02, 0x03, 0x28, 0x04], SAME);
    expect(d.ok && d.decoded.order.tags).toEqual([1, 2, 3, 4]);
  });

  it('the last value of a repeated scalar field wins', () => {
    const d = decode([0x18, 0x01, 0x18, 0x02], SAME);
    expect(d.ok && d.decoded.order.qty).toBe(2);
  });

  it('reports malformed input instead of guessing', () => {
    expect(decode([0x12, 0x02, 0xff, 0xfe], SAME)).toMatchObject({ ok: false, error: 'the string is not valid UTF-8' });
    expect(decode([0x2a, 0x02, 0x80, 0x01], SAME).ok).toBe(true);
    expect(decode([0x2a, 0x02, 0x80, 0x01, 0x05], SAME).ok).toBe(false);
    expect(decode([0x2a, 0x01, 0x80], SAME).ok).toBe(false);
    expect(decode([0x12, 0x09, 0x61], SAME).ok).toBe(false);
  });
});

describe('JSON size', () => {
  it('uses the proto3 JSON mapping: int64 as a string, defaults omitted', () => {
    const m = order({ id: 150n, item: 'testing', qty: 3, delta: -1, tags: [3, 270, 86942] });
    expect(toJson(m)).toBe('{"id":"150","item":"testing","qty":3,"delta":-1,"tags":[3,270,86942]}');
    expect(jsonBytes(m)).toBe(69);
    expect(toJson(emptyOrder())).toBe('{}');
    expect(jsonBytes(order({ item: 'é' }))).toBe('{"item":"é"}'.length + 1);
  });
  it('is larger than protobuf for the default message (69 vs 24 bytes)', () => {
    const m = order({ id: 150n, item: 'testing', qty: 3, delta: -1, tags: [3, 270, 86942] });
    expect(jsonBytes(m)).toBeGreaterThan(encode(m).bytes.length);
  });
});
