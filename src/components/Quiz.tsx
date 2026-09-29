import { motion } from 'motion/react';
import { useState } from 'react';
import type { QuizQuestion } from '../core/types';

/** Quick-check questions. Calls onComplete once every question is answered correctly. */
export function Quiz({ questions, onComplete }: { questions: QuizQuestion[]; onComplete: () => void }) {
  const [picked, setPicked] = useState<(number | null)[]>(() => questions.map(() => null));

  const choose = (qi: number, oi: number) => {
    if (picked[qi] === questions[qi].answer) return; // already solved
    const next = picked.slice();
    next[qi] = oi;
    setPicked(next);
    if (next.every((p, i) => p === questions[i].answer)) onComplete();
  };

  const solved = picked.filter((p, i) => p === questions[i].answer).length;

  return (
    <section className="quiz">
      <header className="quiz-head">
        <h2>Quick check</h2>
        <span className="quiz-score">
          {solved}/{questions.length}
        </span>
      </header>
      <div className="quiz-list">
        {questions.map((q, qi) => {
          const p = picked[qi];
          const correct = p === q.answer;
          return (
            <div key={qi} className="quiz-q">
              <p className="quiz-prompt">{q.q}</p>
              <div className="quiz-options">
                {q.options.map((opt, oi) => {
                  const state = p === oi ? (correct ? 'right' : 'wrong') : '';
                  return (
                    <motion.button
                      key={oi}
                      type="button"
                      className={`quiz-opt ${state}`}
                      onClick={() => choose(qi, oi)}
                      disabled={correct && p !== oi}
                      animate={state === 'wrong' ? { x: [0, -6, 6, -4, 4, 0] } : state === 'right' ? { scale: [1, 1.04, 1] } : {}}
                      transition={{ duration: 0.35 }}
                    >
                      {opt}
                    </motion.button>
                  );
                })}
              </div>
              {p !== null && (
                <motion.p
                  className={`quiz-why ${correct ? 'right' : 'wrong'}`}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                >
                  {correct ? '✓ ' + q.why : 'Not quite. Try another.'}
                </motion.p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
