/** What the token chips show: the symbol, its id, how to print it, and (byte mode) the text its bytes spell. */
import { createTokenizer, countWords, END, symbolPreview, UNKNOWN, type Mode, type Tokenizer } from './bpe';
import { MAX_MERGES, PARAGRAPH } from './corpus';

export interface TokenView {
  symbol: string;
  id: number;
  /** Printed form: the end-of-word marker shows as a middle dot. */
  label: string;
  /** Byte mode: the text this symbol's bytes spell, or null (see partial). */
  text: string | null;
  /** Byte mode: the bytes are only part of a character, so they spell no text on their own. */
  partial: boolean;
  /** Byte mode: the symbol's bytes in hex, with spaces between them. */
  hex: string | null;
  unknown: boolean;
}

const MARK = '·';
export const showEnd = (symbol: string) => symbol.replace(END, MARK);

export function tokenViews(tokenizer: Tokenizer, tokens: readonly string[]): TokenView[] {
  return tokens.map((symbol) => {
    const bytes = tokenizer.mode === 'bytes';
    const body = symbol.replace(END, '');
    const preview = bytes ? symbolPreview(symbol, 'bytes') : null;
    return {
      symbol,
      id: tokenizer.idOf(symbol),
      label: bytes ? (body === '' ? MARK : body.match(/../g)!.join(' ') + (symbol.endsWith(END) ? ` ${MARK}` : '')) : showEnd(symbol),
      text: preview === null ? null : preview.replace(END, MARK),
      partial: bytes && preview === null,
      hex: bytes && body !== '' ? body.match(/../g)!.join(' ') : null,
      unknown: symbol === UNKNOWN,
    };
  });
}

const words = countWords(PARAGRAPH);
const built = new Map<Mode, Tokenizer>();

/** The toy tokenizer of scenes 2 to 4, trained once per alphabet on the lesson's paragraph, with every merge it can learn up to MAX_MERGES. */
export function paragraphTokenizer(mode: Mode): Tokenizer {
  let t = built.get(mode);
  if (!t) {
    t = createTokenizer(words, mode, MAX_MERGES);
    built.set(mode, t);
  }
  return t;
}

export interface TokenStats {
  tokens: number;
  characters: number;
  /** Characters per token, or null for empty text. */
  charsPerToken: number | null;
  words: number;
  /** Words that came out as a single token. */
  whole: number;
}

export function tokenStats(tokenizer: Tokenizer, text: string): TokenStats {
  const tokens = tokenizer.encode(text).length;
  const characters = Array.from(text).length;
  const list = text.split(' ').filter(Boolean);
  return {
    tokens,
    characters,
    charsPerToken: tokens === 0 ? null : characters / tokens,
    words: list.length,
    whole: list.filter((w) => tokenizer.encodeWord(w).length === 1).length,
  };
}

/** UTF-8 byte length of a string (code points, as typed). */
export const byteLength = (text: string): number => new TextEncoder().encode(text).length;
