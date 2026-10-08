import type { ReactNode } from 'react';
import { isMultiFactor, kindsOf, KIND_LABEL, PATHS, STRENGTH_LABEL, weakestOf } from './factors';
import { skewVerdict, STEP_SECONDS } from './totp';

/** The caption for the clock-skew slider, from the skew itself. */
export function skewAdvice(skew: number): ReactNode {
  const shown = `${skew > 0 ? '+' : ''}${skew} s`;
  switch (skewVerdict(skew)) {
    case 'always':
      return skew === 0
        ? <>Phone and server agree on the time, so they compute the same code from the same counter.</>
        : <>The phone is {shown} off, within one {STEP_SECONDS}-second step, so its counter is at most one away from the server&apos;s: <span className="hl ok">always accepted</span>.</>;
    case 'sometimes':
      return <>The phone is {shown} off, a bit more than one step. Whether the counters end up one or two apart depends on where in the 30 seconds you are: <span className="hl orange">sometimes accepted</span>.</>;
    default:
      return <>The phone is {shown} off, two whole steps or more, so its counter is at least two away from the server&apos;s and the code is <span className="hl bad">refused</span>.</>;
  }
}

export function factorsCaption(ids: readonly string[]): ReactNode {
  if (!ids.length) return <>Pick the ways you sign in. Two of the same kind are not two factors.</>;
  const kinds = kindsOf(ids).map((k) => KIND_LABEL[k].toLowerCase());
  return isMultiFactor(ids)
    ? <><span className="hl ok">Multi-factor</span>: {kinds.join(' and ')} are different kinds, so stealing one does not give the other.</>
    : <><span className="hl bad">Not multi-factor</span>: everything here is something you {kinds[0]}, so one leak of that kind opens all of it.</>;
}

export function pathsCaption(ids: readonly string[]): ReactNode {
  const weakest = weakestOf(ids);
  if (weakest === null) return <>With no way in enabled, nobody (including you) can sign in or recover the account.</>;
  const names = PATHS.filter((p) => ids.includes(p.id) && p.strength === weakest).map((p) => p.label);
  return <>An attacker uses the weakest way in that is enabled: <span className={`hl ${weakest === 'resistant' ? 'ok' : weakest === 'phishable' ? 'orange' : 'bad'}`}>{names.join(', ')}</span>, which is {STRENGTH_LABEL[weakest]}.</>;
}
