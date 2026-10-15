/**
 * inverted-index: the index itself. A map from term to a posting list, each posting a document id, a term frequency and the positions
 * of the term; every list is sorted by document id. Document ids are the 1-based numbers d1, d2, ... Pure.
 */
import { tokenize, type Steps } from './analyzer';

export interface Posting {
  doc: number;
  tf: number;
  positions: number[];
}

export interface Index {
  /** Number of documents. */
  n: number;
  /** Tokens of each document (index 0 is d1). */
  tokens: string[][];
  postings: Map<string, Posting[]>;
  /** Mean document length in tokens (0 for an empty corpus). */
  avgdl: number;
  steps: Steps;
}

export function buildIndex(docs: readonly string[], steps: Steps): Index {
  const tokens = docs.map((d) => tokenize(d, steps));
  const postings = new Map<string, Posting[]>();
  tokens.forEach((toks, i) => {
    const doc = i + 1;
    toks.forEach((term, pos) => {
      const list = postings.get(term) ?? [];
      const last = list[list.length - 1];
      if (last && last.doc === doc) {
        last.tf++;
        last.positions.push(pos);
      } else list.push({ doc, tf: 1, positions: [pos] });
      postings.set(term, list);
    });
  });
  const total = tokens.reduce((s, t) => s + t.length, 0);
  return { n: docs.length, tokens, postings, avgdl: docs.length ? total / docs.length : 0, steps };
}

export const postingsOf = (index: Index, term: string): Posting[] => index.postings.get(term) ?? [];
/** The document ids a term occurs in, ascending. */
export const docIds = (index: Index, term: string): number[] => postingsOf(index, term).map((p) => p.doc);
/** Document frequency: how many documents hold the term. */
export const df = (index: Index, term: string): number => postingsOf(index, term).length;
/** Terms in alphabetical order. */
export const termsOf = (index: Index): string[] => [...index.postings.keys()].sort();
