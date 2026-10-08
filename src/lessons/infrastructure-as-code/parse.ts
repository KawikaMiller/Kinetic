/**
 * A hand-written parser for the lesson's HCL-like subset. Line-oriented, never evaluated:
 *
 *   # a comment (whole line, or after a value)
 *   resource "<type>" "<label>" {
 *     key = "text" | 123 | true | other_type.label
 *     tags = { env = "prod", team = "web" }      (one line, string values)
 *   }
 *
 * Anything else is refused with the line number and the reason.
 */
import { flatKey, MAX_DIGITS, MAX_RESOURCES, MAX_STRING, MAX_TAGS, MAX_TEXT, SCHEMA, TYPE_NAMES, type Scalar } from './schema';

export interface Ref {
  ref: string;
}
export type ConfigValue = Scalar | Ref;
export const isRef = (v: unknown): v is Ref => typeof v === 'object' && v !== null && 'ref' in v;

export interface ResourceDecl {
  address: string;
  type: string;
  label: string;
  /** Attributes by flattened key (`tags.env`). References are `{ ref: 'network.main' }`. */
  attrs: Record<string, ConfigValue>;
  line: number;
}
export type Config = ResourceDecl[];

export type ParseResult = { ok: true; config: Config } | { ok: false; line: number; message: string };

const LABEL = /^[a-z][a-z0-9_]{0,23}$/;
const BLOCK_OPEN = /^resource\s+"([^"]*)"\s+"([^"]*)"\s*\{$/;
const ATTR = /^([a-z_][a-z0-9_]*)\s*=\s*(.+)$/;
const NUMBER = new RegExp(`^\\d{1,${MAX_DIGITS}}$`);
const REF = /^([a-z_][a-z0-9_]*)\.([a-z][a-z0-9_]*)$/;
const ENTRY = /^([a-z_][a-z0-9_-]*)\s*=\s*"([^"]*)"$/;

/** Cut a trailing `# comment`, ignoring a # inside a string. */
function stripComment(line: string): string {
  let inString = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') inString = !inString;
    else if (line[i] === '#' && !inString) return line.slice(0, i);
  }
  return line;
}

const fail = (line: number, message: string): ParseResult => ({ ok: false, line, message });

type Parsed<T> = { ok: true; value: T } | { ok: false; message: string };

function parseMap(body: string): Parsed<Record<string, string>> {
  const out: Record<string, string> = {};
  const trimmed = body.trim();
  if (trimmed === '') return { ok: true, value: out };
  for (const part of trimmed.split(',')) {
    const m = ENTRY.exec(part.trim());
    if (!m) return { ok: false, message: `a tag must look like key = "value", got ${JSON.stringify(part.trim())}` };
    if (m[2].length > MAX_STRING) return { ok: false, message: `a tag value can be at most ${MAX_STRING} characters` };
    if (m[1] in out) return { ok: false, message: `the tag ${m[1]} is set twice` };
    out[m[1]] = m[2];
  }
  if (Object.keys(out).length > MAX_TAGS) return { ok: false, message: `at most ${MAX_TAGS} tags per resource here` };
  return { ok: true, value: out };
}

function parseValue(raw: string): Parsed<ConfigValue | Record<string, string>> {
  const v = raw.trim();
  if (v.startsWith('"')) {
    if (!/^"[^"]*"$/.test(v)) return { ok: false, message: 'a string needs a closing quote and no quotes inside (this subset has no escapes)' };
    if (v.length - 2 > MAX_STRING) return { ok: false, message: `a string can be at most ${MAX_STRING} characters` };
    return { ok: true, value: v.slice(1, -1) };
  }
  if (v === 'true' || v === 'false') return { ok: true, value: v === 'true' };
  if (NUMBER.test(v)) return { ok: true, value: Number(v) };
  if (/^-?\d/.test(v)) return { ok: false, message: `numbers here are whole and non-negative, up to ${MAX_DIGITS} digits` };
  if (v.startsWith('{')) {
    if (!v.endsWith('}')) return { ok: false, message: 'a tag map must close with } on the same line' };
    return parseMap(v.slice(1, -1));
  }
  const ref = REF.exec(v);
  if (ref) return { ok: true, value: { ref: v } };
  return { ok: false, message: `can't read the value ${JSON.stringify(v.slice(0, 30))}: use "text", a whole number, true/false, a type.label reference or a { tag map }` };
}

export function parseConfig(text: string): ParseResult {
  if (text.length > MAX_TEXT) return fail(1, `the config is too long for this lesson (${MAX_TEXT} characters at most)`);
  const lines = text.split('\n');
  const config: Config = [];
  let open: ResourceDecl | null = null;

  for (let i = 0; i < lines.length; i++) {
    const n = i + 1;
    const line = stripComment(lines[i]).trim();
    if (line === '') continue;

    if (!open) {
      const m = BLOCK_OPEN.exec(line);
      if (!m) return fail(n, line.startsWith('resource') ? 'a block opens like: resource "vm" "web1" {' : `unexpected "${line.slice(0, 30)}": only resource blocks go at the top level`);
      const [, type, label] = m;
      if (!(type in SCHEMA)) return fail(n, `unknown resource type "${type}" (this provider has ${TYPE_NAMES.join(', ')})`);
      if (!LABEL.test(label)) return fail(n, `the label "${label}" must be lowercase letters, digits and underscores, starting with a letter`);
      const address = `${type}.${label}`;
      if (config.some((r) => r.address === address)) return fail(n, `${address} is declared twice`);
      if (config.length >= MAX_RESOURCES) return fail(n, `at most ${MAX_RESOURCES} resources in this lesson`);
      open = { address, type, label, attrs: {}, line: n };
      continue;
    }

    if (line === '}') {
      const spec = SCHEMA[open.type].attrs;
      const missing = Object.keys(spec).find((k) => spec[k].kind !== 'map' && !(k in open!.attrs));
      if (missing) return fail(open.line, `${open.address} is missing the required attribute "${missing}"`);
      config.push(open);
      open = null;
      continue;
    }
    if (line.endsWith('{') && line.startsWith('resource')) return fail(n, 'blocks cannot be nested: close the previous one with } first');

    const m = ATTR.exec(line);
    if (!m) return fail(n, `expected key = value or } inside ${open.address}, got "${line.slice(0, 30)}"`);
    const [, key, rawValue] = m;
    const spec = SCHEMA[open.type].attrs[key];
    if (!spec) return fail(n, `${open.type} has no attribute "${key}" (it has ${Object.keys(SCHEMA[open.type].attrs).join(', ')})`);
    if (key in open.attrs || Object.keys(open.attrs).some((k) => k.startsWith(`${key}.`))) return fail(n, `"${key}" is set twice in ${open.address}`);
    const value = parseValue(rawValue);
    if (!value.ok) return fail(n, value.message);

    if (spec.kind === 'map') {
      if (typeof value.value !== 'object' || isRef(value.value)) return fail(n, `${key} takes a tag map like { env = "prod" }`);
      for (const [k, v] of Object.entries(value.value as Record<string, string>)) open.attrs[flatKey(key, k)] = v;
      continue;
    }
    const v = value.value as ConfigValue;
    const want = { string: 'a string', number: 'a whole number', bool: 'true or false', ref: `a ${spec.refType} reference` }[spec.kind];
    const got = isRef(v) ? 'ref' : typeof v === 'object' ? 'map' : typeof v === 'boolean' ? 'bool' : typeof v;
    if (got !== spec.kind) return fail(n, `${key} must be ${want}`);
    if (isRef(v)) {
      const [refType] = v.ref.split('.');
      if (refType !== spec.refType) return fail(n, `${key} must point at a ${spec.refType}, not a ${refType}`);
    }
    open.attrs[key] = v;
  }

  if (open) return fail(open.line, `${open.address} is never closed: add a } line`);

  for (const decl of config) {
    for (const [key, v] of Object.entries(decl.attrs)) {
      if (isRef(v) && !config.some((r) => r.address === v.ref)) return fail(decl.line, `${decl.address} refers to ${v.ref}, which is not declared (attribute ${key})`);
    }
  }
  return { ok: true, config };
}

const quote = (v: Scalar) => (typeof v === 'string' ? `"${v}"` : String(v));

/** Print a config back as text the parser reads (presets, tests). */
export function formatConfig(config: Config): string {
  return config
    .map((r) => {
      const lines = [`resource "${r.type}" "${r.label}" {`];
      const tags: string[] = [];
      for (const [key, v] of Object.entries(r.attrs)) {
        if (key.includes('.')) tags.push(`${key.split('.')[1]} = "${v}"`);
        else lines.push(`  ${key} = ${isRef(v) ? v.ref : quote(v)}`);
      }
      if (tags.length) lines.push(`  tags = { ${tags.join(', ')} }`);
      lines.push('}');
      return lines.join('\n');
    })
    .join('\n');
}
