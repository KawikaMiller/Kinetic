import type { ReactNode } from 'react';
import { MODEL_NAME, MODEL_SHORT, explainViolation, strongestHolding, type Op, type OrderModel, type Preset, type Verdicts } from './model';
import { DESIGN_NAME, SERVICE_OPS, type Design } from './service';
import type { ServiceView } from './view';

/** "C1 W(x=1), C2 R(x)→0": the bars in a violating subset. */
const names = (ops: readonly Op[]): string => ops.map((o) => `${o.client} ${o.kind === 'write' ? `W(x=${o.value})` : `R(x)→${o.value}`}`).join(', ');

/** Scene 1: what the four checkers say about the history, and what the model in focus shows on the timeline. */
export function timelineCaption(a: { ops: readonly Op[]; verdicts: Verdicts; focus: OrderModel; viewer: string; subset: readonly Op[] | null }): ReactNode {
  if (a.ops.length === 0) return <>Press a slot on a client's row to add an operation. A write is W(x=v), a read is R(x)→v, and x starts at 0.</>;
  const strongest = strongestHolding(a.verdicts);
  const focus = a.verdicts[a.focus];
  return (
    <>
      {strongest ? <>The strongest order model this history satisfies is <span className="hl ok">{MODEL_SHORT[strongest]}</span>.</> : <span className="hl bad">No order model accepts this history.</span>}{' '}
      {focus.ok ? (
        <>
          {MODEL_NAME[a.focus]} holds: the numbers on the bars are one order{a.focus === 'causal' ? ` in ${a.viewer}'s view` : ''} that explains every read.
        </>
      ) : (
        <>
          {MODEL_NAME[a.focus]} fails. {a.subset ? explainViolation(a.focus, a.subset) : focus.message} The ringed bars ({a.subset ? names(a.subset) : 'none'}) are the smallest set that already breaks it.
        </>
      )}{' '}
      {a.verdicts.converged.message}
    </>
  );
}

/** Scene 2: where a preset history falls in the chain. */
export function relationCaption(preset: Preset, v: Verdicts): ReactNode {
  const strongest = strongestHolding(v);
  const converged = v.converged.state === 'ok' ? 'yes' : v.converged.state === 'bad' ? 'no' : 'not decided';
  return (
    <>
      <b>{preset.label}</b>:{' '}
      {strongest ? <>the strongest order model it satisfies is <span className="hl ok">{MODEL_SHORT[strongest]}</span>, so the stronger ones fail.</> : <span className="hl bad">no order model accepts it.</span>}{' '}
      Converged (the quiet reads agree): {converged}. That marker sits beside the chain because it says nothing about order.
    </>
  );
}

/** Scene 3: the recorded history of one simulated run, up to the replay time. */
export function serviceCaption(a: {
  design: Design;
  seed: number;
  t: number;
  end: number;
  answered: number;
  view: ServiceView;
  firstBreak: { model: OrderModel; at: number } | null;
}): ReactNode {
  const { view } = a;
  return (
    <>
      <b>{DESIGN_NAME[a.design]}</b>, seed {a.seed}, replayed to {a.t} of {a.end} ms: {a.answered} of {SERVICE_OPS} operations have answered.{' '}
      {view.strongest ? <>The history so far is <span className="hl ok">{MODEL_SHORT[view.strongest]}</span> at the strongest.</> : <span className="hl bad">No order model accepts the history so far.</span>}{' '}
      {view.explained && view.subset ? (
        <>
          {MODEL_NAME[view.explained]} fails: {view.why} The smallest set that breaks it: {names(view.subset)}.
        </>
      ) : null}
      {a.firstBreak ? <> The checker first rejected {MODEL_SHORT[a.firstBreak.model]} at {a.firstBreak.at} ms, when an operation answered.</> : null}
    </>
  );
}
