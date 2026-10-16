/** mapreduce-batch: the input text, its tokenising rule and the presets the scenes open on. */

/** Typed input is cut to this many words (the learner is told when it happens). */
export const WORD_LIMIT = 200;
/** A longer word is shortened where it is drawn; the job itself still sees all of it. */
export const DISPLAY_WORD_MAX = 24;

/** The stated rule: lowercase, and split on anything that is not a letter a to z. */
export const wordsOf = (text: string): string[] => text.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 0);

export const shownWord = (w: string): string => (w.length > DISPLAY_WORD_MAX ? `${w.slice(0, DISPLAY_WORD_MAX - 1)}…` : w);

export const PRESET_SHORT = 'the cat and the dog and the bird';
export const PRESET_LONG =
  'the library opens at nine and the librarian greets every reader at the door while a cat sleeps on the desk and a quiet dog waits outside for the children who come to borrow books about birds and boats and bridges';

export interface TextPreset {
  id: 'short' | 'long';
  label: string;
  text: string;
}
export const TEXT_PRESETS: TextPreset[] = [
  { id: 'short', label: 'Short sentence', text: PRESET_SHORT },
  { id: 'long', label: 'A paragraph', text: PRESET_LONG },
];

/** The word that dominates the skewed preset, and the share of the input it makes up. */
export const HOT_WORD = 'the';
export const HOT_SHARE = 0.6;

/**
 * The paragraph's other words with `hot` mixed in until it makes up `share` of the result, spread evenly through it
 * (a running count says when the next hot word is due), so the others keep their order and the skew is exact up to rounding.
 */
export function skewedWords(base: readonly string[], hot: string, share: number): string[] {
  const others = base.filter((w) => w !== hot);
  const total = Math.round(others.length / (1 - share));
  const hotCount = total - others.length;
  const out: string[] = [];
  let used = 0;
  let placed = 0;
  for (let i = 0; i < total; i++) {
    if (placed < Math.round(((i + 1) * hotCount) / total)) {
      out.push(hot);
      placed++;
    } else out.push(others[used++]);
  }
  return out;
}

export const EVEN_WORDS: string[] = wordsOf(PRESET_LONG);
export const SKEWED_WORDS: string[] = skewedWords(EVEN_WORDS, HOT_WORD, HOT_SHARE);
