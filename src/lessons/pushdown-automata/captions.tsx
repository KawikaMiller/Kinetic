import type { ReactNode } from 'react';
import type { DuelResult } from './duel';
import type { CheckResult } from './learner';
import { CHECK_LENGTH } from './learner';

const word = (n: number) => (n === 0 ? 'ε' : `a^${n} b^${n}`);

/** The duel scene's caption: whether the two machines agree at this k and n, and why. */
export function duelCaption({ k, n, result, states }: { k: number; n: number; result: DuelResult; states: number }): ReactNode {
  const verdict = (accepts: boolean) => (accepts ? 'accepts' : 'rejects');
  if (n <= k) {
    return <>n = {n}, within the limit k = {k}: the DFA {verdict(result.dfaAccepts)} {word(n)} and so does the PDA. The DFA spends its {states} states counting.</>;
  }
  return (
    <>
      n = {n} is past the limit k = {k}: the DFA {verdict(result.dfaAccepts)} {word(n)} because its counter has run out, while the PDA {verdict(result.pdaAccepts)} it: the stack has no limit. {n === k + 1 ? <>This is the first n where they disagree.</> : null}
    </>
  );
}

/** The build scene's caption after a Check, or the instruction before one. */
export function buildCaption(check: CheckResult | null): ReactNode {
  if (check === null) return <>Change the table so the machine accepts a^n b^(2n) (hint: push two symbols per a), then press Check. Accepting means the input is used up and the stack is empty.</>;
  if (check.first === null) return <>All {check.checked.toLocaleString('en-US')} strings of a and b up to length {CHECK_LENGTH} agree with a^n b^(2n): your machine passes this sweep (a sweep to a length is evidence, not a proof).</>;
  const { input, inLanguage, reason } = check.first;
  return (
    <>
      First disagreement, after {check.checked.toLocaleString('en-US')} strings: <code>{input === '' ? 'ε' : input}</code> {inLanguage ? 'is' : 'is not'} in the language, and your machine says: {reason}.
    </>
  );
}
