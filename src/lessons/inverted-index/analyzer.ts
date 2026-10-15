/**
 * inverted-index: the toy analyzer. Lowercase, split on anything that is not a letter or digit, drop ten stop words, strip a few
 * suffixes. Each step but the split can be switched off. Not Porter's stemmer and not for other languages. Pure.
 */

export interface Steps {
  lowercase: boolean;
  stopWords: boolean;
  stem: boolean;
}

export const ALL_STEPS: Steps = { lowercase: true, stopWords: true, stem: true };
export const STOP_WORDS: readonly string[] = ['the', 'a', 'an', 'and', 'of', 'on', 'in', 'is', 'it', 'to'];

/** The toy stemmer: -ing (kept stem of 3 or more letters), then -ed, then a plural -s that is not -ss. */
export function toyStem(token: string): string {
  if (token.endsWith('ing') && token.length >= 6) return token.slice(0, -3);
  if (token.endsWith('ed') && token.length >= 5) return token.slice(0, -2);
  if (token.endsWith('s') && !token.endsWith('ss') && token.length >= 4) return token.slice(0, -1);
  return token;
}

const SPLIT = /[^A-Za-z0-9]+/;

export interface Analysis {
  raw: string;
  /** The text after lowercasing, or the raw text when that step is off. */
  cased: string;
  /** Words after splitting. */
  split: string[];
  /** After the stop-word step: every word, flagged when it is removed (all kept when the step is off). */
  afterStop: { token: string; removed: boolean }[];
  /** After stemming the words that survived: flagged when the stemmer changed one (none when the step is off). */
  stemmed: { token: string; from: string; changed: boolean }[];
}

export function analyze(text: string, steps: Steps): Analysis {
  const cased = steps.lowercase ? text.toLowerCase() : text;
  const split = cased.split(SPLIT).filter((w) => w.length > 0);
  const afterStop = split.map((token) => ({ token, removed: steps.stopWords && STOP_WORDS.includes(token) }));
  const stemmed = afterStop
    .filter((t) => !t.removed)
    .map((t) => {
      const token = steps.stem ? toyStem(t.token) : t.token;
      return { token, from: t.token, changed: token !== t.token };
    });
  return { raw: text, cased, split, afterStop, stemmed };
}

/** The tokens that go into the index (or are looked up): everything after the enabled steps. */
export const tokenize = (text: string, steps: Steps): string[] => analyze(text, steps).stemmed.map((t) => t.token);
