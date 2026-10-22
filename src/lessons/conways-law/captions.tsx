import type { ReactNode } from 'react';
import { integer, joinList, plural } from '../../core/format';
import { ASSIGNMENT_COUNT, CHANGES, MAX_TIED_SHOWN, SERVICE_IDS, placedCount, type Layout, type Metrics, type Reference } from './model';

const TOTAL = SERVICE_IDS.length;

/** The changes that touch three teams: each one is a three-way handoff. */
export const threeTeamChanges = (m: Metrics): string[] => CHANGES.filter((c) => m.teamsTouched[c.id] >= 3).map((c) => c.id);

/** Said by every scene until the board is complete. */
export const placeAll = (layout: Layout): ReactNode => <>Place all {TOTAL} services: {placedCount(layout)} of {TOTAL} placed. The numbers need every service on a team.</>;

/** Scene 1 and 2: what this layout costs against the cap. */
export function layoutCaption(m: Metrics, cap: number): ReactNode {
  const three = threeTeamChanges(m);
  return (
    <>
      This layout has {plural(m.handoffs, 'handoff')} across {plural(CHANGES.length, 'change')} and {plural(m.interfaces, 'interface')}; the largest cognitive load is {m.maxCognitive} against a cap of {cap}
      {m.over.length ? <>, so {joinList(m.over.map((t) => `team ${t}`))} {m.over.length === 1 ? 'is' : 'are'} over it</> : <>, inside it for every team</>}.
      {three.length ? <> {joinList(three)} touches three teams.</> : null} Skill peers: {m.peers} of {TOTAL} services sit beside one that shares their skill.
    </>
  );
}

/** Scene 3: the reference layouts and what they cost. */
export function referenceCaption(r: Reference, cap: number, weight: number, shown: boolean): ReactNode {
  if (r.score === null) return <>No layout fits a cap of {cap}: some team would carry more than that however the services are split.</>;
  const tied = r.tied.length;
  return (
    <>
      At a cap of {cap} and a weight of {weight}, the lowest handoffs plus {weight} x interfaces over all {integer(ASSIGNMENT_COUNT)} assignments is {r.score}, reached by {plural(tied, 'distinct layout')}.
      {shown ? <> {tied > MAX_TIED_SHOWN ? `The first ${MAX_TIED_SHOWN} are listed. ` : ''}It is one view, not the answer: change the cap and the layout moves.</> : <> Show one reference to see {tied === 1 ? 'it' : 'them'}.</>}
    </>
  );
}

/** Scene 4: what a move does. */
export function moveCaption(service: string, from: string, to: string, before: Metrics, after: Metrics, cap: number): ReactNode {
  if (from === to) return <>{service} is already in team {to}. Pick another team to see what moving it changes.</>;
  return (
    <>
      Moving {service} from team {from} to team {to} takes handoffs from {before.handoffs} to {after.handoffs}, interfaces from {before.interfaces} to {after.interfaces} and the largest load from {before.maxCognitive} to {after.maxCognitive}
      {after.over.length ? <>, which leaves {joinList(after.over.map((t) => `team ${t}`))} over the cap of {cap}</> : <>, inside the cap of {cap}</>}.
    </>
  );
}
