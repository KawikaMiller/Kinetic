// Sinks: the browser APIs that put a value into a page, and whether the value stays data.
// A "safe" sink never parses the value as markup. The unsafe ones do, so the value is read with
// the HTML parser's rules (modelled in html.ts), and a link value may choose a non-web scheme.
import { readMarkup } from './html';

export type SinkId = 'textContent' | 'setAttribute' | 'innerHTML' | 'documentWrite' | 'href' | 'escapeHatch';

export interface Sink {
  id: SinkId;
  /** The line of code shown in the panel. */
  code: string;
  safe: boolean;
  /** The safe replacement shown beside an unsafe line. */
  fix: string;
}

export const SINKS: Sink[] = [
  { id: 'textContent', code: 'note.textContent = value;', safe: true, fix: '' },
  { id: 'setAttribute', code: "box.setAttribute('title', value);", safe: true, fix: '' },
  { id: 'innerHTML', code: 'note.innerHTML = value;', safe: false, fix: 'note.textContent = value;' },
  { id: 'documentWrite', code: 'document.write(value);', safe: false, fix: 'note.textContent = value;' },
  { id: 'href', code: 'link.href = value;', safe: false, fix: 'if (isWebUrl(value)) link.href = value;' },
  { id: 'escapeHatch', code: '<div dangerouslySetInnerHTML={{ __html: value }} />', safe: false, fix: '<div>{value}</div>' },
];

export interface SinkResult {
  /** What ends up in the page, as plain-words pieces: text stays text, markup becomes elements. */
  pieces: { kind: 'text' | 'element'; text: string }[];
  /** True when the value was read with markup rules (the elements are the evidence). */
  parsed: boolean;
}

/** Schemes an application allows in a link built from a value. */
const WEB_SCHEMES = new Set(['http:', 'https:']);

/** The scheme a link value resolves to when the page sits on https://shop.example/. */
export function linkScheme(value: string): string | null {
  try {
    return new URL(value, 'https://shop.example/').protocol;
  } catch {
    return null;
  }
}

export const isWebUrl = (value: string) => {
  const scheme = linkScheme(value);
  return scheme !== null && WEB_SCHEMES.has(scheme);
};

const textPieces = (value: string): SinkResult => ({ pieces: [{ kind: 'text', text: value }], parsed: false });

export function parseAsMarkup(value: string): SinkResult {
  const { text, tags } = readMarkup(value);
  const elements = tags.filter((t) => !t.end && t.name).map((t) => ({ kind: 'element' as const, text: `<${t.name}>` }));
  return { pieces: [...elements, { kind: 'text', text }], parsed: true };
}

/** What each sink does with a value. */
export function throughSink(id: SinkId, value: string): SinkResult {
  switch (id) {
    case 'textContent':
    case 'setAttribute':
    case 'href':
      return textPieces(value);
    case 'innerHTML':
    case 'documentWrite':
    case 'escapeHatch':
      return parseAsMarkup(value);
  }
}

/** Did the sink keep the value as data? Computed from the result, not from which sink it was. */
export const keptAsData = (id: SinkId, value: string): boolean => {
  const r = throughSink(id, value);
  return !r.pieces.some((p) => p.kind === 'element') && r.pieces.map((p) => p.text).join('') === value;
};

export interface HrefVerdict {
  kind: 'web' | 'relative' | 'other';
  scheme: string | null;
}

/** How an unchecked `link.href = value` reads a value, and whether the allow-list would accept it. */
export function hrefVerdict(value: string): HrefVerdict {
  const scheme = linkScheme(value);
  const absolute = /^[A-Za-z][A-Za-z0-9+.-]*:/.test(value.trim());
  if (!absolute) return { kind: 'relative', scheme };
  return { kind: scheme !== null && WEB_SCHEMES.has(scheme) ? 'web' : 'other', scheme };
}

export type SourceId = 'stored' | 'reflected' | 'dom';

export interface Route {
  id: SourceId;
  label: string;
  /** Where the value comes from. */
  from: string;
  /** What writes it into the page. */
  via: string;
  /** Where the encoding belongs. */
  fixAt: string;
}

export const ROUTES: Route[] = [
  { id: 'stored', label: 'Stored', from: 'a comment saved in the database', via: 'server template', fixAt: 'the server template, where the value is written into the page' },
  { id: 'reflected', label: 'Reflected', from: 'a value in the request URL', via: 'server template', fixAt: 'the server template, where the value is written into the page' },
  { id: 'dom', label: 'DOM-based', from: 'a value in the URL, read by page code', via: 'page code in the browser', fixAt: 'the browser sink: textContent instead of innerHTML' },
];
