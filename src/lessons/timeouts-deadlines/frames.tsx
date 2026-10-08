import type { ReactNode } from 'react';
import { decimal } from '../../core/format';
import type { Frame } from '../../core/types';
import { HOPS, MIN_BUDGET, hopOf, type ChainRun, type HopId, type HopRun } from './model';

/** One step of the request's life: time jumps to the next thing that happens. */
export interface ChainFrame extends Frame {
  /** Seconds since the user sent the request. */
  now: number;
}

export type ChainEvent =
  | { kind: 'reach'; at: number; hop: HopId }
  | { kind: 'gave-up'; at: number }
  | { kind: 'finish'; at: number; hop: HopId };

const sec = (x: number) => `${decimal(x, 2)} s`;
/** Sentence-start form: "A", "B", "C", "The database". */
const startName = (id: HopId) => (id === 'DB' ? 'The database' : id);

const KIND_ORDER = { reach: 0, 'gave-up': 1, finish: 2 } as const;

/** Everything that happens, in time order; at one instant: arrivals, then the deadline, then finishes (deepest hop first). */
export function chainEvents(run: ChainRun): ChainEvent[] {
  const events: ChainEvent[] = [];
  for (const h of run.hops) {
    if (!h.reached) continue;
    events.push({ kind: 'reach', at: h.start, hop: h.id });
    events.push({ kind: 'finish', at: h.finish, hop: h.id });
  }
  events.push({ kind: 'gave-up', at: run.gaveUp });
  const depth = (e: ChainEvent) => (e.kind === 'finish' ? HOPS.indexOf(e.hop) : 0);
  const hopIndex = (e: ChainEvent) => (e.kind === 'gave-up' ? 0 : HOPS.indexOf(e.hop));
  return events.sort((a, b) => a.at - b.at || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || (a.kind === 'finish' ? depth(b) - depth(a) : hopIndex(a) - hopIndex(b)));
}

/** Hops that are mid-work at `t`: started, not finished. */
const stillWorking = (run: ChainRun, t: number) => run.hops.filter((h) => h.reached && !h.refused && h.start <= t && t < h.finish).map((h) => h.id);

const list = (ids: readonly HopId[]) => {
  const names = ids.map((id) => (id === 'DB' ? 'the database' : id));
  return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
};

function reachCaption(run: ChainRun, h: HopRun): ReactNode {
  if (run.params.propagate) {
    if (h.refused) {
      return <>{startName(h.id)} gets the call with only <b>{sec(Math.max(0, h.budget!))}</b> of budget left, under the {sec(MIN_BUDGET)} minimum it needs to start: it
        refuses at once with <span className="hl orange">deadline exceeded</span> instead of doing work nobody will wait for.</>;
    }
    return <>{startName(h.id)} starts at {sec(h.start)} with <b>{sec(h.budget!)}</b> of budget left: the deadline minus the time already spent, network and queueing included.{' '}
      {h.id === 'B' && run.params.queueB > 0 ? <>B's {sec(run.params.queueB)} wait in its queue came out of that budget.</> : null}</>;
  }
  return <>{startName(h.id)} starts at {sec(h.start)}.{' '}
    {h.id === 'B' && run.params.queueB > 0 ? <>It sat in B's queue for {sec(run.params.queueB)} first. </> : null}
    It is not told how long the user will wait: it only knows its own timeout.</>;
}

function gaveUpCaption(run: ChainRun): ReactNode {
  const running = stillWorking(run, run.gaveUp);
  if (run.params.propagate) {
    return <>The deadline, <span className="hl">{sec(run.gaveUp)}</span>, passes. Every hop was given this absolute time, so {running.length ? <>{list(running)} {running.length === 1 ? 'stops' : 'stop'} at this same instant</> : 'nothing is still running'}.</>;
  }
  if (!running.length) return <><span className="hl bad">The user gives up</span> at {sec(run.gaveUp)}. Nothing is still working, so no work is left over.</>;
  return <><span className="hl bad">The user gives up</span> at {sec(run.gaveUp)}, but {list(running)} {running.length === 1 ? 'is' : 'are'} still working: nothing told {running.length === 1 ? 'it' : 'them'} to stop, and each still holds a thread.</>;
}

/** What the callee does when its caller stops waiting. */
function calleeNote(run: ChainRun, h: HopRun): ReactNode {
  const callee = run.hops[HOPS.indexOf(h.id) + 1];
  if (!callee?.reached || callee.finish <= h.finish) return null;
  if (run.params.propagate) return <> {startName(callee.id)} was given this limit as its deadline, so it stops too.</>;
  return <> Nobody tells {callee.id === 'DB' ? 'the database' : callee.id}, so it carries on.</>;
}

function finishCaption(run: ChainRun, h: HopRun): ReactNode {
  const waste = h.wasted > 0 ? <> {sec(h.wasted)} of its work came after nobody was waiting for it.</> : null;
  const who = startName(h.id);
  if (h.refused) return <>{who} has refused and finishes at {sec(h.finish)}. The error climbs back to its caller.</>;
  switch (h.outcome) {
    case 'ok': {
      const late = h.lateSuccess ? <> Its caller stopped waiting at {sec(h.expiry)}, so this success reached nobody: a retry would do it again (see <code>idempotency-keys</code>).</> : null;
      return <>{who} finishes at {sec(h.finish)} with a <span className="hl ok">good answer</span>.{late}{waste}</>;
    }
    case 'timeout':
      return <><span className="hl bad">{who} times out</span> at {sec(h.finish)}: it stops waiting ({sec(run.params.timeouts[h.id as 'A' | 'B' | 'C'])} timeout).
        {calleeNote(run, h)}{waste}</>;
    case 'deadline':
      return <><span className="hl orange">{who}: deadline exceeded</span> at {sec(h.finish)}: the budget ran out, so it stops and returns that error.{waste}</>;
    case 'error':
      return <>{who} finishes at {sec(h.finish)} with an <span className="hl bad">error</span> from below and passes it up.{waste}</>;
    default:
      return null;
  }
}

/** What the whole run came to, for the closing frame. */
export function summaryCaption(run: ChainRun): ReactNode {
  const a = hopOf(run, 'A');
  const verdict = {
    ok: <>The user got a good answer at {sec(run.answerAt)}.</>,
    error: <>The user got an error at {sec(run.answerAt)}, before giving up.</>,
    'gave-up': run.params.propagate ? <>The deadline passed at {sec(run.gaveUp)} with no answer.</> : <>The user gave up at {sec(run.gaveUp)} with no answer.</>,
  }[run.userSees];
  if (run.params.propagate) {
    return <>{verdict} Every hop that worked stopped by {sec(run.gaveUp)}: <b>{sec(run.totalWasted)}</b> of work nobody was waiting for.</>;
  }
  return <>{verdict} The last hop stopped working at {sec(run.end)}, A at {sec(a.finish)}: <b>{sec(run.totalWasted)}</b> of work nobody was waiting for, summed over hops.</>;
}

function introCaption(run: ChainRun): ReactNode {
  return <>The user sends a request to <b>A</b>, which calls <b>B</b>, which calls <b>C</b>, which queries the database. They will wait <b>{sec(run.gaveUp)}</b>.{' '}
    {run.params.propagate ? <>This time A passes the deadline down.</> : <>Each service only has a timeout of its own.</>} Press play, or step.</>;
}

/** The chain as a list of frames, one per event, with the intro first and the summary last. */
export function chainFrames(run: ChainRun): ChainFrame[] {
  const frames: ChainFrame[] = [{ now: 0, say: introCaption(run) }];
  for (const e of chainEvents(run)) {
    const say = e.kind === 'gave-up' ? gaveUpCaption(run) : e.kind === 'reach' ? reachCaption(run, hopOf(run, e.hop)) : finishCaption(run, hopOf(run, e.hop));
    frames.push({ now: e.at, say });
  }
  frames.push({ now: run.end, say: summaryCaption(run) });
  return frames;
}
