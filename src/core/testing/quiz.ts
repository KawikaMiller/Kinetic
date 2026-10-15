import type { QuizQuestion } from '../types';

/** How many questions have a correct option strictly longer than every distractor (AC-0/T2 rule 6: at most half). */
export const correctStrictlyLongest = (quiz: readonly QuizQuestion[]): number =>
  quiz.filter((q) => q.options.every((o, i) => i === q.answer || o.length < q.options[q.answer].length)).length;
