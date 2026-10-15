/**
 * Scene 1 of schema-evolution: a three-field Protocol Buffers message evolved by one change, written
 * with one schema and read with the other, as real bytes (binary) or as the JSON mapping (by name).
 *
 * Every field carries a `concept`: what it means. Renaming or renumbering a field keeps its concept;
 * reusing a number for a new field gives it a new one. The verdict compares what the reader ended up
 * with against what the writer meant for each of the reader's own concepts, so "silently wrong" is
 * measured against the writer's intent and never read off the decoder's own output.
 */

import { parseBoundedInt, type FieldParse } from '../../core/parse';
import {
  INT32_MAX, INT32_MIN, INT64_MAX, INT64_MIN, WIRE, asInt32, encodeVarint, int32Varint, int64Varint, readRecords, readVarint, tagOf,
} from '../../core/protobuf';

export type PType = 'int32' | 'int64' | 'string';
export type PValue = bigint | string;

export interface PField {
  concept: string;
  name: string;
  number: number;
  type: PType;
}

export interface PSchema {
  fields: PField[];
  reserved: number[];
}

/** What the writer means to say, by concept. A concept left out is at its default and is not sent. */
export type PMessage = Record<string, PValue>;

export const MAX_FIELD_NUMBER = 2 ** 29 - 1;
/** The range protobuf keeps for its own implementation (from memory: check the language guide). */
export const IMPLEMENTATION_RESERVED = { from: 19000, to: 19999 } as const;

const WIRE_OF: Record<PType, number> = { int32: WIRE.varint, int64: WIRE.varint, string: WIRE.len };
const utf8 = new TextEncoder();
const utf8Strict = new TextDecoder('utf-8', { fatal: true });

export const defaultOf = (t: PType): PValue => (t === 'string' ? '' : 0n);
const isDefault = (v: PValue) => v === 0n || v === '';

// ── The starting schema ─────────────────────────────────────────────────

export const V1: PSchema = {
  fields: [
    { concept: 'id', name: 'id', number: 1, type: 'int32' },
    { concept: 'name', name: 'name', number: 2, type: 'string' },
    { concept: 'qty', name: 'qty', number: 3, type: 'int32' },
  ],
  reserved: [],
};
export const V1_MESSAGE: PMessage = { id: 150n, name: 'testing', qty: 300n };
/** A quantity that does not fit in 32 bits: 2^32 + 300. */
export const BIG_QTY = 2n ** 32n + 300n;

export const protoLines = (s: PSchema): string[] => [
  'message Item {',
  ...s.fields.map((f) => `  ${f.type} ${f.name} = ${f.number};`),
  ...(s.reserved.length ? [`  reserved ${s.reserved.join(', ')};`] : []),
  '}',
];

// ── Encoding and decoding (binary) ──────────────────────────────────────

export type SegmentRole = 'tag' | 'length' | 'value';
export interface Segment {
  from: number;
  to: number;
  role: SegmentRole;
  concept: string;
}

export function encode(schema: PSchema, msg: PMessage): { bytes: number[]; segments: Segment[] } {
  const bytes: number[] = [];
  const segments: Segment[] = [];
  const put = (concept: string, role: SegmentRole, data: number[]) => {
    segments.push({ from: bytes.length, to: bytes.length + data.length - 1, role, concept });
    bytes.push(...data);
  };
  for (const f of [...schema.fields].sort((a, b) => a.number - b.number)) {
    const v = msg[f.concept];
    if (v === undefined || isDefault(v)) continue;
    put(f.concept, 'tag', tagOf(f.number, WIRE_OF[f.type]));
    if (f.type === 'string') {
      const data = [...utf8.encode(String(v))];
      put(f.concept, 'length', encodeVarint(BigInt(data.length)));
      put(f.concept, 'value', data);
    } else {
      put(f.concept, 'value', encodeVarint(f.type === 'int32' ? int32Varint(Number(v)) : int64Varint(BigInt(v))));
    }
  }
  return { bytes, segments };
}

export interface UnknownRecord {
  field: number;
  wire: number;
  from: number;
  to: number;
}

export type Decoded = { ok: true; values: Record<string, PValue>; unknown: UnknownRecord[] } | { ok: false; error: string };

/** Read bytes with `reader`: a field number the reader lacks, or one whose wire type differs from the reader's type, is skipped by its length and kept as unknown. */
export function decode(reader: PSchema, bytes: readonly number[]): Decoded {
  const read = readRecords(bytes);
  if (!read.ok) return { ok: false, error: read.error };
  const values: Record<string, PValue> = Object.fromEntries(reader.fields.map((f) => [f.name, defaultOf(f.type)]));
  const unknown: UnknownRecord[] = [];
  for (const rec of read.records) {
    const f = reader.fields.find((x) => x.number === rec.field);
    if (!f || WIRE_OF[f.type] !== rec.wire) {
      unknown.push({ field: rec.field, wire: rec.wire, from: rec.from, to: rec.to });
      continue;
    }
    if (f.type === 'string') {
      try {
        values[f.name] = utf8Strict.decode(Uint8Array.from(bytes.slice(rec.valueFrom, rec.valueTo + 1)));
      } catch {
        return { ok: false, error: `${f.name} is not valid UTF-8` };
      }
    } else {
      const raw = readVarint(bytes, rec.valueFrom)?.value ?? 0n;
      values[f.name] = f.type === 'int32' ? BigInt(asInt32(raw)) : BigInt.asIntN(64, raw);
    }
  }
  return { ok: true, values, unknown };
}

// ── The JSON mapping (by name) ──────────────────────────────────────────

/** proto3's JSON form names a field in lowerCamelCase (from memory: check the language guide). */
export const jsonName = (name: string) => name.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

export function encodeJson(schema: PSchema, msg: PMessage): string {
  const obj: Record<string, string | number> = {};
  for (const f of schema.fields) {
    const v = msg[f.concept];
    if (v === undefined || isDefault(v)) continue;
    obj[jsonName(f.name)] = f.type === 'int32' ? Number(v) : String(v);
  }
  return JSON.stringify(obj);
}

const INT_TEXT = /^-?\d+$/;

function jsonInt(f: PField, raw: unknown): PValue | string {
  const [lo, hi] = f.type === 'int32' ? [BigInt(INT32_MIN), BigInt(INT32_MAX)] : [INT64_MIN, INT64_MAX];
  const text = typeof raw === 'number' ? (Number.isInteger(raw) ? String(raw) : '') : typeof raw === 'string' ? raw : '';
  if (!INT_TEXT.test(text)) return `${f.name} is not an integer`;
  const v = BigInt(text);
  return v < lo || v > hi ? `${text} does not fit in ${f.type}` : v;
}

/** Read the JSON text with `reader`, matching by name. `strict` refuses a name the reader does not have (from memory: many parsers do by default). */
export function decodeJson(reader: PSchema, text: string, strict: boolean): Decoded & { ignored?: string[] } {
  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    return { ok: false, error: 'not valid JSON' };
  }
  const values: Record<string, PValue> = Object.fromEntries(reader.fields.map((f) => [f.name, defaultOf(f.type)]));
  const ignored: string[] = [];
  for (const [key, raw] of Object.entries(obj as Record<string, unknown>)) {
    const f = reader.fields.find((x) => jsonName(x.name) === key);
    if (!f) {
      if (strict) return { ok: false, error: `unknown field "${key}"` };
      ignored.push(key);
      continue;
    }
    if (f.type === 'string') {
      if (typeof raw !== 'string') return { ok: false, error: `${f.name} is not a string` };
      values[f.name] = raw;
    } else {
      const v = jsonInt(f, raw);
      if (typeof v === 'string') return { ok: false, error: v };
      values[f.name] = v;
    }
  }
  return { ok: true, values, unknown: [], ignored };
}

// ── The changes ─────────────────────────────────────────────────────────

export type ChangeId = 'add' | 'remove' | 'rename' | 'widen' | 'to-string' | 'renumber' | 'reuse-same' | 'reuse-diff';

export interface ChangeParams {
  /** The field number for `add` and `renumber`. */
  number: number;
  /** Whether the removed number is listed as `reserved`. */
  reserved: boolean;
}

export const DEFAULT_PARAMS: ChangeParams = { number: 4, reserved: false };

export interface Evolved {
  /** The schema after the change, or null when protoc would refuse to compile it. */
  schema: PSchema | null;
  /** What a writer on the new schema means to say. */
  message: PMessage;
  refusal?: string;
}

export const CHANGES: { id: ChangeId; label: string; usesNumber: boolean; usesReserved: boolean }[] = [
  { id: 'add', label: 'Add a field', usesNumber: true, usesReserved: false },
  { id: 'remove', label: 'Remove qty', usesNumber: false, usesReserved: true },
  { id: 'rename', label: 'Rename name', usesNumber: false, usesReserved: false },
  { id: 'widen', label: 'qty: int32 to int64', usesNumber: false, usesReserved: false },
  { id: 'to-string', label: 'qty: int32 to string', usesNumber: false, usesReserved: false },
  { id: 'renumber', label: 'Change qty number', usesNumber: true, usesReserved: false },
  { id: 'reuse-same', label: 'Reuse 3 (same type)', usesNumber: false, usesReserved: true },
  { id: 'reuse-diff', label: 'Reuse 3 (other type)', usesNumber: false, usesReserved: true },
];

const without = (s: PSchema, concept: string): PField[] => s.fields.filter((f) => f.concept !== concept);
const retype = (s: PSchema, concept: string, patch: Partial<PField>): PField[] => s.fields.map((f) => (f.concept === concept ? { ...f, ...patch } : f));
const WITHOUT_QTY: PMessage = Object.fromEntries(Object.entries(V1_MESSAGE).filter(([concept]) => concept !== 'qty'));

/** v2: the learner's change applied to v1. */
export function evolve(change: ChangeId, p: ChangeParams): Evolved {
  const reserved = p.reserved ? [3] : [];
  switch (change) {
    case 'add':
      return {
        schema: { fields: [...V1.fields, { concept: 'nick', name: 'nick', number: p.number, type: 'string' }], reserved: [] },
        message: { ...V1_MESSAGE, nick: 'ada' },
      };
    case 'remove':
      return { schema: { fields: without(V1, 'qty'), reserved }, message: WITHOUT_QTY };
    case 'rename':
      return { schema: { fields: retype(V1, 'name', { name: 'title' }), reserved: [] }, message: V1_MESSAGE };
    case 'widen':
      return { schema: { fields: retype(V1, 'qty', { type: 'int64' }), reserved: [] }, message: { ...V1_MESSAGE, qty: BIG_QTY } };
    case 'to-string':
      return { schema: { fields: retype(V1, 'qty', { type: 'string' }), reserved: [] }, message: { ...V1_MESSAGE, qty: '300' } };
    case 'renumber':
      return { schema: { fields: retype(V1, 'qty', { number: p.number }), reserved: [] }, message: V1_MESSAGE };
    case 'reuse-same':
    case 'reuse-diff': {
      const same = change === 'reuse-same';
      const added: PField = same
        ? { concept: 'discount', name: 'discount', number: 3, type: 'int32' }
        : { concept: 'label', name: 'label', number: 3, type: 'string' };
      if (p.reserved) {
        return { schema: null, message: {}, refusal: `protoc refuses this: ${added.name} = 3 uses a number the schema lists as reserved (from memory: check the language guide)` };
      }
      return { schema: { fields: [...without(V1, 'qty'), added], reserved: [] }, message: { ...WITHOUT_QTY, [added.concept]: same ? 7n : 'gold' } };
    }
  }
}

/** The field-number box: a whole number in 1 to 2^29 - 1 that the implementation does not keep and no other field uses. */
export function parseFieldNumber(text: string, taken: readonly PField[]): FieldParse<number> {
  const parsed = parseBoundedInt(text, {
    min: 1,
    max: MAX_FIELD_NUMBER,
    messages: {
      empty: 'Type a field number.',
      invalid: () => 'A field number is a whole number.',
      tooSmall: () => 'Field numbers start at 1; 0 is not allowed.',
      tooBig: () => `The largest field number is ${MAX_FIELD_NUMBER.toLocaleString('en-US')}.`,
    },
  });
  if (!parsed.ok) return parsed;
  if (parsed.value >= IMPLEMENTATION_RESERVED.from && parsed.value <= IMPLEMENTATION_RESERVED.to) {
    return { ok: false, error: `${IMPLEMENTATION_RESERVED.from} to ${IMPLEMENTATION_RESERVED.to} is kept for the protobuf implementation (from memory).` };
  }
  const clash = taken.find((f) => f.number === parsed.value);
  return clash ? { ok: false, error: `${parsed.value} is already used by ${clash.name}.` } : parsed;
}

// ── Reading across versions ─────────────────────────────────────────────

export type Format = 'binary' | 'json';
export type Verdict = 'ok' | 'lossy' | 'error';
export type FindingKind = 'ok' | 'lossy' | 'error' | 'unknown';

export interface Finding {
  kind: FindingKind;
  text: string;
}

export interface Reading {
  verdict: Verdict;
  findings: Finding[];
  /** The decoded object as the reader sees it, or the error. */
  shown: string;
  /** The writer's bytes (binary) with the records the reader treated as unknown. */
  bytes: number[];
  segments: Segment[];
  unknown: UnknownRecord[];
  /** The JSON text on the wire (json). */
  json: string;
}

export const show = (v: PValue) => (typeof v === 'string' ? JSON.stringify(v) : v.toString());
const showObject = (values: Record<string, PValue>) => `{ ${Object.entries(values).map(([k, v]) => `${k}: ${show(v)}`).join(', ')} }`;

/** What the reader should hold for each of its own fields: the writer's value for that concept, else the default. */
function expectedFor(reader: PField, msg: PMessage): PValue {
  const v = msg[reader.concept];
  return v === undefined ? defaultOf(reader.type) : v;
}

/** Judge a decode against the writer's intent, field by field. */
function judge(writer: PSchema, msg: PMessage, reader: PSchema, values: Record<string, PValue>, how: (w: PField) => string): Finding[] {
  const findings: Finding[] = [];
  for (const rf of reader.fields) {
    const got = values[rf.name];
    const want = expectedFor(rf, msg);
    const sent = writer.fields.find((w) => w.concept === rf.concept && msg[w.concept] !== undefined && !isDefault(msg[w.concept]));
    if (String(got) === String(want)) {
      findings.push({ kind: 'ok', text: sent ? `${rf.name} reads ${show(got)}.` : `${rf.name} is not in the message, so it reads its default ${show(got)}.` });
    } else if (!sent) {
      const owner = writer.fields.find((w) => w.number === rf.number);
      findings.push({
        kind: 'lossy',
        text: `${rf.name} reads ${show(got)}, but the writer never sent a ${rf.name}${owner ? `: the writer's field ${rf.number} is ${owner.name}` : ''}. Nothing failed.`,
      });
    } else if (isDefault(got)) {
      findings.push({ kind: 'lossy', text: `${rf.name} reads ${show(got)}, but the writer sent ${show(want)} ${how(sent)}; the reader could not place it. Nothing failed.` });
    } else {
      findings.push({ kind: 'lossy', text: `${rf.name} reads ${show(got)}, not ${show(want)}: the value does not fit in ${rf.type}. Nothing failed.` });
    }
  }
  return findings;
}

/** Write with `writer`, read with `reader`, and say what happened. */
export function readAcross(writer: PSchema, msg: PMessage, reader: PSchema, format: Format, strictJson: boolean): Reading {
  const enc = encode(writer, msg);
  const json = encodeJson(writer, msg);
  const base = { bytes: enc.bytes, segments: enc.segments, json };
  if (format === 'binary') {
    const d = decode(reader, enc.bytes);
    if (!d.ok) return { ...base, verdict: 'error', findings: [{ kind: 'error', text: d.error }], shown: `error: ${d.error}`, unknown: [] };
    const findings = judge(writer, msg, reader, d.values, (w) => `as field ${w.number}`);
    for (const u of d.unknown) {
      const w = writer.fields.find((x) => x.number === u.field);
      const own = reader.fields.find((x) => x.number === u.field);
      const why = own ? `is ${own.name} (${own.type}) to the reader, but the wire type differs` : "is not in the reader's schema";
      findings.push({ kind: 'unknown', text: `Field ${u.field}${w ? ` (${w.name})` : ''} ${why}: skipped by its length (${u.to - u.from + 1} bytes) and kept as unknown.` });
    }
    const verdict: Verdict = findings.some((f) => f.kind === 'lossy') ? 'lossy' : 'ok';
    return { ...base, verdict, findings, shown: showObject(d.values), unknown: d.unknown };
  }
  const d = decodeJson(reader, json, strictJson);
  if (!d.ok) return { ...base, verdict: 'error', findings: [{ kind: 'error', text: d.error }], shown: `error: ${d.error}`, unknown: [] };
  const findings = judge(writer, msg, reader, d.values, (w) => `under the name ${jsonName(w.name)}`);
  for (const name of d.ignored ?? []) findings.push({ kind: 'unknown', text: `The name "${name}" is not one the reader knows: ignored.` });
  const verdict: Verdict = findings.some((f) => f.kind === 'lossy') ? 'lossy' : 'ok';
  return { ...base, verdict, findings, shown: showObject(d.values), unknown: [] };
}

export interface Crossing {
  /** The old writer's message read by the new reader. */
  oldToNew: Reading;
  /** The new writer's message read by the old reader. */
  newToOld: Reading;
}

/** Both directions of a change. Null when the change cannot be compiled. */
export function crossBoth(change: ChangeId, p: ChangeParams, format: Format, strictJson: boolean): { evolved: Evolved; crossing: Crossing | null } {
  const evolved = evolve(change, p);
  if (!evolved.schema) return { evolved, crossing: null };
  return {
    evolved,
    crossing: {
      oldToNew: readAcross(V1, V1_MESSAGE, evolved.schema, format, strictJson),
      newToOld: readAcross(evolved.schema, evolved.message, V1, format, strictJson),
    },
  };
}
