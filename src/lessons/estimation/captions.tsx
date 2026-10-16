import type { ReactNode } from 'react';
import { plural, sig } from '../../core/format';
import { findEnding, redMeters, type Scenario, type Walk } from '../../core/scenario';
import {
  CONE_PHASES, RUNS, bandRatio, chanceBy, outsideCone, type CalibrationScore, type OutcomePoint, type Statistic, type SumFacts, type SumRun, type SumSpec,
  type ThreePointResult,
} from './model';
import { METER } from './scenario';

const first = CONE_PHASES[0];
const last = CONE_PHASES[CONE_PHASES.length - 1];
const pctOf = (share: number) => `${Math.round(share * 100)}%`;
const days = (x: number) => `${sig(x, 3)} days`;

/** Scene 1: the numbers in the cone, kept apart from whether a project follows them. */
export function coneCaption(points: readonly OutcomePoint[] | null): ReactNode {
  return (
    <>
      The numbers in the cone: at the initial concept an estimate can sit anywhere from {first.low}x to {first.high}x the final outcome, a band {sig(bandRatio(first), 3)} times wide; at
      detailed design it is {last.low}x to {last.high}x, {sig(bandRatio(last), 3)} times wide.{' '}
      {points
        ? <>In this toy, {outsideCone(points)} of {points.length} invented outcomes fall outside their own phase&apos;s band. </>
        : <>Pick an outcome model to scatter invented projects over the cone. </>}
      Whether your project follows the cone is a separate question: the picture does not narrow anything by itself.
    </>
  );
}

const STAT_WORD: Record<Statistic, string> = { mode: 'most likely values', median: 'medians', mean: 'means' };

/** Scene 2: the learner's sum read against the simulated totals. */
export function sumCaption(spec: SumSpec, facts: SumFacts, run: SumRun, stat: Statistic, yourSum: number, deadline: number, independentSd: number): ReactNode {
  const n = spec.medians.length;
  const byYours = chanceBy(run, yourSum);
  return (
    <>
      Adding the {n} {STAT_WORD[stat]} gives day {sig(yourSum, 3)}, and {pctOf(byYours)} of the {RUNS.toLocaleString('en-US')} simulated runs finish by it. The median of the total (P50) is {days(facts.p50)}, against
      {' '}{days(facts.sumMedians)} for the sum of medians; P80 is {days(facts.p80)} and P90 {days(facts.p90)}. A deadline of day {deadline} is met in {pctOf(chanceBy(run, deadline))} of runs.{' '}
      The spread of the total is {days(run.sd)} (standard deviation){spec.rho > 0 ? <>; independent tasks would give {days(independentSd)}, so shared causes widen it</> : <>, the independent-task value</>}.
    </>
  );
}

/** Scene 3: PERT beside the fitted log-normal, or the refusal. */
export function threePointCaption(result: ThreePointResult | null, refusal: string | null): ReactNode {
  if (refusal) return <>{refusal} Nothing is computed until the three values are in order.</>;
  if (!result) return <>Type three values in days.</>;
  const gap = result.fit.mean - result.pert.mean;
  return (
    <>
      PERT gives a mean of {days(result.pert.mean)} and a spread of {days(result.pert.sd)}. A log-normal with the same 5th and 95th percentiles has a mean of {days(result.fit.mean)} and a median of{' '}
      {days(result.fit.median)}, so its mean is {gap >= 0 ? 'above' : 'below'} the PERT mean by {days(Math.abs(gap))}. At the 80th percentile PERT says day {sig(result.pert.p80, 3)} and the fit says day {sig(result.fit.p80, 3)}.
      A convention, not a law: the two disagree because they assume different shapes.
    </>
  );
}

/** Scene 4: the running score, or the prompt. */
export function calibrationCaption(score: CalibrationScore, scored: boolean, rows: number): ReactNode {
  if (score.refused > 0) return <>{plural(score.refused, 'row')} could not be read: fix the marked fields first.</>;
  if (score.answered === 0) return <>Type a low and a high for each quantity so that you are 90% sure the true value is between them. {rows} quantities, none answered yet.</>;
  if (!scored) return <>{score.answered} of {rows} answered. Press Score my ranges to see the true values.</>;
  return <>{score.hits} of {score.answered} ranges contained the true value; 90% ranges would contain about {sig(score.expected, 2)} of {score.answered}.</>;
}

const joinNames = (xs: readonly string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/** Scene 5: where the conversation stands, from the walk's own meters. */
export function talkCaption(s: Scenario, w: Walk): ReactNode {
  const ending = findEnding(s, w.at);
  const red = redMeters(s, w.meters).map((m) => m.label.toLowerCase());
  return (
    <>
      {ending ? <>{ending.title}. </> : null}
      Trust {w.meters[METER.trust]} of 10, a {w.meters[METER.risk]}% chance of missing the planned day, {w.meters[METER.slack]} days of slack against the median plan.
      {red.length ? <> In the red: {joinNames(red)}.</> : <> Nothing is in the red.</>}
    </>
  );
}
