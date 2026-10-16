/**
 * Word-overlap retrieval scorers over a list of already tokenised documents: TF-IDF with cosine
 * similarity, and BM25. Neither knows what a word means. Tokenising (case, stopwords, stemming) is the
 * caller's job: pass each document as its list of terms and each query as its list of distinct terms.
 *
 * `buildTermIndex` counts once; `tfidfScores` and `bm25Scores` return one score per document, in
 * document order, 0 for a document sharing no query term.
 */
import { cosine, norm } from './vec';

/** BM25's two usual defaults (from memory: verify against the original papers or a textbook). */
export const BM25_K1 = 1.2;
export const BM25_B = 0.75;

export interface TermIndex {
  docCount: number;
  /** Term to its column in `idf` and `vectors`. */
  vocab: ReadonlyMap<string, number>;
  /** Number of documents containing each term. */
  df: readonly number[];
  /** ln(N / df) + 1 */
  idf: readonly number[];
  /** Term counts of each document, by vocabulary index. */
  counts: readonly ReadonlyMap<number, number>[];
  /** Terms in each document. */
  lengths: readonly number[];
  avgLength: number;
  /** L2-normalised TF-IDF vector of each document over the whole vocabulary (all zeros for an empty document). */
  vectors: readonly (readonly number[])[];
}

/** Index a list of documents, each given as its terms. */
export function buildTermIndex(docs: readonly (readonly string[])[]): TermIndex {
  const vocab = new Map<string, number>();
  const counts = docs.map((terms) => {
    const m = new Map<number, number>();
    for (const t of terms) {
      if (!vocab.has(t)) vocab.set(t, vocab.size);
      const id = vocab.get(t)!;
      m.set(id, (m.get(id) ?? 0) + 1);
    }
    return m;
  });
  const df = new Array<number>(vocab.size).fill(0);
  for (const m of counts) for (const id of m.keys()) df[id]++;
  const n = docs.length;
  const idf = df.map((d) => Math.log(n / d) + 1);
  const vectors = counts.map((m) => {
    const v = new Array<number>(vocab.size).fill(0);
    for (const [id, tf] of m) v[id] = tf * idf[id];
    const length = norm(v);
    return length === 0 ? v : v.map((x) => x / length);
  });
  const lengths = docs.map((t) => t.length);
  return { docCount: n, vocab, df, idf, counts, lengths, avgLength: lengths.reduce((a, b) => a + b, 0) / Math.max(1, n), vectors };
}

/** Cosine of the query's TF-IDF vector with each document's. `terms` must all be in the vocabulary (filter first). */
export function tfidfScores(index: TermIndex, terms: readonly string[]): number[] {
  const counts = new Array<number>(index.vocab.size).fill(0);
  for (const t of terms) counts[index.vocab.get(t)!] += 1;
  const q = counts.map((tf, id) => tf * index.idf[id]);
  if (norm(q) === 0) return new Array<number>(index.docCount).fill(0);
  return index.vectors.map((v) => (norm(v) === 0 ? 0 : cosine(q, v)));
}

/** Okapi BM25 of each document for the query's distinct terms (a repeated term counts once; unknown terms are skipped). */
export function bm25Scores(index: TermIndex, terms: readonly string[], k1 = BM25_K1, b = BM25_B): number[] {
  const n = index.docCount;
  const unique = [...new Set(terms)];
  return Array.from({ length: n }, (_, doc) => {
    let score = 0;
    for (const t of unique) {
      const id = index.vocab.get(t);
      if (id === undefined) continue;
      const tf = index.counts[doc].get(id) ?? 0;
      if (tf === 0) continue;
      const idf = Math.log(1 + (n - index.df[id] + 0.5) / (index.df[id] + 0.5));
      score += (idf * tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * index.lengths[doc]) / index.avgLength));
    }
    return score;
  });
}
