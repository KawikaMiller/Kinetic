import { shuffle } from './random';
import type { QuizQuestion } from './types';

/**
 * A copy of `q` with its options in a random order and `answer` pointing at the
 * same option. Lessons author the right answer wherever it reads naturally (often
 * second), so showing them unshuffled lets "always pick B" pass a lesson.
 */
export function shuffleOptions(q: QuizQuestion, rnd: () => number = Math.random): QuizQuestion {
  const order = shuffle(
    q.options.map((_, i) => i),
    rnd,
  );
  return { ...q, options: order.map((i) => q.options[i]), answer: order.indexOf(q.answer) };
}
