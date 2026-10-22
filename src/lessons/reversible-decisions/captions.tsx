import type { ReactNode } from 'react';
import { decimal, integer, joinList, plural } from '../../core/format';
import { findEnding, redMeters, type Scenario, type Walk } from '../../core/scenario';
import {
  crossoverCost, deliberateCount, doorClosing, optimalHours, optimalTotal, totalCost, undoAt, DECISIONS,
  type Rigour, type TechniqueRow,
} from './model';
import { METER } from './scenario';

/** Hours of work, one decimal. */
export const hoursText = (x: number): string => decimal(x, 1);
const percentText = (p: number): string => `${Math.round(p * 100)}%`;

/** Scene 1: how many are placed, and once all are, what the model says about them. */
export function placeCaption(placed: number): ReactNode {
  const total = DECISIONS.length;
  if (placed < total) return <>{placed} of {total} decisions placed. Put each in the cell you think it belongs in; the board does not mark them, and the numbers appear once every decision is placed.</>;
  const worth = deliberateCount();
  return <>All {total} placed. In the model, rigour pays for {worth} of them and the other {total - worth} are decide-now; the table gives each one&apos;s crossover, best hours of rigour and expected cost.</>;
}

/** Scene 2: the totals at no rigour, at the best rigour and at the learner's hours. */
export function curveCaption(label: string, m: Rigour, hours: number): ReactNode {
  const star = optimalHours(m);
  const crossover = crossoverCost(m.p0, m.tau, m.w);
  return (
    <>
      {label}: {integer(m.undo)} hours to undo and a {percentText(m.p0)} chance of being wrong with no rigour (invented).{' '}
      {star > 0
        ? <>Rigour pays: the lowest expected cost is {hoursText(optimalTotal(m))} hours at {hoursText(star)} hours of rigour, against {hoursText(totalCost(0, m))} with none.</>
        : <>Decide now: the crossover is {hoursText(crossover)} hours and this costs {integer(m.undo)} to undo, so any rigour costs more than it saves.</>}{' '}
      At your {plural(hours, 'hour')} the expected cost is {hoursText(totalCost(hours, m))}.
    </>
  );
}

/** Scene 3, part one: when the door closes. */
export function doorsCaption(c0: number, growth: number, crossover: number, month: number): ReactNode {
  const closing = doorClosing(c0, growth, crossover);
  const now = undoAt(c0, growth, month);
  const side = now >= crossover ? 'one-way' : 'two-way';
  return (
    <>
      The cost to undo starts at {integer(c0)} hours and grows {growth}% a month; the crossover is {hoursText(crossover)} hours.{' '}
      {closing.kind === 'already' ? <>It starts at or above the crossover, so this door is one-way from month 0.</>
        : closing.kind === 'never' ? <>With no growth it never reaches the crossover, so the door stays two-way.</>
          : <>The door becomes one-way at month {hoursText(closing.month)}.</>}{' '}
      At month {month} it costs {hoursText(now)} hours to undo: {side}.
    </>
  );
}

/** Scene 3, part two: what the picked technique does to one decision. */
export function techniqueCaption(label: string, row: TechniqueRow | null): ReactNode {
  if (row === null) return <>{label}: pick a technique to see what it does to the cost to undo, and whether the saving beats the hours it takes to set up.</>;
  const { technique: t } = row;
  return (
    <>
      {t.label} on {label}: the cost to undo falls to {hoursText(row.undoAfter)} hours, which saves {hoursText(row.saving)} expected hours against {t.setup} to set it up.{' '}
      {row.pays ? <>It pays, by {hoursText(row.saving - t.setup)}.</> : <>It does not pay: it costs {hoursText(t.setup - row.saving)} hours more than it saves.</>}
    </>
  );
}

/** Scene 4: where the story stands. */
export function storyCaption(s: Scenario, w: Walk): ReactNode {
  const ending = findEnding(s, w.at);
  const red = redMeters(s, w.meters).map((m) => m.label.toLowerCase().replace(/ \(.*\)$/, '').replace(/:.*$/, ''));
  return (
    <>
      {ending ? <>{ending.title}. </> : null}
      Slack {plural(w.meters[METER.slack], 'day')}, regret {w.meters[METER.regret]}, cost to reverse {w.meters[METER.undo]}, upkeep {w.meters[METER.upkeep]} hours a week (invented units).
      {red.length ? <> In the red: {joinList(red)}.</> : <> Nothing is in the red.</>}
    </>
  );
}
