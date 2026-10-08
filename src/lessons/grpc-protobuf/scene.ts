/**
 * What the encode scene derives from the learner's message and its three switches: the
 * writer's schema, the reader's schema, the bytes, the decode, and the size comparison.
 * Pure, so the live caption and the panels read the same numbers.
 */
import { parseBoundedBigInt, parseBoundedInt, type FieldParse } from '../../core/parse';
import {
  INT32_MAX, INT32_MIN, INT64_MAX, INT64_MIN, MAX_TAGS, SCHEMA, WIRE_NAME, decode, encode, jsonBytes, reserialize, toJson, type DecodeResult,
  type DeltaType, type Encoded, type FieldName, type Order, type Reader, type Writer,
} from './model';

/** Who reads the bytes: a reader with the same .proto, an older one without field 5, or one that missed a renumbering. */
export type ReaderId = 'same' | 'older' | 'renumbered';
export const READERS: { value: ReaderId; label: string }[] = [
  { value: 'same', label: 'same .proto' },
  { value: 'older', label: 'older: no field 5' },
  { value: 'renumbered', label: 'writer renumbered qty' },
];

/** The new field number the "renumbered" writer gives `qty` (was 3). */
export const RENUMBERED_QTY = 6;

export const writerFor = (deltaType: DeltaType, reader: ReaderId): Writer => ({
  numbers: { ...SCHEMA.numbers, ...(reader === 'renumbered' ? { qty: RENUMBERED_QTY } : {}) },
  deltaType,
});

/** The reader keeps the original numbering; the older one has never heard of `tags`. */
export const readerFor = (deltaType: DeltaType, reader: ReaderId): Reader => ({
  numbers: reader === 'older' ? { id: 1, item: 2, qty: 3, delta: 4 } : { ...SCHEMA.numbers },
  deltaType,
});

export interface Analysis {
  writer: Writer;
  reader: Reader;
  encoded: Encoded;
  decoded: DecodeResult;
  json: string;
  jsonBytes: number;
  /** The reader's message written back out with unknown fields kept: identical to the input bytes. */
  reserialized: number[] | null;
}

export function analyse(order: Order, deltaType: DeltaType, readerId: ReaderId): Analysis {
  const writer = writerFor(deltaType, readerId);
  const reader = readerFor(deltaType, readerId);
  const encoded = encode(order, writer);
  const decoded = decode(encoded.bytes, reader);
  return {
    writer, reader, encoded, decoded, json: toJson(order), jsonBytes: jsonBytes(order),
    reserialized: decoded.ok ? reserialize(encoded.bytes, decoded.decoded, reader) : null,
  };
}

/** What the reader lost: fields the writer sent that decode to something else than the writer's value. */
export function lostFields(order: Order, a: Analysis): string[] {
  if (!a.decoded.ok) return ['everything (the bytes would not decode)'];
  const got = a.decoded.decoded.order;
  const lost: string[] = [];
  if (got.id !== order.id) lost.push('id');
  if (got.item !== order.item) lost.push('item');
  if (got.qty !== order.qty) lost.push('qty');
  if (got.delta !== order.delta) lost.push('delta');
  if (got.tags.join() !== order.tags.join()) lost.push('tags');
  return lost;
}

// ── Learner input ───────────────────────────────────────────────────────

const group3 = (n: bigint | number) => n.toLocaleString('en-US').replace('-', '−');

export const parseId = (text: string): FieldParse<bigint> =>
  parseBoundedBigInt(text, {
    min: INT64_MIN, max: INT64_MAX, typographicMinus: true,
    messages: {
      empty: 'Type a whole number; 0 means "not sent".',
      tooSmall: () => `An int64 holds ${group3(INT64_MIN)} to ${group3(INT64_MAX)}.`,
      tooBig: () => `An int64 holds ${group3(INT64_MIN)} to ${group3(INT64_MAX)}.`,
    },
  });

export const parseInt32 = (text: string, label = 'An int32'): FieldParse<number> =>
  parseBoundedInt(text, {
    min: INT32_MIN, max: INT32_MAX, typographicMinus: true,
    messages: {
      empty: 'Type a whole number; 0 means "not sent".',
      tooSmall: () => `${label} holds ${group3(INT32_MIN)} to ${group3(INT32_MAX)}.`,
      tooBig: () => `${label} holds ${group3(INT32_MIN)} to ${group3(INT32_MAX)}.`,
    },
  });

/** The tags list: empty means no tags (nothing sent); otherwise int32s separated by commas or by spaces. */
export function parseTags(text: string): FieldParse<number[]> {
  const t = text.trim();
  if (!t) return { ok: true, value: [] };
  const parts = t.includes(',') ? t.split(',').map((x) => x.trim()) : t.split(/\s+/);
  if (parts.some((x) => x === '')) return { ok: false, error: 'There is an empty entry between two commas.' };
  if (parts.length > MAX_TAGS) return { ok: false, error: `Up to ${MAX_TAGS} tags, please.` };
  const out: number[] = [];
  for (const part of parts) {
    const v = parseInt32(part, 'A tag');
    if (!v.ok) return v;
    out.push(v.value);
  }
  return { ok: true, value: out };
}

// ── Reading a varint ────────────────────────────────────────────────────

export interface VarintBreakdown {
  /** Each byte's low 7 bits, in the order they appear on the wire (least significant group first). */
  groups: string[];
  /** The same groups with the last first: the number's bits read left to right. */
  reversed: string[];
  value: bigint;
}

const bits7 = (b: number) => (b & 0x7f).toString(2).padStart(7, '0');

/** Split varint bytes into 7-bit groups and put them back together, most significant group first. */
export function varintBreakdown(bytes: readonly number[]): VarintBreakdown {
  const groups = bytes.map(bits7);
  const reversed = [...groups].reverse();
  const value = bytes.reduce((v, b, i) => v | (BigInt(b & 0x7f) << BigInt(7 * i)), 0n);
  return { groups, reversed, value };
}

// ── The decode trace ────────────────────────────────────────────────────

export interface TraceRow {
  field: number;
  wire: string;
  hex: string;
  /** "qty = 3", or why it was skipped. */
  meaning: string;
  skipped: boolean;
}

const hex2 = (b: number) => b.toString(16).padStart(2, '0');

/** One row per field on the wire: what the reader made of it, or that it skipped it. */
export function traceRows(a: Analysis): TraceRow[] {
  if (!a.decoded.ok) return [];
  const { known, unknown } = a.decoded.decoded;
  const bytes = a.encoded.bytes;
  const text = (f: FieldName, rec: { from: number; to: number }): string => {
    const one = decode(bytes.slice(rec.from, rec.to + 1), a.reader);
    if (!one.ok) return `${f} (unreadable)`;
    const o = one.decoded.order;
    const number = (v: bigint | number | number[]) => (Array.isArray(v) ? `[${v.join(', ')}]` : String(v)).replace(/-/g, '−');
    const value = f === 'item' ? JSON.stringify(o.item) : number(f === 'id' ? o.id : f === 'tags' ? o.tags : o[f]);
    return `${f} ${f === 'tags' ? '+=' : '='} ${value}`;
  };
  const rows: (TraceRow & { from: number })[] = [
    ...known.map((k) => ({
      from: k.record.from, field: k.record.field, wire: WIRE_NAME[k.record.wire], hex: bytes.slice(k.record.from, k.record.to + 1).map(hex2).join(' '),
      meaning: text(k.name, k.record), skipped: false,
    })),
    ...unknown.map((u) => ({
      from: u.from, field: u.field, wire: WIRE_NAME[u.wire], hex: bytes.slice(u.from, u.to + 1).map(hex2).join(' '),
      meaning: `unknown to this reader: skipped (${u.to - u.from + 1} bytes with its tag), kept`, skipped: true,
    })),
  ];
  return rows.sort((x, y) => x.from - y.from).map(({ from: _from, ...r }) => r);
}
