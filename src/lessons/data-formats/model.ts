// One record set, four formats. JSON is the source of truth and uses the real
// JSON.parse / JSON.stringify; CSV has an RFC 4180 parser and writer; YAML and XML come from
// small subset emitters written for this lesson (no parser or library is shipped).

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** One printed line of a pane, tagged with the JSON leaf paths it shows (e.g. "0.address.city"). */
export interface Line {
  text: string;
  paths: string[];
}

export const SAMPLE: Json = [
  { id: 101, name: 'Ada Lovelace', age: 36, tags: ['admin', 'math'], address: { city: 'London', country: 'GB' }, joined: '2026-03-08', price: 12.5 },
  { id: 102, name: 'Grace Hopper', age: 45, tags: ['navy'], address: { city: 'New York', country: 'US' }, joined: '2026-01-15', price: 9 },
  { id: 103, name: 'Smith, Jane', age: 29, tags: [], address: { city: 'Oslo', country: 'NO' }, joined: '2025-11-30', price: 20 },
];

export const SAMPLE_TEXT = JSON.stringify(SAMPLE, null, 2);

const isObject = (v: Json): v is { [key: string]: Json } => typeof v === 'object' && v !== null && !Array.isArray(v);
const join = (base: string, key: string | number) => (base === '' ? String(key) : `${base}.${key}`);

// ─── JSON (the real thing) ──────────────────────────────────────────────────

export type ParseResult = { ok: true; value: Json } | { ok: false; error: string; line: number | null };

/** JSON.parse, with the error's line worked out from the engine's position when it gives one. */
export function parseJson(text: string): ParseResult {
  try {
    return { ok: true, value: JSON.parse(text) as Json };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    const lineCol = /line (\d+) column/.exec(error);
    const pos = /position (\d+)/.exec(error);
    const line = lineCol ? Number(lineCol[1]) - 1 : pos ? text.slice(0, Number(pos[1])).split('\n').length - 1 : null;
    return { ok: false, error, line };
  }
}

/** Every leaf value by path: the thing two versions are compared on. */
export function leaves(value: Json, base = ''): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (v: Json, path: string) => {
    if (Array.isArray(v)) {
      if (v.length === 0) out.set(path, '[]');
      v.forEach((x, i) => walk(x, join(path, i)));
    } else if (isObject(v)) {
      const keys = Object.keys(v);
      if (keys.length === 0) out.set(path, '{}');
      keys.forEach((k) => walk(v[k], join(path, k)));
    } else {
      out.set(path, JSON.stringify(v));
    }
  };
  walk(value, base);
  return out;
}

/** Leaf paths whose value changed, appeared or disappeared between two versions. */
export function changedPaths(prev: Json | null, next: Json): Set<string> {
  if (prev === null) return new Set();
  const a = leaves(prev);
  const b = leaves(next);
  const changed = new Set<string>();
  for (const [p, v] of b) if (a.get(p) !== v) changed.add(p);
  for (const p of a.keys()) if (!b.has(p)) changed.add(p);
  return changed;
}

/**
 * Numbers JSON can hold but JavaScript can't: integers past 2^53 lose digits in JSON.parse, and
 * anything past ~1.8e308 (1e400) becomes Infinity, which no format here can write back as a number.
 */
export function unsafeNumberPaths(value: Json): Set<string> {
  const out = new Set<string>();
  const walk = (v: Json, path: string) => {
    if (Array.isArray(v)) v.forEach((x, i) => walk(x, join(path, i)));
    else if (v !== null && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, join(path, k));
    else if (typeof v === 'number' && (!Number.isFinite(v) || (Number.isInteger(v) && !Number.isSafeInteger(v)))) out.add(path);
  };
  walk(value, '');
  return out;
}

// ─── CSV (RFC 4180) ─────────────────────────────────────────────────────────

const needsQuotes = (field: string) => /[",\r\n]/.test(field);

/** RFC 4180 field: quoted when it holds a comma, quote or line break; quotes are doubled. */
export const csvField = (field: string) => (needsQuotes(field) ? `"${field.replaceAll('"', '""')}"` : field);

/** Rows to CSV text, CRLF line endings as RFC 4180 specifies. */
export function writeCsv(rows: readonly (readonly string[])[]): string {
  return rows.map((r) => r.map(csvField).join(',')).join('\r\n');
}

/**
 * RFC 4180 parser: commas, doubled quotes and line breaks (CRLF or LF) inside quoted
 * fields; a trailing line break doesn't make an empty row.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let i = 0;
  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };
  while (i < text.length) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i += 2;
      } else if (c === '"') {
        quoted = false;
        i += 1;
      } else {
        field += c;
        i += 1;
      }
    } else if (c === '"' && field === '') {
      quoted = true;
      i += 1;
    } else if (c === ',') {
      endField();
      i += 1;
    } else if (c === '\r' && text[i + 1] === '\n') {
      endRow();
      i += 2;
    } else if (c === '\n') {
      endRow();
      i += 1;
    } else {
      field += c;
      i += 1;
    }
  }
  if (field !== '' || row.length > 0) endRow();
  return rows;
}

/** A value as one CSV cell. Lists join with ";", which is where CSV stops being lossless. */
const cellText = (v: Json | undefined): string =>
  v === undefined || v === null ? '' : Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(';') : typeof v === 'object' ? JSON.stringify(v) : String(v);

export interface CsvTable {
  header: string[];
  /** Columns that lost structure: nested objects flattened to dotted names, lists joined with ";". */
  lossy: { column: string; why: 'nested' | 'list' }[];
  lines: Line[];
  text: string;
}

/**
 * Records as a CSV table. CSV has rows of text and nothing else, so nested objects become
 * dotted columns (address.city) and lists become one ";"-joined cell. Returns null for a
 * shape CSV can't hold at all (anything that isn't a list of records).
 */
export function toCsv(value: Json): CsvTable | null {
  if (!Array.isArray(value) || value.length === 0 || !value.every(isObject)) return null;
  const records = value as { [key: string]: Json }[];
  const columns: string[] = [];
  const lossy: CsvTable['lossy'] = [];
  const seen = new Set<string>();
  const addColumn = (c: string, why?: 'nested' | 'list') => {
    if (seen.has(c)) return;
    seen.add(c);
    columns.push(c);
    if (why) lossy.push({ column: c, why });
  };
  for (const r of records) {
    for (const [k, v] of Object.entries(r)) {
      if (isObject(v)) Object.keys(v).forEach((sub) => addColumn(`${k}.${sub}`, 'nested'));
      else addColumn(k, Array.isArray(v) ? 'list' : undefined);
    }
  }
  const valueAt = (r: { [key: string]: Json }, column: string): Json | undefined => {
    const [head, sub] = column.split('.');
    const v = r[head];
    return sub !== undefined && isObject(v) ? v[sub] : sub === undefined ? v : undefined;
  };
  const rows = [columns, ...records.map((r) => columns.map((c) => cellText(valueAt(r, c))))];
  const lines: Line[] = rows.map((row, i) => ({
    text: row.map(csvField).join(','),
    paths: i === 0 ? [] : columns.map((c) => `${i - 1}.${c}`),
  }));
  return { header: columns, lossy, lines, text: writeCsv(rows) };
}

// ─── YAML 1.1 scalars (the pitfalls) ────────────────────────────────────────

export type YamlType = 'bool' | 'null' | 'int' | 'float' | 'timestamp' | 'str';

// The implicit types of YAML 1.1, from the type repository at yaml.org/type/:
// bool (yaml.org/type/bool.html), null (null.html), int (int.html, decimal/octal/hex),
// float (float.html) and timestamp (timestamp.html). YAML 1.1 parsers such as PyYAML
// resolve an unquoted scalar matching one of these to that type; YAML 1.2 narrowed bool to
// true/false, which is why "NO" is only a boolean in 1.1.
const YAML11: [YamlType, RegExp][] = [
  ['bool', /^(?:y|Y|yes|Yes|YES|n|N|no|No|NO|true|True|TRUE|false|False|FALSE|on|On|ON|off|Off|OFF)$/],
  ['null', /^(?:~|null|Null|NULL|)$/],
  ['int', /^[-+]?(?:0|[1-9][0-9_]*|0[0-7_]+|0x[0-9a-fA-F_]+|0b[0-1_]+)$/],
  ['float', /^(?:[-+]?(?:[0-9][0-9_]*)?\.[0-9.]*(?:[eE][-+][0-9]+)?|[-+]?\.(?:inf|Inf|INF)|\.(?:nan|NaN|NAN))$/],
  ['timestamp', /^[0-9]{4}-[0-9]{1,2}-[0-9]{1,2}(?:(?:[Tt]|[ \t]+)[0-9]{1,2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]*)?(?:[ \t]*(?:Z|[-+][0-9]{1,2}(?::[0-9]{2})?))?)?$/],
];

const YAML11_TRUE = /^(?:y|Y|yes|Yes|YES|true|True|TRUE|on|On|ON)$/;

/** What a YAML 1.1 parser makes of an unquoted scalar, and the value it reads. */
export function resolveYaml11(scalar: string): { type: YamlType; value: string | number | boolean | null } {
  for (const [type, re] of YAML11) {
    if (!re.test(scalar)) continue;
    if (type === 'bool') return { type, value: YAML11_TRUE.test(scalar) };
    if (type === 'null') return { type, value: null };
    if (type === 'int') {
      const s = scalar.replaceAll('_', '');
      const sign = s.startsWith('-') ? -1 : 1;
      const body = s.replace(/^[-+]/, '');
      const n = body.startsWith('0x') ? parseInt(body.slice(2), 16) : body.startsWith('0b') ? parseInt(body.slice(2), 2) : body.length > 1 && body.startsWith('0') ? parseInt(body, 8) : Number(body);
      return { type, value: sign * n };
    }
    if (type === 'float') return { type, value: Number(scalar.replaceAll('_', '')) };
    return { type, value: scalar };
  }
  return { type: 'str', value: scalar };
}

/** Strings a YAML reader could misread (a type pattern, or YAML syntax characters) get quotes. */
function yamlString(s: string): string {
  // No leading "-" / "?" (list and key markers), no ": " or " #" (mapping and comment syntax).
  const plainSafe = /^[A-Za-z0-9_./@][\w ./@+,()'-]*$/.test(s) && !/:\s|\s#|\s$/.test(s) && resolveYaml11(s).type === 'str';
  return plainSafe ? s : JSON.stringify(s);
}

const yamlScalar = (v: Exclude<Json, Json[] | { [key: string]: Json }>) =>
  v === null ? 'null' : typeof v === 'string' ? yamlString(v) : String(v);

/** Block-style YAML for the lesson's shapes: nested mappings, lists, scalars. */
export function toYaml(value: Json): Line[] {
  const lines: Line[] = [];
  // `lead` starts the first line ("- " or "key: "). A container after a lead goes on the
  // following lines, one level deeper; at the top level (no lead) it starts at `indent`.
  const emit = (v: Json, indent: string, path: string, lead: string) => {
    const inner = lead ? `${indent}  ` : indent;
    if (Array.isArray(v)) {
      if (v.length === 0) return lines.push({ text: `${lead}[]`, paths: [path] });
      if (lead) lines.push({ text: lead.trimEnd(), paths: [] });
      v.forEach((x, i) => emitItem(x, inner, join(path, i)));
      return;
    }
    if (isObject(v)) {
      const keys = Object.keys(v);
      if (keys.length === 0) return lines.push({ text: `${lead}{}`, paths: [path] });
      if (lead) lines.push({ text: lead.trimEnd(), paths: [] });
      keys.forEach((k) => emitEntry(k, v[k], inner, join(path, k)));
      return;
    }
    lines.push({ text: `${lead}${yamlScalar(v)}`, paths: [path] });
  };
  const emitEntry = (key: string, v: Json, indent: string, path: string) => {
    const k = yamlString(key);
    if (Array.isArray(v) && v.length) {
      lines.push({ text: `${indent}${k}:`, paths: [] });
      v.forEach((x, i) => emitItem(x, `${indent}  `, join(path, i)));
    } else if (isObject(v) && Object.keys(v).length) {
      lines.push({ text: `${indent}${k}:`, paths: [] });
      Object.keys(v).forEach((sub) => emitEntry(sub, v[sub], `${indent}  `, join(path, sub)));
    } else {
      emit(v, indent, path, `${indent}${k}: `);
    }
  };
  const emitItem = (v: Json, indent: string, path: string) => {
    if (isObject(v) && Object.keys(v).length) {
      // "- " then the first key on the same line, the rest indented under it
      const keys = Object.keys(v);
      const first = lines.length;
      emitEntry(keys[0], v[keys[0]], `${indent}  `, join(path, keys[0]));
      lines[first] = { ...lines[first], text: `${indent}- ${lines[first].text.slice(indent.length + 2)}` };
      keys.slice(1).forEach((k) => emitEntry(k, v[k], `${indent}  `, join(path, k)));
    } else {
      emit(v, indent, path, `${indent}- `);
    }
  };
  emit(value, '', '', '');
  return lines;
}

// ─── XML ────────────────────────────────────────────────────────────────────

export const xmlEscape = (s: string) =>
  s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');

const XML_NAME = /^[A-Za-z_][\w.-]*$/;
const singular = (k: string) => (k.endsWith('s') && k.length > 1 ? k.slice(0, -1) : 'item');

/**
 * XML for the lesson's shapes. Elements by default; with `attributes`, a record's scalar
 * fields become attributes on its element instead (the "attributes vs elements" choice).
 */
export function toXml(value: Json, { root = 'users', attributes = false } = {}): Line[] {
  const lines: Line[] = [{ text: '<?xml version="1.0" encoding="UTF-8"?>', paths: [] }];
  const element = (name: string, v: Json, indent: string, path: string) => {
    const tag = XML_NAME.test(name) ? name : 'field';
    if (Array.isArray(v)) {
      if (v.length === 0) return lines.push({ text: `${indent}<${tag}/>`, paths: [path] });
      lines.push({ text: `${indent}<${tag}>`, paths: [] });
      v.forEach((x, i) => element(singular(tag), x, `${indent}  `, join(path, i)));
      return lines.push({ text: `${indent}</${tag}>`, paths: [] });
    }
    if (isObject(v)) {
      const entries = Object.entries(v);
      const attrs = attributes ? entries.filter(([k, x]) => XML_NAME.test(k) && (x === null || typeof x !== 'object')) : [];
      const children = entries.filter((e) => !attrs.includes(e));
      const attrText = attrs.map(([k, x]) => ` ${k}="${xmlEscape(x === null ? '' : String(x))}"`).join('');
      const attrPaths = attrs.map(([k]) => join(path, k));
      if (children.length === 0) return lines.push({ text: `${indent}<${tag}${attrText}/>`, paths: attrPaths });
      lines.push({ text: `${indent}<${tag}${attrText}>`, paths: attrPaths });
      children.forEach(([k, x]) => element(k, x, `${indent}  `, join(path, k)));
      return lines.push({ text: `${indent}</${tag}>`, paths: [] });
    }
    const text = v === null ? '' : xmlEscape(String(v));
    lines.push({ text: `${indent}<${tag}>${text}</${tag}>`, paths: [path] });
  };
  element(root, value, '', '');
  return lines;
}

// ─── Parse, then validate ───────────────────────────────────────────────────

export interface Issue {
  path: string;
  message: string;
}

type FieldType = 'string' | 'number' | 'string[]' | 'date' | { [key: string]: FieldType };

/** What every user record must look like. Parsing only proves the text is JSON; this proves it's a user. */
export const USER_SCHEMA: { [key: string]: FieldType } = {
  id: 'number', name: 'string', age: 'number', tags: 'string[]', address: { city: 'string', country: 'string' }, joined: 'date', price: 'number',
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function validateUsers(value: Json): Issue[] {
  if (!Array.isArray(value)) return [{ path: '', message: 'expected a list of users' }];
  const issues: Issue[] = [];
  const check = (v: Json | undefined, type: FieldType, path: string) => {
    if (v === undefined) return issues.push({ path, message: 'missing' });
    if (typeof type === 'object') {
      if (!isObject(v)) return issues.push({ path, message: 'expected an object' });
      for (const [k, t] of Object.entries(type)) check(v[k], t, join(path, k));
      return;
    }
    const ok =
      type === 'string' ? typeof v === 'string'
        : type === 'number' ? typeof v === 'number'
          : type === 'string[]' ? Array.isArray(v) && v.every((x) => typeof x === 'string')
            : typeof v === 'string' && ISO_DATE.test(v);
    if (!ok) issues.push({ path, message: `expected ${type === 'date' ? 'a YYYY-MM-DD date' : `a ${type}`}, got ${JSON.stringify(v)}` });
  };
  value.forEach((u, i) => check(u, USER_SCHEMA, String(i)));
  return issues;
}

/** UTF-8 bytes, the size that goes over the wire. */
export const byteSize = (s: string) => new TextEncoder().encode(s).length;

// ─── Pitfalls ───────────────────────────────────────────────────────────────

export type Format = 'csv' | 'json' | 'yaml' | 'xml';

export interface Snippet {
  label: string;
  lines: string[];
  /** Lines to mark (bad in "before", fixed in "after"). */
  marked: number[];
}

export interface Pitfall {
  id: string;
  format: Format;
  title: string;
  before: Snippet;
  after: Snippet;
  note: string;
  /** Behaviour described from a cited source rather than computed on this page. */
  cited?: string;
}

const show = (v: unknown) => JSON.stringify(v);

function commaPitfall(): Pitfall {
  const line = '42,"Smith, Jane",jane@example.com';
  const naive = line.split(',');
  const [parsed] = parseCsv(line);
  return {
    id: 'csv-comma', format: 'csv', title: 'A comma inside a field',
    before: { label: 'line.split(",")', lines: [line, `→ ${show(naive)}`, `${naive.length} columns, the name is cut in half`], marked: [1, 2] },
    after: { label: 'RFC 4180 parser', lines: [line, `→ ${show(parsed)}`, `${parsed.length} columns: quotes protect the comma`], marked: [1, 2] },
    note: 'CSV is not "split on commas": a field with a comma, quote or line break must be quoted, and quotes inside are doubled ("").',
  };
}

function newlinePitfall(): Pitfall {
  const text = 'id,address\r\n1,"12 Main St\r\nApt 4"\r\n2,9 Elm Rd';
  const naive = text.split(/\r?\n/);
  const parsed = parseCsv(text);
  return {
    id: 'csv-newline', format: 'csv', title: 'A line break inside a quoted field',
    before: { label: 'text.split("\\n")', lines: [...naive.map((l) => `row: ${l}`), `${naive.length} rows: Apt 4 became its own row`], marked: [2, naive.length] },
    after: { label: 'RFC 4180 parser', lines: [...parsed.map((r) => `row: ${show(r)}`), `${parsed.length} rows, the address kept whole`], marked: [1, parsed.length] },
    note: 'A quoted field can contain line breaks, so you can\'t read CSV line by line. Use a real CSV parser.',
  };
}

function excelPitfall(): Pitfall {
  return {
    id: 'csv-excel', format: 'csv', title: 'Spreadsheets guess types',
    before: { label: 'opened in Excel', lines: ['zip,gene', '00123,SEPT2', '→ zip 123, gene 2-Sep'], marked: [2] },
    after: { label: 'imported as text', lines: ['zip,gene', '00123,SEPT2', '→ zip 00123, gene SEPT2'], marked: [2] },
    note: 'CSV has no types, so the app opening it guesses. Import such columns as text, or use a typed format (JSON, Parquet).',
    cited: 'Excel\'s behaviour, described rather than run here: leading zeros drop, and gene names like SEPT2 turn into dates (Ziemann et al., Genome Biology, 2016; HGNC renamed such genes in 2020).',
  };
}

function trailingCommaPitfall(): Pitfall {
  const bad = '{ "name": "Ada", /* admin */ "id": 1, }';
  const good = '{ "name": "Ada", "id": 1 }';
  const err = parseJson(bad);
  return {
    id: 'json-trailing', format: 'json', title: 'No comments, no trailing commas',
    before: { label: 'JSON.parse', lines: [bad, `→ SyntaxError: ${err.ok ? '' : err.error}`], marked: [1] },
    after: { label: 'JSON.parse', lines: [good, `→ ${show(JSON.parse(good))}`], marked: [1] },
    note: 'JSON is stricter than JavaScript: no comments, no trailing commas, double quotes only. Config formats that allow them (JSON5, YAML) are different formats.',
  };
}

function bigIdPitfall(): Pitfall {
  const bad = '{"id":9007199254740993}';
  const good = '{"id":"9007199254740993"}';
  const parsedBad = (JSON.parse(bad) as { id: number }).id;
  const parsedGood = (JSON.parse(good) as { id: string }).id;
  return {
    id: 'json-bigid', format: 'json', title: 'Big ids silently lose digits',
    before: { label: 'JSON.parse', lines: [bad, `→ id = ${parsedBad}`, 'the last digit changed: …993 became …992'], marked: [1, 2] },
    after: { label: 'ids as strings', lines: [good, `→ id = "${parsedGood}"`, 'exact, because it never became a number'], marked: [1] },
    note: `JSON numbers become 64-bit floats in JavaScript, exact only up to ${Number.MAX_SAFE_INTEGER} (2^53 − 1). Send large ids (database, Twitter/X, Discord) as strings.`,
  };
}

function datePitfall(): Pitfall {
  const joined = new Date(Date.UTC(2026, 2, 8, 9, 15));
  const text = JSON.stringify({ joined });
  const back = (JSON.parse(text) as { joined: unknown }).joined;
  return {
    id: 'json-dates', format: 'json', title: 'Dates are just strings',
    before: { label: 'JSON.stringify({ joined: new Date(…) })', lines: [text, `JSON.parse(…).joined is a ${typeof back}, not a Date`], marked: [1] },
    after: { label: 'agree on a format', lines: ['ISO 8601 with a zone: "2026-03-08T09:15:00.000Z"', 'new Date(parsed.joined) when you need a Date'], marked: [0] },
    note: 'JSON has no date type. Agree on ISO 8601 with a time zone (the "Z" means UTC); see the time-and-timezones lesson.',
  };
}

function undefinedPitfall(): Pitfall {
  const out = JSON.stringify({ name: 'Ada', nickname: undefined });
  const kept = JSON.stringify({ name: 'Ada', nickname: null });
  return {
    id: 'json-undefined', format: 'json', title: 'undefined fields vanish',
    before: { label: 'JSON.stringify({ name, nickname: undefined })', lines: [`→ ${out}`, 'nickname is gone, not empty'], marked: [0, 1] },
    after: { label: 'use null for "no value"', lines: [`→ ${kept}`], marked: [0] },
    note: 'JSON has null but no undefined: stringify drops undefined properties (and turns them into null inside arrays).',
  };
}

function norwayPitfall(): Pitfall {
  const no = resolveYaml11('NO');
  const version = resolveYaml11('1.10');
  return {
    id: 'yaml-norway', format: 'yaml', title: 'The Norway problem',
    before: { label: 'unquoted, read by a YAML 1.1 parser', lines: ['country: NO', `→ ${no.type} ${show(no.value)}`, 'version: 1.10', `→ ${version.type} ${show(version.value)}`], marked: [1, 3] },
    after: { label: 'quoted', lines: ['country: "NO"', '→ string "NO"', 'version: "1.10"', '→ string "1.10"'], marked: [1, 3] },
    note: 'YAML guesses a type for unquoted values: NO, yes and on are booleans, 1.10 is the number 1.1, 2026-03-08 a date. Quote anything that must stay text.',
    cited: 'Per the YAML 1.1 type repository (yaml.org/type/bool.html, float.html), which parsers like PyYAML follow; YAML 1.2 fixed some of these (only true/false are booleans).',
  };
}

function indentPitfall(): Pitfall {
  const nested = toYaml({ address: { city: 'Oslo' } }).map((l) => l.text);
  // What a learner actually types: "address:" with nothing after it, which YAML reads as null.
  const flat = ['address:', 'city: Oslo'];
  return {
    id: 'yaml-indent', format: 'yaml', title: 'Indentation is structure',
    before: { label: 'city not indented', lines: [...flat, `→ address is ${resolveYaml11('').type}, city is a separate top-level key`], marked: [1, 2] },
    after: { label: 'city indented under address', lines: [...nested, '→ city belongs to address'], marked: [1, 2] },
    note: 'In YAML, two spaces change what belongs to what, and tabs aren\'t allowed for indentation. A misplaced indent is a different document, not an error.',
  };
}

function attributesPitfall(): Pitfall {
  const user = [{ id: 101, name: 'Ada', tags: ['admin'] }];
  return {
    id: 'xml-attributes', format: 'xml', title: 'Attributes or elements?',
    before: { label: 'every field an element', lines: toXml(user).slice(1).map((l) => l.text), marked: [] },
    after: { label: 'scalars as attributes', lines: toXml(user, { attributes: true }).slice(1).map((l) => l.text), marked: [1] },
    note: 'Same data, two valid XML shapes: consumers must agree which one. Namespaces (xmlns="…") exist so two vocabularies can use the same element names in one document.',
  };
}

export const PITFALLS: readonly Pitfall[] = [
  commaPitfall(), newlinePitfall(), excelPitfall(),
  trailingCommaPitfall(), bigIdPitfall(), datePitfall(), undefinedPitfall(),
  norwayPitfall(), indentPitfall(),
  attributesPitfall(),
];

/** Starting points for the editor: each breaks one thing on purpose. */
export const EDITS: readonly { id: string; label: string; text: string; caption: string }[] = [
  { id: 'sample', label: 'Sample data', text: SAMPLE_TEXT, caption: 'Three users as JSON. Edit a value and watch the same field change in every other format.' },
  {
    id: 'thirty', label: 'age: "thirty"', text: SAMPLE_TEXT.replace('"age": 36', '"age": "thirty"'),
    caption: 'Still valid JSON, so it parses fine. Only the schema check catches that age should be a number.',
  },
  {
    id: 'bigid', label: 'id past 2^53', text: SAMPLE_TEXT.replace('"id": 101', '"id": 9007199254740993'),
    caption: 'JSON.parse reads 9007199254740993 as 9007199254740992: every format downstream now carries the wrong id.',
  },
  {
    id: 'trailing', label: 'Trailing comma', text: SAMPLE_TEXT.replace('"price": 20\n', '"price": 20,\n'),
    caption: 'One trailing comma and JSON.parse refuses the whole document.',
  },
];
