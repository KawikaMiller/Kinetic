/**
 * Typed text on its way into the tokenizer. A lone surrogate is not text: TextEncoder would silently turn it into
 * U+FFFD (EF BF BD), so the bytes would no longer be the ones typed. Lone surrogates and control characters are
 * therefore shown and encoded as a visible escape, `\uXXXX`, which round-trips like any other text.
 */

export const MAX_CHARS = 2000;

const isHigh = (c: number) => c >= 0xd800 && c <= 0xdbff;
const isLow = (c: number) => c >= 0xdc00 && c <= 0xdfff;
const isControl = (c: number) => c < 0x20 || c === 0x7f;
const escapeCode = (c: number) => `\\u${c.toString(16).padStart(4, '0')}`;

/** The escaped text and how many characters were replaced. */
function escapeCounted(text: string): { text: string; count: number } {
  let out = '';
  let count = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (isHigh(c) && i + 1 < text.length && isLow(text.charCodeAt(i + 1))) {
      out += text[i] + text[i + 1];
      i++;
    } else if (isHigh(c) || isLow(c) || isControl(c)) {
      out += escapeCode(c);
      count++;
    } else out += text[i];
  }
  return { text: out, count };
}

/** Replace every lone surrogate and control character by its `\uXXXX` escape; every other character is kept. */
export const escapeText = (text: string): string => escapeCounted(text).text;

export interface Prepared {
  /** What the tokenizer sees: at most MAX_CHARS characters of the typed text, escaped. */
  text: string;
  truncated: boolean;
  /** How many characters were replaced by an escape. */
  escaped: number;
}

export function prepare(typed: string): Prepared {
  const chars = Array.from(typed);
  const { text, count } = escapeCounted(chars.slice(0, MAX_CHARS).join(''));
  return { text, truncated: chars.length > MAX_CHARS, escaped: count };
}
