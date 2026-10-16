/** Captions: every number from the model on screen. Plain strings, so tests can read them. */
import { plural } from '../../core/format';
import { PREPARED } from './chunker';
import { CONTEXT_BUDGET_WORDS, GROUNDING_THRESHOLD, type Verdict } from './generate';
import type { PipelineRun } from './pipeline';
import { SCORER_LABEL, type Scorer } from './retrieval';
import { fullPhrase, type ChunkView, type RecallCurve } from './views';

export const cos = (v: number) => v.toFixed(3);

export function chunkCaption(v: ChunkView, size: number, overlapPct: number): string {
  const words = PREPARED[v.docIndex].words.length;
  const head = `This page has ${words} words, cut into ${plural(v.chunks.length, 'chunk')} of up to ${size} words with ${overlapPct}% overlap.`;
  if (!v.gold || !v.question) return `${head} No evaluation question points at this page, so there is no gold sentence to check.`;
  const q = v.question.id.toUpperCase();
  if (v.inside) return `${head} The gold sentence for ${q} sits whole inside one chunk, and that chunk scores ${cos(v.cosine ?? 0)} against the question.`;
  return `${head} The gold sentence for ${q} is split across ${v.touching} chunks, so no chunk holds it whole and retrieval cannot return it.`;
}

export function retrieveCaption(run: PipelineRun, k: number, scorer: Scorer, custom: boolean): string {
  const r = run.retrieval;
  if (r.note === 'no-usable-words') return 'No usable words in the question (only stopwords), so nothing is retrieved and the prompt has no sources.';
  if (r.note === 'no-known-words') return 'None of the question\'s words appear in the documents, so every chunk scores zero and nothing is retrieved.';
  const used = `The prompt uses ${run.prompt.used} of the ${CONTEXT_BUDGET_WORDS}-word budget${run.prompt.cut > 0 ? ` and cuts ${plural(run.prompt.cut, 'chunk')}` : ''}.`;
  const head = `${SCORER_LABEL[scorer]} returned ${plural(r.top.length, 'chunk')} for top-${k}.`;
  if (custom || !run.gold) return `${head} A typed question has no gold sentence, so the list is not marked right or wrong. ${used}`;
  if (run.goldHits.length === 0) return `${head} None of them holds the gold sentence, so the model would only see the wrong pages. ${used}`;
  const rank = r.top.indexOf(run.goldHits[0]) + 1;
  const item = run.prompt.items[rank - 1];
  return `${head} The gold sentence is in the chunk ranked ${rank}${item.fits ? ', and it fits in the prompt' : ', but that chunk is cut from the prompt for lack of room'}. ${used}`;
}

const VERDICT_TEXT: Record<Verdict, string> = {
  correct: 'the gold sentence, so the answer is right',
  wrong: 'a sentence that is not the whole gold sentence: a confident wrong answer',
  abstained: 'nothing: the rule abstained, which is a different failure from a wrong answer',
  nothing: 'nothing: there was no context',
};

export function answerCaption(run: PipelineRun, grounded: boolean): string {
  const a = run.answer;
  const share = a.kind === 'answer' ? a.pick.overlap : a.kind === 'abstain' ? a.best.overlap : 0;
  const rule = `Stand-in rule: the best sentence shares ${Math.round(share * 100)}% of the question's words${grounded ? `, and with the grounding instruction on it abstains below ${Math.round(GROUNDING_THRESHOLD * 100)}%` : ', and with the instruction off it answers anyway'}.`;
  const outcome = run.verdict ? ` It produced ${VERDICT_TEXT[run.verdict]}.` : '';
  const retrieval = run.gold ? (run.goldHits.length > 0 ? ' Retrieval did hand it the gold chunk.' : ' Retrieval missed the gold chunk, and the generator cannot recover what it was never given.') : '';
  return `${rule}${outcome}${retrieval}`;
}

export function measureCaption(tfidf: RecallCurve, bm25: RecallCurve, size: number, k: number, overlapPct: number, atSize: { tfidf: number; bm25: number }): string {
  return `Recall@${k} with ${overlapPct}% overlap, computed by running the whole pipeline at each size. At ${size} words: TF-IDF ${atSize.tfidf}%, BM25 ${atSize.bm25}%. 100% is reached ${fullPhrase(tfidf)} (TF-IDF) and ${fullPhrase(bm25)} (BM25). One question is 12.5 points of recall here, so a 100% at a size or two is noise, not a setting to trust.`;
}

/** The two weightings the Retrieve scene states on screen; retrieval.ts uses exactly these. */
export const IDF_NOTE = {
  tfidf: 'idf = ln(N / df) + 1',
  bm25: 'idf = ln(1 + (N - df + 0.5) / (df + 0.5))',
} as const;
