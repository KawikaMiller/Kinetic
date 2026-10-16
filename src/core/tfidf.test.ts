import { describe, expect, it } from 'vitest';
import { mulberry32 } from './random';
import { BM25_B, BM25_K1, bm25Scores, buildTermIndex, tfidfScores } from './tfidf';

const DOCS = [['cat', 'sat'], ['cat', 'cat', 'dog'], ['bird']];

describe('buildTermIndex', () => {
  const index = buildTermIndex(DOCS);

  it('counts documents, vocabulary, document frequency and lengths', () => {
    expect(index.docCount).toBe(3);
    expect([...index.vocab.keys()]).toEqual(['cat', 'sat', 'dog', 'bird']);
    expect(index.df).toEqual([2, 1, 1, 1]);
    expect(index.lengths).toEqual([2, 3, 1]);
    expect(index.avgLength).toBe(2);
  });

  it('uses idf = ln(N / df) + 1 and unit-length document vectors', () => {
    expect(index.idf[0]).toBeCloseTo(Math.log(1.5) + 1, 12);
    expect(index.idf[1]).toBeCloseTo(Math.log(3) + 1, 12);
    for (const v of index.vectors) expect(Math.hypot(...v)).toBeCloseTo(1, 12);
  });

  it('copes with no documents and with an empty document', () => {
    expect(buildTermIndex([]).avgLength).toBe(0);
    const withEmpty = buildTermIndex([['a'], []]);
    expect(withEmpty.vectors[1]).toEqual([0]);
    expect(tfidfScores(withEmpty, ['a'])).toEqual([1, 0]);
    expect(bm25Scores(withEmpty, ['a'])[1]).toBe(0);
  });
});

describe('bm25Scores', () => {
  const index = buildTermIndex(DOCS);

  it('matches the hand-worked scores for the query "cat"', () => {
    const idfCat = Math.log(1 + 1.5 / 2.5);
    const d0 = (idfCat * 1 * (BM25_K1 + 1)) / (1 + BM25_K1 * (1 - BM25_B + (BM25_B * 2) / 2));
    const d1 = (idfCat * 2 * (BM25_K1 + 1)) / (2 + BM25_K1 * (1 - BM25_B + (BM25_B * 3) / 2));
    const got = bm25Scores(index, ['cat']);
    expect(got[0]).toBeCloseTo(d0, 12);
    expect(got[1]).toBeCloseTo(d1, 12);
    expect(got[2]).toBe(0);
    expect(d0).toBeCloseTo(0.470004, 5);
    expect(d1).toBeCloseTo(0.56658, 4);
  });

  it('counts a repeated query term once and skips unknown terms', () => {
    expect(bm25Scores(index, ['cat', 'cat', 'cat'])).toEqual(bm25Scores(index, ['cat']));
    expect(bm25Scores(index, ['cat', 'zebra'])).toEqual(bm25Scores(index, ['cat']));
    expect(bm25Scores(index, [])).toEqual([0, 0, 0]);
  });

  it('accepts other k1 and b, and b = 0 ignores document length', () => {
    const flat = bm25Scores(index, ['dog'], 1.2, 0);
    expect(flat[1]).toBeCloseTo((Math.log(1 + 2.5 / 1.5) * 1 * 2.2) / (1 + 1.2), 12);
  });
});

describe('tfidfScores', () => {
  const index = buildTermIndex(DOCS);

  it('is the cosine of the query and document TF-IDF vectors', () => {
    const idf = index.idf;
    const qv = [idf[0], idf[1]];
    expect(tfidfScores(index, ['cat', 'sat'])[0]).toBeCloseTo(1, 12);
    const d1 = [2 * idf[0], 0, idf[2]];
    const want = (qv[0] * d1[0]) / (Math.hypot(...qv) * Math.hypot(...d1));
    expect(tfidfScores(index, ['cat', 'sat'])[1]).toBeCloseTo(want, 12);
  });

  it('is 0 for a document with no shared term, and for an empty query', () => {
    expect(tfidfScores(index, ['bird'])).toEqual([0, 0, 1]);
    expect(tfidfScores(index, [])).toEqual([0, 0, 0]);
  });
});

describe('both scorers against a per-document recomputation on seeded random corpora', () => {
  const WORDS = ['ant', 'bee', 'cow', 'doe', 'elk', 'fox', 'gnu', 'hen'];

  it('agree with a direct formula that never builds the shared index', () => {
    const rnd = mulberry32(77);
    for (let t = 0; t < 60; t++) {
      const docs = Array.from({ length: 2 + Math.floor(rnd() * 6) }, () => Array.from({ length: 1 + Math.floor(rnd() * 9) }, () => WORDS[Math.floor(rnd() * WORDS.length)]));
      const index = buildTermIndex(docs);
      const query = [...new Set(Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => WORDS[Math.floor(rnd() * WORDS.length)]))].filter((w) => index.vocab.has(w));
      if (!query.length) continue;
      const n = docs.length;
      const avg = docs.reduce((s, d) => s + d.length, 0) / n;
      const dfOf = (w: string) => docs.filter((d) => d.includes(w)).length;
      const tf = (d: string[], w: string) => d.filter((x) => x === w).length;
      const bm = docs.map((d) =>
        query.reduce((s, w) => {
          const f = tf(d, w);
          if (!f) return s;
          const df = dfOf(w);
          return s + (Math.log(1 + (n - df + 0.5) / (df + 0.5)) * f * (BM25_K1 + 1)) / (f + BM25_K1 * (1 - BM25_B + (BM25_B * d.length) / avg));
        }, 0),
      );
      const got = bm25Scores(index, query);
      bm.forEach((want, i) => expect(got[i], `bm25 corpus ${t} doc ${i}`).toBeCloseTo(want, 12));
      const vocab = [...new Set(docs.flat())];
      const weight = (d: string[], w: string) => tf(d, w) * (Math.log(n / dfOf(w)) + 1);
      const norm = (d: string[]) => Math.hypot(...vocab.map((w) => weight(d, w)));
      const cos = docs.map((d) => {
        const dot = vocab.reduce((s, w) => s + weight(query, w) * weight(d, w), 0);
        return dot === 0 ? 0 : dot / (norm(query) * norm(d));
      });
      const tfidf = tfidfScores(index, query);
      cos.forEach((want, i) => expect(tfidf[i], `tfidf corpus ${t} doc ${i}`).toBeCloseTo(want, 12));
    }
  });
});
