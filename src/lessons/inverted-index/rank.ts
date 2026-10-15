/**
 * inverted-index: ranking. TF-IDF in its textbook form and BM25 with the Lucene-style IDF. Pure.
 *
 *   BM25(D, Q) = sum over q in Q of IDF(q) * f * (k1 + 1) / (f + k1 * (1 - b + b * |D| / avgdl))
 *   IDF(q)     = ln(1 + (N - n + 0.5) / (n + 0.5))
 *
 * f is q's frequency in D, |D| the document's length in tokens, avgdl the mean length, N the number of documents and n the number holding q.
 */
import { df, postingsOf, type Index } from './postings';

/** How many ranked rows the results list shows before it cuts. */
export const RANKED_SHOWN = 8;

export interface RankedRow {
  scored: Scored;
  /** 1-based place in the full ranking. */
  place: number;
}

/**
 * The rows a results list shows: the first `limit`, plus the `pinned` document's row when it falls outside them, so a learner
 * can always see where a document they are following landed.
 */
export function shownRows(ranked: readonly Scored[], pinned: number | null, limit = RANKED_SHOWN): { rows: RankedRow[]; pinnedRow: RankedRow | null } {
  const rows = ranked.slice(0, limit).map((scored, i) => ({ scored, place: i + 1 }));
  const at = pinned === null ? -1 : ranked.findIndex((s) => s.doc === pinned);
  return { rows, pinnedRow: at >= limit ? { scored: ranked[at], place: at + 1 } : null };
}

export const K1_RANGE = { min: 0, max: 3, step: 0.1 } as const;
export const B_RANGE = { min: 0, max: 1, step: 0.05 } as const;
export const DEFAULT_K1 = 1.2;
export const DEFAULT_B = 0.75;

export type Ranker = 'tfidf' | 'bm25';

export interface Params {
  k1: number;
  b: number;
}

export const idfBm25 = (n: number, containing: number): number => Math.log(1 + (n - containing + 0.5) / (containing + 0.5));
/** Textbook inverse document frequency, ln(N / n): zero for a term every document holds. */
export const idfClassic = (n: number, containing: number): number => (containing === 0 ? 0 : Math.log(n / containing));

export interface TermScore {
  term: string;
  f: number;
  idf: number;
  /** This term's contribution to the score. */
  part: number;
}

export interface Scored {
  doc: number;
  score: number;
  length: number;
  parts: TermScore[];
}

/** One document's score for the given (already analyzed, distinct) query terms. */
export function scoreDoc(index: Index, doc: number, terms: readonly string[], ranker: Ranker, p: Params): Scored {
  const length = index.tokens[doc - 1].length;
  const parts = terms.map((term) => {
    const f = postingsOf(index, term).find((x) => x.doc === doc)?.tf ?? 0;
    if (ranker === 'tfidf') {
      const idf = idfClassic(index.n, df(index, term));
      return { term, f, idf, part: f * idf };
    }
    const idf = idfBm25(index.n, df(index, term));
    const norm = index.avgdl === 0 ? 1 : 1 - p.b + (p.b * length) / index.avgdl;
    return { term, f, idf, part: f === 0 ? 0 : (idf * f * (p.k1 + 1)) / (f + p.k1 * norm) };
  });
  return { doc, score: parts.reduce((s, x) => s + x.part, 0), length, parts };
}

/** Documents ranked best first (ties by document id), over the ones given. */
export const rankDocs = (index: Index, docs: readonly number[], terms: readonly string[], ranker: Ranker, p: Params): Scored[] =>
  docs.map((d) => scoreDoc(index, d, terms, ranker, p)).sort((a, b) => b.score - a.score || a.doc - b.doc);
