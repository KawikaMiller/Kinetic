import type { ReactNode } from 'react';
import { plural } from '../../core/format';
import { alphaEqual } from './debruijn';
import { MAX_SIZE, redexPaths, stepAt, type Run, type RunEnd, type Step, type Strategy } from './reduce';
import type { Note } from './useStepper';
import { print, type Term } from './term';

const STRATEGY_WORD: Record<Strategy, string> = { normal: 'Normal', applicative: 'Applicative' };
const SIZE_LIMIT = MAX_SIZE.toLocaleString('en-US');

/** What a stopped reduction showed, in words that claim only what the run established. */
export function endText(end: RunEnd, o: { steps: number; budget?: number; strategy: Strategy }): string {
  const order = `${STRATEGY_WORD[o.strategy]} order`;
  if (end.kind === 'normal') return o.steps === 0 ? 'This term is already in normal form: it has no redex.' : `Normal form after ${plural(o.steps, 'step')}: no redex is left.`;
  if (end.kind === 'budget') return `${order} did not reach a normal form within ${o.budget ?? o.steps} steps. That is a stop, not a verdict about later steps.`;
  if (end.kind === 'too-big') return `${order} stopped: the term grew past ${SIZE_LIMIT} nodes (${end.size}).`;
  return `The term after step ${end.at} is the term after step ${end.first}, so ${order.toLowerCase()} repeats here (certified: the terms are alpha-equal).`;
}

/** One step, said from the step: what was replaced, what was renamed, what was captured. */
export function stepText(s: Step, index: number): ReactNode {
  const places = s.replaced.length;
  const wrong = s.mode === 'naive' && s.captured;
  const correct = wrong ? stepAt(s.before, s.redex, 'safe') : null;
  return (
    <>
      Step {index}: reduced the redex, replacing <b>{s.binder}</b> by <span className="hl info wrap">{print(s.argument)}</span>{' '}
      {places === 0 ? `(${s.binder} does not occur in the body, so the argument is dropped)` : `at ${plural(places, 'place')}`}.
      {s.renames.map((r) => (
        <span key={r.to}> <span className="hl orange wrap">α-rename {r.from} → {r.to}</span> first: the free {r.from} in the argument would be captured by the binder λ{r.from}.</span>
      ))}
      {wrong && (
        <>
          {' '}
          <span className="hl bad wrap">Captured: a free variable of the argument is now bound</span>, so the result is wrong
          {correct && !alphaEqual(correct.after, s.after) ? <>: the correct result is {print(correct.after)}.</> : '.'}
        </>
      )}
    </>
  );
}

export function stepperCaption(o: { terms: readonly Term[]; current: Term; last: Step | null; note: Note | null }): ReactNode {
  const { note, last } = o;
  if (note?.kind === 'not-redex') return <>That node is not a redex: a redex is an abstraction applied to an argument. Click one that is underlined.</>;
  if (note?.kind === 'ended') {
    return (
      <>
        {last && <>{stepText(last, o.terms.length - 1)} </>}
        {endText(note.end, { steps: o.terms.length - 1, budget: note.budget, strategy: note.strategy })}
      </>
    );
  }
  if (last) {
    const left = redexPaths(o.current).length;
    return <>{stepText(last, o.terms.length - 1)} {left === 0 ? 'No redex is left: this is a normal form.' : `${plural(left, 'redex')} left.`}</>;
  }
  const n = redexPaths(o.current).length;
  return n === 0
    ? <>This term has no redex, so it is already in normal form.</>
    : <>{plural(n, 'redex')} in this term. Click one in the tree or the list, or step with a strategy.</>;
}

/** Scene 4: one strategy's outcome on one term. */
export function runText(r: Run, strategy: Strategy, budget: number): string {
  return endText(r.end, { steps: r.terms.length - 1, budget, strategy });
}
