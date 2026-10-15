import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import { randomOrder } from './randomOrder';
import { SCHEMA, decode, emptyOrder, encode, jsonBytes, presentFields, reserialize, toJson, type Order, type Reader, type Writer } from './model';
import { INT32_MAX, INT32_MIN, INT64_MAX, INT64_MIN } from '../../core/protobuf';

const hex = (bytes: number[]) => bytes.map((b) => b.toString(16).padStart(2, '0')).join(' ');
const order = (o: Partial<Order>): Order => ({ ...emptyOrder(), ...o });
const SAME: Reader = { numbers: SCHEMA.numbers, deltaType: 'sint32' };
const OLDER: Reader = { numbers: { id: 1, item: 2, qty: 3, delta: 4 }, deltaType: 'sint32' };

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
