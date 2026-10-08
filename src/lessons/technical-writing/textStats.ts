/**
 * Readability numbers computed on the text on screen. They are crude proxies: a formula sees word and
 * syllable counts, never whether the reader understood. The syllable count is a heuristic.
 */

/** A word: letters and digits, with inner apostrophes, hyphens, colons and dots kept (don't, 09:35, v1.2). */
const WORD = /[A-Za-z0-9]+(?:['’:.-][A-Za-z0-9]+)*/g;

export const wordsOf = (text: string): string[] => text.match(WORD) ?? [];

/** Syllables in one word, by counting vowel groups with the usual silent-e and -ed corrections. */
export function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (w.length === 0) return 1; // a number or time read as one beat
  if (w.length <= 3) return 1;
  const trimmed = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '');
  const groups = trimmed.match(/[aeiouy]{1,2}/g);
  const hiatus = trimmed.match(/cr(?=ea)/g); // cre-ate, cre-ation: "ea" is two beats here, not one
  return Math.max(1, (groups ? groups.length : 1) + (hiatus ? hiatus.length : 0));
}

/**
 * Sentences: text ending in . ! or ?, plus every bullet line ("- ...") as its own sentence, and a line
 * ending in a colon that introduces a list. A text with no words has none.
 */
export function sentencesOf(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (t === '') continue;
    if (t.startsWith('- ')) {
      out.push(t);
      continue;
    }
    const parts = t.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
    out.push(...parts);
  }
  return out.filter((s) => wordsOf(s).length > 0);
}

export interface TextStats {
  words: number;
  sentences: number;
  /** Average words per sentence. */
  perSentence: number;
  syllablesPerWord: number;
  /** Flesch-Kincaid grade level: 0.39(words/sentences) + 11.8(syllables/words) - 15.59. */
  grade: number;
  /** Flesch reading ease: 206.835 - 1.015(words/sentences) - 84.6(syllables/words). */
  ease: number;
}

export function textStats(text: string): TextStats {
  const words = wordsOf(text);
  const sentences = sentencesOf(text).length;
  const syl = words.reduce((n, w) => n + syllables(w), 0);
  if (words.length === 0 || sentences === 0) return { words: 0, sentences: 0, perSentence: 0, syllablesPerWord: 0, grade: 0, ease: 0 };
  const perSentence = words.length / sentences;
  const syllablesPerWord = syl / words.length;
  return {
    words: words.length,
    sentences,
    perSentence,
    syllablesPerWord,
    grade: 0.39 * perSentence + 11.8 * syllablesPerWord - 15.59,
    ease: 206.835 - 1.015 * perSentence - 84.6 * syllablesPerWord,
  };
}

/** The 1-based position of the first word of the first sentence matching `cue`, or null if no sentence does. */
export function firstWordOf(text: string, cue: RegExp): number | null {
  let seen = 0;
  for (const s of sentencesOf(text)) {
    if (cue.test(s)) return seen + 1;
    seen += wordsOf(s).length;
  }
  return null;
}

/** The sentence ending the skim: how many sentences a skimming reader is assumed to read (an illustrative model). */
export const SKIM_SENTENCES = 3;

/** Words a skimmer is assumed to read: everything up to the end of the first SKIM_SENTENCES sentences. */
export function skimWords(text: string, sentences: number = SKIM_SENTENCES): number {
  return sentencesOf(text).slice(0, sentences).reduce((n, s) => n + wordsOf(s).length, 0);
}

/** The character offset in `text` where the skimmed sentences end: where the "skim stops here" marker sits. */
export function skimEnd(text: string, sentences: number = SKIM_SENTENCES): number {
  let from = 0;
  for (const s of sentencesOf(text).slice(0, sentences)) from = text.indexOf(s, from) + s.length;
  return from;
}
