/**
 * inverted-index: the numbers the try-this entries quote, computed from the same models the scenes run, from each scene's default state.
 */
import { ALL_STEPS } from './analyzer';
import { DEFAULT_DOCS, REPEATER, docName } from './corpus';
import { buildIndex, docIds, termsOf } from './postings';
import { evaluate, parseQuery } from './query';
import { DEFAULT_B, DEFAULT_K1, rankDocs } from './rank';
import { BIG_SEED, DEFAULT_EXPONENT, POSTINGS_SHOWN, seededIds, sizesOf } from './vbyte';

export const THREE_WORDS = 'cat dog garden';
export const PHRASE = '"cat sat"';
export const REVERSED_PHRASE = '"sat cat"';
export const WORD = 'cat';

const index = buildIndex(DEFAULT_DOCS, ALL_STEPS);

/** Try-this 1: the postings of one word, and what switching the stemmer off does to the dictionary. */
export function buildFacts() {
  const ids = docIds(index, WORD);
  return {
    word: WORD,
    docs: ids.map((d) => docName(d - 1)),
    terms: termsOf(index).length,
    termsWithoutStemmer: termsOf(buildIndex(DEFAULT_DOCS, { ...ALL_STEPS, stem: false })).length,
  };
}

const run = (text: string, op: 'and' | 'or', order: 'shortest-first' | 'as-typed') => evaluate(index, parseQuery(text, ALL_STEPS), op, order);

/** Try-this 2: the default query, then three words, in both merge orders. */
export function queryFacts() {
  const two = run('cat dog', 'and', 'shortest-first');
  return {
    twoDocs: two.docs.length,
    twoComparisons: two.comparisons,
    threeShortest: run(THREE_WORDS, 'and', 'shortest-first').comparisons,
    threeTyped: run(THREE_WORDS, 'and', 'as-typed').comparisons,
    threeDocs: run(THREE_WORDS, 'and', 'shortest-first').docs.length,
  };
}

/** Try-this 3: a phrase and the same words reversed. */
export function phraseFacts() {
  return {
    phrase: run(PHRASE, 'and', 'as-typed').docs.map((d) => docName(d - 1)),
    reversed: run(REVERSED_PHRASE, 'and', 'as-typed').docs.length,
    both: run('cat sat', 'and', 'as-typed').docs.length,
  };
}

/** Try-this 4: where the repeating document ranks under TF-IDF, BM25 and BM25 with k1 = 0. */
export function rankFacts() {
  const withRepeater = buildIndex([...DEFAULT_DOCS, REPEATER], ALL_STEPS);
  const matches = evaluate(withRepeater, parseQuery('cat dog', ALL_STEPS), 'or', 'as-typed').docs;
  const place = (ranker: 'tfidf' | 'bm25', k1: number) => rankDocs(withRepeater, matches, ['cat', 'dog'], ranker, { k1, b: DEFAULT_B }).findIndex((s) => s.doc === DEFAULT_DOCS.length + 1) + 1;
  return { tfidf: place('tfidf', DEFAULT_K1), bm25: place('bm25', DEFAULT_K1), bm25k0: place('bm25', 0), matches: matches.length };
}

/** Try-this 5: the big collection at its default size. */
export function compressFacts() {
  const ids = seededIds(POSTINGS_SHOWN, 10 ** DEFAULT_EXPONENT, BIG_SEED);
  return { collection: 10 ** DEFAULT_EXPONENT, count: ids.length, ...sizesOf(ids) };
}
