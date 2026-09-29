import type { ReactNode } from 'react';
import type { Frame } from '../../core/types';

export type Tid = 0 | 1;
export const TNAME = ['T1', 'T2'] as const;

export const PROGRAMS = {
  race: [
    ['tmp = count', 'tmp = tmp + 1', 'count = tmp'],
    ['tmp = count', 'tmp = tmp + 1', 'count = tmp'],
  ],
  mutex: [
    ['lock(m)', 'tmp = count', 'tmp = tmp + 1', 'count = tmp', 'unlock(m)'],
    ['lock(m)', 'tmp = count', 'tmp = tmp + 1', 'count = tmp', 'unlock(m)'],
  ],
  deadlock: [
    ['lock(A)', 'lock(B)', 'transfer()', 'unlock(B)', 'unlock(A)'],
    ['lock(B)', 'lock(A)', 'transfer()', 'unlock(A)', 'unlock(B)'],
  ],
  ordered: [
    ['lock(A)', 'lock(B)', 'transfer()', 'unlock(B)', 'unlock(A)'],
    ['lock(A)', 'lock(B)', 'transfer()', 'unlock(B)', 'unlock(A)'],
  ],
} satisfies Record<string, [string[], string[]]>;

export type ProgramKey = keyof typeof PROGRAMS;

export interface LogEntry {
  t: Tid;
  text: string;
  kind: 'step' | 'lock' | 'wait' | 'lost';
}

export interface RcFrame extends Frame {
  count: number;
  tmp: [number | null, number | null];
  pc: [number, number];
  locks: Record<string, Tid | null>;
  waiting: [string | null, string | null];
  /** Thread that acted this frame, and which of its lines. */
  active: Tid | null;
  line: number | null;
  event: 'start' | 'step' | 'wait' | 'lost' | 'deadlock' | 'done';
  log: LogEntry[];
  done: [boolean, boolean];
  /** How many times the count has been written (successful increments attempted). */
  writes: number;
}

const other = (t: Tid): Tid => (t === 0 ? 1 : 0);

/**
 * Run two programs under a given scheduling preference.
 * `picks` says which thread the scheduler *wants* to run next; a thread that is
 * already blocked on a held lock is skipped (it would just spin), and if both
 * are blocked on each other we have a deadlock.
 */
export function simulate(key: ProgramKey, picks: Tid[], strict = false): RcFrame[] {
  const progs = PROGRAMS[key];
  const locks: Record<string, Tid | null> = {};
  for (const p of progs) for (const l of p) {
    const m = l.match(/^lock\((\w+)\)$/);
    if (m) locks[m[1]] = null;
  }
  let s: RcFrame = {
    count: 0, tmp: [null, null], pc: [0, 0], locks, waiting: [null, null],
    active: null, line: null, event: 'start', log: [], done: [false, false], writes: 0,
    say: startSay(key),
  };
  const frames: RcFrame[] = [s];
  const done = (st: RcFrame, t: Tid) => st.pc[t] >= progs[t].length;
  const blocked = (st: RcFrame, t: Tid) => {
    const w = st.waiting[t];
    return w !== null && st.locks[w] !== null && st.locks[w] !== t;
  };

  for (let guard = 0, k = 0; guard < 60; guard++) {
    if (done(s, 0) && done(s, 1)) break;
    let t: Tid = picks[k] ?? (k % 2 === 0 ? 0 : 1);
    if (strict) {
      if (k >= picks.length) break;
      k++;
      if (done(s, t)) continue;
    } else {
      k++;
      if (done(s, t)) t = other(t);
      if (blocked(s, t)) {
        // it already knows it's waiting; let the other thread run instead
        const o = other(t);
        if (done(s, o) || blocked(s, o)) {
          frames.push({
            ...s, active: null, line: null, event: 'deadlock', hold: 2,
            say: (
              <>
                <span className="hl bad">Deadlock.</span> T1 holds A and waits for B; T2 holds B and waits for A. Neither
                can ever continue. Nothing crashes, it just hangs forever.
              </>
            ),
          });
          return frames;
        }
        t = o;
      }
    }
    s = exec(s, t, progs[t]);
    s.done = [done(s, 0), done(s, 1)];
    frames.push(s);
  }

  const last = frames[frames.length - 1];
  if (last.done[0] && last.done[1]) {
    frames.push({ ...last, active: null, line: null, event: 'done', hold: 2, say: endSay(key, last) });
  }
  return frames;
}

function exec(prev: RcFrame, t: Tid, prog: string[]): RcFrame {
  const line = prev.pc[t];
  const instr = prog[line];
  const s: RcFrame = {
    ...prev, tmp: [...prev.tmp] as RcFrame['tmp'], pc: [...prev.pc] as RcFrame['pc'],
    locks: { ...prev.locks }, waiting: [...prev.waiting] as RcFrame['waiting'],
    active: t, line, event: 'step', log: [...prev.log], hold: undefined,
  };
  const name = TNAME[t];
  const tc = t === 0 ? 'info' : 'violet';
  const who = <span className={`hl ${tc}`}>{name}</span>;
  const lock = instr.match(/^(lock|unlock)\((\w+)\)$/);

  if (lock && lock[1] === 'lock') {
    const l = lock[2];
    if (s.locks[l] === null) {
      s.locks[l] = t;
      s.waiting[t] = null;
      s.pc[t]++;
      s.log.push({ t, text: `lock ${l}`, kind: 'lock' });
      s.say = <>{who} grabs lock <b>{l}</b>. Nobody else can hold it until {name} lets go.</>;
    } else {
      s.waiting[t] = l;
      s.event = 'wait';
      s.log.push({ t, text: `wait ${l}`, kind: 'wait' });
      s.say = <>{who} wants <b>{l}</b>, but {TNAME[s.locks[l]!]} holds it. {name} is <span className="hl bad">blocked</span> and has to wait.</>;
    }
  } else if (lock) {
    const l = lock[2];
    s.locks[l] = null;
    s.pc[t]++;
    s.log.push({ t, text: `unlock ${l}`, kind: 'lock' });
    s.say = <>{who} releases <b>{l}</b>. Anyone waiting for it can go now.</>;
  } else if (instr === 'tmp = count') {
    s.tmp[t] = s.count;
    s.pc[t]++;
    s.log.push({ t, text: `read ${s.count}`, kind: 'step' });
    s.say = <>{who} <b>reads</b> count ({s.count}) into its own register.</>;
  } else if (instr === 'tmp = tmp + 1') {
    s.tmp[t] = (s.tmp[t] ?? 0) + 1;
    s.pc[t]++;
    s.log.push({ t, text: `add → ${s.tmp[t]}`, kind: 'step' });
    s.say = <>{who} adds 1 in its register: {s.tmp[t]}. Memory still says {s.count}.</>;
  } else if (instr === 'count = tmp') {
    const before = s.count;
    s.count = s.tmp[t] ?? 0;
    s.writes++;
    s.pc[t]++;
    const lost = s.count <= before && s.writes > 1;
    s.log.push({ t, text: `write ${s.count}`, kind: lost ? 'lost' : 'step' });
    s.event = lost ? 'lost' : 'step';
    s.say = lost ? (
      <>
        {who} <b>writes</b> {s.count} over the {before} that's already there. The other thread's increment just{' '}
        <span className="hl bad">vanished</span>.
      </>
    ) : (
      <>{who} <b>writes</b> {s.count} back to memory.</>
    );
  } else {
    s.pc[t]++;
    s.log.push({ t, text: 'transfer', kind: 'step' });
    s.say = <>{who} holds both locks and does its work.</>;
  }
  return s;
}

function startSay(key: ProgramKey): ReactNode {
  if (key === 'race') return <>Two threads each run <code>count = count + 1</code>. That one line is really <b>three</b> steps: read, add, write. Start at 0; we expect 2.</>;
  if (key === 'mutex') return <>Same increment, now wrapped in a <span className="hl ok">mutex</span>. Only the thread holding the lock may touch count.</>;
  if (key === 'deadlock') return <>A bank transfer needs two locks, A and B. T1 takes them A then B; T2 takes them <b>B then A</b>.</>;
  return <>The fix: <b>everyone takes locks in the same order</b>, A before B.</>;
}

function endSay(key: ProgramKey, f: RcFrame): ReactNode {
  if (key === 'race')
    return f.count === 2 ? (
      <>count = <span className="hl ok">2</span>. Correct, but only because this order was lucky. Try the unlucky one.</>
    ) : (
      <>
        count = <span className="hl bad">{f.count}</span>, not 2. A <b>lost update</b>. Fix it with a lock, or an atomic
        increment (e.g. <code>fetch_add</code>) that does read-add-write as one indivisible step.
      </>
    );
  if (key === 'mutex') return <>count = <span className="hl ok">{f.count}</span>. The lock made read-add-write happen as one unit. Correct in <b>every</b> ordering, at the cost of T2 waiting.</>;
  return <>Both finished. With one agreed lock order there can't be a cycle of waiting, so <span className="hl ok">no deadlock</span>.</>;
}
