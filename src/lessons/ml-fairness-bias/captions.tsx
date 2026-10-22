import type { ReactNode } from 'react';
import { plural } from '../../core/format';
import { findEnding, redMeters, type Scenario, type Walk } from '../../core/scenario';
import { CRITERIA, holds, type Criterion, type GroupStats, type Gaps } from './model';
import { METER } from './scenario';
import type { OptionResult } from './options';

const joinNames = (xs: readonly string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
export const pctText = (x: number) => (Number.isNaN(x) ? '–' : `${(x * 100).toFixed(1)}%`);
const points = (x: number) => (Number.isNaN(x) ? '–' : `${(x * 100).toFixed(1)} points`);

/** Which of the four rate criteria hold (gap within tolerance), named. */
export const heldNames = (gaps: Gaps): string[] => CRITERIA.filter((c) => holds(gaps[c.id])).map((c) => c.label.toLowerCase());

/** Scene 1: the cut-off, the selection rates and which criteria hold. */
export function thresholdCaption(t: number, a: GroupStats, b: GroupStats, gaps: Gaps, calibrationHolds: boolean): ReactNode {
  const held = heldNames(gaps);
  return (
    <>
      At a cut-off of {t.toFixed(2)}, group A is approved at {pctText(a.selection)} and group B at {pctText(b.selection)}. The true-positive rates are {pctText(a.tpr)} and {pctText(b.tpr)}, the false-positive rates {pctText(a.fpr)} and {pctText(b.fpr)}, the precisions {pctText(a.precision)} and {pctText(b.precision)}.{' '}
      {held.length === 0 ? <>No rate is equal within 3 points.</> : <>Equal within 3 points: {joinNames(held)}.</>} Calibration within groups {calibrationHolds ? 'holds' : 'does not hold'} at this scale.
    </>
  );
}

export interface TradeoffReading {
  tA: number;
  tB: number;
  criterion: Criterion;
  gaps: Gaps;
  worstPossible: number;
  perfect: boolean;
  equalBase: boolean;
}

/** Scene 2: the current pair, and how close any pair gets to equal on three criteria at once. */
export function tradeoffCaption(r: TradeoffReading): ReactNode {
  const name = CRITERIA.find((c) => c.id === r.criterion)!.label.toLowerCase();
  return (
    <>
      Cut-offs {r.tA.toFixed(3)} and {r.tB.toFixed(3)} leave the {name} {points(r.gaps[r.criterion])} apart; the other gaps are approval {points(r.gaps.selection)}, true-positive {points(r.gaps.tpr)}, false-positive {points(r.gaps.fpr)} and precision {points(r.gaps.precision)}.{' '}
      Over every worthwhile pair of cut-offs the closest any comes to equalising true-positive rate, false-positive rate and precision together is {points(r.worstPossible)}
      {r.worstPossible <= 0.03 ? <>: with {r.perfect ? 'a perfect scorer' : 'equal base rates and the same score distributions'} all three can be equal at once.</> : <>: with different base rates and an imperfect scorer they cannot all be equal.</>}
    </>
  );
}

/** Scene 3: one option against the plain scorer. */
export function optionCaption(base: OptionResult, o: OptionResult): ReactNode {
  return (
    <>
      {o.label}: accuracy {pctText(o.accuracy)} (the plain scorer {pctText(base.accuracy)}); group A approved at {pctText(o.a.selection)}, group B at {pctText(o.b.selection)}. The gaps are approval {points(o.gaps.selection)}, true-positive {points(o.gaps.tpr)}, false-positive {points(o.gaps.fpr)}, precision {points(o.gaps.precision)}.
    </>
  );
}

/** Scene 4: the three toys in one paragraph. */
export function sourcesCaption(share: number, bError: number, aError: number, apparentB: number, actualB: number, shareStart: number, shareEnd: number): ReactNode {
  return (
    <>
      Representation: with group B at {Math.round(share * 100)}% of the training data its error is {pctText(bError)} and group A&apos;s {pctText(aError)}. Label bias: against the biased labels group B looks {pctText(apparentB)} accurate, against what really happened {pctText(actualB)}.
      Feedback loop: group B&apos;s share of the training data went from {pctText(shareStart)} to {pctText(shareEnd)}.
    </>
  );
}

/** Scene 5: where the report choice stands. */
export function chooseCaption(s: Scenario, w: Walk): ReactNode {
  const ending = findEnding(s, w.at);
  const red = redMeters(s, w.meters).map((m) => m.label.toLowerCase());
  return (
    <>
      {ending ? <>{ending.title}. </> : null}
      Group B approved {w.meters[METER.approved]}%, {plural(w.meters[METER.denied], 'creditworthy applicant')} denied in error, {plural(w.meters[METER.defaulters], 'defaulting applicant')} approved, trust {w.meters[METER.trust]} of 10.
      {red.length ? <> In the red: {joinNames(red)}.</> : <> Nothing is in the red.</>}
    </>
  );
}
