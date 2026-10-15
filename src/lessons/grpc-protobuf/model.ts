/**
 * A Protocol Buffers (proto3) encoder and decoder for one message, `Order`, written for this
 * lesson. It follows the wire format for the field types shown: int64 and int32 as varints
 * (negative values sign-extended to 10 bytes), sint32 as a zigzag varint, string as
 * length-delimited UTF-8, and `repeated int32` packed. Defaults are not sent (proto3), fields
 * are written in field-number order, and a decoder skips (and keeps) fields it doesn't know.
 * Not modelled: other scalar types, nested messages, oneof, map, groups and packed=false output.
 * The wire format underneath (varints, zigzag, tags, the record reader) is core/protobuf.
 */

import { WIRE, asInt32, encodeVarint, int32Varint, int64Varint, readRecords, readVarint, tagOf, unzigzag32, zigzag32, type WireRecord } from '../../core/protobuf';

export type FieldName = 'id' | 'item' | 'qty' | 'delta' | 'tags';
export const FIELD_NAMES: readonly FieldName[] = ['id', 'item', 'qty', 'delta', 'tags'];

export interface Order {
  /** int64 */
  id: bigint;
  item: string;
  /** int32 */
  qty: number;
  /** sint32 in the lesson's schema, int32 in the "what if" */
  delta: number;
  /** repeated int32, packed */
  tags: number[];
}

export type DeltaType = 'sint32' | 'int32';

/** What the writer's .proto says: its field numbers and the type of `delta`. */
export interface Writer {
  numbers: Record<FieldName, number>;
  deltaType: DeltaType;
}

/** What the reader's .proto knows: a field it doesn't list is skipped on read. */
export interface Reader {
  numbers: Partial<Record<FieldName, number>>;
  deltaType: DeltaType;
}

export const SCHEMA: Writer = { numbers: { id: 1, item: 2, qty: 3, delta: 4, tags: 5 }, deltaType: 'sint32' };

/** The wire type each field is written with. */
export const FIELD_WIRE: Record<FieldName, number> = { id: WIRE.varint, item: WIRE.len, qty: WIRE.varint, delta: WIRE.varint, tags: WIRE.len };

export const emptyOrder = (): Order => ({ id: 0n, item: '', qty: 0, delta: 0, tags: [] });

// ── Encoding ────────────────────────────────────────────────────────────

export type SegmentRole = 'tag' | 'length' | 'value';

export interface Segment {
  from: number;
  to: number;
  role: SegmentRole;
  field: FieldName;
}

export interface VarintItem {
  /** "id", "qty", "tags[1]" */
  label: string;
  field: FieldName;
  from: number;
  to: number;
  /** The unsigned value the varint carries (a negative int32 shows as its 64-bit two's complement). */
  value: bigint;
}

export interface Encoded {
  bytes: number[];
  segments: Segment[];
  varints: VarintItem[];
  /** Byte range of each field that was written (tag through value); absent fields are not on the wire. */
  span: Partial<Record<FieldName, { from: number; to: number }>>;
}

const utf8 = new TextEncoder();

/** Encode `o` the way proto3 would under writer schema `w`. */
export function encode(o: Order, w: Writer = SCHEMA): Encoded {
  const bytes: number[] = [];
  const segments: Segment[] = [];
  const varints: VarintItem[] = [];
  const span: Encoded['span'] = {};
  const put = (field: FieldName, role: SegmentRole, data: number[]) => {
    if (!data.length) return;
    segments.push({ from: bytes.length, to: bytes.length + data.length - 1, role, field });
    bytes.push(...data);
  };
  const scalar = (field: FieldName, value: bigint, label: string) => {
    const start = bytes.length;
    put(field, 'tag', tagOf(w.numbers[field], WIRE.varint));
    const v = encodeVarint(value);
    varints.push({ label, field, from: bytes.length, to: bytes.length + v.length - 1, value });
    put(field, 'value', v);
    span[field] = { from: start, to: bytes.length - 1 };
  };
  const order: FieldName[] = [...FIELD_NAMES].sort((a, b) => w.numbers[a] - w.numbers[b]);
  for (const f of order) {
    switch (f) {
      case 'id':
        if (o.id !== 0n) scalar('id', int64Varint(o.id), 'id');
        break;
      case 'item': {
        if (o.item === '') break;
        const start = bytes.length;
        const data = [...utf8.encode(o.item)];
        put('item', 'tag', tagOf(w.numbers.item, WIRE.len));
        put('item', 'length', encodeVarint(BigInt(data.length)));
        put('item', 'value', data);
        span.item = { from: start, to: bytes.length - 1 };
        break;
      }
      case 'qty':
        if (o.qty !== 0) scalar('qty', int32Varint(o.qty), 'qty');
        break;
      case 'delta':
        if (o.delta !== 0) scalar('delta', w.deltaType === 'sint32' ? BigInt(zigzag32(o.delta)) : int32Varint(o.delta), 'delta');
        break;
      case 'tags': {
        if (!o.tags.length) break;
        const start = bytes.length;
        const items = o.tags.map((t) => encodeVarint(int32Varint(t)));
        put('tags', 'tag', tagOf(w.numbers.tags, WIRE.len));
        put('tags', 'length', encodeVarint(BigInt(items.reduce((s, b) => s + b.length, 0))));
        items.forEach((b, i) => {
          varints.push({ label: `tags[${i}]`, field: 'tags', from: bytes.length, to: bytes.length + b.length - 1, value: int32Varint(o.tags[i]) });
          put('tags', 'value', b);
        });
        span.tags = { from: start, to: bytes.length - 1 };
        break;
      }
    }
  }
  return { bytes, segments, varints, span };
}

// ── Decoding ────────────────────────────────────────────────────────────

export interface UnknownField {
  field: number;
  wire: number;
  from: number;
  to: number;
}

export interface Decoded {
  order: Order;
  /** Records the reader recognised, with the name each one was read as. */
  known: { record: WireRecord; name: FieldName }[];
  /** Fields the reader's schema doesn't have (or has with a different wire type): skipped by length, kept for re-serialising. */
  unknown: UnknownField[];
}

export type DecodeResult = { ok: true; decoded: Decoded } | { ok: false; error: string; at: number };

const utf8Strict = new TextDecoder('utf-8', { fatal: true });

/** Decode `bytes` as an Order under reader schema `r`. Last value wins for scalars; repeated int32 accepts packed and unpacked. */
export function decode(bytes: readonly number[], r: Reader): DecodeResult {
  const read = readRecords(bytes);
  if (!read.ok) return read;
  const order = emptyOrder();
  const known: Decoded['known'] = [];
  const unknown: UnknownField[] = [];
  for (const rec of read.records) {
    const name = FIELD_NAMES.find((f) => r.numbers[f] === rec.field);
    const fits = name && (rec.wire === FIELD_WIRE[name] || (name === 'tags' && rec.wire === WIRE.varint));
    if (!name || !fits) {
      unknown.push({ field: rec.field, wire: rec.wire, from: rec.from, to: rec.to });
      continue;
    }
    known.push({ record: rec, name });
    const value = readVarint(bytes, rec.valueFrom)?.value ?? 0n;
    if (name === 'id') order.id = BigInt.asIntN(64, value);
    else if (name === 'qty') order.qty = asInt32(value);
    else if (name === 'delta') order.delta = r.deltaType === 'sint32' ? unzigzag32(Number(value & 0xffffffffn)) : asInt32(value);
    else if (name === 'item') {
      try {
        order.item = utf8Strict.decode(Uint8Array.from(bytes.slice(rec.valueFrom, rec.valueTo + 1)));
      } catch {
        return { ok: false, error: 'the string is not valid UTF-8', at: rec.valueFrom };
      }
    } else if (rec.wire === WIRE.varint) order.tags.push(asInt32(value));
    else {
      for (let at = rec.valueFrom; at <= rec.valueTo; ) {
        const v = readVarint(bytes, at);
        if (!v || v.next > rec.valueTo + 1) return { ok: false, error: 'a packed value ran past its length', at };
        order.tags.push(asInt32(v.value));
        at = v.next;
      }
    }
  }
  return { ok: true, decoded: { order, known, unknown } };
}

/**
 * Write a decoded message back out, putting the skipped unknown records back byte for byte,
 * as a proto3 library that keeps unknown fields would. Real libraries typically append unknown fields after the known ones; here they
 * are merged in field-number order, which gives the same bytes for this schema because the unknown numbers (5, 6) sit after the ones the reader knows.
 * Known fields use the reader's numbers.
 */
export function reserialize(bytes: readonly number[], d: Decoded, r: Reader): number[] {
  const w: Writer = { numbers: { ...SCHEMA.numbers, ...(r.numbers as Partial<Record<FieldName, number>>) }, deltaType: r.deltaType };
  const enc = encode(d.order, w);
  const pieces: { field: number; bytes: number[] }[] = [];
  for (const f of FIELD_NAMES) {
    const span = enc.span[f];
    if (span) pieces.push({ field: w.numbers[f], bytes: enc.bytes.slice(span.from, span.to + 1) });
  }
  for (const u of d.unknown) pieces.push({ field: u.field, bytes: bytes.slice(u.from, u.to + 1) as number[] });
  return pieces.sort((a, b) => a.field - b.field).flatMap((p) => p.bytes);
}

// ── JSON, for the size comparison ───────────────────────────────────────

/** The proto3 JSON mapping of an Order, compact: defaults omitted and int64 written as a string. */
export function toJson(o: Order): string {
  const obj: Record<string, unknown> = {};
  if (o.id !== 0n) obj.id = o.id.toString();
  if (o.item !== '') obj.item = o.item;
  if (o.qty !== 0) obj.qty = o.qty;
  if (o.delta !== 0) obj.delta = o.delta;
  if (o.tags.length) obj.tags = o.tags;
  return JSON.stringify(obj);
}

export const jsonBytes = (o: Order): number => utf8.encode(toJson(o)).length;

// ── What the learner types ──────────────────────────────────────────────

export const MAX_TAGS = 12;
export const MAX_ITEM_CHARS = 40;

/** The `.proto` source for a writer schema, one line per field. */
export function protoLines(w: Writer): string[] {
  const pad = (s: string, n: number) => s.padEnd(n);
  return [
    'message Order {',
    `  ${pad('int64', 6)} id    = ${w.numbers.id};`,
    `  ${pad('string', 6)} item  = ${w.numbers.item};`,
    `  ${pad('int32', 6)} qty   = ${w.numbers.qty};`,
    `  ${pad(w.deltaType, 6)} delta = ${w.numbers.delta};`,
    `  repeated int32 tags = ${w.numbers.tags};`,
    '}',
  ];
}

/** Line index of each field in `protoLines`. */
export const PROTO_LINE: Record<FieldName, number> = { id: 1, item: 2, qty: 3, delta: 4, tags: 5 };

/** Which fields are on the wire for `o` (non-default values only). */
export const presentFields = (o: Order): FieldName[] =>
  FIELD_NAMES.filter((f) => (f === 'id' ? o.id !== 0n : f === 'item' ? o.item !== '' : f === 'tags' ? o.tags.length > 0 : o[f] !== 0));
