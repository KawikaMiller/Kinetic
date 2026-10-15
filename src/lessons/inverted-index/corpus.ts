/**
 * inverted-index: the corpus the learner edits. Twelve short lesson-authored documents, at most MAX_DOCS, each cut at MAX_DOC_CHARS.
 */

export const MAX_DOCS = 30;
export const MAX_DOC_CHARS = 280;

export const DEFAULT_DOCS: readonly string[] = [
  'The cat sat on the warm mat by the door',
  'A dog chased the ball across the garden and the cat watched',
  'Cats and dogs sleeping together on the sofa all afternoon',
  'The fox jumped over the lazy dog near the old barn',
  'A cat climbed the tree and the dog barked at the cat',
  'Birds sing in the garden before the cat wakes up',
  'The old barn is full of mice, and the cat likes mice',
  'Dogs bark, cats purr, and the birds sing along together',
  'She walked the dog to the park and fed the birds there',
  'The barn cat sat on the mat and the dog sat nearby',
  'Mice hide in the garden from the cat all day long',
  'He painted the door of the old barn bright red',
];

/** A document that repeats `cat` ten times among other words: the one that shows term-frequency saturation. */
export const REPEATER = `${'cat '.repeat(10)}and then a long list of other words about gardens, barns, birds and trees`;

/** The query every scene opens on. */
export const DEFAULT_QUERY = 'cat dog';

export interface Cleaned {
  text: string;
  /** Set when the text was cut. */
  truncated: boolean;
}

/** A document as stored: cut at MAX_DOC_CHARS. */
export const cleanDoc = (typed: string): Cleaned => ({ text: typed.slice(0, MAX_DOC_CHARS), truncated: typed.length > MAX_DOC_CHARS });

/** The name of document `i` (0-based): d1, d2, ... */
export const docName = (i: number): string => `d${i + 1}`;
