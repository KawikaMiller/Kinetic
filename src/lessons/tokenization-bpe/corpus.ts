import type { WordCount } from './bpe';

/** The classic worked corpus of the original BPE-for-NLP paper (Sennrich et al., 2016; from memory, verify): four words with counts. */
export const CLASSIC_WORDS: readonly WordCount[] = [
  { word: 'low', count: 5 },
  { word: 'lower', count: 2 },
  { word: 'newest', count: 6 },
  { word: 'widest', count: 3 },
];

/**
 * The first ten merges of CLASSIC_WORDS with ties broken lexicographically (a hand-worked list: the test
 * recomputes it): [left, right, count].
 */
export const CLASSIC_MERGES: readonly (readonly [string, string, number])[] = [
  ['e', 's', 9],
  ['es', 't', 9],
  ['est', '</w>', 9],
  ['l', 'o', 7],
  ['lo', 'w', 7],
  ['e', 'w', 6],
  ['ew', 'est</w>', 6],
  ['n', 'ewest</w>', 6],
  ['low', '</w>', 5],
  ['d', 'est</w>', 3],
];

/** A lesson-authored English paragraph of about 300 words: the toy tokenizer learns from this and from nothing else. */
export const PARAGRAPH =
  'Computers cannot read letters, so before a language model sees any text, a tokenizer turns the text into a list of numbers. ' +
  'A tokenizer is built before the model is trained. It looks at a large pile of text, finds the pieces that appear most often, and writes them into a vocabulary. ' +
  'Common words become one piece. Rare words are split into smaller pieces that the tokenizer has seen before. ' +
  'The word lowest might become low and est, and the word newest might become new and est, because those pieces appear in many other words too. ' +
  'This idea is called byte pair encoding. It starts with single characters and repeatedly joins the two neighbours that appear together most often. ' +
  'Each join adds one new piece to the vocabulary, and the list of joins is kept in order. ' +
  'To tokenize new text, the tokenizer applies the same joins in the same order. It does not count anything again. ' +
  'The more joins it learns, the larger the vocabulary becomes and the fewer pieces each sentence needs. ' +
  'A short list of joins gives long sequences of tiny pieces, while a long list gives short sequences of larger pieces. ' +
  'Neither is simply better: a large vocabulary needs a larger table inside the model, and a small vocabulary makes every sentence longer. ' +
  'Because the tokenizer is fitted to its training text, words that were common there are cheap, and words from other languages or topics can cost many more pieces. ' +
  'Numbers are split too, and the split depends on the text the tokenizer learned from: a long number such as 2024, 2025 or 2026 may be cut into two pieces, or four. ' +
  'The tokenizer is not part of the neural network and is not changed when the network learns. ' +
  'This small example learns from one paragraph only, so its pieces are not those of any real model, and nothing here shows how a real tokenizer behaves.';

export const MAX_MERGES = 200;

/** The same idea in three languages, for scene 3's count table (lesson-authored; the toy has only seen English). */
export const SENTENCES: readonly { language: string; text: string }[] = [
  { language: 'English', text: 'the cat sat on the mat' },
  { language: 'French', text: 'le chat est assis sur le tapis' },
  { language: 'Greek', text: 'η γάτα κάθεται στο χαλί' },
];

/** A made-up example price, per million tokens, so cost arithmetic has a number in it. Not any provider's price. */
export const ILLUSTRATIVE_PRICE_PER_MILLION = 2.5;
export const ILLUSTRATIVE_WINDOWS = [256, 1_024, 4_096, 128_000] as const;

/** The cost of `tokens` at `pricePerMillion` per million tokens. */
export const tokenCost = (tokens: number, pricePerMillion: number): number => (tokens * pricePerMillion) / 1e6;
