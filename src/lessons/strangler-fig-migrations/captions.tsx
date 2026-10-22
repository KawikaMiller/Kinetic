import type { ReactNode } from 'react';
import { integer, joinList, plural } from '../../core/format';
import { findEnding, redMeters, type Scenario, type Walk } from '../../core/scenario';
import { ROUTES, bestOnEvery, neverRedPaths, routeOf, type Facade, type Observed, type PathRow, type Readout } from './model';
import { METERS } from './scenario';

/** A share of all requests as a percentage with up to three decimals, at least two: 0.0011 is "0.11%", 0.00305 is "0.305%". */
export function rateText(share: number): string {
  const text = (share * 100).toFixed(3);
  return `${text.endsWith('0') ? text.slice(0, -1) : text}%`;
}

/** The sentence under a rollback loss: names the route and the figure. */
export const lossText = (route: string, lost: number): string =>
  `Rolling back ${route} now loses ${integer(lost)} writes that exist only in the new store: there is no safe way back.`;

/** Scene 1: the expected figures, the observed ones from the seeded run, and the rollback price. */
export function facadeCaption(f: Facade, r: Readout, o: Observed): ReactNode {
  const routed = ROUTES.filter((x) => f.settings[x.id].mode !== 'off');
  if (routed.length === 0) return <>Every route is Off: all requests go to the monolith, so nothing can be wrong in the new stack and nothing is mirrored. Set a route to Shadow or Serve.</>;
  return (
    <>
      Expected user-visible error rate {rateText(r.errorRate)}; the seeded run of {o.minutes} minutes saw {rateText(o.errorRate)} (seed {f.seed}).{' '}
      {r.mirroredPerMin > 0 ? <>Shadow mirrors {integer(r.mirroredPerMin)} requests a minute and about {integer(Math.round(r.mismatchPerMin))} of them differ ({rateText(r.mismatchRate ?? 0)}); users still see the monolith&apos;s answer. </> : null}
      {r.lostTotal > 0 ? <>{r.lost.map((l) => lossText(routeOf(l.route).label, l.lost)).join(' ')}</> : <>Rolling back loses no writes.</>}
    </>
  );
}

/** Scene 2: where the story stands. */
export function storyCaption(s: Scenario, w: Walk): ReactNode {
  const ending = findEnding(s, w.at);
  const red = redMeters(s, w.meters).map((m) => m.label.toLowerCase());
  const [incidents, weeks, strain, surprises] = METERS.map((m) => w.meters[m.id]);
  return (
    <>
      {ending ? <>{ending.title}. </> : null}
      Incidents {incidents}, weeks {weeks}, strain {strain}, unknowns still ahead {surprises}.
      {red.length ? <> In the red: {joinList(red)}.</> : <> Nothing is in the red.</>}
    </>
  );
}

/** Scene 3: what the 28 paths show. */
export function ledgerCaption(s: Scenario, rows: readonly PathRow[], shown: number): ReactNode {
  const calm = neverRedPaths(rows).length;
  const best = bestOnEvery(s, rows);
  const everyCostsWeeks = rows.every((r) => r.worseThanStart.length > 0);
  return (
    <>
      {plural(rows.length, 'path')} in all, {shown} shown. {plural(calm, 'path')} {calm === 1 ? 'goes' : 'go'} through no red meter at any step{everyCostsWeeks ? ', and each of those still leaves at least one meter worse than it started' : ''}.{' '}
      {best.length === 0 ? <>No path is best on every meter: the paths that end best on each meter share none.</> : <>{plural(best.length, 'path')} end best on every meter.</>}
    </>
  );
}
