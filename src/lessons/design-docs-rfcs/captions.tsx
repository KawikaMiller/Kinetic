import type { ReactNode } from 'react';
import { plural } from '../../core/format';
import { READERS, keptOrder, lintDoc, reachOf, type DocContent, type Reach } from './designdoc';
import { CRITERIA, rank, sweepFlips, type ConstraintId, type CriterionId, type Weights } from './decision';
import { findEnding, findNode, ledger, redMeters, type Scenario, type Walk } from './scenario';

const REACH_WORD: Record<Reach | 'cut', string> = { full: 'reaches it', partly: 'is cut off partway through it', none: 'never reaches it', cut: 'is cut off' };

/** Scene 1: where each reader gets to in the learner's order, and how many doc checks pass. */
export function buildCaption(c: DocContent): ReactNode {
  const order = keptOrder(c);
  const lint = lintDoc(c);
  const passes = lint.filter((l) => l.pass).length;
  const none = READERS.filter((r) => (reachOf(order, r.budget, 'recommendation')?.reach ?? 'none') === 'none').length;
  return (
    <>
      {READERS.map((r, i) => {
        const reach = reachOf(order, r.budget, 'recommendation')?.reach ?? 'none';
        return (
          <span key={r.id}>
            {i > 0 && (i === READERS.length - 1 ? ', and ' : ', ')}
            the {r.name.toLowerCase()} {REACH_WORD[reach]}
          </span>
        );
      })}
      {', '}
      {none === 0 ? <>so every reader gets to the recommendation.</> : <>so <b>{plural(none, 'reader')} reach no decision</b>.</>} {passes} of {lint.length} doc checks pass.
    </>
  );
}

/** Scene 2: who leads, who is knocked out, and where the swept weight flips the winner. */
export function decisionCaption(w: Weights, on: readonly ConstraintId[], swept: CriterionId): ReactNode {
  const ranked = rank(w, on);
  if (!ranked) return <>Every weight is zero, so nothing can be ranked: raise at least one.</>;
  const out = ranked.filter((r) => r.knockedOut.length > 0);
  const lead = ranked[0].knockedOut.length === 0 ? ranked[0] : null;
  const flips = sweepFlips(w, swept, on);
  const label = CRITERIA.find((c) => c.id === swept)!.label.toLowerCase();
  return (
    <>
      {lead ? (
        <>
          <b>{lead.option.name}</b> ranks first, with {lead.score.toFixed(2)} of a possible 1.00.
        </>
      ) : (
        <>Every option is knocked out by a constraint.</>
      )}{' '}
      {out.length > 0 ? <>{out.map((r) => `${r.option.name} (${r.knockedOut.map((k) => k.label).join(', ')})`).join('; ')} {out.length === 1 ? 'is' : 'are'} knocked out. </> : null}
      {flips.length === 0 ? <>Sweeping the weight on {label} from 0 to 1 never changes the winner.</> : <>Sweeping the weight on {label} changes the winner at {flips.map((f) => f.at.toFixed(2)).join(' and ')}.</>}
    </>
  );
}

/** Scene 3: the decision in front of the learner, or the ending reached with its meters. */
export function scenarioCaption(s: Scenario, w: Walk): ReactNode {
  const ending = findEnding(s, w.at);
  if (ending) {
    const red = redMeters(s, w.meters);
    return (
      <>
        <b>{ending.title}.</b>{' '}
        {red.length === 0 ? <>No meter is in the red.</> : <>In the red: {red.map((m) => `${m.label.toLowerCase()} ${w.meters[m.id]}${m.unit ? ` ${m.unit}` : ''}`).join('; ')}.</>}
      </>
    );
  }
  const node = findNode(s, w.at)!;
  const rows = ledger(s, w);
  const last = rows[rows.length - 1];
  return last ? (
    <>
      You chose <b>&quot;{last.choice.label}&quot;</b>. {last.choice.because} Now: {node.prompt}
    </>
  ) : (
    <>{node.prompt}</>
  );
}
