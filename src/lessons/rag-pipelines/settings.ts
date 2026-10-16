/** Opening states of the four scenes (pure data, tested against the try-this entries). */
import type { Scorer } from './retrieval';

export const SCENES = ['chunk', 'retrieve', 'answer', 'measure'] as const;
export type SceneId = (typeof SCENES)[number];

export const CHUNK_DEFAULT = { doc: 'r3', size: 40, overlapPct: 0 } as const;
export const RETRIEVE_DEFAULT = { question: 'q1', size: 60, scorer: 'tfidf' as Scorer, k: 2 } as const;
export const ANSWER_DEFAULT = { question: 'q1', size: 60, k: 2, grounded: false } as const;
export const MEASURE_DEFAULT = { size: 60, k: 2, overlapPct: 0 } as const;

/** The answer scene retrieves with TF-IDF and no overlap; neither is a control there. */
export const ANSWER_SCORER: Scorer = 'tfidf';
export const ANSWER_OVERLAP_PCT = 0;
/** The retrieve scene has no overlap control. */
export const RETRIEVE_OVERLAP_PCT = 0;

export const MAX_QUESTION_CHARS = 120;
export const K_MIN = 1;
export const K_MAX = 8;
