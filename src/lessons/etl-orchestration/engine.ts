/**
 * etl-orchestration: a small simulated scheduler for one daily pipeline, in whole hours on the shared tick sim. A run for logical
 * date D is triggered once D's interval has closed (midnight after it). Within a run a task starts only when every upstream task
 * succeeded; an upstream failure marks the downstream tasks `upstream_failed` (they do not run). Failures are injected by the
 * learner (transient: the first attempt of a run fails; permanent: every attempt fails until cleared) or by seeded flakiness.
 * The load task writes the day's source rows to the output table by append or by overwriting that date's partition.
 */
import { createTickSim, type TickSim } from '../../core/simTick';

export const TASKS = ['extract_orders', 'extract_users', 'clean', 'join', 'load_report'] as const;
export type Task = (typeof TASKS)[number];
export const UPSTREAM: Record<Task, Task[]> = {
  extract_orders: [],
  extract_users: [],
  clean: ['extract_orders'],
  join: ['clean', 'extract_users'],
  load_report: ['join'],
};
export const DURATION: Record<Task, number> = { extract_orders: 1, extract_users: 1, clean: 2, join: 1, load_report: 1 };

export const DAYS = 7;
/** Hours since the calendar start: the run for day d is triggered when its interval closes, at the next midnight. */
export const triggerHour = (day: number): number => 24 * (day + 1);
export const CALENDAR_START = '2026-03-01T00:00:00Z';
export const RETRY_DELAY = 1;
export const MAX_RETRIES = 3;
export const SOURCE_ROWS: readonly number[] = [10, 12, 9, 14, 11, 13, 8];
export const LATE_ROWS = 3;
export const HORIZON_HOURS = 24 * (DAYS + 3);
/** Chance an attempt fails when the workers are flaky. */
export const FLAKY_RATE = 0.2;

export type Status = 'pending' | 'running' | 'retry' | 'success' | 'failed' | 'upstream_failed';
export interface Span {
  start: number;
  end: number;
  ok: boolean;
}
export interface TaskRun {
  status: Status;
  /** Attempts made in this run's current epoch. */
  attempt: number;
  start: number | null;
  end: number | null;
  readyAt: number | null;
  /** The hour the task was marked `upstream_failed`. */
  blockedAt: number | null;
  /** Every attempt ever made, across reruns, for the chart. */
  spans: Span[];
}
export interface RunState {
  day: number;
  /** Bumped by each rerun of the whole day. */
  epoch: number;
  tasks: Record<Task, TaskRun>;
}

export type Mode = 'append' | 'overwrite';
export interface Fail {
  kind: 'transient' | 'permanent';
}
export type Op = { at: number; kind: 'rerun'; day: number } | { at: number; kind: 'late'; day: number } | { at: number; kind: 'clear'; day: number; task: Task };

export interface Config {
  retries: number;
  mode: Mode;
  /** Injected failures by `day:task`. */
  failures: Readonly<Record<string, Fail>>;
  ops: readonly Op[];
  flaky: boolean;
}

export const keyOf = (day: number, task: Task) => `${day}:${task}`;

export interface World {
  hour: number;
  runs: RunState[];
  source: number[];
  output: number[];
  /** How many times each day's load task has succeeded. */
  loads: number[];
  cleared: string[];
  log: { id: number; hour: number; text: string; bad: boolean }[];
}

const freshTask = (): TaskRun => ({ status: 'pending', attempt: 0, start: null, end: null, readyAt: null, blockedAt: null, spans: [] });
const freshTasks = (): Record<Task, TaskRun> => Object.fromEntries(TASKS.map((t) => [t, freshTask()])) as Record<Task, TaskRun>;

export function initialWorld(): World {
  return {
    hour: 0,
    runs: Array.from({ length: DAYS }, (_, day) => ({ day, epoch: 0, tasks: freshTasks() })),
    source: [...SOURCE_ROWS],
    output: Array(DAYS).fill(0),
    loads: Array(DAYS).fill(0),
    cleared: [],
    log: [],
  };
}

const copy = (w: World): World => ({
  ...w,
  runs: w.runs.map((r) => ({ ...r, tasks: Object.fromEntries(TASKS.map((t) => [t, { ...r.tasks[t], spans: [...r.tasks[t].spans] }])) as Record<Task, TaskRun> })),
  source: [...w.source],
  output: [...w.output],
  loads: [...w.loads],
  cleared: [...w.cleared],
  log: [...w.log],
});

const downstreamOf = (task: Task): Task[] => TASKS.filter((t) => UPSTREAM[t].includes(task)).flatMap((t) => [t, ...downstreamOf(t)]);

/** One hour: operations at this hour, then starts, then every attempt that ends at the next hour is judged. */
export function stepWorld(prev: World, cfg: Config, rnd: () => number): World {
  const w = copy(prev);
  const h = prev.hour;
  const note = (text: string, bad = false) => w.log.push({ id: w.log.length, hour: h, text, bad });
  const dayName = (d: number) => `day ${d + 1}`;

  for (const op of cfg.ops.filter((o) => o.at === h)) {
    const run = w.runs[op.day];
    if (op.kind === 'late') {
      w.source[op.day] += LATE_ROWS;
      note(`${LATE_ROWS} late rows arrive in the source for ${dayName(op.day)}`);
    } else if (op.kind === 'rerun') {
      run.epoch++;
      for (const t of TASKS) run.tasks[t] = { ...freshTask(), spans: run.tasks[t].spans };
      note(`${dayName(op.day)} is run again from the start`);
    } else {
      w.cleared.push(keyOf(op.day, op.task));
      for (const t of [op.task, ...downstreamOf(op.task)]) if (['failed', 'upstream_failed'].includes(run.tasks[t].status)) run.tasks[t] = { ...freshTask(), spans: run.tasks[t].spans };
      note(`${op.task} of ${dayName(op.day)} is cleared and run again`);
    }
  }

  for (const run of w.runs) {
    if (h < triggerHour(run.day)) continue;
    for (const t of TASKS) {
      const tr = run.tasks[t];
      const ups = UPSTREAM[t].map((u) => run.tasks[u].status);
      if (tr.status === 'pending') {
        if (ups.some((s) => s === 'failed' || s === 'upstream_failed')) {
          tr.status = 'upstream_failed';
          tr.blockedAt = h;
          note(`${t} of ${dayName(run.day)} does not run: an upstream task failed`, true);
        } else if (ups.every((s) => s === 'success')) {
          Object.assign(tr, { status: 'running', attempt: tr.attempt + 1, start: h, end: h + DURATION[t] });
        }
      } else if (tr.status === 'retry' && tr.readyAt !== null && tr.readyAt <= h) {
        Object.assign(tr, { status: 'running', attempt: tr.attempt + 1, start: h, end: h + DURATION[t], readyAt: null });
      }
    }
  }

  for (const run of w.runs) {
    for (const t of TASKS) {
      const tr = run.tasks[t];
      if (tr.status !== 'running' || tr.end !== h + 1) continue;
      const injected = cfg.failures[keyOf(run.day, t)];
      const roll = rnd();
      const failed =
        (injected?.kind === 'permanent' && !w.cleared.includes(keyOf(run.day, t))) || (injected?.kind === 'transient' && tr.attempt === 1) || (cfg.flaky && roll < FLAKY_RATE);
      tr.spans.push({ start: tr.start!, end: tr.end, ok: !failed });
      if (failed && tr.attempt <= cfg.retries) {
        tr.status = 'retry';
        tr.readyAt = tr.end + RETRY_DELAY;
        note(`${t} of ${dayName(run.day)} fails (attempt ${tr.attempt}); it will retry`, true);
      } else if (failed) {
        tr.status = 'failed';
        note(`${t} of ${dayName(run.day)} fails and has no retries left`, true);
      } else {
        tr.status = 'success';
        if (t === 'load_report') {
          w.loads[run.day]++;
          w.output[run.day] = cfg.mode === 'append' ? w.output[run.day] + w.source[run.day] : w.source[run.day];
          note(`load_report of ${dayName(run.day)} writes ${w.source[run.day]} rows (${cfg.mode})`);
        }
      }
    }
  }
  w.hour = h + 1;
  return w;
}

/** The safety property: a task runs, or has succeeded, only when every upstream task of its run has succeeded. */
export function violation(w: World): string | null {
  for (const run of w.runs) {
    for (const t of TASKS) {
      const s = run.tasks[t].status;
      if ((s === 'running' || s === 'success') && UPSTREAM[t].some((u) => run.tasks[u].status !== 'success')) return `${t} of day ${run.day + 1} is ${s} while an upstream task is not a success`;
    }
  }
  return null;
}

export function createPipeline(cfg: Config, seed: number): TickSim<World> {
  return createTickSim<World>({ seed, init: initialWorld, step: (w, rnd) => stepWorld(w, cfg, rnd), check: violation });
}

export function runPipeline(cfg: Config, seed: number, hours: number = HORIZON_HOURS): TickSim<World> {
  const sim = createPipeline(cfg, seed);
  sim.run(hours);
  return sim;
}

export type DayStatus = 'ok' | 'stale' | 'duplicated' | 'missing';
/** The output for a day against the source as it is now. */
export function dayStatus(w: World, day: number): DayStatus {
  if (w.loads[day] === 0) return 'missing';
  if (w.output[day] > w.source[day]) return 'duplicated';
  return w.output[day] === w.source[day] ? 'ok' : 'stale';
}

/** The latest world's status of one task of one day. */
export const statusOf = (w: World, day: number, task: Task): Status => w.runs[day].tasks[task].status;
