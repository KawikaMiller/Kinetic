import type { ReactNode } from 'react';
import { plural } from '../../core/format';
import { COPIES, STRATEGY_LABEL, countStatus, stateOf, type Scenario } from './copies';
import type { View } from './kanon';
import { EXPOSURE_TEXT, FIELDS, FIELD_ORDER, exposure, stillIdentifying, type FieldId, type Recovery, type Treatment } from './logline';
import { BUDGET, MIN_EPSILON, TRUE_COUNT, mean, noiseScale, type Answers } from './noise';

export const num = (v: number) => v.toLocaleString('en-US');

export function recordsCaption(s: Scenario): ReactNode {
  const states = stateOf(s);
  const readable = states.filter((x) => x.status === 'readable').map((x) => x.copy.label.toLowerCase());
  const present = states.length - countStatus(states, 'absent');
  return (
    <>
      Day {s.day}, {STRATEGY_LABEL[s.strategy].toLowerCase()}: {readable.length} of {present} copies still hold readable data
      {readable.length ? ` (${readable.join(', ')})` : ''}; {countStatus(states, 'deleted')} deleted, {countStatus(states, 'unreadable')} unreadable, {countStatus(states, 'held')} kept under a legal hold.
      {s.minimise ? ` Minimisation means ${COPIES.length - present} copies were never made.` : ''}
      {s.legalHold && s.strategy === 'shred' ? ' The hold keeps the key, so the keyed copies stay readable too.' : ''}
    </>
  );
}

export function kanonCaption(v: View): ReactNode {
  const r = v.readouts;
  if (r.k === null) return <>Every row is suppressed, so there is no table left to attack: the information loss is {Math.round(v.loss * 100)}%.</>;
  return (
    <>
      k = {r.k}, l = {r.l}, {plural(r.unique, 'unique row')}, information loss {Math.round(v.loss * 100)}%. A join with the invented public list ties {plural(v.linkedNow, 'row')} to one named person, against {v.linkedExact} before anything was generalised.
      {v.leak ? <> The group {v.leak.key.replaceAll('|', ', ')} has {v.leak.members.length} people who all have condition {v.leak.members[0].condition}: k is {r.k}, yet that value leaks (l = {r.l}).</> : null}
    </>
  );
}

export function noiseCaption(epsilon: number, a: Answers): ReactNode {
  const scale = noiseScale(epsilon);
  if (a.values.length === 0) {
    return (
      <>
        The true count is {TRUE_COUNT}. At epsilon {epsilon.toFixed(1)} each answer carries Laplace noise of scale {scale.toFixed(1)}. Ask a question; each one spends {epsilon.toFixed(1)} of a budget of {BUDGET}.
      </>
    );
  }
  const m = mean(a.values);
  return (
    <>
      {plural(a.values.length, 'answer')} so far, spending {a.spent.toFixed(1)} of {BUDGET}: their mean is {m.toFixed(1)}, {Math.abs(m - TRUE_COUNT).toFixed(1)} from the true {TRUE_COUNT}.
      {a.exhausted ? ' The budget is spent: the next question is refused.' : ''} The smallest epsilon is {MIN_EPSILON} so the noise stays finite.
    </>
  );
}

export function logsCaption(choice: Record<FieldId, Treatment>, recovery: Recovery | null): ReactNode {
  const still = stillIdentifying(choice);
  const linkable = FIELD_ORDER.filter((f) => exposure(f, choice[f]) === 'linkable');
  return (
    <>
      {still.length === 0 ? 'No field points at a person on its own.' : `${plural(still.length, 'field')} still point${still.length === 1 ? 's' : ''} at a person: ${still.map((f) => FIELDS[f].label).join(', ')}.`}
      {linkable.length ? ` ${linkable.map((f) => FIELDS[f].label).join(', ')} stay linkable: ${EXPOSURE_TEXT.linkable}.` : ''}
      {recovery === null ? '' : recovery.recovered ? ` Trying five addresses against the hashed email reproduces it: it was ${recovery.recovered}.` : ' None of the five addresses reproduces the logged email value.'}
    </>
  );
}
