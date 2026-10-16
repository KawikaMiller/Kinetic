import type { ReactNode } from 'react';
import { plural } from '../../core/format';
import { STEP_BUDGET, type WhichAnswer } from './engines';
import type { WhichRule } from './opening';

const quote = (s: string) => <code>{s || '(empty)'}</code>;

/** The caption of the which-match scene, built from the two answers and the rule in use. */
export function whichCaption(pattern: string, subject: string, answer: WhichAnswer, rule: WhichRule): ReactNode {
  if (answer.firstExhausted) {
    const longest = answer.longest ? subject.slice(answer.longest.start, answer.longest.end) : null;
    return (
      <>
        {quote(pattern)} on {quote(subject)}: the backtracking matcher did not finish within {STEP_BUDGET.toLocaleString('en-US')} steps, so leftmost-first has no answer here.{' '}
        {longest === null ? <>The NFA finds no match.</> : <>The NFA, which does not backtrack, allows {plural(answer.ends.length, 'end')} ({answer.ends.join(', ')}) and longest returns {quote(longest)}.</>}
      </>
    );
  }
  if (!answer.first && !answer.longest) return <>No match: {quote(pattern)} matches nothing in {quote(subject)}, so both rules agree there is no answer.</>;
  const text = (span: { start: number; end: number } | null) => (span ? subject.slice(span.start, span.end) : null);
  const first = text(answer.first);
  const longest = text(answer.longest);
  const same = first === longest && answer.first?.start === answer.longest?.start;
  return (
    <>
      {quote(pattern)} on {quote(subject)}: the NFA allows {plural(answer.ends.length, 'end')} ({answer.ends.join(', ')}). Leftmost-first returns {first === null ? 'no match' : quote(first)}, longest returns {longest === null ? 'no match' : quote(longest)}.{' '}
      {same ? <>Here the two rules agree.</> : <>They differ, and the rule in use is {rule === 'first' ? 'leftmost-first' : 'longest'}.</>}
    </>
  );
}
