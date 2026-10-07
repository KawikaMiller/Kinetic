import type { ReactNode } from 'react';
import { plural } from '../../core/format';
import { createRecorder } from '../../core/recorder';
import type { Frame } from '../../core/types';
import {
  bruteForceBest, coinVerdict, dpCoins, exchange, greedyCoins, greedySchedule, RULE_LABEL, span, verdict, type Meeting, type Rule,
} from './model';

const ids = (ms: readonly Meeting[]) => ms.map((m) => m.id).join(', ');
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

// ── Interval scheduling ──────────────────────────────────────────────

export type MeetingStatus = 'pending' | 'now' | 'booked' | 'rejected';

export interface ScheduleFrame extends Frame {
  status: Record<string, MeetingStatus>;
  /** Meetings looked at so far. */
  seen: number;
  /** Ids booked so far, in scan order. */
  booked: string[];
  /** The scan is over: the comparison with the best possible (and the outlines) show now. */
  done: boolean;
}

const ORDER_TEXT: Record<Rule, string> = {
  finish: 'by the time they end',
  start: 'by the time they start',
  shortest: 'by length, shortest first',
};

const WHY_LOST: Record<Rule, string> = {
  finish: '',
  start: 'Starting early says nothing about how long a meeting holds the room.',
  shortest: 'A short meeting can still straddle two others and knock both out.',
};

export function scheduleFrames(ms: readonly Meeting[], rule: Rule): ScheduleFrame[] {
  const { steps } = greedySchedule(ms, rule);
  const rec = createRecorder<ScheduleFrame>({ status: Object.fromEntries(ms.map((m) => [m.id, 'pending'])), seen: 0, booked: [], done: false });
  rec.snap(
    <>
      Rule: <b>{RULE_LABEL[rule]}</b>. Sort the {ms.length} meetings {ORDER_TEXT[rule]}, then go down the list once: book each meeting unless it
      overlaps one already booked. No second thoughts.
    </>,
  );
  steps.forEach((s, i) => {
    const prev = rec.get();
    const status = { ...prev.status };
    if (i > 0) {
      const last = steps[i - 1];
      status[last.meeting.id] = last.accepted ? 'booked' : 'rejected';
    }
    status[s.meeting.id] = 'now';
    const bookedNow = s.accepted ? [...prev.booked, s.meeting.id] : prev.booked;
    rec.snap(
      s.accepted ? (
        <>
          {i + 1}/{steps.length}: {s.meeting.id} ({span(s.meeting)}) overlaps nothing booked, so book it. {plural(bookedNow.length, 'meeting')} booked.
        </>
      ) : (
        <>
          {i + 1}/{steps.length}: {s.meeting.id} ({span(s.meeting)}) overlaps {s.clashWith!.id} ({span(s.clashWith!)}), which is already booked, so reject it.
        </>
      ),
      undefined,
      { status, seen: i + 1, booked: bookedNow },
    );
  });
  const final = { ...rec.get().status };
  const last = steps[steps.length - 1];
  if (last) final[last.meeting.id] = last.accepted ? 'booked' : 'rejected';
  rec.set({ status: final, done: true });
  rec.close(scheduleVerdict(ms, rule), 2);
  return rec.frames;
}

/** The closing comparison, from the greedy count and the brute-force count. */
export function scheduleVerdict(ms: readonly Meeting[], rule: Rule): ReactNode {
  const { booked } = greedySchedule(ms, rule);
  const best = bruteForceBest(ms, booked);
  const v = verdict(booked.length, best.size);
  const bestText = (
    <>
      the best possible is {best.size} (brute force tried all {best.tried.toLocaleString('en-US')} subsets)
    </>
  );
  if (v.kind === 'optimal') {
    return (
      <>
        {cap(RULE_LABEL[rule])} booked {booked.length} and {bestText}: <b>greedy was optimal here</b>.
        {rule === 'finish' ? ' Earliest finish always is; the Exchange argument scene shows why.' : ' Not every input is this kind: try the other presets.'}
      </>
    );
  }
  const wrong = booked.filter((m) => !best.best.some((b) => b.id === m.id));
  return (
    <>
      {cap(RULE_LABEL[rule])} booked {booked.length}, but {bestText}: <b>greedy lost by {v.by}</b>. Outlined in red:{' '}
      {wrong.length === 1 ? `${wrong[0].id}, a pick` : `${ids(wrong)}, picks`} that even the closest best schedule doesn't make. {WHY_LOST[rule]}
    </>
  );
}

// ── Exchange argument ────────────────────────────────────────────────

export interface ExchangeFrame extends Frame {
  /** The best schedule as it stands after this step's swap. */
  schedule: Meeting[];
  /** The meeting just swapped in, and the one it replaced. */
  swappedIn: string | null;
  swappedOut: Meeting | null;
  swaps: number;
}

export function exchangeFrames(ms: readonly Meeting[]): ExchangeFrame[] {
  const { greedy, optimum, swaps } = exchange(ms);
  const k = greedy.length;
  const rec = createRecorder<ExchangeFrame>({ schedule: optimum, swappedIn: null, swappedOut: null, swaps: 0 }, { transient: { swappedIn: null, swappedOut: null } });
  rec.snap(
    <>
      Earliest finish booked {plural(k, 'meeting')}: {ids(greedy)}. Take a best schedule found another way (here, scanning by latest start):{' '}
      {ids(optimum)}. Line both up in time order and swap the best one's meetings for greedy's, one position at a time.
    </>,
  );
  const real = swaps.filter((s) => s.was.id !== s.greedy.id);
  if (!real.length) {
    rec.close(<>Here both ways found the same {plural(k, 'meeting')}, so there's nothing to swap. Pick another preset or a random day to see the swaps.</>);
    return rec.frames;
  }
  let made = 0;
  for (const s of swaps) {
    if (s.was.id === s.greedy.id) continue;
    made++;
    const before = s.schedule[s.i - 1];
    const after = s.schedule[s.i + 1];
    rec.snap(
      <>
        Position {s.i + 1}: swap {s.was.id} ({span(s.was)}) for greedy's {s.greedy.id} ({span(s.greedy)}). Greedy picked the earliest finish
        available, so {s.greedy.id} ends at {s.greedy.end}, no later than {s.was.end}. It fits {before ? `after ${before.id} (ends ${before.end})` : 'first in the day'}{' '}
        and {after ? `before ${after.id} (starts ${after.start})` : 'nothing comes after it'}:{' '}
        {s.valid ? <>still no overlap, still {plural(k, 'meeting')}.</> : <>this would overlap.</>}
      </>,
      undefined,
      { schedule: s.schedule, swappedIn: s.greedy.id, swappedOut: s.was, swaps: made },
    );
  }
  rec.close(
    <>
      After {plural(made, 'swap')} the best schedule has become greedy's, and it never lost a meeting on the way. The same swaps work on any best
      schedule, so earliest finish can never book fewer than the best: it's optimal, on every input.
    </>,
    2,
  );
  return rec.frames;
}

// ── Coin change ──────────────────────────────────────────────────────

export interface CoinSystem {
  name: string;
  coins: readonly number[];
}

export interface CoinFrame extends Frame {
  /** How many of greedy's picks are on screen. */
  taken: number;
  done: boolean;
}

const plus = (xs: readonly number[]) => xs.join(' + ');

function coinStep(sys: CoinSystem, target: number, j: number): string | null {
  const g = greedyCoins(sys.coins, target);
  if (j <= g.taken.length) {
    const c = g.taken[j - 1];
    const left = target - g.taken.slice(0, j).reduce((a, b) => a + b, 0);
    return `${sys.name}: take ${c}, ${left} left`;
  }
  if (j === g.taken.length + 1 && g.left > 0) return `${sys.name}: no coin fits the ${g.left} left, stuck`;
  return null;
}

export function coinFrames(target: number, systems: readonly CoinSystem[]): CoinFrame[] {
  const rec = createRecorder<CoinFrame>({ taken: 0, done: false });
  rec.snap(<>Make {target} from as few coins as possible. Greedy grabs the largest coin that still fits, again and again, without looking ahead.</>);
  const steps = Math.max(...systems.map((s) => {
    const g = greedyCoins(s.coins, target);
    return g.taken.length + (g.left > 0 ? 1 : 0);
  }));
  for (let j = 1; j <= steps; j++) {
    const parts = systems.map((s) => coinStep(s, target, j)).filter((p): p is string => p !== null);
    rec.snap(<>{parts.join('. ')}.</>, undefined, { taken: j });
  }
  rec.set({ done: true });
  rec.close(
    <>
      {systems.map((s, i) => (
        <span key={s.name}>
          {i > 0 && ' '}
          {coinSummary(s, target)}
        </span>
      ))}
    </>,
    2,
  );
  return rec.frames;
}

/** One system's verdict, from greedy's coins and the DP optimum. */
export function coinSummary(sys: CoinSystem, target: number): ReactNode {
  const g = greedyCoins(sys.coins, target);
  const dp = dpCoins(sys.coins, target);
  const v = coinVerdict(sys.coins, target);
  switch (v.kind) {
    case 'impossible':
      return <>{sys.name}: no mix of these coins makes {target} at all, so there's nothing to win.</>;
    case 'stuck':
      return <>{sys.name}: greedy got stuck with {v.left} left, yet {plus(dp.coins!)} works. <b>Greedy failed here</b>.</>;
    case 'optimal':
      return <>{sys.name}: greedy's {plural(g.taken.length, 'coin')} match the fewest possible: <b>greedy was optimal here</b>.</>;
    case 'lost':
      return <>{sys.name}: greedy used {plural(g.taken.length, 'coin')}, but {plus(dp.coins!)} needs only {dp.coins!.length}: <b>greedy lost by {v.by}</b>.</>;
  }
}
