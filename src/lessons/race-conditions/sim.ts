// Pure model behind the race-conditions lesson: two threads stepping through tiny programs
// under a chosen schedule, with shared count, per-thread registers and locks. Each step
// carries a typed note; frames.tsx turns notes into captions.

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

/** Each thread increments once, so a correct run ends at 2. */
export const EXPECTED = 2;

export interface LogEntry {
  t: Tid;
  text: string;
  kind: 'step' | 'lock' | 'wait' | 'lost';
}

/** What a step did, for its caption. */
export type Note =
  | { kind: 'start'; key: ProgramKey }
  | { kind: 'grab'; t: Tid; lock: string }
  | { kind: 'wait'; t: Tid; lock: string; holder: Tid }
  | { kind: 'release'; t: Tid; lock: string }
  | { kind: 'read'; t: Tid; value: number }
  | { kind: 'add'; t: Tid; value: number; memory: number }
  | { kind: 'write'; t: Tid; value: number; before: number; lost: boolean }
  | { kind: 'work'; t: Tid }
  | { kind: 'deadlock'; holds: [string[], string[]]; wants: [string, string] }
  | { kind: 'done'; key: ProgramKey; count: number; waited: Tid[] };

export interface RcState {
  count: number;
  tmp: [number | null, number | null];
  pc: [number, number];
  locks: Record<string, Tid | null>;
  waiting: [string | null, string | null];
  /** Thread that acted this step, and which of its lines. */
  active: Tid | null;
  line: number | null;
  event: 'start' | 'step' | 'wait' | 'lost' | 'deadlock' | 'done';
  log: LogEntry[];
  done: [boolean, boolean];
  /** How many times the count has been written. */
  writes: number;
  note: Note;
}

const other = (t: Tid): Tid => (t === 0 ? 1 : 0);

/** Thread `t` is waiting on a lock somebody else holds. */
export const isBlocked = (s: RcState, t: Tid) => {
  const w = s.waiting[t];
  return w !== null && s.locks[w] !== null && s.locks[w] !== t;
};

/**
 * Run two programs under a given scheduling preference.
 * `picks` says which thread the scheduler *wants* to run next. In free mode a finished
 * thread hands over to the other, a thread already blocked on a held lock is skipped (it
 * would just spin), and if both are stuck the run ends in a deadlock. In strict mode
 * (the learner's own schedule) the picks are followed exactly and the run stops when
 * they run out.
 */
export function simulate(key: ProgramKey, picks: readonly Tid[], strict = false): RcState[] {
  const progs = PROGRAMS[key];
  const locks: Record<string, Tid | null> = {};
  for (const p of progs) for (const l of p) {
    const m = l.match(/^lock\((\w+)\)$/);
    if (m) locks[m[1]] = null;
  }
  let s: RcState = {
    count: 0, tmp: [null, null], pc: [0, 0], locks, waiting: [null, null],
    active: null, line: null, event: 'start', log: [], done: [false, false], writes: 0,
    note: { kind: 'start', key },
  };
  const states: RcState[] = [s];
  const done = (st: RcState, t: Tid) => st.pc[t] >= progs[t].length;

  for (let guard = 0, k = 0; guard < MAX_STEPS; guard++) {
    if (done(s, 0) && done(s, 1)) break;
    let t: Tid = picks[k] ?? (k % 2 === 0 ? 0 : 1);
    if (strict) {
      if (k >= picks.length) break;
      k++;
      if (done(s, t)) continue;
    } else {
      k++;
      if (done(s, t)) t = other(t);
      if (isBlocked(s, t)) {
        // it already knows it's waiting; let the other thread run instead
        const o = other(t);
        if (done(s, o) || isBlocked(s, o)) {
          const holds = ([0, 1] as Tid[]).map((x) => Object.keys(s.locks).filter((l) => s.locks[l] === x)) as [string[], string[]];
          states.push({ ...s, active: null, line: null, event: 'deadlock', note: { kind: 'deadlock', holds, wants: [s.waiting[0]!, s.waiting[1]!] } });
          return states;
        }
        t = o;
      }
    }
    s = exec(s, t, progs[t]);
    s.done = [done(s, 0), done(s, 1)];
    states.push(s);
  }

  const last = states[states.length - 1];
  if (last.done[0] && last.done[1]) {
    const waited = ([0, 1] as Tid[]).filter((t) => last.log.some((l) => l.t === t && l.kind === 'wait'));
    states.push({ ...last, active: null, line: null, event: 'done', note: { kind: 'done', key, count: last.count, waited } });
  }
  return states;
}

/** Enough steps for both threads to finish even with every wait in between. */
const MAX_STEPS = 60;

function exec(prev: RcState, t: Tid, prog: string[]): RcState {
  const line = prev.pc[t];
  const instr = prog[line];
  const s: RcState = {
    ...prev, tmp: [...prev.tmp] as RcState['tmp'], pc: [...prev.pc] as RcState['pc'],
    locks: { ...prev.locks }, waiting: [...prev.waiting] as RcState['waiting'],
    active: t, line, event: 'step', log: [...prev.log],
  };
  const lock = instr.match(/^(lock|unlock)\((\w+)\)$/);

  if (lock && lock[1] === 'lock') {
    const l = lock[2];
    const holder = s.locks[l];
    if (holder === null) {
      s.locks[l] = t;
      s.waiting[t] = null;
      s.pc[t]++;
      s.log.push({ t, text: `lock ${l}`, kind: 'lock' });
      s.note = { kind: 'grab', t, lock: l };
    } else {
      s.waiting[t] = l;
      s.event = 'wait';
      s.log.push({ t, text: `wait ${l}`, kind: 'wait' });
      s.note = { kind: 'wait', t, lock: l, holder };
    }
  } else if (lock) {
    const l = lock[2];
    s.locks[l] = null;
    s.pc[t]++;
    s.log.push({ t, text: `unlock ${l}`, kind: 'lock' });
    s.note = { kind: 'release', t, lock: l };
  } else if (instr === 'tmp = count') {
    s.tmp[t] = s.count;
    s.pc[t]++;
    s.log.push({ t, text: `read ${s.count}`, kind: 'step' });
    s.note = { kind: 'read', t, value: s.count };
  } else if (instr === 'tmp = tmp + 1') {
    s.tmp[t] = (s.tmp[t] ?? 0) + 1;
    s.pc[t]++;
    s.log.push({ t, text: `add → ${s.tmp[t]}`, kind: 'step' });
    s.note = { kind: 'add', t, value: s.tmp[t]!, memory: s.count };
  } else if (instr === 'count = tmp') {
    const before = s.count;
    s.count = s.tmp[t] ?? 0;
    s.writes++;
    s.pc[t]++;
    // a later write that doesn't raise the count overwrote an increment
    const lost = s.count <= before && s.writes > 1;
    s.log.push({ t, text: `write ${s.count}`, kind: lost ? 'lost' : 'step' });
    s.event = lost ? 'lost' : 'step';
    s.note = { kind: 'write', t, value: s.count, before, lost };
  } else {
    s.pc[t]++;
    s.log.push({ t, text: 'transfer', kind: 'step' });
    s.note = { kind: 'work', t };
  }
  return s;
}

/** Every way to interleave two threads' steps, as pick lists (each keeps its own order). */
export function interleavings(a: number, b: number): Tid[][] {
  if (a === 0) return [Array<Tid>(b).fill(1)];
  if (b === 0) return [Array<Tid>(a).fill(0)];
  return [...interleavings(a - 1, b).map((r) => [0 as Tid, ...r]), ...interleavings(a, b - 1).map((r) => [1 as Tid, ...r])];
}

/** How many orderings of the unlocked increment lose an update, out of how many. */
export function lostUpdateTally() {
  const all = interleavings(PROGRAMS.race[0].length, PROGRAMS.race[1].length);
  const lost = all.filter((p) => simulate('race', p, true).at(-1)!.count !== EXPECTED).length;
  return { lost, total: all.length };
}
