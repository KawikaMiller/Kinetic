/**
 * Prompt assembly and the scripted stand-in answerer. The answerer is a documented rule, not a
 * language model: it returns the context sentence that shares the most question words, and (with the
 * grounding instruction on) abstains when that share is below a threshold.
 */
import { PREPARED, chunkLength, type Chunk, type GoldSpan } from './chunker';
import { tokenise } from './retrieval';

/** Words in the fixed instruction at the top of the prompt. */
export const SYSTEM_PROMPT = 'Answer the question using only the sources below, and cite the source. If the sources do not contain the answer, say so.';
export const SYSTEM_WORDS = SYSTEM_PROMPT.split(' ').length;
/** Illustrative: a real model's window is measured in tokens and differs by model. */
export const CONTEXT_BUDGET_WORDS = 300;
/** The share of the question's words a sentence must contain before the grounded stand-in answers. */
export const GROUNDING_THRESHOLD = 0.3;

export interface PromptItem {
  chunk: Chunk;
  words: number;
  fits: boolean;
}

export interface Prompt {
  systemWords: number;
  questionWords: number;
  items: PromptItem[];
  /** Words in the prompt that was actually sent: system, the chunks that fit, the question. */
  used: number;
  budget: number;
  cut: number;
}

/** Chunks join in rank order while they fit; the first that would overflow and every later one are cut. */
export function assemble(chunks: readonly Chunk[], question: string, budget = CONTEXT_BUDGET_WORDS): Prompt {
  const questionWords = question.trim().split(/\s+/).filter(Boolean).length;
  let used = SYSTEM_WORDS + questionWords;
  let open = true;
  const items = chunks.map((chunk) => {
    const words = chunkLength(chunk);
    open = open && used + words <= budget;
    if (open) used += words;
    return { chunk, words, fits: open };
  });
  return { systemWords: SYSTEM_WORDS, questionWords, items, used, budget, cut: items.filter((i) => !i.fits).length };
}

export interface Candidate {
  chunk: Chunk;
  start: number;
  end: number;
  text: string;
  /** Share of the question's distinct content words that the sentence contains. */
  overlap: number;
  /** The sentence was clipped by the chunk's edge. */
  clipped: boolean;
}

/** Every sentence (clipped to its chunk) in the context, in rank then reading order. */
export function candidates(context: readonly Chunk[], question: string): Candidate[] {
  const q = [...new Set(tokenise(question))];
  return context.flatMap((chunk) => {
    const p = PREPARED[chunk.docIndex];
    return p.sentenceSpans
      .filter(([s, e]) => s < chunk.end && e > chunk.start)
      .map(([s, e]) => {
        const start = Math.max(s, chunk.start);
        const end = Math.min(e, chunk.end);
        const text = p.words.slice(start, end).join(' ');
        const have = new Set(tokenise(text));
        return { chunk, start, end, text, overlap: q.length === 0 ? 0 : q.filter((t) => have.has(t)).length / q.length, clipped: start !== s || end !== e };
      });
  });
}

export type Answer =
  | { kind: 'none'; reason: 'empty context' }
  | { kind: 'abstain'; best: Candidate }
  | { kind: 'answer'; pick: Candidate };

export function answer(context: readonly Chunk[], question: string, grounded: boolean): Answer {
  const all = candidates(context, question);
  if (all.length === 0) return { kind: 'none', reason: 'empty context' };
  let best = all[0];
  for (const c of all) if (c.overlap > best.overlap) best = c;
  return grounded && best.overlap < GROUNDING_THRESHOLD ? { kind: 'abstain', best } : { kind: 'answer', pick: best };
}

export type Verdict = 'correct' | 'wrong' | 'abstained' | 'nothing';

/** Judged against the gold sentence: a clipped or different sentence is wrong, and abstaining is its own outcome. */
export function verdict(a: Answer, gold: GoldSpan): Verdict {
  if (a.kind === 'none') return 'nothing';
  if (a.kind === 'abstain') return 'abstained';
  const { pick } = a;
  return pick.chunk.docIndex === gold.docIndex && pick.start === gold.start && pick.end === gold.end ? 'correct' : 'wrong';
}

/** The chunks of a prompt that fit in it. */
export const contextOf = (prompt: Prompt): Chunk[] => prompt.items.filter((i) => i.fits).map((i) => i.chunk);
