import type { ReactNode } from 'react';
import { duration, plural } from '../../core/format';
import type { Frame } from '../../core/types';
import { HORIZON, stateAt, summaryAt, type Run } from './model';
import { ownerCounts, type Row } from './spectrum';

/** Seconds of simulated time per frame. */
export const STEP = 0.5;

export interface PoolFrame extends Frame {
  now: number;
  /** Requests that arrived since the previous frame (they fly into the pool on this one). */
  fresh: number[];
}

/** The caption for what happened in (from, to]: counts come from the run, never typed in. */
export function stepCaption(run: Run, from: number, to: number): ReactNode {
  const arrived = run.requests.filter((r) => r.at > from && r.at <= to);
  const cold = arrived.filter((r) => r.outcome === 'cold').length;
  const warm = arrived.filter((r) => r.outcome === 'warm').length;
  const throttled = arrived.filter((r) => r.outcome === 'throttled').length;
  const reaped = run.instances.filter((i) => i.reapedAt !== null && i.reapedAt > from && i.reapedAt <= to).length;
  const parts: ReactNode[] = [];
  if (cold > 0) {
    parts.push(
      <span key="cold">
        <span className="hl">{plural(cold, 'cold start')}</span>: no warm instance was free, so {cold === 1 ? 'a new one' : 'new ones'} ran provision, runtime start and{' '}
        {duration(run.config.initS)} of function init before the handler.
      </span>,
    );
  }
  if (warm > 0) {
    parts.push(
      <span key="warm">
        <span className="hl ok">{plural(warm, 'warm hit')}</span>: a free warm instance took {warm === 1 ? 'it' : 'them'} straight away.
      </span>,
    );
  }
  if (throttled > 0) {
    parts.push(
      <span key="thr">
        <span className="hl bad">{plural(throttled, 'request')} throttled (429)</span>: every instance up to the limit of {run.config.limit} was busy, so nothing starts and nothing queues.
      </span>,
    );
  }
  if (reaped > 0) {
    parts.push(
      <span key="reap">
        The idle timer <span className="hl">reaped {plural(reaped, 'instance')}</span>, which cost nothing while it waited.
      </span>,
    );
  }
  if (parts.length === 0) {
    const idle = run.instances.filter((i) => stateAt(i, to) === 'idle').length;
    return (
      <>
        No new requests. {idle === 0 ? 'No instance is warm' : `${plural(idle, 'instance')} sit${idle === 1 ? 's' : ''} warm and idle`}, so the next request {idle === 0 ? 'will cold-start' : 'will be warm if one is free'}.
      </>
    );
  }
  return (
    <>
      {parts.flatMap((p, i) => (i === 0 ? [p] : [' ', p]))}
    </>
  );
}

export function poolFrames(run: Run): PoolFrame[] {
  const frames: PoolFrame[] = [
    {
      now: 0,
      fresh: [],
      say: (
        <>
          A simulated function platform: each request needs its own instance, and a new one has to boot first. Press play to watch {HORIZON} simulated seconds
          of traffic.
        </>
      ),
    },
  ];
  for (let t = STEP; t <= HORIZON + 1e-9; t += STEP) {
    const now = Math.round(t / STEP) * STEP;
    const from = now - STEP;
    frames.push({
      now,
      fresh: run.requests.filter((r) => r.at > from && r.at <= now).map((r) => r.id),
      say: stepCaption(run, from, now),
      quiet: true,
    });
  }
  const s = summaryAt(run, HORIZON);
  frames.push({
    now: HORIZON,
    fresh: [],
    hold: 2,
    say: (
      <>
        Run over: {plural(s.cold, 'cold start')} and {plural(s.warm, 'warm hit')} across {plural(s.cold + s.warm, 'served request')}, {s.throttled} throttled.
      </>
    ),
  });
  return frames;
}

/** The caption for a clicked row, built from the table itself. */
export function rowCaption(row: Row): ReactNode {
  const { you, split, provider } = ownerCounts(row);
  const names = (cols: typeof you) => cols.map((c) => c.title).join(', ');
  return (
    <>
      <b>{row.title}</b> is on <span className="hl info">you</span> in {plural(you.length, 'column')}
      {you.length > 0 && <> ({names(you)})</>}, <span className="hl violet">split</span> in {plural(split.length, 'column')}
      {split.length > 0 && <> ({names(split)})</>}, and <b>the provider's</b> in {plural(provider.length, 'column')}
      {provider.length > 0 && <> ({names(provider)})</>}.
    </>
  );
}
