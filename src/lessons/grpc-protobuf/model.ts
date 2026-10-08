/**
 * A Protocol Buffers (proto3) encoder and decoder for one message, `Order`, written for this
 * lesson. It follows the wire format for the field types shown: int64 and int32 as varints
 * (negative values sign-extended to 10 bytes), sint32 as a zigzag varint, string as
 * length-delimited UTF-8, and `repeated int32` packed. Defaults are not sent (proto3), fields
 * are written in field-number order, and a decoder skips (and keeps) fields it doesn't know.
 * Not modelled: other scalar types, nested messages, oneof, map, groups and packed=false output.
 */

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

export const WIRE = { varint: 0, i64: 1, len: 2, i32: 5 } as const;
export const WIRE_NAME: Record<number, string> = { 0: 'varint', 1: '64-bit', 2: 'length-delimited', 5: '32-bit' };

/** The wire type each field is written with. */
export const FIELD_WIRE: Record<FieldName, number> = { id: WIRE.varint, item: WIRE.len, qty: WIRE.varint, delta: WIRE.varint, tags: WIRE.len };

export const INT32_MIN = -(2 ** 31);
export const INT32_MAX = 2 ** 31 - 1;
export const INT64_MIN = -(2n ** 63n);
export const INT64_MAX = 2n ** 63n - 1n;
const U64 = 2n ** 64n;

export const emptyOrder = (): Order => ({ id: 0n, item: '', qty: 0, delta: 0, tags: [] });

// ── Varints and zigzag ──────────────────────────────────────────────────

/** Base-128 varint, least-significant 7-bit group first, high bit set on every byte but the last. */
export function encodeVarint(v: bigint): number[] {
  if (v < 0n || v >= U64) throw new RangeError('a varint holds 0 to 2^64 - 1');
  const out: number[] = [];
  let rest = v;
  do {
    const group = Number(rest & 0x7fn);
    rest >>= 7n;
    out.push(rest > 0n ? group | 0x80 : group);
  } while (rest > 0n);
  return out;
}

/** zigzag(n) for a 32-bit signed n: 0→0, -1→1, 1→2, -2→3 … (small magnitudes stay small). */
export const zigzag32 = (n: number): number => ((n << 1) ^ (n >> 31)) >>> 0;
export const unzigzag32 = (u: number): number => (u >>> 1) ^ -(u & 1);

/** The unsigned varint value a signed 32-bit field writes: negatives are sign-extended to 64 bits. */
export const int32Varint = (n: number): bigint => BigInt.asUintN(64, BigInt(n));
export const int64Varint = (n: bigint): bigint => BigInt.asUintN(64, n);

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

/** The tag byte(s): (field number << 3) | wire type, as a varint. */
export const tagOf = (field: number, wire: number): number[] => encodeVarint((BigInt(field) << 3n) | BigInt(wire));

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

/** One field as it sits on the wire, before any schema is applied. */
export interface WireRecord {
  field: number;
  wire: number;
  /** First and last byte of the whole record: tag, any length, and value. */
  from: number;
  to: number;
  /** The value's bytes (for varint: the varint itself; for length-delimited: the payload). */
  valueFrom: number;
  valueTo: number;
}

export type ReadResult = { ok: true; records: WireRecord[] } | { ok: false; error: string; at: number };

const MAX_VARINT_BYTES = 10;

/** Read a varint at `at`: its value, and the index after it. Null if truncated or longer than 10 bytes. */
export function readVarint(bytes: readonly number[], at: number): { value: bigint; next: number } | null {
  let value = 0n;
  for (let i = 0; i < MAX_VARINT_BYTES; i++) {
    const b = bytes[at + i];
    if (b === undefined) return null;
    value |= BigInt(b & 0x7f) << BigInt(7 * i);
    if ((b & 0x80) === 0) return { value: BigInt.asUintN(64, value), next: at + i + 1 };
  }
  return null;
}

/** Split bytes into wire records, skipping nothing: the decoder decides what each record means. */
export function readRecords(bytes: readonly number[]): ReadResult {
  const records: WireRecord[] = [];
  let at = 0;
  while (at < bytes.length) {
    const from = at;
    const tag = readVarint(bytes, at);
    if (!tag) return { ok: false, error: 'ran out of bytes inside a tag', at };
    at = tag.next;
    const wire = Number(tag.value & 7n);
    const field = Number(tag.value >> 3n);
    if (field < 1) return { ok: false, error: 'field number 0 is not allowed', at: from };
    let valueFrom = at;
    let valueTo: number;
    if (wire === WIRE.varint) {
      const v = readVarint(bytes, at);
      if (!v) return { ok: false, error: 'a varint ran off the end (or is longer than 10 bytes)', at };
      at = v.next;
      valueTo = at - 1;
    } else if (wire === WIRE.i64 || wire === WIRE.i32) {
      const n = wire === WIRE.i64 ? 8 : 4;
      if (at + n > bytes.length) return { ok: false, error: `a ${n * 8}-bit value ran off the end`, at };
      at += n;
      valueTo = at - 1;
    } else if (wire === WIRE.len) {
      const len = readVarint(bytes, at);
      if (!len) return { ok: false, error: 'a length ran off the end', at };
      const n = Number(len.value);
      valueFrom = len.next;
      if (len.value > BigInt(bytes.length) || len.next + n > bytes.length) return { ok: false, error: `a length of ${len.value} runs past the end`, at };
      at = len.next + n;
      valueTo = at - 1;
    } else {
      return { ok: false, error: `wire type ${wire} is not supported (3 and 4 are deprecated groups; 6 and 7 are invalid)`, at: from };
    }
    records.push({ field, wire, from, to: at - 1, valueFrom, valueTo });
  }
  return { ok: true, records };
}

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

/** The 32-bit signed value of a varint (int32 keeps the low 32 bits). */
const asInt32 = (v: bigint): number => Number(BigInt.asIntN(32, v));

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
