/**
 * The chunker and the corpus as words. A chunk is a window of `size` words; consecutive windows
 * overlap by `overlapPct` percent of the size. Word counts stand in for tokens throughout the lesson.
 */
import { DOCS, EVAL_QUESTIONS, type Doc, type EvalQuestion } from './corpus';

export const SIZE_MIN = 20;
export const SIZE_MAX = 200;
export const SIZE_STEP = 10;
export const OVERLAP_MAX_PCT = 50;
export const OVERLAP_STEP_PCT = 10;

export interface PreparedDoc {
  doc: Doc;
  words: readonly string[];
  /** [start, end) word indices of each sentence. */
  sentenceSpans: readonly (readonly [number, number])[];
}

export interface Chunk {
  /** Position in the whole chunk list. */
  id: number;
  /** Index into PREPARED. */
  docIndex: number;
  start: number;
  end: number;
}

/** A deliberately wrong chunker for the broken-variant test: every chunk loses its last word. */
export type ChunkFault = 'none' | 'dropLastWord';

export const prepareDoc = (doc: Doc): PreparedDoc => {
  const words: string[] = [];
  const sentenceSpans: [number, number][] = [];
  for (const sentence of doc.sentences) {
    const parts = sentence.split(' ');
    sentenceSpans.push([words.length, words.length + parts.length]);
    words.push(...parts);
  }
  return { doc, words, sentenceSpans };
};

export const PREPARED: readonly PreparedDoc[] = DOCS.map(prepareDoc);

export const docIndexOf = (id: string): number => PREPARED.findIndex((p) => p.doc.id === id);

/** Words shared by two consecutive full-size chunks. */
export const overlapWords = (size: number, overlapPct: number): number => Math.round((size * overlapPct) / 100);

/** [start, end) windows over `wordCount` words. */
export function chunkSpans(wordCount: number, size: number, overlapPct: number, fault: ChunkFault = 'none'): [number, number][] {
  if (!(size >= 1)) throw new RangeError('size must be at least 1');
  if (!(overlapPct >= 0 && overlapPct <= OVERLAP_MAX_PCT)) throw new RangeError(`overlap must be 0 to ${OVERLAP_MAX_PCT}%`);
  const step = size - overlapWords(size, overlapPct);
  const spans: [number, number][] = [];
  for (let start = 0; start < wordCount; start += step) {
    const end = Math.min(start + size, wordCount);
    spans.push([start, fault === 'dropLastWord' ? end - 1 : end]);
    if (end === wordCount) break;
  }
  return spans;
}

/** Every chunk of the corpus, document by document. */
export function buildChunks(size: number, overlapPct: number, fault: ChunkFault = 'none'): Chunk[] {
  const chunks: Chunk[] = [];
  PREPARED.forEach((p, docIndex) => {
    for (const [start, end] of chunkSpans(p.words.length, size, overlapPct, fault)) chunks.push({ id: chunks.length, docIndex, start, end });
  });
  return chunks;
}

export const chunkWords = (c: Chunk): readonly string[] => PREPARED[c.docIndex].words.slice(c.start, c.end);
export const chunkText = (c: Chunk): string => chunkWords(c).join(' ');
export const chunkLength = (c: Chunk): number => c.end - c.start;

export interface GoldSpan {
  question: EvalQuestion;
  docIndex: number;
  start: number;
  end: number;
}

export const goldSpan = (q: EvalQuestion): GoldSpan => {
  const docIndex = docIndexOf(q.doc);
  const [start, end] = PREPARED[docIndex].sentenceSpans[q.sentence];
  return { question: q, docIndex, start, end };
};

export const GOLD: readonly GoldSpan[] = EVAL_QUESTIONS.map(goldSpan);

/** Whole gold sentence inside this one chunk. */
export const holdsGold = (c: Chunk, g: GoldSpan): boolean => c.docIndex === g.docIndex && c.start <= g.start && c.end >= g.end;

/** Chunks of the gold document that touch the gold sentence. */
export const touching = (chunks: readonly Chunk[], g: GoldSpan): Chunk[] =>
  chunks.filter((c) => c.docIndex === g.docIndex && c.start < g.end && c.end > g.start);
