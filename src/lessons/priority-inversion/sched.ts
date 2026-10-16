/**
 * A single core with fixed-priority preemptive scheduling: each tick the highest effective-priority runnable task
 * runs. Three tasks H, M and L (priorities 3, 2, 1) and one mutex R shared by H and L. A toy scheduler with
 * abstract ticks: not any real operating system's, and ticks are not milliseconds.
 *
 * Rules the lesson states and the tests check:
 *  - a task that cannot lock R is blocked until R is released; locking and unlocking take no time;
 *  - ties go to the task that ran last tick, then to H, M, L in that order;
 *  - none: effective priority is the base priority;
 *  - inheritance: while it holds R, a task runs at the highest effective priority of the tasks blocked on R, and drops
 *    back to its own priority when it unlocks;
 *  - ceiling (immediate): a task that locks R runs at R's ceiling, the highest priority of any task that uses R, until it unlocks.
 */
import { mulberry32 } from '../../core/random';

export type TaskId = 'H' | 'M' | 'L';
export const TASKS: TaskId[] = ['H', 'M', 'L'];
export const BASE: Record<TaskId, number> = { H: 3, M: 2, L: 1 };
export const CEILING = Math.max(BASE.H, BASE.L);

export type Protocol = 'none' | 'inheritance' | 'ceiling';
export const PROTOCOLS: Protocol[] = ['none', 'inheritance', 'ceiling'];

/** Fixed lengths of the parts of each task the learner does not edit. */
export const H_CRITICAL = 2;
export const H_AFTER = 1;
export const L_BEFORE = 1;
export const L_AFTER = 2;
export const HORIZON = 120;

export interface Scenario {
  /** Length of L's critical section, in ticks (0 is allowed: lock then unlock at once). */
  csL: number;
  arrivalH: number;
  arrivalM: number;
  lenM: number;
  /** The tick by which H should have finished. */
  deadline: number;
}

export const RANGES = {
  csL: { min: 0, max: 10 },
  arrivalH: { min: 0, max: 10 },
  arrivalM: { min: 0, max: 10 },
  lenM: { min: 1, max: 20 },
  deadline: { min: 1, max: 40 },
  watchdog: { min: 1, max: 20 },
} as const;

export const DEFAULT_SCENARIO: Scenario = { csL: 6, arrivalH: 3, arrivalM: 4, lenM: 8, deadline: 12 };
export const DEFAULT_WATCHDOG = 8;

type Seg = { kind: 'compute'; n: number } | { kind: 'lock' } | { kind: 'unlock' };

export function scriptOf(task: TaskId, s: Scenario): Seg[] {
  if (task === 'M') return [{ kind: 'compute', n: s.lenM }];
  if (task === 'H') return [{ kind: 'lock' }, { kind: 'compute', n: H_CRITICAL }, { kind: 'unlock' }, { kind: 'compute', n: H_AFTER }];
  return [
    { kind: 'compute', n: L_BEFORE },
    { kind: 'lock' },
    ...(s.csL > 0 ? [{ kind: 'compute', n: s.csL } as Seg] : []),
    { kind: 'unlock' },
    { kind: 'compute', n: L_AFTER },
  ];
}

export const arrivalOf = (task: TaskId, s: Scenario): number => (task === 'H' ? s.arrivalH : task === 'M' ? s.arrivalM : 0);

export type Status = 'none' | 'running' | 'ready' | 'blocked' | 'done';

export type EventKind = 'arrive' | 'block' | 'inherit' | 'lock' | 'unlock' | 'finish' | 'preempt' | 'reset';
export interface SchedEvent {
  kind: EventKind;
  task: TaskId;
  /** For `inherit`: the priority taken; for `block`: the holder. */
  detail?: number | TaskId;
}

export interface TickRecord {
  t: number;
  /** The task that ran this tick, null when none was runnable. */
  running: TaskId | null;
  eff: Record<TaskId, number>;
  status: Record<TaskId, Status>;
  holder: TaskId | null;
  events: SchedEvent[];
}

export interface Options {
  protocol: Protocol;
  /** A deliberately broken inheritance that keeps the borrowed priority after unlocking (tests only). */
  forgetRestore?: boolean;
  /** The watchdog resets the system when H has been unable to run for more than this many ticks in a row. */
  watchdog?: number | null;
}

export interface Schedule {
  scenario: Scenario;
  options: Options;
  ticks: TickRecord[];
  /** Tick at which each task finished (the end of its last tick), null when it never did. */
  finish: Record<TaskId, number | null>;
  /** The tick of the watchdog reset, when there was one: the run stops there. */
  resetAt: number | null;
}

interface Live {
  pc: number;
  left: number;
  arrived: boolean;
  done: boolean;
  blocked: boolean;
  /** Priority borrowed and never given back: only the broken variant sets it. */
  stuck: number;
}

export function schedule(s: Scenario, options: Options): Schedule {
  const scripts: Record<TaskId, Seg[]> = { H: scriptOf('H', s), M: scriptOf('M', s), L: scriptOf('L', s) };
  const live: Record<TaskId, Live> = {
    H: { pc: 0, left: 0, arrived: false, done: false, blocked: false, stuck: 0 },
    M: { pc: 0, left: 0, arrived: false, done: false, blocked: false, stuck: 0 },
    L: { pc: 0, left: 0, arrived: false, done: false, blocked: false, stuck: 0 },
  };
  let holder: TaskId | null = null;
  let last: TaskId | null = null;
  let waitRun = 0;
  const finish: Record<TaskId, number | null> = { H: null, M: null, L: null };
  const ticks: TickRecord[] = [];
  let resetAt: number | null = null;

  const effective = (): Record<TaskId, number> => {
    const eff: Record<TaskId, number> = { H: BASE.H, M: BASE.M, L: BASE.L };
    TASKS.forEach((k) => (eff[k] = Math.max(BASE[k], live[k].stuck)));
    if (holder !== null) {
      if (options.protocol === 'ceiling') eff[holder] = Math.max(eff[holder], CEILING);
      if (options.protocol === 'inheritance') {
        const waiters = TASKS.filter((k) => live[k].blocked && live[k].arrived && !live[k].done).map((k) => BASE[k]);
        eff[holder] = Math.max(eff[holder], ...waiters);
      }
    }
    return eff;
  };

  const ready = (k: TaskId) => live[k].arrived && !live[k].done && !live[k].blocked;
  const nextSeg = (k: TaskId): Seg | undefined => scripts[k][live[k].pc];
  const advance = (k: TaskId) => {
    live[k].pc++;
    live[k].left = 0;
  };

  for (let t = 0; t < HORIZON && TASKS.some((k) => !live[k].done); t++) {
    const events: SchedEvent[] = [];
    TASKS.forEach((k) => {
      if (!live[k].arrived && arrivalOf(k, s) <= t) {
        live[k].arrived = true;
        events.push({ kind: 'arrive', task: k });
      }
    });
    const effBefore = effective();
    let running: TaskId | null = null;
    // pick the highest effective priority, settling locks and unlocks (which take no time) until the pick has CPU work
    for (let guard = 0; guard < 50 && running === null; guard++) {
      const eff = effective();
      const runnable = TASKS.filter(ready);
      if (runnable.length === 0) break;
      const best = runnable.reduce((a, b) => (eff[b] > eff[a] || (eff[b] === eff[a] && b === last && a !== last) ? b : a));
      const seg = nextSeg(best)!;
      if (seg.kind === 'lock') {
        if (holder === null) {
          holder = best;
          advance(best);
          events.push({ kind: 'lock', task: best });
        } else {
          live[best].blocked = true;
          events.push({ kind: 'block', task: best, detail: holder });
        }
      } else if (seg.kind === 'unlock') {
        const lowered = effective()[best];
        holder = null;
        advance(best);
        events.push({ kind: 'unlock', task: best });
        if (options.forgetRestore && options.protocol === 'inheritance') live[best].stuck = Math.max(live[best].stuck, lowered);
        TASKS.forEach((k) => {
          if (live[k].blocked) live[k].blocked = false;
        });
      } else running = best;
    }
    const eff = effective();
    TASKS.forEach((k) => {
      if (holder === k && eff[k] > Math.max(BASE[k], effBefore[k]) && options.protocol === 'inheritance') events.push({ kind: 'inherit', task: k, detail: eff[k] });
    });
    if (running !== null && last !== null && running !== last && !live[last].done && !live[last].blocked && live[last].arrived) events.push({ kind: 'preempt', task: last, detail: running });
    const status: Record<TaskId, Status> = { H: 'none', M: 'none', L: 'none' };
    TASKS.forEach((k) => {
      status[k] = live[k].done ? 'done' : !live[k].arrived ? 'none' : live[k].blocked ? 'blocked' : k === running ? 'running' : 'ready';
    });
    if (running !== null) {
      const seg = nextSeg(running) as Extract<Seg, { kind: 'compute' }>;
      if (live[running].left === 0) live[running].left = seg.n;
      live[running].left--;
      if (live[running].left === 0) {
        advance(running);
        if (!nextSeg(running)) {
          live[running].done = true;
          finish[running] = t + 1;
          events.push({ kind: 'finish', task: running });
        }
      }
    }
    ticks.push({ t, running, eff, status, holder, events });
    last = running;
    // the watchdog counts ticks in a row in which H is waiting to run
    if (status.H === 'ready' || status.H === 'blocked') waitRun++;
    else waitRun = 0;
    if (options.watchdog != null && waitRun > options.watchdog) {
      resetAt = t + 1;
      ticks[ticks.length - 1].events.push({ kind: 'reset', task: 'H' });
      break;
    }
  }
  return { scenario: s, options, ticks, finish, resetAt };
}

// ── readouts: all computed from the schedule ─────────────────────────────

/** H's blocking time: the ticks between its arrival and its finish in which it was not running. Null when it never finished. */
export function blockingTime(sch: Schedule): number | null {
  const end = sch.finish.H;
  if (end === null) return null;
  return sch.ticks.filter((r) => r.t >= sch.scenario.arrivalH && r.t < end && r.running !== 'H').length;
}

/** The ticks in which H was waiting (blocked on R or held back), whether or not it finished. */
export function waitingTicks(sch: Schedule): number[] {
  return sch.ticks.filter((r) => r.status.H === 'blocked' || r.status.H === 'ready').map((r) => r.t);
}

/** The inversion window: ticks in which H is waiting and the running task is neither H nor the holder of R. */
export function inversionWindow(sch: Schedule): number[] {
  return sch.ticks.filter((r) => (r.status.H === 'blocked' || r.status.H === 'ready') && r.running !== null && r.running !== r.holder).map((r) => r.t);
}

/** Runs of consecutive ticks as [start, end) pairs. */
export function runsOf(ticks: readonly number[]): [number, number][] {
  const out: [number, number][] = [];
  for (const t of ticks) {
    const last = out.at(-1);
    if (last && last[1] === t) last[1] = t + 1;
    else out.push([t, t + 1]);
  }
  return out;
}

export interface Verdict {
  blocking: number | null;
  finishH: number | null;
  /** Deadline minus finish: negative is late; null when H never finished. */
  slack: number | null;
  met: boolean;
  window: number;
  /** H never had to wait. */
  noInversion: boolean;
  resetAt: number | null;
}

export function verdictOf(sch: Schedule): Verdict {
  const finishH = sch.finish.H;
  const slack = finishH === null ? null : sch.scenario.deadline - finishH;
  return {
    blocking: blockingTime(sch),
    finishH,
    slack,
    met: slack !== null && slack >= 0 && sch.resetAt === null,
    window: inversionWindow(sch).length,
    noInversion: waitingTicks(sch).length === 0,
    resetAt: sch.resetAt,
  };
}

// ── seeded scenarios ─────────────────────────────────────────────────────


/** A scenario drawn from a seed, always inside the slider ranges. */
export function scenarioFromSeed(seed: number): Scenario {
  const rnd = mulberry32(seed);
  const pick = (r: { min: number; max: number }) => r.min + Math.floor(rnd() * (r.max - r.min + 1));
  return {
    csL: pick(RANGES.csL),
    arrivalH: pick(RANGES.arrivalH),
    arrivalM: pick(RANGES.arrivalM),
    lenM: pick(RANGES.lenM),
    deadline: pick(RANGES.deadline),
  };
}

/** The lowest seed whose scenario shows unbounded-looking inversion with no protocol: H waits longer than L's critical section because M ran. */
export const BROKEN_SEED = 2;
