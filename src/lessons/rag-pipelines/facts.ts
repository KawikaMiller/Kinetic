/** The numbers the try-this entries quote, each computed from the model at the scene's opening state. */
import { runPipeline } from './pipeline';
import { evalRecall } from './retrieval';
import { ANSWER_DEFAULT, CHUNK_DEFAULT, MEASURE_DEFAULT, RETRIEVE_DEFAULT } from './settings';
import { chunkView, recallCurve, smallestFullK } from './views';
import { EVAL_QUESTIONS } from './corpus';

export const OVERLAP_FIX_PCT = 30;
export const WIDE_SIZE = 200;
export const BIG_CHUNK_SIZE = 100;
export const BIG_K = 3;

const text = (id: string) => EVAL_QUESTIONS.find((q) => q.id === id)!.text;

export function chunkFacts() {
  const d = CHUNK_DEFAULT;
  const open = chunkView(d.doc, d.size, d.overlapPct);
  const fixed = chunkView(d.doc, d.size, OVERLAP_FIX_PCT);
  const wide = chunkView(d.doc, WIDE_SIZE, OVERLAP_FIX_PCT);
  return { open, fixed, wide, question: open.question!.id.toUpperCase() };
}

export function retrieveFacts() {
  const d = RETRIEVE_DEFAULT;
  const q = text(d.question);
  const open = runPipeline(q, { ...d, overlapPct: 0, grounded: false });
  const bigger = runPipeline(q, { ...d, size: BIG_CHUNK_SIZE, k: BIG_K, overlapPct: 0, grounded: false });
  const goldRank = bigger.retrieval.top.findIndex((id) => bigger.goldHits.includes(id)) + 1;
  return { open, bigger, goldRank, goldFits: bigger.prompt.items[goldRank - 1]?.fits ?? false };
}

export function answerFacts() {
  const d = ANSWER_DEFAULT;
  const q = text(d.question);
  const base = { size: d.size, k: d.k, scorer: 'tfidf' as const, overlapPct: 0 };
  const off = runPipeline(q, { ...base, grounded: false });
  const on = runPipeline(q, { ...base, grounded: true });
  const overlap = off.answer.kind === 'answer' ? off.answer.pick.overlap : 0;
  return { off, on, overlap };
}

export function measureFacts() {
  const d = MEASURE_DEFAULT;
  const at = (scorer: 'tfidf' | 'bm25', size: number, k: number) => Math.round(evalRecall(size, d.overlapPct, scorer, k).recall * 100);
  return {
    tfidfAtBig: at('tfidf', BIG_CHUNK_SIZE, BIG_K),
    bm25AtBig: at('bm25', BIG_CHUNK_SIZE, BIG_K),
    tfidfAtDefault: at('tfidf', d.size, d.k),
    bm25AtDefault: at('bm25', d.size, d.k),
    curveAtDefaultK: recallCurve('tfidf', d.k, d.overlapPct),
    curveAtBigK: recallCurve('tfidf', BIG_K, d.overlapPct),
    kNeededAtBig: smallestFullK(BIG_CHUNK_SIZE, d.overlapPct, 'tfidf', 8),
  };
}
