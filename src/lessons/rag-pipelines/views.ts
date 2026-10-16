/** What scenes 1 and 4 show, as pure functions of their controls. */
import { EVAL_QUESTIONS, type EvalQuestion } from './corpus';
import { GOLD, PREPARED, SIZE_MAX, SIZE_MIN, SIZE_STEP, chunkLength, docIndexOf, holdsGold, touching, type Chunk, type GoldSpan } from './chunker';
import { evalRecall, indexFor, scoresFor, type Scorer } from './retrieval';

export interface ChunkView {
  docIndex: number;
  /** Chunks of this document only. */
  chunks: Chunk[];
  question: EvalQuestion | null;
  gold: GoldSpan | null;
  /** Chunks that touch the gold sentence (2 or more means it is split). */
  touching: number;
  /** One chunk holds the whole gold sentence. */
  inside: boolean;
  /** TF-IDF cosine of the question with the best chunk that holds the gold sentence, over the whole corpus's index. */
  cosine: number | null;
  /** Words in the longest chunk. */
  longest: number;
}

export function chunkView(docId: string, size: number, overlapPct: number): ChunkView {
  const docIndex = docIndexOf(docId);
  const index = indexFor(size, overlapPct);
  const chunks = index.chunks.filter((c) => c.docIndex === docIndex);
  const question = EVAL_QUESTIONS.find((q) => q.doc === docId) ?? null;
  const gold = question ? (GOLD.find((g) => g.question.id === question.id) ?? null) : null;
  const holding = gold ? chunks.filter((c) => holdsGold(c, gold)) : [];
  const scores = question ? scoresFor(index, 'tfidf', question.text) : [];
  return {
    docIndex,
    chunks,
    question,
    gold,
    touching: gold ? touching(chunks, gold).length : 0,
    inside: holding.length > 0,
    cosine: holding.length > 0 ? Math.max(...holding.map((c) => scores[c.id])) : null,
    longest: Math.max(...chunks.map(chunkLength)),
  };
}

/** Chunk sizes on the recall plot's x axis. */
export const SWEEP_SIZES: readonly number[] = Array.from({ length: (SIZE_MAX - SIZE_MIN) / SIZE_STEP + 1 }, (_, i) => SIZE_MIN + i * SIZE_STEP);

export interface RecallCurve {
  scorer: Scorer;
  /** Recall@k in percent at each of SWEEP_SIZES. */
  percent: number[];
  /** Smallest swept size with 100% recall, or null. */
  firstFull: number | null;
}

export function recallCurve(scorer: Scorer, k: number, overlapPct: number): RecallCurve {
  const percent = SWEEP_SIZES.map((s) => Math.round(evalRecall(s, overlapPct, scorer, k).recall * 100));
  const at = percent.findIndex((p) => p === 100);
  return { scorer, percent, firstFull: at < 0 ? null : SWEEP_SIZES[at] };
}

/** Smallest k (1 to `max`) at which a setting reaches 100% recall, or null. */
export function smallestFullK(size: number, overlapPct: number, scorer: Scorer, max: number): number | null {
  for (let k = 1; k <= max; k++) if (evalRecall(size, overlapPct, scorer, k).recall === 1) return k;
  return null;
}

export const DOC_COUNT = PREPARED.length;

/** Shortest and longest page, in words (the on-screen range comes from here). */
export const WORD_RANGE: readonly [number, number] = [Math.min(...PREPARED.map((p) => p.words.length)), Math.max(...PREPARED.map((p) => p.words.length))];
