import type { ReactNode } from 'react';
import { plural, sig } from '../../core/format';
import { measured, type Check, type Design, type Person } from './folklore';
import { LONG_WINDOW_DAYS, RUNS, type PowerSpec } from './power';
import { KIND_WORD, METRICS, RELEASE_WEEK, change, type Breach, type Guardrails, type MetricId, type Series } from './series';
import { BEHAVIOUR_NEEDS, LEVELS, SOLUTIONS, behaviourCoverage, cheapestFull, optionsAt, type Solution } from './tree';

const joinNames = (xs: readonly string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const pctOf = (share: number) => `${share >= 0 ? '+' : '-'}${Math.round(Math.abs(share) * 100)}%`;

const partsOf = (s: Solution) => BEHAVIOUR_NEEDS.filter((n) => s.covers.includes(n)).length;

/** Scene 1: where the walk is, and what the cheapest full cover is against the request. */
export function treeCaption(level: number): ReactNode {
  const here = LEVELS[level];
  const options = optionsAt(here.id);
  const request = SOLUTIONS.find((s) => s.id === 'csv')!;
  const best = cheapestFull();
  return (
    <>
      You are at "{here.label}": {here.text}. {here.id === 'metric' || here.id === 'goal'
        ? <>Every solution is a bet on this level, so the comparison is easier a step or two lower. </>
        : <>Options that serve it: {joinNames(options.map((s) => `${s.label} (${s.effort} days)`))}. </>}
      The cheapest option that covers the whole behaviour is the {best.label.toLowerCase()} at {plural(best.effort, 'day')}; the request, {request.label}, takes {plural(request.effort, 'day')} and covers {partsOf(request)} of {BEHAVIOUR_NEEDS.length} parts of it.
    </>
  );
}

/** Scene 2: the picked metric, what happened to it, and the release verdict. */
export function seriesCaption(series: Series, metric: MetricId, pushed: boolean, breach: Breach | null, g: Guardrails): ReactNode {
  const m = METRICS.find((x) => x.id === metric)!;
  return (
    <>
      {m.label} ({KIND_WORD[m.kind]}) changed by {pctOf(change(series[metric]))} after the release in week {RELEASE_WEEK}. Across all five: {METRICS.map((x) => `${x.label.toLowerCase()} ${pctOf(change(series[x.id]))}`).join(', ')}.{' '}
      {breach
        ? <>Release flagged: {breach.metric === 'tickets' ? `support tickets crossed ${g.tickets} a week` : `page latency crossed ${g.latency} ms`} in week {breach.week}.</>
        : <>No guardrail was crossed{pushed ? '' : `: signups ${pctOf(change(series.signups))} while weekly active teams moved ${pctOf(change(series.active))} and retention ${pctOf(change(series.retention))}`}.</>}
    </>
  );
}

export interface PowerReading {
  spec: PowerSpec;
  n: number;
  days: number;
  perDay: number;
  simulated: number;
}

/** Scene 3: the sample size, the wait, and what it says about small user bases. */
export function powerCaption(r: PowerReading | null, refusal: string | null): ReactNode {
  if (refusal || !r) return <>{refusal} Nothing is computed until the inputs make sense.</>;
  const long = r.days > LONG_WINDOW_DAYS;
  return (
    <>
      To detect a {r.spec.lift}-point lift from {r.spec.baseline}% at alpha {r.spec.alpha} and power {r.spec.power} you need about {r.n.toLocaleString('en-US')} visitors in each arm, and at {r.perDay.toLocaleString('en-US')} visitors a day that takes {sig(r.days, 3)} days.
      A simulation of {RUNS.toLocaleString('en-US')} such tests finds the lift in {Math.round(r.simulated * 100)}% of them.{' '}
      {long ? <>That is longer than {LONG_WINDOW_DAYS} days: small user bases cannot detect small lifts. Options: a bigger bet, qualitative research, or a longer window.</> : <>That fits inside {LONG_WINDOW_DAYS} days.</>}
    </>
  );
}

/** Scene 4: what the chosen measurement would report, and what each choice does. */
export function folkloreCaption(people: readonly Person[], d: Design, checkList: readonly Check[]): ReactNode {
  const flagged = checkList.filter((c) => !c.ok).length;
  return (
    <>
      This design would report {Math.round(measured(people, d) * 100)}% of accounts as using the feature. {flagged === 0 ? <>Its three choices count what the feature is for.</> : <>{plural(flagged, 'choice')} here change what is counted: the number reflects the design as much as the product.</>}
    </>
  );
}

export const coverageWord = (s: Solution): string => ({ full: 'covers the behaviour', part: 'covers part of the behaviour', none: 'misses the behaviour' })[behaviourCoverage(s)];
