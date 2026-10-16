/** One whole pass of the pipeline for a question: chunk, retrieve, assemble, answer. */
import { GOLD, type GoldSpan } from './chunker';
import { EVAL_QUESTIONS } from './corpus';
import { answer, assemble, contextOf, verdict, type Answer, type Prompt, type Verdict } from './generate';
import { holdsGold } from './chunker';
import { indexFor, retrieve, type Retrieval, type Scorer } from './retrieval';

export interface PipelineSettings {
  size: number;
  overlapPct: number;
  scorer: Scorer;
  k: number;
  grounded: boolean;
}

export interface PipelineRun {
  retrieval: Retrieval;
  prompt: Prompt;
  answer: Answer;
  gold: GoldSpan | null;
  /** Retrieved chunk ids that hold the gold sentence, in rank order. */
  goldHits: number[];
  verdict: Verdict | null;
}

export const goldFor = (question: string): GoldSpan | null => {
  const q = EVAL_QUESTIONS.find((e) => e.text === question);
  return q ? (GOLD.find((g) => g.question.id === q.id) ?? null) : null;
};

export function runPipeline(question: string, s: PipelineSettings): PipelineRun {
  const index = indexFor(s.size, s.overlapPct);
  const retrieval = retrieve(index, s.scorer, question, s.k);
  const prompt = assemble(retrieval.top.map((id) => index.chunks[id]), question);
  const a = answer(contextOf(prompt), question, s.grounded);
  const gold = goldFor(question);
  const goldHits = gold ? retrieval.top.filter((id) => holdsGold(index.chunks[id], gold)) : [];
  return { retrieval, prompt, answer: a, gold, goldHits, verdict: gold ? verdict(a, gold) : null };
}
