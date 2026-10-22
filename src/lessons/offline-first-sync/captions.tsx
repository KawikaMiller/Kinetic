import type { ReactNode } from 'react';
import { STRATEGIES, type Strategy, type View } from './ops';
import type { Attempt } from './status';
import { countMarks, retryGaps } from './status';
import type { Run } from './runs';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export const strategyLabel = (s: Strategy) => STRATEGIES.find((x) => x.id === s)!.label;
const s1 = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

/** The list a replica shows, as words: "Oat milk, Eggs (done)"; the empty list says so. */
export function listText(v: View): string {
  const alive = v.items.filter((i) => !i.deleted);
  if (alive.length === 0) return 'an empty list';
  return alive.map((i) => `${i.title === null ? 'undecided' : `"${i.title}"`}${i.done ? ' (done)' : ''}`).join(', ');
}

// ---- scene 1 ----------------------------------------------------------------------------------

export function liveIntro(run: Run): ReactNode {
  const p = countMarks(run.phone);
  const l = countMarks(run.laptop);
  const waiting = p.pending + l.pending;
  const flying = p.inflight + l.inflight;
  const offline = [run.phone.airplane && 'the phone', run.laptop.airplane && 'the laptop'].filter(Boolean).join(' and ');
  return (
    <>
      Phone: {plural(p.pending, 'edit')} <span className="hl">pending</span>, {p.inflight} <span className="hl info">in flight</span>. Laptop: {plural(l.pending, 'edit')} pending, {l.inflight} in flight.{' '}
      {waiting + flying === 0 && run.converged ? (
        <>
          Everything is <span className="hl ok">confirmed</span> and all three replicas show {listText(run.views.server)}.
        </>
      ) : run.converged ? (
        <>The replicas already agree, with edits still on their way.</>
      ) : (
        <>
          The replicas <span className="hl orange">differ for now</span>: phone {listText(run.views.phone)}, laptop {listText(run.views.laptop)}
          {offline ? ` (${offline} offline)` : ''}.
        </>
      )}
    </>
  );
}

// ---- scene 2 ----------------------------------------------------------------------------------

export function strategyCaption(run: Run, strategy: Strategy): ReactNode {
  const conflicts = run.views.server.conflicts.length;
  return (
    <>
      Under <b>{strategyLabel(strategy)}</b>:{' '}
      {run.converged ? (
        <>
          all three replicas <span className="hl ok">end with the same list</span>, {listText(run.views.server)}
        </>
      ) : (
        <>
          the replicas <span className="hl bad">end different</span>: phone {listText(run.views.phone)}, laptop {listText(run.views.laptop)}, server {listText(run.views.server)}
        </>
      )}
      .{' '}
      {run.lost.length === 0 ? (
        <>No acknowledged edit was lost.</>
      ) : (
        <>
          <span className="hl bad">{plural(run.lost.length, 'acknowledged edit')} lost</span> with nothing listed.
        </>
      )}{' '}
      {conflicts === 0 ? 'No conflict is listed.' : <><span className="hl orange">{plural(conflicts, 'conflict')} listed</span> for the user.</>}
    </>
  );
}

// ---- scene 3 ----------------------------------------------------------------------------------

export interface TraceCounts {
  sent: number;
  lost: number;
  duplicates: number;
}
export function traceCounts(run: Run): TraceCounts {
  return {
    sent: run.trace.filter((r) => r.kind === 'send').length,
    lost: run.trace.filter((r) => r.kind === 'drop' && !r.dup).length,
    duplicates: run.trace.filter((r) => r.kind === 'deliver' && r.dup).length,
  };
}

export function faultCaption(run: Run, dedupe: boolean): ReactNode {
  const c = run.views;
  const expected = new Set(run.accepted.filter((o) => o.kind === 'inc').map((o) => o.id)).size;
  const counts = [c.phone.counter, c.laptop.counter, c.server.counter];
  const right = counts.every((n) => n === expected);
  const t = traceCounts(run);
  return (
    <>
      {plural(expected, 'increment')} {expected === 1 ? 'was' : 'were'} made. The counter reads{' '}
      <span className={right ? 'hl ok' : 'hl bad'}>
        phone {c.phone.counter}, laptop {c.laptop.counter}, server {c.server.counter}
      </span>{' '}
      with deduplication {dedupe ? 'on' : 'off'}. The network carried {plural(t.sent, 'message')}: {t.lost} lost, {t.duplicates} delivered twice.
    </>
  );
}

// ---- scene 4 ----------------------------------------------------------------------------------

export function loopCaption(attempts: Attempt[], outageSec: number, ackedAt: number | null, since: number | null): ReactNode {
  if (attempts.length === 0) return <>The laptop never pushed: it made no edit.</>;
  const lost = attempts.filter((a) => a.lost).length;
  const gaps = retryGaps(attempts);
  const grew = gaps.every((g, i) => i === 0 || g >= gaps[i - 1]);
  const shown = `${gaps.slice(0, 6).map(s1).join(', ')}${gaps.length > 6 ? ', ...' : ''}`;
  return (
    <>
      The laptop pushed {plural(attempts.length, 'time')}
      {outageSec === 0 ? <>; with no outage <span className="hl ok">none was lost</span>.</> : <>; <span className="hl bad">{lost} {lost === 1 ? 'was' : 'were'} lost</span> to the {outageSec} s outage{gaps.length > 1 ? (grew ? <>, and the waits between retries grew: {shown}</> : <>, and the waits between retries rose only on average, because jitter takes up to half of each: {shown}</>) : null}.</>}{' '}
      {ackedAt === null ? 'No push was acknowledged in this run.' : <>The first push after the outage was <span className="hl ok">acknowledged at {s1(ackedAt)}</span>{since !== null ? <>, and the next pull asked for everything since log position {since}</> : null}.</>}
    </>
  );
}
