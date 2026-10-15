/**
 * LZ77, pure: a greedy parser that replaces repeats with (distance, length) back-references, the
 * decoder that undoes it (copying one character at a time, so a match may overlap what it is
 * writing), and the text rules of this byte-oriented teaching encoder.
 */
import type { Result } from '../../core/result';

/** DEFLATE's longest match (RFC 1951 length code 285). */
export const MAX_MATCH = 258;
/** The most characters the lesson reads. */
export const MAX_TEXT = 200;
/** The window sizes the slider offers; DEFLATE's is 32 KiB. */
export const WINDOW_BOUNDS = { min: 4, max: 64 } as const;
export const DEFAULT_WINDOW = 32;
export const MIN_MATCH_OPTIONS = [2, 3, 4] as const;
/** DEFLATE's shortest match: the format has no code for a length of 2. */
export const DEFLATE_MIN_MATCH = 3;
export const DEFAULT_MIN_MATCH = DEFLATE_MIN_MATCH;

export interface Literal {
  kind: 'literal';
  char: string;
  /** Index in the text. */
  pos: number;
  /** The longest earlier copy the window offered here (0 when there was none); below the minimum, so it was not used. */
  best: number;
}
export interface Match {
  kind: 'match';
  distance: number;
  length: number;
  pos: number;
}
export type Token = Literal | Match;

/** Characters this token stands for. */
export const tokenLength = (t: Token): number => (t.kind === 'match' ? t.length : 1);

export interface ParseOptions {
  window: number;
  minMatch: number;
}

/**
 * The longest match for text[pos..] starting at any of the `window` previous positions. A match may run
 * past `pos` (overlap): the comparison reads the text itself, and the decoder reproduces it by copying one
 * character at a time. Equal lengths go to the nearest start (smallest distance).
 */
export function longestMatch(text: string, pos: number, window: number): { distance: number; length: number } {
  const limit = Math.min(MAX_MATCH, text.length - pos);
  let best = { distance: 0, length: 0 };
  for (let d = 1; d <= Math.min(window, pos); d++) {
    let l = 0;
    while (l < limit && text[pos + l] === text[pos + l - d]) l++;
    if (l > best.length) best = { distance: d, length: l };
  }
  return best;
}

/** Greedy parse: at each position the longest match in the window if it reaches `minMatch`, else a literal. */
export function parseLz77(text: string, { window, minMatch }: ParseOptions): Token[] {
  const tokens: Token[] = [];
  for (let pos = 0; pos < text.length; ) {
    const m = longestMatch(text, pos, window);
    if (m.length >= minMatch) {
      tokens.push({ kind: 'match', distance: m.distance, length: m.length, pos });
      pos += m.length;
    } else {
      tokens.push({ kind: 'literal', char: text[pos], pos, best: m.length });
      pos += 1;
    }
  }
  return tokens;
}

/** The right decoder: a match copies one character at a time, so it may read characters it has just written. */
export function decodeTokens(tokens: readonly Token[]): string {
  const out: string[] = [];
  for (const t of tokens) {
    if (t.kind === 'literal') out.push(t.char);
    else for (let i = 0; i < t.length; i++) out.push(out[out.length - t.distance]);
  }
  return out.join('');
}

/**
 * The wrong decoder: copy the match as one block, `slice(start, start + length)` of what exists when the
 * copy begins. When length exceeds distance the slice is cut short at the end of the output, so the
 * overlapping part is never produced.
 */
export function decodeAsBlock(tokens: readonly Token[]): string {
  const out: string[] = [];
  for (const t of tokens) {
    if (t.kind === 'literal') out.push(t.char);
    else {
      const start = out.length - t.distance;
      out.push(...out.slice(start, start + t.length));
    }
  }
  return out.join('');
}

// ── Text rules ───────────────────────────────────────────────────────

const hex = (c: string) => `U+${(c.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')}`;

/** The learner's text, or the reason it is refused: at most 200 characters, each a code point below 256 (a byte). */
export function checkText(raw: string): Result<string> {
  const chars = Array.from(raw);
  const bad = chars.find((c) => (c.codePointAt(0) ?? 0) > 255);
  if (bad !== undefined) {
    return { ok: false, error: `"${bad}" (${hex(bad)}) is outside 0 to 255: this teaching encoder works on single bytes, so use Latin-1 characters.` };
  }
  if (chars.length > MAX_TEXT) return { ok: false, error: `That is ${chars.length} characters: the limit is ${MAX_TEXT}.` };
  return { ok: true, value: raw };
}

/** A character made visible: a space, tab or control character would vanish from a cell. */
export function showChar(c: string): string {
  const code = c.charCodeAt(0);
  if (c === ' ') return '␣';
  if (code < 32 || (code >= 127 && code < 160)) return `·`;
  return c;
}
