/**
 * Scene 1: one server, five I/O models. A seeded schedule says which connections have a request ready in each
 * round; every model serves the very same schedule and the counters are counted, never estimated. A request is an
 * echo: one read, one write. Costs are illustrative ticks. Pure; a simulated server, not a real kernel.
 */
import { mulberry32 } from '../../core/random';

export type Model = 'blocking' | 'busy' | 'select' | 'epoll' | 'uring';
export const MODELS: readonly Model[] = ['blocking', 'busy', 'select', 'epoll', 'uring'];

/** Rounds the schedule runs for. */
export const ROUNDS = 20;
/** Virtual address space reserved per thread stack: the usual Linux default of 8 MiB (verified once: `ulimit -s` is 8192 KB on WSL2). */
export const STACK_BYTES = 8 * 1024 * 1024;
/** Illustrative ticks: one system call, one fd entry examined, one thread wake-up and context switch. */
export const SYSCALL_TICKS = 2;
export const ENTRY_TICKS = 1;
export const WAKE_TICKS = 5;

export const CONNECTION_STEPS: readonly number[] = [10, 30, 100, 300, 1000, 3000, 10000];
export const ACTIVE_STEPS: readonly number[] = [1, 2, 5, 10, 20, 50, 100];
export const DEFAULT_CONNECTIONS_INDEX = 4;
export const DEFAULT_ACTIVE_INDEX = 1;
export const DEFAULT_SERVER_SEED = 11;
export const DEFAULT_MODEL: Model = 'select';
/** Ticks of work per request when the scene opens. */
export const DEFAULT_WORK = 4;

/** One round's ready connections, ascending, for each of the ROUNDS rounds. */
export type Schedule = number[][];

export function makeSchedule(connections: number, activePct: number, seed: number): Schedule {
  const rnd = mulberry32(seed);
  return Array.from({ length: ROUNDS }, () => {
    const ready: number[] = [];
    for (let fd = 0; fd < connections; fd++) if (rnd() < activePct / 100) ready.push(fd);
    return ready;
  });
}

export interface Served {
  round: number;
  conn: number;
}

export interface Counters {
  model: Model;
  syscalls: number;
  /** fd entries the kernel scans (select, and one per read on a busy poll) or hands back (epoll's ready list, io_uring completions). */
  entries: number;
  /** Entries the program scans itself after a select returns. */
  userScan: number;
  /** Calls that returned no data: EAGAIN on a busy poll. */
  wasted: number;
  threads: number;
  stackBytes: number;
  /** One-time registration calls (epoll_ctl), not counted in `syscalls`. */
  setupSyscalls: number;
  served: Served[];
  /** Ticks spent on everything except the work itself. */
  overheadTicks: number;
  /** Rounds in which a wait call actually returned something. */
  busyRounds: number;
}

export const stackOf = (threads: number) => threads * STACK_BYTES;

export function runModel(model: Model, connections: number, schedule: Schedule): Counters {
  const served: Served[] = [];
  let syscalls = 0;
  let entries = 0;
  let userScan = 0;
  let wasted = 0;
  let wakes = 0;
  let busyRounds = 0;
  schedule.forEach((ready, round) => {
    const k = ready.length;
    for (const conn of ready) served.push({ round, conn });
    if (model === 'blocking') {
      syscalls += 2 * k;
      wakes += k;
    } else if (model === 'busy') {
      syscalls += connections + k;
      entries += connections;
      wasted += connections - k;
      busyRounds++;
    } else if (k > 0) {
      busyRounds++;
      if (model === 'select') {
        syscalls += 1 + 2 * k;
        entries += connections;
        userScan += connections;
      } else if (model === 'epoll') {
        syscalls += 1 + 2 * k;
        entries += k;
      } else {
        syscalls += 1;
        entries += k;
      }
    }
  });
  const threads = model === 'blocking' ? connections : 1;
  return {
    model, syscalls, entries, userScan, wasted, threads, stackBytes: stackOf(threads), setupSyscalls: model === 'epoll' ? connections : 0, served,
    overheadTicks: syscalls * SYSCALL_TICKS + (entries + userScan) * ENTRY_TICKS + wakes * WAKE_TICKS,
    busyRounds,
  };
}

/** Work done: ticks of per-request work. */
export const workTicks = (c: Counters, perRequest: number) => c.served.length * perRequest;
/** The share of CPU ticks that is not the work itself. */
export const overheadShare = (c: Counters, perRequest: number) => {
  const total = c.overheadTicks + workTicks(c, perRequest);
  return total === 0 ? 0 : c.overheadTicks / total;
};

export const MODEL_LABEL: Record<Model, string> = {
  blocking: 'Blocking, a thread per connection',
  busy: 'Non-blocking busy poll',
  select: 'select / poll',
  epoll: 'epoll',
  uring: 'Completion (io_uring style)',
};

export const MODEL_SHORT: Record<Model, string> = { blocking: 'Thread each', busy: 'Busy poll', select: 'select / poll', epoll: 'epoll', uring: 'io_uring' };

/** The entries column means a different thing per model; this says which. */
export const ENTRY_NOTE: Record<Model, string> = {
  blocking: 'the kernel wakes the one thread; no scan',
  busy: 'one fd examined per read call',
  select: 'every fd is scanned on each call, then again by the program',
  epoll: 'only the ready fds come back',
  uring: 'completions reaped, no per-fd calls',
};
