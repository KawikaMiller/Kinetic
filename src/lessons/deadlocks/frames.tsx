import type { ReactNode } from 'react';
import { plural } from '../../core/format';
import type { Frame } from '../../core/types';
import {
  CONDITION_KEYS, DETECT_EVERY, MAX_TICKS, PRESETS, describeCycle, ragCycle, run,
  type ConditionKey, type Conditions, type DlState, type Note, type Preset, type PresetId, type RunOptions,
} from './model';

export interface DlFrame extends Frame, DlState {
  /** The wait cycle in the graph right now (node ids), or null. */
  cycle: string[] | null;
}

const VERDICT_HOLD = 2.5;

export const CONDITION_FIX: Record<ConditionKey, ReactNode> = {
  mutualExclusion: <>mutual exclusion is off: every lock is a shared read-only copy, so nobody ever waits (this only works when the threads just read)</>,
  holdAndWait: <>hold-and-wait is off: a thread takes all its locks in one go or none, so it never holds one while waiting</>,
  noPreemption: <>no-preemption is off: a thread whose <code>tryLock</code> fails gives back what it holds and starts over</>,
  circularWait: <>circular wait is off: everyone takes locks in one global order, so a cycle can't close</>,
};

const INTRO: Record<PresetId, ReactNode> = {
  two: <>The <code>race-conditions</code> case: T1 locks A then B, T2 locks B then A.</>,
  dining: <>Five philosophers, five forks. Each picks up the fork on their left, then the one on their right.</>,
  transfer: <>Three services each move money between two accounts: T1 locks A then B, T2 B then C, T3 C then A.</>,
  database: <>Two transactions update the same two rows in opposite order. T1 begins first, T2 one tick later. A detector checks for cycles every {DETECT_EVERY} ticks.</>,
};

const who = (t: string) => <span className="hl info">{t}</span>;
const list = (xs: readonly string[]) => (xs.length ? xs.join(' and ') : 'nothing');

function intro(p: Preset, c: Conditions): ReactNode {
  const off = CONDITION_KEYS.filter((k) => !c[k]);
  if (off.length === 0) return <>{INTRO[p.id]} All four Coffman conditions hold.</>;
  return (
    <>
      {INTRO[p.id]} Fix in place: {off.map((k, i) => <span key={k}>{i > 0 && '; '}{CONDITION_FIX[k]}</span>)}.
    </>
  );
}

export function caption(note: Note, p: Preset, c: Conditions, s: DlState, cycle: string[] | null): ReactNode {
  switch (note.kind) {
    case 'start':
      return intro(p, c);
    case 'grab':
      if (note.shared) return <>{who(note.t)} takes a read-only copy of {list(note.locks)}. Shared, so nobody has to wait for it.</>;
      if (note.locks.length > 1) return <>{who(note.t)} finds {list(note.locks)} all free and takes them together, in one step.</>;
      return <>{who(note.t)} locks {note.locks[0]}.</>;
    case 'block':
      return (
        <>
          {who(note.t)} asks for {note.lock}, but {note.holder} holds it. {note.t} <b>sleeps</b> until {note.lock} is free, still holding{' '}
          {list(s.threads.find((t) => t.id === note.t)!.holds)}.
          {cycle && <> The graph now has a <span className="hl bad">cycle</span>.</>}
        </>
      );
    case 'blockAll':
      return (
        <>
          {who(note.t)} needs everything at once, but {list(note.missing)} {note.missing.length > 1 ? 'are' : 'is'} taken.{' '}
          {c.noPreemption ? 'It waits holding nothing.' : 'It holds nothing, so it backs off and tries again.'}
        </>
      );
    case 'tryFail':
      return note.holding.length ? (
        <>
          {who(note.t)}'s <code>tryLock({note.lock})</code> fails: {note.holder} holds it. Rather than wait while holding {list(note.holding)}, it will give{' '}
          {note.holding.length > 1 ? 'them' : 'it'} back on its next turn.
          {cycle && <> For a moment the graph has a cycle, but this one gets broken.</>}
        </>
      ) : (
        <>{who(note.t)}'s <code>tryLock({note.lock})</code> fails: {note.holder} holds it. {note.t} holds nothing, so it backs off and tries again.</>
      );
    case 'release':
      if (note.reason === 'done') return <>{who(note.t)} is done: it unlocks {list(note.locks)}.</>;
      return note.locks.length ? (
        <>{who(note.t)} unlocks {list(note.locks)} and backs off before starting over: it gives up its locks (it preempts itself).</>
      ) : (
        <>{who(note.t)} backs off before trying again.</>
      );
    case 'work':
      return <>{who(note.t)} holds {list(s.threads.find((t) => t.id === note.t)!.holds)} and does its work.</>;
    case 'idle':
      if (cycle && p.detector) return <>The transactions in the cycle are asleep. Nothing moves until the detector's next check.</>;
      return <>Nobody can run this tick: the threads that could are still backing off or waiting to retry.</>;
    case 'abort':
      return (
        <>
          The detector finds a cycle ({describeCycle(note.cycle)}) and aborts <span className="hl orange">{note.victim}</span>, the transaction that
          began last, rolling back its lock on {list(note.released)}. The rest can go on; {note.victim} retries after a pause.
        </>
      );
    case 'finished': {
      const aborts = s.log.filter((l) => l.text === 'ERROR: deadlock detected').length;
      return (
        <>
          <span className="hl ok">All {s.threads.length} finished.</span>{' '}
          {aborts > 0 ? <>The detector broke {plural(aborts, 'deadlock')} by rolling back a victim, which then retried. </> : <>No deadlock in this run. </>}
          Longest anyone waited: {note.longest.t}, {plural(note.longest.ticks, 'tick')}.
        </>
      );
    }
    case 'deadlock':
      return (
        <>
          <span className="hl bad">Deadlock.</span> {describeCycle(note.cycle)}. All four conditions hold, so nobody can ever move. Nothing crashes:
          it just hangs.
        </>
      );
    case 'livelock':
      return (
        <>
          <span className="hl bad">Livelock.</span> This is exactly the state from tick {note.since}: taking turns with a fixed retry delay, the threads
          grab, fail and release in lockstep forever. Nobody is blocked, nobody finishes. Switch the retry delay to random to break the tie.
        </>
      );
    case 'timeout':
      return <>Stopped after {MAX_TICKS} ticks without everyone finishing.</>;
  }
}

export function buildFrames(id: PresetId, o: RunOptions): DlFrame[] {
  const p = PRESETS[id];
  return run(p, o).map((s, i, all) => {
    const cycle = ragCycle(p, s);
    const end = i === all.length - 1;
    return { ...s, cycle, say: caption(s.note, p, o.conditions, s, cycle), hold: end || s.note.kind === 'abort' ? VERDICT_HOLD : undefined };
  });
}

/** Seeds tried for the "how often does it deadlock" stat. */
export const RATE_SEEDS = 200;

/**
 * How many random orderings of this setup deadlock: they end frozen, or (with a detector)
 * need a victim aborted. The rest slip through.
 */
export function deadlockCount(id: PresetId, conditions: Conditions): number {
  let n = 0;
  for (let seed = 0; seed < RATE_SEEDS; seed++) {
    const states = run(PRESETS[id], { conditions, schedule: { kind: 'random', seed }, backoff: 'random' });
    if (states.some((s) => s.note.kind === 'deadlock' || s.note.kind === 'abort')) n++;
  }
  return n;
}
