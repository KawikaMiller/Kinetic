import type { ReactNode } from 'react';
import { plural } from '../../core/format';
import type { Frame } from '../../core/types';
import { DAYS, flaggedOff, integrationDay, type Outcome, type Side, type Strategy } from './model';

export interface WeekFrame extends Frame {
  /** -1 = before the week starts. */
  day: number;
}

export interface SidePlan {
  strategy: Strategy;
  outcome: Outcome;
}

/** Conflicts one side resolved on a given day. */
export const conflictsOn = (o: Outcome, day: number) => o.merges.filter((m) => m.day === day).reduce((s, m) => s + m.conflicts, 0);
/** Conflicts resolved so far, up to and including `day`. */
export const conflictsBy = (o: Outcome, day: number) => o.merges.filter((m) => m.day <= day).reduce((s, m) => s + m.conflicts, 0);

function dayCaption(day: number, sides: Record<Side, SidePlan>): ReactNode {
  const { long, trunk } = sides;
  const longMerges = integrationDay(day, long.strategy.lifetime) === day;
  const longToday = conflictsOn(long.outcome, day);
  const trunkToday = conflictsOn(trunk.outcome, day);
  const trunkMerges = integrationDay(day, trunk.strategy.lifetime) === day;

  const left: ReactNode = longMerges ? (
    <>
      <b>Integration day</b> for the long-lived branches: <span className={`hl ${longToday ? 'bad' : 'ok'}`}>{plural(longToday, 'conflict')}</span>{' '}
      at once, on {plural(long.strategy.lifetime, 'day')} of changes each.
    </>
  ) : (
    <>Long-lived branches drift further from develop: nobody has seen anyone else's work for {plural((day % long.strategy.lifetime) + 1, 'day')}.</>
  );
  const right: ReactNode = trunkMerges ? (
    <>
      Trunk integrates again: {trunkToday ? <span className="hl bad">{plural(trunkToday, 'small conflict')}</span> : 'no conflicts'}
      {!trunk.strategy.flags ? '.' : flaggedOff(day) ? ', and unfinished work merges dark behind a flag.' : ', and today\'s features are finished, so their flags flip on (green).'}
    </>
  ) : (
    <>Trunk: features aren't done, and without flags they can't merge yet.</>
  );
  return (
    <>
      Day {day + 1}. {left} {right}
    </>
  );
}

export function weekFrames(sides: Record<Side, SidePlan>): WeekFrame[] {
  const frames: WeekFrame[] = [
    {
      day: -1,
      say: (
        <>
          The same team makes the <b>same changes</b> all week under two strategies. Top: long-lived branches, merged every{' '}
          {plural(sides.long.strategy.lifetime, 'day')}. Bottom: trunk-based. Press play.
        </>
      ),
    },
  ];
  for (let day = 0; day < DAYS; day++) frames.push({ day, say: dayCaption(day, sides), hold: 1.4 });
  const { long, trunk } = sides;
  frames.push({
    day: DAYS - 1,
    hold: 3,
    say: (
      <>
        Week done: <span className="hl bad">{long.outcome.conflicts}</span> conflicts on the long-lived side vs{' '}
        <span className="hl ok">{trunk.outcome.conflicts}</span> on trunk, and a change waits {long.outcome.leadTime.toFixed(1)} days
        on average to reach production vs {trunk.outcome.leadTime.toFixed(1)}.{' '}
        {trunk.strategy.flags ? (
          <>Trunk-based still uses branches and review: they just live for hours, not weeks.</>
        ) : (
          <>Without feature flags, trunk work waits {plural(trunk.strategy.lifetime, 'day')} for a feature to finish before it merges: flags are
            what let branches shrink to hours.</>
        )}
      </>
    ),
  });
  return frames;
}
