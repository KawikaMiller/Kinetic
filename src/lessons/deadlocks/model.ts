// Pure model behind the deadlocks lesson: threads run scripted lock acquisitions under a
// scheduler, with each of Coffman's four conditions switchable off by a real prevention
// strategy, plus a periodic deadlock detector for the database scenario.
import { mulberry32, type Rnd } from '../../core/random';

export type PresetId = 'two' | 'dining' | 'transfer' | 'database';

export interface ThreadSpec {
  id: string;
  /** The locks it needs, in the order its code takes them. */
  needs: readonly string[];
  /** Tick at which the thread (a database transaction) begins. */
  start: number;
}

export interface Preset {
  id: PresetId;
  label: string;
  threads: readonly ThreadSpec[];
  /** Every resource, in the global lock order used when circular wait is switched off. */
  resources: readonly string[];
  /** A periodic detector that aborts a victim (the database scenario). */
  detector: boolean;
}

const DINERS = 5;
const fork = (i: number) => `F${(i % DINERS) + 1}`;

export const PRESETS: Record<PresetId, Preset> = {
  two: {
    id: 'two',
    label: 'Two threads, two locks',
    threads: [
      { id: 'T1', needs: ['A', 'B'], start: 0 },
      { id: 'T2', needs: ['B', 'A'], start: 0 },
    ],
    resources: ['A', 'B'],
    detector: false,
  },
  dining: {
    id: 'dining',
    label: 'Dining philosophers',
    // Philosopher i picks up the fork on their left, then the one on their right.
    threads: Array.from({ length: DINERS }, (_, i) => ({ id: `P${i + 1}`, needs: [fork(i), fork(i + 1)], start: 0 })),
    resources: Array.from({ length: DINERS }, (_, i) => fork(i)),
    detector: false,
  },
  transfer: {
    id: 'transfer',
    label: 'Three-service transfer',
    threads: [
      { id: 'T1', needs: ['A', 'B'], start: 0 },
      { id: 'T2', needs: ['B', 'C'], start: 0 },
      { id: 'T3', needs: ['C', 'A'], start: 0 },
    ],
    resources: ['A', 'B', 'C'],
    detector: false,
  },
  database: {
    id: 'database',
    label: 'Database deadlock',
    threads: [
      { id: 'T1', needs: ['row 1', 'row 2'], start: 0 },
      { id: 'T2', needs: ['row 2', 'row 1'], start: 1 },
    ],
    resources: ['row 1', 'row 2'],
    detector: true,
  },
};

/** Each Coffman condition: true = present (the default, deadlock-prone), false = broken by its fix. */
export interface Conditions {
  mutualExclusion: boolean;
  holdAndWait: boolean;
  noPreemption: boolean;
  circularWait: boolean;
}

export const ALL_ON: Conditions = { mutualExclusion: true, holdAndWait: true, noPreemption: true, circularWait: true };
export const CONDITION_KEYS = ['mutualExclusion', 'holdAndWait', 'noPreemption', 'circularWait'] as const;
export type ConditionKey = (typeof CONDITION_KEYS)[number];

export type Schedule = { kind: 'turns' } | { kind: 'random'; seed: number };
/** How long a thread whose tryLock failed waits before starting over. */
export type Backoff = 'fixed' | 'random';

/** Ticks of critical-section work once a thread holds everything. */
export const WORK_TICKS = 1;
/** The detector looks for a cycle every this many ticks. */
export const DETECT_EVERY = 3;
/** Ticks a rolled-back transaction waits before it retries. */
export const ABORT_TICKS = 2;
/** Fixed back-off after a failed tryLock (0: retry on the very next turn). */
export const FIXED_BACKOFF = 0;
/**
 * Random back-off is 0..(this × thread count) ticks: it has to outlast a lap of the other
 * threads, or turn-taking puts them straight back in lockstep.
 */
export const RANDOM_BACKOFF_PER_THREAD = 2;
export const MAX_TICKS = 160;

export type Status = 'idle' | 'running' | 'waiting' | 'backoff' | 'aborted' | 'done';

export interface ThreadState {
  id: string;
  /** Next lock index in `order`; order.length = working; order.length + 1 = releasing. */
  pc: number;
  order: readonly string[];
  holds: string[];
  /** Locks it's asking for and can't get yet (request edges). */
  wants: string[];
  status: Status;
  /** Ticks left in the critical section, back-off or abort pause. */
  left: number;
  /** When this attempt (transaction) started: the detector's age rule. */
  startedAt: number;
  waitedFor: number;
  longestWait: number;
  restarts: number;
}

export type Note =
  | { kind: 'start' }
  | { kind: 'grab'; t: string; locks: string[]; shared: boolean }
  | { kind: 'block'; t: string; lock: string; holder: string }
  | { kind: 'blockAll'; t: string; missing: string[] }
  | { kind: 'tryFail'; t: string; lock: string; holder: string; holding: string[] }
  | { kind: 'release'; t: string; locks: string[]; reason: 'done' | 'backoff' }
  | { kind: 'work'; t: string }
  | { kind: 'idle' }
  | { kind: 'detect'; cycle: string[] | null }
  | { kind: 'abort'; victim: string; cycle: string[]; released: string[] }
  | { kind: 'finished'; longest: { t: string; ticks: number } }
  | { kind: 'deadlock'; cycle: string[] }
  | { kind: 'livelock'; since: number }
  | { kind: 'timeout' };

export interface DlState {
  tick: number;
  threads: ThreadState[];
  /** Resource → threads holding it (more than one only when it's shareable). */
  holders: Record<string, string[]>;
  /** The thread that acted this tick. */
  active: string | null;
  /** The aborted victim, while it's rolled back. */
  victim: string | null;
  /** Database log lines so far. */
  log: { text: string; tone: 'bad' | 'orange' | 'muted' }[];
  note: Note;
}

// ---- the resource-allocation graph ----

export interface RagEdge {
  from: string;
  to: string;
  kind: 'request' | 'assign';
}

/** Request edges thread → resource, assignment edges resource → thread. */
export function ragEdges(s: Pick<DlState, 'threads' | 'holders'>): RagEdge[] {
  const edges: RagEdge[] = [];
  for (const [r, hs] of Object.entries(s.holders)) for (const h of hs) edges.push({ from: r, to: h, kind: 'assign' });
  for (const t of s.threads) for (const r of t.wants) edges.push({ from: t.id, to: r, kind: 'request' });
  return edges;
}

/**
 * One directed cycle as its node list (closing back to the first), or null: three-colour
 * depth-first search, the same check graph-representations uses.
 */
export function findCycle(nodes: readonly string[], edges: readonly { from: string; to: string }[]): string[] | null {
  const out = new Map<string, string[]>(nodes.map((n) => [n, []]));
  for (const e of edges) out.get(e.from)?.push(e.to);
  const colour = new Map<string, 0 | 1 | 2>(nodes.map((n) => [n, 0]));
  const stack: string[] = [];
  const visit = (u: string): string[] | null => {
    colour.set(u, 1);
    stack.push(u);
    for (const v of out.get(u) ?? []) {
      if (colour.get(v) === 1) return stack.slice(stack.indexOf(v));
      if (colour.get(v) === 0) {
        const c = visit(v);
        if (c) return c;
      }
    }
    stack.pop();
    colour.set(u, 2);
    return null;
  };
  for (const n of nodes) {
    if (colour.get(n) !== 0) continue;
    const c = visit(n);
    if (c) return c;
  }
  return null;
}

export const ragNodes = (p: Preset) => [...p.threads.map((t) => t.id), ...p.resources];

export function ragCycle(p: Preset, s: Pick<DlState, 'threads' | 'holders'>): string[] | null {
  return findCycle(ragNodes(p), ragEdges(s));
}

// ---- the scheduler ----

/** The lock order a thread's code uses: its own, or the global one when circular wait is off. */
export function lockOrder(p: Preset, t: ThreadSpec, c: Conditions): string[] {
  if (c.circularWait) return [...t.needs];
  return [...t.needs].sort((a, b) => p.resources.indexOf(a) - p.resources.indexOf(b));
}

const cloneThreads = (ts: readonly ThreadState[]) => ts.map((t) => ({ ...t, holds: [...t.holds], wants: [...t.wants] }));
const cloneHolders = (h: Record<string, string[]>) => Object.fromEntries(Object.entries(h).map(([k, v]) => [k, [...v]]));

/** Someone other than `t` holds `r` exclusively. */
const heldByOther = (s: DlState, r: string, t: string, c: Conditions) => c.mutualExclusion && s.holders[r].some((h) => h !== t);

/** Could this thread do something useful if it got the CPU now? */
function canRun(s: DlState, t: ThreadState, c: Conditions): boolean {
  if (t.status === 'done' || t.status === 'backoff' || t.status === 'aborted' || t.status === 'idle') return false;
  if (t.status !== 'waiting') return true;
  // tryLock threads are never parked: their next turn is the release.
  if (!c.noPreemption) return true;
  // A blocked thread sleeps until everything it's asking for is free.
  return t.wants.every((r) => !heldByOther(s, r, t.id, c));
}

/** One scheduled step of thread `t`; returns the note for it. */
function act(s: DlState, t: ThreadState, c: Conditions): Note {
  if (t.status === 'waiting' && !c.noPreemption) {
    // tryLock failed last turn: give back everything and back off.
    const released = [...t.holds];
    for (const r of released) s.holders[r] = s.holders[r].filter((h) => h !== t.id);
    t.holds = [];
    t.wants = [];
    t.pc = 0;
    t.status = 'backoff';
    return { kind: 'release', t: t.id, locks: released, reason: 'backoff' };
  }
  if (t.pc < t.order.length) {
    const wanted = c.holdAndWait ? [t.order[t.pc]] : t.order.slice(t.pc);
    const missing = wanted.filter((r) => heldByOther(s, r, t.id, c));
    if (missing.length === 0) {
      for (const r of wanted) s.holders[r].push(t.id);
      t.holds.push(...wanted);
      t.pc += wanted.length;
      t.wants = [];
      t.status = 'running';
      return { kind: 'grab', t: t.id, locks: wanted, shared: !c.mutualExclusion };
    }
    t.wants = missing;
    t.status = 'waiting';
    if (!c.holdAndWait) return { kind: 'blockAll', t: t.id, missing };
    const holder = s.holders[missing[0]].find((h) => h !== t.id)!;
    if (!c.noPreemption) return { kind: 'tryFail', t: t.id, lock: missing[0], holder, holding: [...t.holds] };
    return { kind: 'block', t: t.id, lock: missing[0], holder };
  }
  if (t.pc === t.order.length) {
    t.status = 'running';
    if (--t.left <= 0) t.pc++;
    return { kind: 'work', t: t.id };
  }
  const released = [...t.holds];
  for (const r of released) s.holders[r] = s.holders[r].filter((h) => h !== t.id);
  t.holds = [];
  t.status = 'done';
  return { kind: 'release', t: t.id, locks: released, reason: 'done' };
}

/** The whole machine state that decides what happens next (for spotting a repeat). */
const stateKey = (s: DlState, rr: number, detector: boolean) => {
  // Only ages' order matters to the detector, and only the tick's phase to its timer.
  const age = s.threads.map((t) => s.threads.filter((u) => u.startedAt < t.startedAt).length);
  return JSON.stringify([rr, detector ? s.tick % DETECT_EVERY : 0, age, s.threads.map((t) => [t.pc, t.holds, t.wants, t.status, t.left])]);
};

export interface RunOptions {
  conditions: Conditions;
  schedule: Schedule;
  backoff: Backoff;
  /** Seed for random back-off when the schedule itself is turn-taking. */
  backoffSeed?: number;
}

/**
 * Run a preset to the end: every thread finished, a permanent deadlock, a provable livelock
 * (turn-taking with a fixed back-off is deterministic, so a repeated state repeats forever),
 * or MAX_TICKS. Returns one state per tick, the start state first and the verdict last.
 */
export function run(p: Preset, o: RunOptions): DlState[] {
  const c = o.conditions;
  const rnd: Rnd | null = o.schedule.kind === 'random' ? mulberry32(o.schedule.seed) : null;
  const backoffRnd: Rnd = rnd ?? mulberry32(o.backoffSeed ?? 1);
  const threads: ThreadState[] = p.threads.map((t) => ({
    id: t.id, pc: 0, order: lockOrder(p, t, c), holds: [], wants: [], status: t.start > 0 ? 'idle' : 'running',
    left: WORK_TICKS, startedAt: t.start, waitedFor: 0, longestWait: 0, restarts: 0,
  }));
  let s: DlState = {
    tick: 0, threads, holders: Object.fromEntries(p.resources.map((r) => [r, []])), active: null, victim: null, log: [], note: { kind: 'start' },
  };
  const states: DlState[] = [s];
  let rr = 0;
  const seen = new Map<string, number>();

  const finish = (note: Note) => {
    states.push({ ...s, active: null, note });
    return states;
  };

  for (let tick = 1; tick <= MAX_TICKS; tick++) {
    const next: DlState = { ...s, tick, threads: cloneThreads(s.threads), holders: cloneHolders(s.holders), active: null, log: [...s.log] };
    const spec = (id: string) => p.threads.find((t) => t.id === id)!;

    // Time passes for everyone: start times, back-off and rollback pauses, wait clocks.
    for (const t of next.threads) {
      if (t.status === 'idle' && spec(t.id).start <= tick) t.status = 'running';
      if ((t.status === 'backoff' || t.status === 'aborted') && --t.left <= 0) {
        if (t.status === 'aborted') {
          t.restarts++;
          t.startedAt = tick;
          next.victim = null;
          next.log.push({ text: `${t.id} retries: BEGIN again`, tone: 'muted' });
        }
        t.status = 'running';
        t.left = WORK_TICKS;
      }
      if (t.status === 'waiting') {
        t.waitedFor++;
        t.longestWait = Math.max(t.longestWait, t.waitedFor);
      } else t.waitedFor = 0;
    }

    // The detector looks only at threads asleep on a lock. Under tryLock nobody sleeps (a
    // failed try is about to be given back), so a momentary cycle there isn't a deadlock.
    if (p.detector && c.noPreemption && tick % DETECT_EVERY === 0) {
      const cycle = ragCycle(p, next);
      if (cycle) {
        const inCycle = next.threads.filter((t) => cycle.includes(t.id));
        // Victim: the youngest transaction, i.e. the latest start (ties: the later id).
        const victim = inCycle.reduce((a, b) => (b.startedAt >= a.startedAt ? b : a));
        const released = [...victim.holds];
        for (const r of released) next.holders[r] = next.holders[r].filter((h) => h !== victim.id);
        Object.assign(victim, { holds: [], wants: [], pc: 0, status: 'aborted', left: ABORT_TICKS, waitedFor: 0 });
        next.victim = victim.id;
        next.log.push({ text: 'ERROR: deadlock detected', tone: 'bad' });
        next.log.push({ text: `DETAIL: ${describeCycle(cycle)}`, tone: 'muted' });
        next.log.push({ text: `${victim.id} rolled back as the victim; it will retry`, tone: 'orange' });
        next.note = { kind: 'abort', victim: victim.id, cycle, released };
        s = next;
        states.push(s);
        continue;
      }
    }

    const runnable = next.threads.map((t, i) => (canRun(next, t, c) ? i : -1)).filter((i) => i >= 0);
    if (next.threads.every((t) => t.status === 'done')) {
      s = next;
      const longest = s.threads.reduce((a, b) => (b.longestWait > a.longestWait ? b : a));
      return finish({ kind: 'finished', longest: { t: longest.id, ticks: longest.longestWait } });
    }
    if (runnable.length === 0) {
      const pending = next.threads.some((t) => t.status === 'backoff' || t.status === 'aborted' || t.status === 'idle');
      if (!pending && !p.detector) {
        s = next;
        return finish({ kind: 'deadlock', cycle: ragCycle(p, s) ?? [] });
      }
      next.note = { kind: 'idle' };
      s = next;
      states.push(s);
      continue;
    }

    let pickIdx: number;
    if (rnd) pickIdx = runnable[Math.floor(rnd() * runnable.length)];
    else {
      pickIdx = runnable.find((i) => i >= rr) ?? runnable[0];
      rr = (pickIdx + 1) % next.threads.length;
    }
    const t = next.threads[pickIdx];
    next.note = act(next, t, c);
    next.active = t.id;
    if (t.status === 'backoff') {
      t.left = (o.backoff === 'fixed' ? FIXED_BACKOFF : Math.floor(backoffRnd() * (RANDOM_BACKOFF_PER_THREAD * next.threads.length + 1))) + 1;
    }
    s = next;
    states.push(s);

    // Turn-taking with a fixed back-off is deterministic: a repeated state repeats forever.
    if (!rnd && o.backoff === 'fixed' && !s.threads.some((x) => x.status === 'idle')) {
      const key = stateKey(s, rr, p.detector);
      const before = seen.get(key);
      if (before !== undefined) return finish({ kind: 'livelock', since: before });
      seen.set(key, tick);
    }
  }
  return finish({ kind: 'timeout' });
}

export function describeCycle(cycle: readonly string[]): string {
  const parts: string[] = [];
  for (let i = 0; i < cycle.length; i++) {
    const a = cycle[i];
    const b = cycle[(i + 1) % cycle.length];
    // Thread → resource is a wait; resource → thread is "held by".
    parts.push(i % 2 === 0 ? `${a} waits for ${b}` : `held by ${b}`);
  }
  return parts.join(', ');
}

export type Verdict = 'finished' | 'deadlock' | 'livelock' | 'timeout';

export function verdictOf(states: readonly DlState[]): Verdict {
  const k = states[states.length - 1].note.kind;
  return k === 'finished' || k === 'deadlock' || k === 'livelock' ? k : 'timeout';
}

/** Threads that are permanently stuck, by graph reduction: an independent check of the cycle test. */
export function stuckThreads(s: Pick<DlState, 'threads' | 'holders'>): string[] {
  const holders = cloneHolders(s.holders);
  const live = new Set(s.threads.filter((t) => t.status !== 'done').map((t) => t.id));
  let changed = true;
  while (changed) {
    changed = false;
    for (const t of s.threads) {
      if (!live.has(t.id)) continue;
      // It can finish if nothing it asks for is held by another unfinished thread.
      const blocked = t.wants.some((r) => holders[r].some((h) => h !== t.id && live.has(h)));
      if (!blocked) {
        live.delete(t.id);
        changed = true;
      }
    }
  }
  return [...live];
}
