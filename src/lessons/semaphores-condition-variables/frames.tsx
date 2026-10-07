import type { ReactNode } from 'react';
import { pct, plural } from '../../core/format';
import type { Frame } from '../../core/types';
import { MAX_TICKS, explore, replay, simulate, type Config, type Exploration, type Note, type Variant, type World } from './model';

export interface ScFrame extends Frame, World {}

const VERDICT_HOLD = 3;

const INTRO: Record<Variant, ReactNode> = {
  busy: <>Busy-waiting: a thread that can't go yet loops, dropping and retaking the lock to re-check <code>count</code>. Correct, but it burns the CPU.</>,
  semaphore: (
    <>
      Semaphores: <code>empty</code> starts with one token per free slot, <code>full</code> with none, and <code>mutex</code> (a binary semaphore)
      with one. <code>wait</code> takes a token or sleeps; <code>signal</code> hands one to a sleeper or puts it back.
    </>
  ),
  monitor: (
    <>
      A monitor: one lock <code>m</code> plus two condition variables. A thread that can't go yet calls <code>wait</code>, which releases{' '}
      <code>m</code> and sleeps in one atomic step.
    </>
  ),
  singleSignal: (
    <>
      One condition variable, <code>changed</code>, shared by the producer and both consumers, and woken with <code>signal</code>: it wakes
      whichever sleeper is first in line.
    </>
  ),
  singleBroadcast: (
    <>
      The same single condition variable, woken with <code>broadcast</code>: every sleeper wakes and re-checks its own condition.
    </>
  ),
  lostWakeup: (
    <>
      The consumer checks <code>count</code> <b>without holding the lock</b>, then calls plain <code>sleep()</code>; the producer calls{' '}
      <code>wakeup()</code> after each put.
    </>
  ),
};

const who = (t: string) => <span className={`hl ${t.startsWith('P') ? 'info' : 'violet'}`}>{t}</span>;
const names = (ids: readonly string[]) => ids.join(' and ');
const condText = (cond: 'full' | 'empty') => (cond === 'full' ? 'count == N' : 'count == 0');

/** Share of the CPU the run spent spinning and idle. */
export function cpuShares(cpu: readonly string[]) {
  const n = Math.max(1, cpu.length);
  return { spin: cpu.filter((x) => x === 'spin').length / n, idle: cpu.filter((x) => x === 'idle').length / n };
}

export function caption(note: Note, w: World, c: Config): ReactNode {
  const N = c.capacity;
  switch (note.kind) {
    case 'start':
      return (
        <>
          {INTRO[c.variant]}
          {c.variant === 'monitor' && c.ifBug && <> Bug switched on: <code>if</code> instead of <code>while</code>, so a woken thread doesn't re-check.</>}
        </>
      );
    case 'idle':
      return <>Nobody can run: every thread is asleep, blocked or off doing I/O, so the CPU sits <b>idle</b>.</>;
    case 'produce':
      return <>{who(note.t)} makes item <b>{note.item}</b>{note.io ? <> ({plural(c.produceTicks, 'tick')} off the CPU)</> : null}.</>;
    case 'consume':
      return <>{who(note.t)} consumes <b>{note.item}</b>{note.io ? <> ({plural(c.consumeTicks, 'tick')} off the CPU)</> : null}.</>;
    case 'lock':
      if (note.retake)
        return note.got ? (
          <>{who(note.t)} was woken and now takes <code>m</code> back, then carries on after its <code>wait</code>.</>
        ) : (
          <>{who(note.t)} is awake, but {note.holder} holds <code>m</code>, so it waits for the lock before it can carry on.</>
        );
      if (!note.got) return <>{who(note.t)} wants <code>m</code>, but {note.holder} holds it: {note.t} blocks until it's free.</>;
      return note.spin ? <>{who(note.t)} takes <code>m</code> again, to re-check.</> : <>{who(note.t)} takes <code>m</code>.</>;
    case 'unlock': {
      const retry = note.retry.length ? <> {names(note.retry)} can try for it again.</> : null;
      return note.spin ? (
        <>{who(note.t)} drops <code>m</code> so someone else can change <code>count</code>, and loops round.{retry}</>
      ) : (
        <>{who(note.t)} releases <code>m</code>.{retry}</>
      );
    }
    case 'P':
      return note.got ? (
        <>{who(note.t)} calls <code>wait({note.s})</code>: a token is there, so it takes one ({w.sems[note.s]} left) and goes on.</>
      ) : (
        <>{who(note.t)} calls <code>wait({note.s})</code>: no tokens, so it <b>sleeps</b> in {note.s}'s queue. No CPU used while it waits.</>
      );
    case 'V':
      return note.woke ? (
        <>{who(note.t)} calls <code>signal({note.s})</code>: {note.woke} was asleep on it, so the token goes straight to {note.woke}, which wakes.</>
      ) : (
        <>{who(note.t)} calls <code>signal({note.s})</code>: nobody is waiting, so {note.s} goes up to {w.sems[note.s]}.</>
      );
    case 'test': {
      if (c.variant === 'lostWakeup')
        return note.holds ? (
          <>{who(note.t)} checks <code>count == 0</code> without the lock: true, so it is about to sleep. Nothing stops the producer from running first.</>
        ) : (
          <>{who(note.t)} checks <code>count == 0</code>: false ({note.count} waiting), so it goes ahead.</>
        );
      if (note.spin) return <>{who(note.t)} checks <code>{condText(note.cond)}</code>: still true, so it spins.</>;
      return note.holds ? (
        <>{who(note.t)} checks <code>{note.keyword} ({condText(note.cond)})</code>: true (count {note.count}), so it must wait.</>
      ) : (
        <>{who(note.t)} checks <code>{note.keyword} ({condText(note.cond)})</code>: false (count {note.count}), so it goes ahead.</>
      );
    }
    case 'wait':
      return <>{who(note.t)} calls <code>wait({note.cv}, m)</code>: in one atomic step it releases <code>m</code> and <b>sleeps</b> on {note.cv}.</>;
    case 'signal':
      if (note.woke.length === 0) return <>{who(note.t)} calls <code>{note.broadcast ? 'broadcast' : 'signal'}({note.cv})</code>, but nobody is asleep on it, so nothing happens.</>;
      if (note.broadcast) return <>{who(note.t)} broadcasts on {note.cv}: {names(note.woke)} wake up, and each will re-check before going on.</>;
      return (
        <>
          {who(note.t)} signals {note.cv}: <span className="hl info">{note.woke[0]}</span> wakes. It's only a hint: {note.woke[0]} still has to get{' '}
          <code>m</code> back, and by then the buffer may have changed.
        </>
      );
    case 'put':
      return note.overflow ? (
        <><span className="hl bad">Overflow:</span> {who(note.t)} puts {note.item} into a full buffer and writes over an item nobody has taken.</>
      ) : (
        <>{who(note.t)} puts <b>{note.item}</b> into slot {note.slot} (count {w.count} of {N}).</>
      );
    case 'take':
      return note.garbage ? (
        <><span className="hl bad">Garbage read:</span> {who(note.t)} takes from an <b>empty</b> buffer.</>
      ) : (
        <>{who(note.t)} takes <b>{note.item}</b> from slot {note.slot} (count {w.count} of {N}).</>
      );
    case 'sleep':
      return <>{who(note.t)} calls <code>sleep()</code> and waits for someone to call <code>wakeup()</code>.</>;
    case 'wakeup':
      return note.woke ? (
        <>{who(note.t)} calls <code>wakeup()</code>: {note.woke} was asleep and wakes.</>
      ) : (
        <>{who(note.t)} calls <code>wakeup()</code>, but nobody is asleep yet: <span className="hl bad">the wake-up is lost</span>.</>
      );
    case 'next':
      return note.done ? <>{who(note.t)} has handled all its items: done.</> : <>{who(note.t)} loops round for its next item.</>;
    case 'finished':
      return finishedCaption(w, c);
    case 'stuck': {
      const asleep = w.threads.filter((t) => t.status !== 'done');
      return (
        <>
          <span className="hl bad">Stuck.</span> Still asleep: {asleep.map((t) => `${t.id} in ${t.on === 'wakeup' ? 'sleep()' : t.on}`).join(', ')}. Nobody is
          left awake to wake {asleep.length > 1 ? 'them' : 'it'}, with {count(w)} in the buffer.
        </>
      );
    }
    case 'violation':
      return note.what === 'garbage' ? (
        <>
          <span className="hl bad">Garbage read.</span> {note.t} was woken when an item arrived, but another consumer took it first. With <code>if</code>,{' '}
          {note.t} didn't re-check after waking, so it read an empty slot. A wake-up is a hint: wait in a <code>while</code> loop.
        </>
      ) : (
        <>
          <span className="hl bad">Overflow.</span> {note.t} was woken when a slot freed up, but another producer filled it first. With <code>if</code>{' '}
          it didn't re-check, so it overwrote an item. Wait in a <code>while</code> loop.
        </>
      );
    case 'limit':
      return <>Stopped after {MAX_TICKS} ticks.</>;
  }
}

const count = (w: World) => plural(w.count, 'item');

function finishedCaption(w: World, c: Config): ReactNode {
  const total = c.producers * c.itemsEach;
  const inOrder = w.consumed.length === total && w.consumed.every((x, i) => x === w.produced[i]) && new Set(w.consumed).size === total;
  const { spin, idle } = cpuShares(w.cpu);
  return (
    <>
      <span className="hl ok">Done</span> in {w.tick} ticks:{' '}
      {inOrder ? <>all {total} items came out in the order they went in, none lost or duplicated.</> : <>{w.consumed.length} of {total} items came out.</>}{' '}
      The CPU spent {pct(spin)} of the run spinning and {pct(idle)} idle.
    </>
  );
}

const toFrames = (worlds: World[], c: Config): ScFrame[] =>
  worlds.map((w, i) => ({ ...w, say: caption(w.note, w, c), hold: i === worlds.length - 1 ? VERDICT_HOLD : undefined }));

/** The bounded buffer under a seeded scheduler. */
export const bufferFrames = (c: Config, seed: number) => toFrames(simulate(c, seed), c);

/** The wake-up bug scenes: their configuration, every schedule counted, and one replayed. */
export function bugScene(variant: 'singleSignal' | 'singleBroadcast' | 'lostWakeup'): { config: Config; ex: Exploration; frames: ScFrame[] } {
  const config: Config =
    variant === 'lostWakeup'
      ? { variant, capacity: 1, producers: 1, consumers: 1, itemsEach: 1, produceTicks: 0, consumeTicks: 0, ifBug: false }
      : { variant, capacity: 1, producers: 1, consumers: 2, itemsEach: 2, produceTicks: 0, consumeTicks: 0, ifBug: false };
  const ex = explore(config);
  const schedule = ex.example.stuck ?? ex.example.finished!;
  return { config, ex, frames: toFrames(replay(config, schedule), config) };
}
