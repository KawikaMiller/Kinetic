/**
 * Retrieval by word overlap: TF-IDF cosine and BM25 over the chunks, a top-k selection, and recall@k
 * against the gold sentence of each evaluation question. Neither scorer knows what a word means.
 */
import { cosine, norm } from '../../core/vec';
import { EVAL_QUESTIONS } from './corpus';
import { buildChunks, chunkWords, GOLD, holdsGold, type Chunk, type ChunkFault, type GoldSpan } from './chunker';

export type Scorer = 'tfidf' | 'bm25';
export const SCORERS: readonly Scorer[] = ['tfidf', 'bm25'];
export const SCORER_LABEL: Record<Scorer, string> = { tfidf: 'TF-IDF cosine', bm25: 'BM25' };

/** BM25's two usual defaults (from memory: verify against the original papers or a textbook). */
export const BM25_K1 = 1.2;
export const BM25_B = 0.75;

export const STOPWORDS: ReadonlySet<string> = new Set(
  ('a an the of to in on at for and or is are was were be been it its you your i my me we our us do does did how what who whom ' +
    'can will with that this as by from if so not no than then when once they them their there have has had but up out any each such which')
    .split(' '),
);

/** Lowercase words and digits, stopwords dropped. */
export const tokenise = (text: string): string[] => (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((t) => !STOPWORDS.has(t));

export interface Index {
  chunks: readonly Chunk[];
  vocab: ReadonlyMap<string, number>;
  /** Number of chunks containing each term. */
  df: readonly number[];
  /** ln(N / df) + 1 */
  idf: readonly number[];
  /** Term counts of each chunk, by vocabulary index. */
  counts: readonly ReadonlyMap<number, number>[];
  /** Content words in each chunk. */
  lengths: readonly number[];
  avgLength: number;
  /** L2-normalised TF-IDF vectors over the whole vocabulary. */
  vectors: readonly (readonly number[])[];
}

/** TF-IDF over any list of already tokenised chunks. */
export function indexTokens(chunks: readonly Chunk[], tokens: readonly (readonly string[])[]): Index {
  const vocab = new Map<string, number>();
  const counts = tokens.map((terms) => {
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
  const n = chunks.length;
  const idf = df.map((d) => Math.log(n / d) + 1);
  const vectors = counts.map((m) => {
    const v = new Array<number>(vocab.size).fill(0);
    for (const [id, tf] of m) v[id] = tf * idf[id];
    const length = norm(v);
    return length === 0 ? v : v.map((x) => x / length);
  });
  const lengths = tokens.map((t) => t.length);
  return { chunks, vocab, df, idf, counts, lengths, avgLength: lengths.reduce((a, b) => a + b, 0) / Math.max(1, n), vectors };
}

export function buildIndex(size: number, overlapPct: number, fault: ChunkFault = 'none'): Index {
  const chunks = buildChunks(size, overlapPct, fault);
  return indexTokens(chunks, chunks.map((c) => tokenise(chunkWords(c).join(' '))));
}

const memo = new Map<string, Index>();
/** `buildIndex`, remembered: the recall sweeps rebuild the same index many times. */
export function indexFor(size: number, overlapPct: number, fault: ChunkFault = 'none'): Index {
  const key = `${size}/${overlapPct}/${fault}`;
  let found = memo.get(key);
  if (!found) {
    found = buildIndex(size, overlapPct, fault);
    memo.set(key, found);
  }
  return found;
}

/** The distinct words of a question that the index has seen. */
export const queryTerms = (index: Index, question: string): string[] => [...new Set(tokenise(question))].filter((t) => index.vocab.has(t));

export function tfidfScores(index: Index, terms: readonly string[]): number[] {
  const counts = new Array<number>(index.vocab.size).fill(0);
  for (const t of terms) counts[index.vocab.get(t)!] += 1;
  const q = counts.map((tf, id) => tf * index.idf[id]);
  if (norm(q) === 0) return index.chunks.map(() => 0);
  return index.vectors.map((v) => (norm(v) === 0 ? 0 : cosine(q, v)));
}

export function bm25Scores(index: Index, terms: readonly string[], k1 = BM25_K1, b = BM25_B): number[] {
  const n = index.chunks.length;
  const unique = [...new Set(terms)];
  return index.chunks.map((_, c) => {
    let score = 0;
    for (const t of unique) {
      const id = index.vocab.get(t);
      if (id === undefined) continue;
      const tf = index.counts[c].get(id) ?? 0;
      if (tf === 0) continue;
      const idf = Math.log(1 + (n - index.df[id] + 0.5) / (index.df[id] + 0.5));
      score += (idf * tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * index.lengths[c]) / index.avgLength));
    }
    return score;
  });
}

export const scoresFor = (index: Index, scorer: Scorer, question: string): number[] => {
  const terms = queryTerms(index, question);
  return scorer === 'tfidf' ? tfidfScores(index, terms) : bm25Scores(index, terms);
};

/** The k highest positive scores by repeated selection (ties go to the earlier chunk): chunk ids, best first. */
export function topK(scores: readonly number[], k: number): number[] {
  const taken = new Set<number>();
  const out: number[] = [];
  while (out.length < k) {
    let best = -1;
    for (let i = 0; i < scores.length; i++) {
      if (taken.has(i) || !(scores[i] > 0)) continue;
      if (best < 0 || scores[i] > scores[best]) best = i;
    }
    if (best < 0) break;
    taken.add(best);
    out.push(best);
  }
  return out;
}

export type RetrievalNote = 'ok' | 'no-usable-words' | 'no-known-words';

export interface Retrieval {
  scorer: Scorer;
  index: Index;
  scores: readonly number[];
  top: readonly number[];
  note: RetrievalNote;
}

export function retrieve(index: Index, scorer: Scorer, question: string, k: number): Retrieval {
  const scores = scoresFor(index, scorer, question);
  const note: RetrievalNote = tokenise(question).length === 0 ? 'no-usable-words' : queryTerms(index, question).length === 0 ? 'no-known-words' : 'ok';
  return { scorer, index, scores, top: topK(scores, k), note };
}

/** Does any of the retrieved chunks hold the whole gold sentence? */
export const hits = (index: Index, top: readonly number[], g: GoldSpan): boolean => top.some((id) => holdsGold(index.chunks[id], g));

export interface QuestionRecall {
  id: string;
  hit: boolean;
  /** 1-based rank of the best chunk holding the gold sentence among all chunks with a positive score, or null. */
  goldRank: number | null;
}

/**
 * 1-based rank of the best chunk that holds the gold sentence among the chunks with a positive score
 * (highest score, the earlier chunk on a tie), or null when none of them scores. One pass, no sort.
 */
export function goldRank(index: Index, scores: readonly number[], g: GoldSpan): number | null {
  let best = -1;
  for (let id = 0; id < scores.length; id++) {
    if (scores[id] > 0 && holdsGold(index.chunks[id], g) && (best < 0 || scores[id] > scores[best])) best = id;
  }
  if (best < 0) return null;
  let ahead = 0;
  for (let id = 0; id < scores.length; id++) if (scores[id] > scores[best] || (scores[id] === scores[best] && id < best)) ahead++;
  return ahead + 1;
}

/** Recall@k of one pipeline setting over the eight questions. */
export function evalRecall(size: number, overlapPct: number, scorer: Scorer, k: number, fault: ChunkFault = 'none'): { recall: number; perQuestion: QuestionRecall[] } {
  const index = indexFor(size, overlapPct, fault);
  const perQuestion = GOLD.map((g) => {
    const rank = goldRank(index, scoresFor(index, scorer, g.question.text), g);
    return { id: g.question.id, hit: rank !== null && rank <= k, goldRank: rank };
  });
  return { recall: perQuestion.filter((p) => p.hit).length / perQuestion.length, perQuestion };
}

export const QUESTION_COUNT = EVAL_QUESTIONS.length;
