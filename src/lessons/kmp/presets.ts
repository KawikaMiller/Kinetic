import { printable } from './kmp';

export const TEXT_MAX = 40;
export const PATTERN_MAX = 12;

export const EMPTY_PATTERN_MESSAGE = 'A pattern needs at least one character (a scan for the empty string matches everywhere, so there is nothing to show).';

export interface Pair {
  text: string;
  pattern: string;
}

export interface Preset extends Pair {
  id: string;
  label: string;
}

/** Where each scene opens. Pure data, so a test can walk every scene's try-this from it. */
export const OPENING = {
  naive: { text: 'a'.repeat(20), pattern: 'aaaab' },
  lps: { pattern: 'abcabd' },
  match: { text: 'abcabcabdabcabcabd', pattern: 'abcabd' },
  count: { text: 'a'.repeat(20), pattern: 'aaaab' },
} as const;

export const NAIVE_PRESETS: Preset[] = [
  { id: 'aaaab', label: 'aaaab in 20 a', ...OPENING.naive },
  { id: 'abcabd', label: 'abcabd', text: 'abcabcabdabcabcabd', pattern: 'abcabd' },
  { id: 'random', label: 'two letters', text: 'abbaabababbbaabab', pattern: 'abab' },
];

export const LPS_PRESETS: Preset[] = [
  { id: 'abcabd', label: 'abcabd', text: '', pattern: 'abcabd' },
  { id: 'aaaab', label: 'aaaab', text: '', pattern: 'aaaab' },
  { id: 'abababac', label: 'abababac', text: '', pattern: 'abababac' },
  { id: 'aabaaab', label: 'aabaaab', text: '', pattern: 'aabaaab' },
];

export const MATCH_PRESETS: Preset[] = [
  { id: 'abcabd', label: 'abcabd', ...OPENING.match },
  { id: 'overlap', label: 'aa in aaaa', text: 'aaaa', pattern: 'aa' },
  { id: 'abababac', label: 'abababac', text: 'abababababacabababac', pattern: 'abababac' },
];

export type Parsed = { ok: true; text: string; pattern: string; surrogates: boolean } | { ok: false; error: string };

const hasSurrogate = (s: string) => /[\ud800-\udfff]/.test(s);

/** Read the two fields: printable characters only, the pattern cannot be empty, and the caps keep the drawing readable. */
export function parsePair(textRaw: string, patternRaw: string): Parsed {
  const text = printable(textRaw);
  const pattern = printable(patternRaw);
  if (pattern.length === 0) return { ok: false, error: EMPTY_PATTERN_MESSAGE };
  if (text.length > TEXT_MAX) return { ok: false, error: `The text is limited to ${TEXT_MAX} characters so the drawing stays readable.` };
  if (pattern.length > PATTERN_MAX) return { ok: false, error: `The pattern is limited to ${PATTERN_MAX} characters so the drawing stays readable.` };
  return { ok: true, text, pattern, surrogates: hasSurrogate(text) || hasSurrogate(pattern) };
}

export const SURROGATE_NOTE = 'An emoji or other character outside the basic plane is two UTF-16 code units here, so it takes two cells.';

/** What a cell shows: the character, or a marker for half of a surrogate pair (which has no glyph of its own). */
export const cellText = (c: string): string => (/[\ud800-\udfff]/.test(c) ? '▯' : c === ' ' ? '␣' : c);
