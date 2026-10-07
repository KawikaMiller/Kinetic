import type { ReactNode } from 'react';
import { percentile } from '../../core/sim';
import { power } from '../../core/format';
import { collisionProbability } from '../../core/stats';
import {
  DAYS, birthdayChance, certainAt, chance, count, dayName, guaranteed, halfPoint, pairs, type Run,
} from './model';

export function pigeonCaption(pigeons: number, holes: number): ReactNode {
  return guaranteed(pigeons, holes)
    ? <>{pigeons} pigeons, {holes} holes: spread them as evenly as you like and some hole still gets <span className="hl bad">two</span>.
        Once every hole has one, pigeon {holes + 1} has nowhere new to go.</>
    : <>{pigeons} pigeons, {holes} holes: there's room for every pigeon to have its own hole, so a double is possible but not
        guaranteed.</>;
}

/** What the caption says when a run hits its first shared birthday. */
export function collisionCaption(run: Run, runNumber: number): ReactNode {
  const n = run.days.length;
  return <>Run {runNumber}: person {n} shares <span className="hl bad">{dayName(run.days[n - 1])}</span> with person {run.match + 1}.
    {' '}{n} people make {pairs(n).toLocaleString('en-US')} pairs, and the chance some pair matches is {chance(birthdayChance(n))}.</>;
}

/** After a batch of runs: the median, computed from every run so far. */
export function batchCaption(sizes: readonly number[]): ReactNode {
  const median = percentile([...sizes].sort((a, b) => a - b), 0.5);
  const under = sizes.filter((s) => s <= 23).length / sizes.length;
  return <>{sizes.length.toLocaleString('en-US')} runs so far: the median is <span className="hl">{median}</span> people, and{' '}
    {chance(under)} of runs found a match by person 23. Nowhere near 183.</>;
}

export function idCaption(n: number, bits: number): ReactNode {
  return <>{count(n)} random {bits}-bit IDs: chance of a repeat {chance(collisionProbability(n, 2 ** bits).p)}. A coin flip comes at about{' '}
    {count(halfPoint(bits))} IDs, roughly √{power(bits)}, not {power(bits)} / 2.</>;
}

export const BIRTHDAY_FACTS = `With ${DAYS} days, ${certainAt(DAYS)} people guarantee a shared birthday (${certainAt(DAYS + 1)} counting Feb 29), but 23 already give ${chance(birthdayChance(23))}.`;
