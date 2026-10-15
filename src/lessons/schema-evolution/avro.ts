/**
 * Scenes 2 and 3 of schema-evolution: Apache Avro's binary encoding and schema resolution for a flat
 * record, written for this lesson from the Avro specification's own rules, plus a registry-style
 * compatibility check on top (the mode names are Confluent Schema Registry's, from memory).
 *
 * Avro data carries no schema: the reader is handed the writer's schema and resolves its own against
 * it. Fields match by name; a reader field the writer lacks needs a default; a writer field the reader
 * lacks is skipped; int, long, float and double may be promoted in that order.
 *
 * Not modelled: nested types, unions, arrays, maps, enums, aliases, bytes, and non-zero defaults (a
 * default here is the type's zero value: 0, "" or false).
 */

import { encodeVarint, readVarint } from '../../core/protobuf';

export type AType = 'int' | 'long' | 'float' | 'double' | 'string' | 'boolean';
export const ATYPES: readonly AType[] = ['int', 'long', 'float', 'double', 'string', 'boolean'];
export type AValue = bigint | number | string | boolean;

export interface AField {
  name: string;
  type: AType;
  hasDefault: boolean;
}
export type ASchema = AField[];
export type ARecord = Record<string, AValue>;

export const MAX_FIELDS = 8;
export const NAME_PATTERN = /^[a-z][a-z0-9_]{0,19}$/;

const INT32_MIN = -(2n ** 31n);
const INT32_MAX = 2n ** 31n - 1n;
const utf8 = new TextEncoder();
const utf8Strict = new TextDecoder('utf-8', { fatal: true });

export const defaultValue = (t: AType): AValue => (t === 'string' ? '' : t === 'boolean' ? false : t === 'int' || t === 'long' ? 0n : 0);

/** One sample value per type, chosen so a long needs more than 32 bits and a float is exact. */
export const sampleValue = (t: AType): AValue =>
  t === 'int' ? 7n : t === 'long' ? 3_000_000_000n : t === 'float' ? 1.5 : t === 'double' ? 2.25 : t === 'string' ? 'foo' : true;

export const sampleRecord = (schema: ASchema): ARecord => Object.fromEntries(schema.map((f) => [f.name, sampleValue(f.type)]));

// ── Binary encoding ─────────────────────────────────────────────────────

const zigzag64 = (n: bigint): bigint => BigInt.asUintN(64, (n << 1n) ^ (n >> 63n));
const unzigzag64 = (u: bigint): bigint => (u >> 1n) ^ -(u & 1n);

export interface AvroSegment {
  from: number;
  to: number;
  field: string;
}

export function encodeRecord(schema: ASchema, rec: ARecord): { bytes: number[]; segments: AvroSegment[] } {
  const bytes: number[] = [];
  const segments: AvroSegment[] = [];
  for (const f of schema) {
    const v = rec[f.name];
    const from = bytes.length;
    switch (f.type) {
      case 'int':
      case 'long':
        bytes.push(...encodeVarint(zigzag64(BigInt(v as bigint))));
        break;
      case 'string': {
        const data = [...utf8.encode(String(v))];
        bytes.push(...encodeVarint(zigzag64(BigInt(data.length))), ...data);
        break;
      }
      case 'boolean':
        bytes.push(v ? 1 : 0);
        break;
      case 'float': {
        const b = new DataView(new ArrayBuffer(4));
        b.setFloat32(0, Number(v), true);
        bytes.push(...new Uint8Array(b.buffer));
        break;
      }
      case 'double': {
        const b = new DataView(new ArrayBuffer(8));
        b.setFloat64(0, Number(v), true);
        bytes.push(...new Uint8Array(b.buffer));
        break;
      }
    }
    segments.push({ from, to: bytes.length - 1, field: f.name });
  }
  return { bytes, segments };
}

export type Decoded<T> = { ok: true; value: T } | { ok: false; error: string };

/** Read the record exactly as its writer's schema describes it. */
export function decodeWithWriter(writer: ASchema, bytes: readonly number[]): Decoded<ARecord> {
  const rec: ARecord = {};
  let at = 0;
  const long = (): bigint | null => {
    const v = readVarint(bytes, at);
    if (!v) return null;
    at = v.next;
    return unzigzag64(v.value);
  };
  for (const f of writer) {
    const where = `field ${f.name}`;
    switch (f.type) {
      case 'int':
      case 'long': {
        const v = long();
        if (v === null) return { ok: false, error: `${where}: the bytes ran out inside a number` };
        if (f.type === 'int' && (v < INT32_MIN || v > INT32_MAX)) return { ok: false, error: `${where}: ${v} does not fit in an int` };
        rec[f.name] = v;
        break;
      }
      case 'string': {
        const n = long();
        if (n === null || n < 0n || at + Number(n) > bytes.length) return { ok: false, error: `${where}: the string's length runs past the end` };
        try {
          rec[f.name] = utf8Strict.decode(Uint8Array.from(bytes.slice(at, at + Number(n))));
        } catch {
          return { ok: false, error: `${where}: not valid UTF-8` };
        }
        at += Number(n);
        break;
      }
      case 'boolean': {
        const b = bytes[at++];
        if (b !== 0 && b !== 1) return { ok: false, error: `${where}: a boolean is the byte 0 or 1` };
        rec[f.name] = b === 1;
        break;
      }
      case 'float':
      case 'double': {
        const n = f.type === 'float' ? 4 : 8;
        if (at + n > bytes.length) return { ok: false, error: `${where}: the bytes ran out inside a ${f.type}` };
        const view = new DataView(Uint8Array.from(bytes.slice(at, at + n)).buffer);
        rec[f.name] = f.type === 'float' ? view.getFloat32(0, true) : view.getFloat64(0, true);
        at += n;
        break;
      }
    }
  }
  return at === bytes.length ? { ok: true, value: rec } : { ok: false, error: `${bytes.length - at} bytes are left over after the last field` };
}

// ── Schema resolution ───────────────────────────────────────────────────

/** The promotions the specification allows: int to long, float or double; long to float or double; float to double. */
export const PROMOTES_TO: Record<AType, readonly AType[]> = {
  int: ['long', 'float', 'double'],
  long: ['float', 'double'],
  float: ['double'],
  double: [],
  string: [],
  boolean: [],
};
export const promotable = (from: AType, to: AType) => PROMOTES_TO[from].includes(to);

const promote = (v: AValue, to: AType): AValue => {
  if (to === 'long') return v;
  if (to === 'float') return Math.fround(Number(v));
  if (to === 'double') return Number(v);
  return v;
};

/** Resolve a writer's record into the reader's schema: promotions, skips and defaults. */
export function resolve(reader: ASchema, writer: ASchema, rec: ARecord): Decoded<ARecord> {
  const out: ARecord = {};
  for (const rf of reader) {
    const wf = writer.find((f) => f.name === rf.name);
    if (!wf) {
      if (!rf.hasDefault) return { ok: false, error: `reader field ${rf.name} has no default and the writer did not write it` };
      out[rf.name] = defaultValue(rf.type);
    } else if (wf.type === rf.type) {
      out[rf.name] = rec[wf.name];
    } else if (promotable(wf.type, rf.type)) {
      out[rf.name] = promote(rec[wf.name], rf.type);
    } else {
      return { ok: false, error: `reader field ${rf.name} is ${rf.type} but the writer wrote ${wf.type}, which cannot be promoted to it` };
    }
  }
  return { ok: true, value: out };
}

/** Encode with the writer's schema, then read with the reader's: the real round trip. */
export function roundTrip(reader: ASchema, writer: ASchema, rec: ARecord = sampleRecord(writer)): Decoded<ARecord> {
  const wrote = decodeWithWriter(writer, encodeRecord(writer, rec).bytes);
  return wrote.ok ? resolve(reader, writer, wrote.value) : wrote;
}

/**
 * The rules, read straight from the specification's resolution table, with no bytes: the problems that
 * keep `reader` from reading data written with `writer` (an empty list means it can).
 */
export function ruleProblems(reader: ASchema, writer: ASchema): string[] {
  const problems: string[] = [];
  for (const rf of reader) {
    const wf = writer.find((f) => f.name === rf.name);
    if (!wf && !rf.hasDefault) problems.push(`${rf.name} has no default and the writer lacks it`);
    if (wf && wf.type !== rf.type && !promotable(wf.type, rf.type)) problems.push(`${rf.name}: ${wf.type} cannot become ${rf.type}`);
  }
  return problems;
}

// ── The registry's compatibility modes (Confluent's names, from memory) ──

export type Mode = 'NONE' | 'BACKWARD' | 'FORWARD' | 'FULL' | 'BACKWARD_TRANSITIVE' | 'FORWARD_TRANSITIVE' | 'FULL_TRANSITIVE';
export const MODES: readonly Mode[] = ['NONE', 'BACKWARD', 'FORWARD', 'FULL', 'BACKWARD_TRANSITIVE', 'FORWARD_TRANSITIVE', 'FULL_TRANSITIVE'];

export interface Pair {
  /** Index of the schema that reads. */
  reader: number;
  /** Index of the schema that wrote. */
  writer: number;
}

/** The pairs a registry checks when version `n` (0-based, n >= 1) is registered under `mode`. */
export function pairsToCheck(mode: Mode, n: number): Pair[] {
  if (mode === 'NONE' || n < 1) return [];
  const against = mode.endsWith('TRANSITIVE') ? Array.from({ length: n }, (_, i) => i) : [n - 1];
  const backward = mode.startsWith('BACKWARD') || mode.startsWith('FULL');
  const forward = mode.startsWith('FORWARD') || mode.startsWith('FULL');
  return against.flatMap((old) => [...(backward ? [{ reader: n, writer: old }] : []), ...(forward ? [{ reader: old, writer: n }] : [])]);
}

export interface PairCheck extends Pair {
  /** What the rules say (empty: compatible). */
  problems: string[];
  /** What really happened when sample bytes were written and read. */
  real: Decoded<ARecord>;
  /** The rules and the round trip reached the same verdict. */
  agree: boolean;
}

export const checkPair = (versions: readonly ASchema[], p: Pair): PairCheck => {
  const problems = ruleProblems(versions[p.reader], versions[p.writer]);
  const real = roundTrip(versions[p.reader], versions[p.writer]);
  return { ...p, problems, real, agree: (problems.length === 0) === real.ok };
};

export interface Registration {
  version: number;
  checks: PairCheck[];
  accepted: boolean;
}

export const register = (mode: Mode, versions: readonly ASchema[], n: number): Registration => {
  const checks = pairsToCheck(mode, n).map((p) => checkPair(versions, p));
  return { version: n, checks, accepted: checks.every((c) => c.problems.length === 0) };
};

// ── The learner's version history ───────────────────────────────────────

export const LESSON_HISTORY: ASchema[] = [
  [{ name: 'a', type: 'int', hasDefault: false }],
  [{ name: 'a', type: 'int', hasDefault: false }, { name: 'b', type: 'int', hasDefault: true }],
  [{ name: 'a', type: 'int', hasDefault: false }, { name: 'b', type: 'int', hasDefault: false }],
];
export const PROMOTION_HISTORY: ASchema[] = [
  [{ name: 'a', type: 'int', hasDefault: false }],
  [{ name: 'a', type: 'long', hasDefault: false }],
  [{ name: 'a', type: 'double', hasDefault: false }],
];
export const NARROWING_HISTORY: ASchema[] = [
  [{ name: 'a', type: 'long', hasDefault: false }],
  [{ name: 'a', type: 'int', hasDefault: false }],
  [{ name: 'a', type: 'int', hasDefault: false }],
];

/** Why a typed field name is refused, or null if it can be added to `schema`. */
export function nameProblem(name: string, schema: ASchema): string | null {
  if (!NAME_PATTERN.test(name)) return 'A name is a lowercase letter then up to 19 lowercase letters, digits or underscores.';
  if (schema.some((f) => f.name === name)) return `${name} is already a field here.`;
  return schema.length >= MAX_FIELDS ? `At most ${MAX_FIELDS} fields.` : null;
}

/** A default as it is written in the schema JSON. */
const defaultText = (t: AType) => (t === 'string' ? '""' : t === 'boolean' ? 'false' : '0');

/** The Avro schema as JSON text, one field per line. */
export const avroLines = (schema: ASchema): string[] => [
  '{ "type": "record", "name": "Event", "fields": [',
  ...schema.map((f, i) => `  { "name": "${f.name}", "type": "${f.type}"${f.hasDefault ? `, "default": ${defaultText(f.type)}` : ''} }${i < schema.length - 1 ? ',' : ''}`),
  '] }',
];
