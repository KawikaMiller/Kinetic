/**
 * The Protocol Buffers (proto3) wire format, without any particular message: varints, zigzag,
 * tags, the 32- and 64-bit integer conversions and a reader that splits bytes into wire records
 * before any schema is applied. Written for grpc-protobuf and shared with schema-evolution; each
 * lesson builds its own message encoder and decoder on top (field order, defaults and unknown
 * fields are the message's business, not the wire's).
 *
 * Not modelled: floats and fixed-width scalars beyond skipping them, groups (wire types 3 and 4
 * are reported as unsupported), and anything schema-level (nested messages, oneof, map).
 */

export const WIRE = { varint: 0, i64: 1, len: 2, i32: 5 } as const;
export const WIRE_NAME: Record<number, string> = { 0: 'varint', 1: '64-bit', 2: 'length-delimited', 5: '32-bit' };

export const INT32_MIN = -(2 ** 31);
export const INT32_MAX = 2 ** 31 - 1;
export const INT64_MIN = -(2n ** 63n);
export const INT64_MAX = 2n ** 63n - 1n;
const U64 = 2n ** 64n;

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

/** The 32-bit signed value of a varint (int32 keeps the low 32 bits). */
export const asInt32 = (v: bigint): number => Number(BigInt.asIntN(32, v));

/** The tag byte(s): (field number << 3) | wire type, as a varint. */
export const tagOf = (field: number, wire: number): number[] => encodeVarint((BigInt(field) << 3n) | BigInt(wire));

// ── Reading ─────────────────────────────────────────────────────────────

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
