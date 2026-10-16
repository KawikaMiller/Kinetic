/**
 * Retrieval by word overlap: TF-IDF cosine and BM25 over the chunks, a top-k selection, and recall@k
 * against the gold sentence of each evaluation question. Neither scorer knows what a word means; both live in
 * core/tfidf, and this file adds the lesson's chunks, tokeniser and stopword list on top.
 */
import { BM25_B, BM25_K1, bm25Scores, buildTermIndex, tfidfScores, type TermIndex } from '../../core/tfidf';
import { EVAL_QUESTIONS } from './corpus';
import { buildChunks, chunkWords, GOLD, holdsGold, type Chunk, type ChunkFault, type GoldSpan } from './chunker';

export type Scorer = 'tfidf' | 'bm25';
export const SCORERS: readonly Scorer[] = ['tfidf', 'bm25'];
export const SCORER_LABEL: Record<Scorer, string> = { tfidf: 'TF-IDF cosine', bm25: 'BM25' };

export const STOPWORDS: ReadonlySet<string> = new Set(
  ('a an the of to in on at for and or is are was were be been it its you your i my me we our us do does did how what who whom ' +
    'can will with that this as by from if so not no than then when once they them their there have has had but up out any each such which')
    .split(' '),
);

/** Lowercase words and digits, stopwords dropped. */
export const tokenise = (text: string): string[] => (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((t) => !STOPWORDS.has(t));

export interface Index extends TermIndex {
  chunks: readonly Chunk[];
}

/** TF-IDF and BM25 statistics over any list of already tokenised chunks. */
export function indexTokens(chunks: readonly Chunk[], tokens: readonly (readonly string[])[]): Index {
  return { chunks, ...buildTermIndex(tokens) };
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

export { BM25_B, BM25_K1, bm25Scores, tfidfScores };

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
