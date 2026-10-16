import type { ReactNode } from 'react';
import { plural } from '../../core/format';
import { staticCount } from './ir';
import { firstRoundChanges, type LoopView, type PassView } from './model';
import { PASS_SHORT, type LoopOptions } from './passes';

/** The sentence under the stage: what each pass did in round 1, and what the order cost or saved. Built from the run. */
export function passCaption(v: PassView, input: number): ReactNode {
  if (v.active.length === 0) return <>Nothing enabled: the program comes back unchanged, {staticCount(v.before)} instructions.</>;
  const first = firstRoundChanges(v);
  const steps = v.active.map((p) => `${PASS_SHORT[p]} ${first[p] ?? 0}`).join(', ');
  const foldAt = v.active.indexOf('fold');
  const propagateAt = v.active.indexOf('propagate');
  const early =
    foldAt >= 0 && propagateAt > foldAt && (first.fold ?? 0) === 0
      ? ' Fold ran before propagate, and none of P1\'s operations has two literal operands until propagation puts them there.'
      : '';
  const rounds = v.pipeline.rounds.length > 1 ? ` The fixed point took ${plural(v.pipeline.changedRounds, 'round')} that changed something.` : '';
  return (
    <>
      Changes in round 1: {steps}.{early}{rounds} The program went from {staticCount(v.before)} to {staticCount(v.after)} instructions; on a = {input} it executes {v.beforeRun.executed} then {v.afterRun.executed} and returns {v.afterRun.value}.
    </>
  );
}

/** The caption: which steps are on, what they did, and what the interpreter counted. Built from the run. */
export function loopCaption(v: LoopView, options: LoopOptions, resultUsed: boolean, n: number): ReactNode {
  const on = (Object.keys(options) as (keyof LoopOptions)[]).filter((k) => options[k]);
  const loopGone = v.after.blocks.length < v.before.blocks.length;
  const counted = (
    <>
      For n = {n.toLocaleString('en-US')} the interpreter counts {v.beforeRun.executed.toLocaleString('en-US')} instructions before and {v.afterRun.executed.toLocaleString('en-US')} after: {v.perIterationBefore} then {v.perIterationAfter} per iteration, and {v.zeroTripBefore} then {v.zeroTripAfter} when the loop runs zero times.
    </>
  );
  if (!resultUsed && loopGone) return <>The benchmark ignores its result, so nothing the loop computes is read, and the whole loop is gone. {counted}</>;
  if (v.blocker) return <>Loop removal refused: {v.blocker}. {counted}</>;
  if (on.length === 0) return <>No steps switched on: the program is as written. {counted}</>;
  return <>{counted}</>;
}
