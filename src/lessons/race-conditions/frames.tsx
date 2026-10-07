import type { ReactNode } from 'react';
import type { Frame } from '../../core/types';
import { EXPECTED, TNAME, simulate, type Note, type ProgramKey, type RcState, type Tid } from './sim';

export interface RcFrame extends Frame, RcState {}

/** Seconds to linger on a verdict. */
const VERDICT_HOLD = 2;

const who = (t: Tid) => <span className={`hl ${t === 0 ? 'info' : 'violet'}`}>{TNAME[t]}</span>;
const list = (xs: string[]) => xs.join(' and ');

export function caption(note: Note): ReactNode {
  switch (note.kind) {
    case 'start':
      if (note.key === 'race') return <>Two threads each run <code>count = count + 1</code>. That one line is really <b>three</b> steps: read, add, write. Start at 0; we expect {EXPECTED}.</>;
      if (note.key === 'mutex') return <>Same increment, now wrapped in a <span className="hl ok">mutex</span>. Only the thread holding the lock may touch count.</>;
      if (note.key === 'deadlock') return <>A bank transfer needs two locks, A and B. T1 takes them A then B; T2 takes them <b>B then A</b>.</>;
      return <>The fix: <b>everyone takes locks in the same order</b>, A before B.</>;
    case 'grab':
      return <>{who(note.t)} grabs lock <b>{note.lock}</b>. Nobody else can hold it until {TNAME[note.t]} lets go.</>;
    case 'wait':
      return <>{who(note.t)} wants <b>{note.lock}</b>, but {TNAME[note.holder]} holds it. {TNAME[note.t]} is <span className="hl bad">blocked</span> and has to wait.</>;
    case 'release':
      return <>{who(note.t)} releases <b>{note.lock}</b>. Anyone waiting for it can go now.</>;
    case 'read':
      return <>{who(note.t)} <b>reads</b> count ({note.value}) into its own register.</>;
    case 'add':
      return <>{who(note.t)} adds 1 in its register: {note.value}. Memory still says {note.memory}.</>;
    case 'write':
      return note.lost ? (
        <>
          {who(note.t)} <b>writes</b> {note.value} over the {note.before} that's already there. The other thread's increment just{' '}
          <span className="hl bad">vanished</span>.
        </>
      ) : (
        <>{who(note.t)} <b>writes</b> {note.value} back to memory.</>
      );
    case 'work':
      return <>{who(note.t)} holds both locks and does its work.</>;
    case 'deadlock':
      return (
        <>
          <span className="hl bad">Deadlock.</span> T1 holds {list(note.holds[0])} and waits for {note.wants[0]}; T2 holds{' '}
          {list(note.holds[1])} and waits for {note.wants[1]}. Neither can ever continue. Nothing crashes, it just hangs
          forever.
        </>
      );
    case 'done':
      return doneCaption(note);
  }
}

function doneCaption({ key, count, waited }: Extract<Note, { kind: 'done' }>): ReactNode {
  if (key === 'race')
    return count === EXPECTED ? (
      <>count = <span className="hl ok">{count}</span>. Correct, but only because this order was lucky. Try the unlucky one.</>
    ) : (
      <>
        count = <span className="hl bad">{count}</span>, not {EXPECTED}. A <b>lost update</b>. Fix it with a lock, or an atomic
        increment (e.g. <code>fetch_add</code>) that does read-add-write as one indivisible step.
      </>
    );
  if (key === 'mutex')
    return (
      <>
        count = <span className="hl ok">{count}</span>. The lock made read-add-write happen as one unit. Correct in <b>every</b>{' '}
        ordering, at the cost of {waited.length ? <>{waited.map((t) => TNAME[t]).join(' and ')} waiting</> : 'a lock on every increment'}.
      </>
    );
  return <>Both finished. With one agreed lock order there can't be a cycle of waiting, so <span className="hl ok">no deadlock</span>.</>;
}

/** Run the programs and caption every step. */
export function buildFrames(key: ProgramKey, picks: readonly Tid[], strict = false): RcFrame[] {
  return simulate(key, picks, strict).map((s) => ({
    ...s,
    say: caption(s.note),
    hold: s.event === 'deadlock' || s.event === 'done' ? VERDICT_HOLD : undefined,
  }));
}
