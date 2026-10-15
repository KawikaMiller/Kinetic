import type { ReactNode } from 'react';
import { plural } from '../../core/format';
import type { Bill } from './bill';
import { PACKAGE_CI_MINUTES } from './bill';
import { lean, tally, type Factors } from './ledger';
import { FLAG_TEAMS, type Review, type Rule } from './owners';
import { CONSUMER_RANGE, changeOf, monorepo, pinsAt, polyrepo, versionsInUse, type ChangeId } from './release';

const oneDecimal = (v: number) => (Math.round(v * 10) / 10).toFixed(1);
const points = (v: number) => (Math.round(v * 100) / 100).toFixed(2);

/** Scene 1: the monorepo play-out, or the polyrepo one at a given day. */
export function releaseCaption(id: ChangeId, mode: 'monorepo' | 'polyrepo', callersUpdated: boolean, day: number): ReactNode {
  const change = changeOf(id);
  if (mode === 'monorepo') {
    const m = monorepo(change, callersUpdated);
    const callers = change.compatible ? null : callersUpdated ? <> and updates {m.failing.length === 0 ? 'the callers' : 'some callers'}</> : <> without touching the callers</>;
    return (
      <>
        One commit changes the library{callers}. CI builds the affected set, <b>{plural(m.affected.length, 'package')}</b>, and the commit{' '}
        {m.status === 'landed' ? <b>lands whole</b> : <b>is blocked: {m.failing.join(' and ')} fail to build</b>}.
      </>
    );
  }
  const p = polyrepo(change);
  const kind = change.compatible ? 'minor' : 'major';
  if (p.prs === 0) {
    return (
      <>
        The library releases <b>{p.version}</b>, a {kind} release: the callers&apos; {CONSUMER_RANGE} range accepts it, so no repository needs a change.
      </>
    );
  }
  const pins = pinsAt(change, day);
  return (
    <>
      The library releases <b>{p.version}</b>, a {kind} release that {CONSUMER_RANGE} rejects: <b>{plural(p.prs, 'repository', 'repositories')}</b> each need their own change, in dependency order. The last lands on <b>day {p.days}</b>; on day {day}{' '}
      {versionsInUse(pins) > 1 ? <>{plural(versionsInUse(pins), 'library version')} are in use at once.</> : <>every repository is on {pins.find((x) => x.state !== 'library')?.version}.</>}
    </>
  );
}

/** Scene 2: the bill for the size and setting on screen. */
export function billCaption(b: Bill, detection: boolean, seed: number): ReactNode {
  const minutes = detection ? b.withDetection : b.withoutDetection;
  return (
    <>
      With {plural(b.size, 'package')} in graph {seed}, a change affects <b>{oneDecimal(b.meanAffected)}</b> packages on average ({Math.round(b.affectedFraction * 100)}% of the repository). Affected-set detection {detection ? 'on' : 'off'}: <b>{oneDecimal(minutes)} CI minutes</b> a change at {PACKAGE_CI_MINUTES} minutes a package.
    </>
  );
}

/** Scene 3: unowned paths and the pull requests read off the rules. */
export function ownersCaption(rules: readonly Rule[], unowned: number, reviews: readonly Review[]): ReactNode {
  const flagged = reviews.filter((r) => r.flagged).length;
  return (
    <>
      {plural(rules.length, 'rule')}, <b>{plural(unowned, 'path')}</b> with no owner. {flagged === 0 ? <>No pull request needs {FLAG_TEAMS} teams.</> : <><b>{plural(flagged, 'pull request')}</b> needs {FLAG_TEAMS} teams or more.</>}
    </>
  );
}

/** Scene 4: where the ledger leans, with the nets it comes from. */
export function ledgerCaption(f: Factors): ReactNode {
  const { option, margin } = lean(f);
  const mono = tally('monorepo', f).net;
  const poly = tally('polyrepo', f).net;
  return (
    <>
      Net points: monorepo <b>{points(mono)}</b>, polyrepo <b>{points(poly)}</b>.{' '}
      {option === null ? <>The ledger is level here.</> : <>At these settings the ledger leans <b>{option}</b> by {points(margin)} points.</>} The weights are invented: read it as which factors an argument turns on, not as a measurement.
    </>
  );
}
