import type { GraphCommit, GraphRef } from '../../components/CommitGraph';
import { DAYS, flaggedOff, integrationDay, type Merge, type Strategy } from './model';

/** A commit plus the day it happens, so the step player can reveal the week day by day. */
export interface DayCommit extends GraphCommit {
  day: number;
  /** Conflicts this commit had to resolve (merges, or trunk commits colliding the same day). */
  conflicts: number;
}

export interface SideGraph {
  commits: DayCommit[];
  /** Branch refs as they stand at the end of each day (index = day, -1 → before the week). */
  refsAt: (day: number) => GraphRef[];
}

const devName = (dev: number) => `dev-${dev + 1}`;

/**
 * The week as commits. Trunk-based with flags: everyone commits small changes straight to
 * main every day (unfinished ones behind a flag). Otherwise each developer works on a
 * branch and merges it into `integrateTo` on integration days; GitFlow also releases
 * develop into main at the end of the week.
 */
export function buildGraph(team: number, s: Strategy, merges: readonly Merge[]): SideGraph {
  const commits: DayCommit[] = [];
  const add = (c: DayCommit) => {
    commits.push(c);
    return c.id;
  };
  const conflictsOf = (day: number, dev: number) => merges.find((m) => m.day === day && m.dev === dev)?.conflicts ?? 0;
  const snapshots: GraphRef[][] = [];

  let main = add({ id: 'c0', lane: 0, parents: [], short: 'v1', message: 'release', day: -1, conflicts: 0 });
  const direct = s.flags && s.lifetime === 1;
  const devLane = (dev: number) => (s.integrateTo === 'develop' ? 2 : 1) + dev;
  let shared = main;
  if (s.integrateTo === 'develop') {
    shared = add({ id: 'd0', lane: 1, parents: [main], short: 'dv', message: 'develop', day: -1, conflicts: 0 });
  }
  const tips: (string | null)[] = new Array(team).fill(null);
  const refsNow = (): GraphRef[] => [
    { name: 'main', at: main },
    ...(s.integrateTo === 'develop' ? [{ name: 'develop', at: shared }] : []),
    ...tips.flatMap((tip, dev) => (tip ? [{ name: `feature/${devName(dev)}`, at: tip }] : [])),
  ];
  snapshots.push(refsNow());

  for (let day = 0; day < DAYS; day++) {
    for (let dev = 0; dev < team; dev++) {
      const id = `${day}-${dev}`;
      if (direct) {
        const conflicts = conflictsOf(day, dev);
        main = add({
          id, lane: 0, parents: [main], short: String(day + 1), message: devName(dev), day, conflicts,
          tone: conflicts ? 'bad' : flaggedOff(day) ? 'dim' : 'ok',
        });
      } else {
        tips[dev] = add({ id, lane: devLane(dev), parents: [tips[dev] ?? shared], short: String(day + 1), message: devName(dev), day, conflicts: 0 });
      }
    }
    if (!direct && integrationDay(day, s.lifetime) === day) {
      for (let dev = 0; dev < team; dev++) {
        const conflicts = conflictsOf(day, dev);
        const lane = s.integrateTo === 'develop' ? 1 : 0;
        const id = add({
          id: `m${day}-${dev}`, lane, parents: [shared, tips[dev]!], short: 'M', day, conflicts,
          tone: conflicts ? 'bad' : s.integrateTo === 'main' ? 'ok' : undefined,
        });
        shared = id;
        if (s.integrateTo === 'main') main = id;
        tips[dev] = null;
      }
    }
    if (s.releaseAtEnd && day === DAYS - 1) {
      main = add({ id: 'rel', lane: 0, parents: [main, shared], short: 'v2', message: 'release', day, conflicts: 0, tone: 'ok' });
    }
    snapshots.push(refsNow());
  }
  return { commits, refsAt: (day) => snapshots[Math.max(-1, Math.min(DAYS - 1, day)) + 1] };
}
