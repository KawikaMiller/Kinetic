import { describe, expect, it } from 'vitest';
import { bytes as formatBytes, pct } from '../../core/format';
import { mulberry32 } from '../../core/random';
import { expectCaption } from '../../core/testing/captions';
import { callFrames, callSummary, encodeCaption, messageCaption } from './frames';
import { ENDINGS, MODES, buildCall } from './calls';
import { MAX_TAGS, emptyOrder, type DeltaType, type Order } from './model';
import { randomOrder } from './randomOrder';
import { READERS, RENUMBERED_QTY, analyse, lostFields, parseId, parseInt32, parseTags, sizeVerdict, traceRows, varintBreakdown, type ReaderId } from './scene';
import { INT32_MAX, INT32_MIN, INT64_MAX, INT64_MIN } from '../../core/protobuf';

const order = (o: Partial<Order>): Order => ({ ...emptyOrder(), ...o });
const DELTA_TYPES: DeltaType[] = ['sint32', 'int32'];
const READER_IDS: ReaderId[] = READERS.map((r) => r.value);
const DEFAULT = order({ id: 150n, item: 'testing', qty: 3, delta: -1, tags: [3, 270, 86942] });
const rnd = mulberry32(31);
const ORDERS: Order[] = [
  DEFAULT, emptyOrder(), order({ id: 150n }), order({ qty: -1, delta: -1, tags: [-1] }), order({ id: INT64_MAX, item: 'big' }), order({ item: 'café 😀' }),
  ...Array.from({ length: 60 }, () => randomOrder(rnd)),
];

describe('caption, every message × delta type × reader', () => {
  it('quotes the model\'s byte counts, JSON size, delta cost and what the reader skipped or lost', () => {
    for (const o of ORDERS) {
      for (const dt of DELTA_TYPES) {
        for (const r of READER_IDS) {
          const a = analyse(o, dt, r);
          const n = a.encoded.bytes.length;
          const text = expectCaption(encodeCaption(o, a, r));
          if (n === 0) expect(text).toContain('0 bytes');
          else {
            expect(text).toContain(`${n} ${n === 1 ? 'byte' : 'bytes'} in protobuf and ${a.jsonBytes} bytes as JSON`);
            // The verdict follows the sizes: protobuf is not always the smaller one.
            const v = sizeVerdict(n, a.jsonBytes);
            if (v.smaller === 'protobuf') expect(text).toContain(`(${pct(v.saving)} smaller)`);
            else if (v.smaller === 'json') expect(text).toContain(`(protobuf is ${pct(v.overhead!)} larger here)`);
            else expect(text).toContain('(the same size)');
          }
          const delta = a.encoded.varints.find((v) => v.field === 'delta');
          expect(text.includes('delta =')).toBe(delta !== undefined);
          if (delta) expect(text).toContain(`takes ${delta.to - delta.from + 1} ${delta.to === delta.from ? 'byte' : 'bytes'} as ${dt}`);
          const unknown = a.decoded.ok ? a.decoded.decoded.unknown : [];
          if (r === 'older') {
            expect(text.includes('No field 5 is on the wire')).toBe(unknown.length === 0);
            if (unknown.length) expect(text).toContain(`field ${unknown[0].field}`);
            expect(unknown.map((u) => u.field)).toEqual(o.tags.length ? [5] : []);
          }
          if (r === 'renumbered') {
            expect(text.includes('The reader lost qty')).toBe(o.qty !== 0);
            expect(lostFields(o, a).includes('qty')).toBe(o.qty !== 0);
            if (o.qty !== 0) expect(text).toContain(`field ${RENUMBERED_QTY}`);
          }
          if (r === 'same') expect(lostFields(o, a)).toEqual([]);
        }
      }
    }
  });

  it('the older reader preserves the unknown field: re-serialising reproduces the wire bytes', () => {
    for (const o of ORDERS) for (const dt of DELTA_TYPES) {
      const a = analyse(o, dt, 'older');
      expect(a.reserialized).toEqual(a.encoded.bytes);
    }
  });

  it('with int32 instead of sint32, -1 costs 10 bytes against 1 (the default message differs by exactly 9)', () => {
    const sint = analyse(DEFAULT, 'sint32', 'same').encoded.bytes.length;
    const int = analyse(DEFAULT, 'int32', 'same').encoded.bytes.length;
    expect(int - sint).toBe(9);
    expect(sint).toBe(24);
  });
});

describe('the decode trace', () => {
  it('has one row per field on the wire, in wire order, and marks only the unknown ones skipped', () => {
    const rows = traceRows(analyse(DEFAULT, 'sint32', 'older'));
    expect(rows.map((r) => [r.field, r.skipped])).toEqual([[1, false], [2, false], [3, false], [4, false], [5, true]]);
    expect(rows[0]).toMatchObject({ wire: 'varint', hex: '08 96 01', meaning: 'id = 150' });
    expect(rows[1].meaning).toBe('item = "testing"');
    expect(rows[3].meaning).toBe('delta = −1');
    expect(rows[4]).toMatchObject({ wire: 'length-delimited', hex: '2a 06 03 8e 02 9e a7 05' });
    expect(rows[4].meaning).toBe('unknown to this reader: skipped (8 bytes with its tag), kept');
    expect(traceRows(analyse(DEFAULT, 'sint32', 'same')).at(-1)!.meaning).toBe('tags += [3, 270, 86942]');
  });
  it('a hyphen in the string is left alone (only numbers get a real minus)', () => {
    expect(traceRows(analyse(order({ item: 'a-b', qty: -4 }), 'sint32', 'same')).map((r) => r.meaning)).toEqual(['item = "a-b"', 'qty = −4']);
  });
});

describe('varint breakdown (hand-worked: 150 = 0010110 then 0000001)', () => {
  it('splits into 7-bit groups, least significant first, and reassembles them reversed', () => {
    const b = varintBreakdown([0x96, 0x01]);
    expect(b.groups).toEqual(['0010110', '0000001']);
    expect(b.reversed).toEqual(['0000001', '0010110']);
    expect(b.value).toBe(150n);
    expect(BigInt(`0b${b.reversed.join('')}`)).toBe(150n);
  });
  it('a negative int32 is ten groups whose value is 2^64 - 1', () => {
    const b = varintBreakdown([0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x01]);
    expect(b.groups).toHaveLength(10);
    expect(b.value).toBe(2n ** 64n - 1n);
  });
});

describe('hostile input is defined behaviour (empty, whitespace, huge, negative, 1e400, emoji, markup, gaps)', () => {
  const bad = ['', '   ', '12345678901234567890123', '1e400', '😀', '<b>', '1.5', '0x10', '+5', '1,2'];
  it.each(bad)('id %j is refused with a message', (text) => {
    const r = parseId(text);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.length).toBeGreaterThan(5);
  });
  it('id accepts the full int64 range and a typographic minus, and refuses one past either end', () => {
    expect(parseId('-9223372036854775808')).toEqual({ ok: true, value: INT64_MIN });
    expect(parseId('9223372036854775807')).toEqual({ ok: true, value: INT64_MAX });
    expect(parseId('−7')).toEqual({ ok: true, value: -7n });
    expect(parseId('9223372036854775808').ok).toBe(false);
    expect(parseId('-9223372036854775809').ok).toBe(false);
    expect(parseId('0')).toEqual({ ok: true, value: 0n });
  });
  it('int32 fields refuse empty (never silently 0) and anything past either end', () => {
    for (const text of ['', ' ', '2147483648', '-2147483649', '1e3', '😀', '<script>']) expect(parseInt32(text).ok).toBe(false);
    expect(parseInt32('-2147483648')).toEqual({ ok: true, value: INT32_MIN });
    expect(parseInt32('2147483647')).toEqual({ ok: true, value: INT32_MAX });
  });
  it('tags: empty is the empty list (nothing sent); commas or spaces separate; a gap, a bad entry or too many is refused', () => {
    expect(parseTags('')).toEqual({ ok: true, value: [] });
    expect(parseTags('  ')).toEqual({ ok: true, value: [] });
    expect(parseTags('3, 270,86942')).toEqual({ ok: true, value: [3, 270, 86942] });
    expect(parseTags('3 270  5')).toEqual({ ok: true, value: [3, 270, 5] });
    expect(parseTags('1,,2')).toMatchObject({ ok: false, error: 'There is an empty entry between two commas.' });
    expect(parseTags('1,')).toMatchObject({ ok: false });
    expect(parseTags('1, x').ok).toBe(false);
    expect(parseTags('1e400').ok).toBe(false);
    expect(parseTags('99999999999').ok).toBe(false);
    expect(parseTags(Array.from({ length: MAX_TAGS }, (_, i) => i).join(',')).ok).toBe(true);
    expect(parseTags(Array.from({ length: MAX_TAGS + 1 }, (_, i) => i).join(',')).ok).toBe(false);
  });
});

describe('gRPC call captions, every mode × ending', () => {
  it('each message caption states its own numbers, and the summary counts the messages shown', () => {
    for (const mode of MODES) {
      for (const ending of ENDINGS) {
        const ms = buildCall(mode, ending);
        for (const m of ms) {
          const text = expectCaption(messageCaption(m, mode));
          if (m.framed !== undefined) {
            expect(text).toContain(`${m.framed} B in a DATA frame`);
            expect(text).toContain(`${m.payload} B of protobuf`);
          }
          if (m.kind === 'trailers' || m.kind === 'trailers-only') expect(text).toContain(`grpc-status: ${m.status}`);
          if (m.kind === 'cancel') expect(text).toContain('DEADLINE_EXCEEDED (4)');
          if (m.kind === 'cancel') expect(text).toContain('the server is told the deadline too, and could also return it');
          if (m.kind === 'trailers-only') expect(text.includes('RST_STREAM with NO_ERROR')).toBe(mode === 'bidi');
          expect(text.includes('END_STREAM')).toBe(m.endStream);
        }
        const req = ms.filter((m) => m.kind === 'req-data').length;
        const resp = ms.filter((m) => m.kind === 'resp-data').length;
        const total = ms.reduce((s, m) => s + (m.framed ?? 0), 0);
        const text = expectCaption(callSummary(mode, ending));
        expect(text).toContain(`${req} request ${req === 1 ? 'message' : 'messages'} and ${resp} response ${resp === 1 ? 'message' : 'messages'}`);
        expect(text).toContain(`(${formatBytes(total, { base: 1000 })} of`);
        const frames = callFrames(mode, ending);
        expect(frames).toHaveLength(ms.length + 2);
        expect(frames.at(-1)!.step).toBe(ms.length - 1);
      }
    }
  });
});
