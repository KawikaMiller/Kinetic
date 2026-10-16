import type { ReactNode } from 'react';
import { DEFENCES, POINTERS, asWritten, assumingNoOverflow, defenceOutcome, rangeOf, withCheck, wrap, type DefenceId, type IntType } from './ub';

const num = (v: number) => v.toLocaleString('en-US');
const typeName = (t: IntType) => `${t.signed ? 'signed' : 'unsigned'} ${t.width}-bit`;
const MAX = rangeOf({ width: 32, signed: true }).max;

/** What the learner reads for each step of the legality argument. Built from the type's own maximum. */
export function stepText(step: number, t: IntType): string {
  const max = num(rangeOf(t).max);
  return [
    'The standard makes signed overflow undefined: it assigns the behaviour no meaning at all.',
    'So a conforming program never overflows: every execution that counts avoids it.',
    `So x is never ${max}, the largest ${typeName(t)} value, in an execution that counts, and x + 1 is greater than x.`,
    'So the comparison x + 1 < x is false, and the function may be rewritten as return 0.',
  ][step - 1];
}

export function overflowCaption(t: IntType, x: number, note: string | null): ReactNode {
  const written = asWritten(x, t);
  const assumed = assumingNoOverflow(x, t);
  const max = rangeOf(t).max;
  return (
    <>
      {note ? <>{note} </> : null}
      {t.signed ? (
        x === max ? (
          <>At the {typeName(t)} maximum {num(x)}, x + 1 wraps to {num(wrap(x + 1, t))}: as written the function returns {written}, while the rewritten one returns {assumed}. This input is outside the contract, so the standard allows both.</>
        ) : (
          <>For x = {num(x)} nothing overflows, so both versions return {written}. They differ only at {num(max)}.</>
        )
      ) : (
        <>Unsigned wrap-around is defined, so the rewrite is not applied: both versions return {written} for x = {num(x)}, even at the maximum {num(max)}.</>
      )}
    </>
  );
}


export function nullCaption(address: number): ReactNode {
  const label = POINTERS.find((p) => p.address === address)?.label ?? String(address);
  if (address === 0) {
    return <>With p = NULL, the load <code>*p</code> is undefined, so the standard promises nothing about the whole execution. Three outcomes it allows are listed below as examples; the model does not simulate memory.</>;
  }
  return <>With p = {label} the check is false anyway, so both versions return {withCheck(address)}. The rewrite removed a check that could only matter after the load had already assumed p was not null.</>;
}


export function classifyCaption(state: { sorted: number; checked: boolean; correct: number }, total: number): ReactNode {
  if (state.checked) return <>{state.correct} of {total} sorted correctly. Press "Why?" on any row for the reason, and the clause it comes from.</>;
  return <>Sort each snippet into one of four categories, then press Check. {state.sorted} of {total} sorted so far.</>;
}


export function defenceCaption(id: DefenceId): ReactNode {
  const o = defenceOutcome(id, MAX);
  const label = DEFENCES.find((d) => d.id === id)?.label ?? id;
  return (
    <>
      {label} on x = {num(MAX)}: {o.outcome}. {o.status === 'defined' ? 'The silent bug now has a defined result.' : o.status === 'visible' ? 'The bug is still undefined behaviour, but it is no longer silent.' : 'The silent bug stays silent.'} Undefined behaviour belongs to an execution, not to a line of text, and an optimiser may use it even before the line that triggers it (shown as a possibility, not tested here).
    </>
  );
}
