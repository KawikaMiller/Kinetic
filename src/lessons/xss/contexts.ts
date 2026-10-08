// Where one comment value lands in a page template, and what each way of writing it in does to the
// page's structure. Everything here is string work on a model of the page: nothing is rendered as
// HTML, and the samples are ordinary text that happens to contain characters browsers care about.
import { decodeReferences, readMarkup } from './html';

export type ContextId = 'text' | 'attr' | 'url' | 'script';
/** raw: pasted in as typed. html: one HTML encoder used everywhere. right: the encoder for that context. */
export type EncoderId = 'raw' | 'html' | 'right';

export const CONTEXTS: { id: ContextId; label: string; encoder: string }[] = [
  { id: 'text', label: 'HTML text', encoder: 'HTML-escape (& < >)' },
  { id: 'attr', label: 'Quoted attribute', encoder: 'HTML-escape, including the quote' },
  { id: 'url', label: 'Value inside a URL', encoder: 'percent-encode (encodeURIComponent)' },
  { id: 'script', label: 'Inside a script string', encoder: 'a quoted string literal (JSON-style escapes)' },
];

export const ENCODERS: { id: EncoderId; label: string }[] = [
  { id: 'raw', label: 'Pasted in as typed' },
  { id: 'html', label: 'HTML-escaped everywhere' },
  { id: 'right', label: 'Encoded for this context' },
];

/** Ordinary text a real user might write; each one trips naive code somewhere by accident. */
export const SAMPLES: { id: string; value: string }[] = [
  { id: 'heart', value: 'I <3 it' },
  { id: 'bold', value: 'use <b>bold</b>' },
  { id: 'quotes', value: 'Tom\'s "best" pick' },
  { id: 'math', value: '5 > 3 & 2 < 4' },
  { id: 'link', value: 'see https://shop.example/a?b=1&c=2' },
  { id: 'path', value: String.raw`C:\temp\new` },
];

/** The template around the value, with a plain-words name for where it sits. */
export const TEMPLATES: Record<ContextId, { before: string; after: string }> = {
  text: { before: '<p>', after: '</p>' },
  attr: { before: '<input value="', after: '">' },
  url: { before: '<a href="https://shop.example/search?q=', after: '">search</a>' },
  script: { before: '<script>var comment = ', after: ';</script>' },
};

export const escapeHtml = (s: string) =>
  s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');

export const encodeUrlValue = (s: string) => encodeURIComponent(s);

/** A string literal for a script: JSON escaping, plus `<`, `>`, `&`, `'` and the two line separators as \u escapes. */
export function encodeJsString(s: string): string {
  return JSON.stringify(s)
    .replace(/[<>&'\u2028\u2029]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

/** What goes into the template for this encoder: a script string needs its quotes, so the naive ones add plain ones. */
export function encode(ctx: ContextId, enc: EncoderId, value: string): string {
  if (enc === 'raw') return ctx === 'script' ? `"${value}"` : value;
  if (enc === 'html') return ctx === 'script' ? `"${escapeHtml(value)}"` : escapeHtml(value);
  switch (ctx) {
    case 'text':
    case 'attr':
      return escapeHtml(value);
    case 'url':
      return encodeUrlValue(value);
    case 'script':
      return encodeJsString(value);
  }
}

export interface Rendered {
  output: string;
  /** The inserted value is output.slice(from, to). */
  from: number;
  to: number;
}

export function render(ctx: ContextId, enc: EncoderId, value: string): Rendered {
  const { before, after } = TEMPLATES[ctx];
  const inserted = encode(ctx, enc, value);
  return { output: before + inserted + after, from: before.length, to: before.length + inserted.length };
}

/** What the page makes of the output, and the pieces of it that are no longer plain data. */
export interface Reading {
  /** The value as the page's parser recovers it, or null when its structure broke. */
  value: string | null;
  intact: boolean;
  /** One plain-words sentence per way it went wrong (empty when intact). */
  issues: string[];
  /** Ranges of `output` that became structure instead of data. */
  marks: [number, number][];
}

const scriptEnd = /<\/script/i;

interface Read {
  value: string | null;
  issues: string[];
  marks: [number, number][];
}

const DIFFERENT = 'the value comes out different from what was typed';

/** Where the attribute value starts, in each template that has one (the URL value sits partway into its href). */
const ATTRIBUTE_START: Partial<Record<ContextId, number>> = { attr: TEMPLATES.attr.before.length, url: '<a href="'.length };

/** Read a double-quoted attribute value: where it really ends and what it decodes to. */
function readAttribute(r: Rendered, ctx: ContextId): Read {
  const { output, to } = r;
  const start = ATTRIBUTE_START[ctx] ?? r.from;
  const quote = output.indexOf('"', start);
  if (quote < to) {
    return { value: null, issues: ['the attribute ends early, at a quote in the value'], marks: [[quote, output.length]] };
  }
  return { value: decodeReferences(output.slice(start, quote)), issues: [], marks: [] };
}

function readText(r: Rendered): Read {
  const body = r.output.slice(r.from);
  const ownEnd = body.length - (r.output.length - r.to);
  const { text, tags } = readMarkup(body);
  const foreign = tags.filter((t) => !(t.end && t.name === 'p' && t.from === ownEnd));
  return {
    value: foreign.length ? null : text,
    issues: foreign.map((t) => `the page reads ${body.slice(t.from, t.to)} as a tag`),
    marks: foreign.map((t) => [r.from + t.from, r.from + t.to]),
  };
}

/** The part of a URL after `?q=` is read as query parameters: the value must stay one parameter. */
function readUrl(r: Rendered): Read {
  const attr = readAttribute(r, 'url');
  if (attr.value === null) return attr;
  let url: URL;
  try {
    url = new URL(attr.value);
  } catch {
    return { value: null, issues: ['the address does not parse as a URL'], marks: [] };
  }
  const entries = [...url.searchParams.entries()];
  if (entries.length === 1 && entries[0][0] === 'q' && !url.hash) return { value: entries[0][1], issues: [], marks: [] };
  const marks: [number, number][] = [];
  const end = r.output.indexOf('"', r.from);
  for (let i = r.from; i < end; i++) {
    if (r.output.startsWith('&amp;', i)) marks.push([i, i + 5]);
    else if (r.output[i] === '&' && !/^&(?:[a-z]+|#[0-9]+);/.test(r.output.slice(i))) marks.push([i, i + 1]);
    if (r.output[i] === '#') marks.push([i, i + 1]);
  }
  return { value: null, issues: ['the value is split into more than one URL part'], marks };
}

/** The inserted script string literal, read with JSON rules (a subset of JavaScript's, enough for these templates). */
function readScript(r: Rendered): Read {
  const literal = r.output.slice(r.from, r.to);
  const issues: string[] = [];
  const marks: [number, number][] = [];
  if (scriptEnd.test(literal)) issues.push('the page parser would end the script element early');
  let value: string | null = null;
  try {
    value = JSON.parse(literal) as string;
  } catch {
    issues.push('the string ends early or has a bad escape: the script has a syntax error');
    for (let i = 1; i < literal.length - 1; i++) if (literal[i] === '"') marks.push([r.from + i, r.from + i + 1]);
  }
  for (let i = 1; i < literal.length - 1; i++) {
    if (literal[i] === '\\') marks.push([r.from + i, r.from + i + 2]);
    const entity = /^&(?:[a-z]+|#[0-9]+);/.exec(literal.slice(i));
    if (entity) marks.push([r.from + i, r.from + i + entity[0].length]);
  }
  return { value, issues, marks };
}

const READERS: Record<ContextId, (r: Rendered) => Read> = { text: readText, attr: (r) => readAttribute(r, 'attr'), url: readUrl, script: readScript };

const dedupe = (marks: [number, number][]) => {
  const seen = new Set<string>();
  return marks.filter(([a, b]) => !seen.has(`${a}:${b}`) && seen.add(`${a}:${b}`));
};

export function inspect(ctx: ContextId, r: Rendered, value: string): Reading {
  const read = READERS[ctx](r);
  const issues = [...read.issues];
  if (read.value !== null && read.value !== value && !issues.length) issues.push(DIFFERENT);
  const intact = read.value === value && issues.length === 0;
  return { value: read.value, intact, issues, marks: intact ? [] : dedupe(read.marks) };
}

export interface Verdict extends Rendered {
  reading: Reading;
}

export function verdict(ctx: ContextId, enc: EncoderId, value: string): Verdict {
  const r = render(ctx, enc, value);
  return { ...r, reading: inspect(ctx, r, value) };
}

/** How many of the four contexts stay intact under each encoder, for the caption and the stat. */
export function tally(value: string): Record<EncoderId, number> {
  const count = (enc: EncoderId) => CONTEXTS.filter((c) => verdict(c.id, enc, value).reading.intact).length;
  return { raw: count('raw'), html: count('html'), right: count('right') };
}

export type RunKind = 'template' | 'data' | 'encoded' | 'structure';
export interface Run {
  text: string;
  kind: RunKind;
}

/**
 * The output split into runs to colour: the template around the value, the value (your text,
 * `data`, or `encoded` once an encoder made it stay data) and the characters that became structure.
 */
export function styleRuns(v: Verdict, enc: EncoderId): Run[] {
  const marked = new Set<number>();
  for (const [a, b] of v.reading.marks) for (let i = a; i < b; i++) marked.add(i);
  const span: RunKind = enc !== 'raw' && v.reading.intact ? 'encoded' : 'data';
  const runs: Run[] = [];
  for (let i = 0; i < v.output.length; i++) {
    const kind: RunKind = marked.has(i) ? 'structure' : i >= v.from && i < v.to ? span : 'template';
    const last = runs.at(-1);
    if (last && last.kind === kind) last.text += v.output[i];
    else runs.push({ text: v.output[i], kind });
  }
  return runs;
}
