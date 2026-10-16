/**
 * Scene 1: one server, five I/O models. A seeded schedule says which connections have a request ready in each
 * round; every model discovers that schedule's requests through its own loop (a thread wake, an fd scan, a ready list, a completion queue) and the counters are tallied inside those loops; the costs are illustrative. A request is an
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

/** Which of fds 0..connections-1 have a request ready this round: what a select scan, a busy poll or a thread wake-up each discovers for itself. */
const readinessOf = (ready: readonly number[]) => {
  const set = new Set(ready);
  return (fd: number) => set.has(fd);
};

/**
 * Each model finds its own work: a thread per connection wakes when its fd is readable, a busy poll reads every fd
 * and gets EAGAIN on the idle ones, select scans every fd twice (kernel, then the program), epoll walks only the
 * kernel's ready list, and a completion queue hands back finished requests. `served` is whatever that loop found, and
 * the counters are tallied inside the loops rather than written as formulas.
 */
export function runModel(model: Model, connections: number, schedule: Schedule): Counters {
  const served: Served[] = [];
  let syscalls = 0;
  let entries = 0;
  let userScan = 0;
  let wasted = 0;
  let wakes = 0;
  let busyRounds = 0;
  schedule.forEach((ready, round) => {
    const isReady = readinessOf(ready);
    const serve = (conn: number) => served.push({ round, conn });
    if (model === 'blocking') {
      for (let thread = 0; thread < connections; thread++) {
        if (!isReady(thread)) continue;
        wakes++;
        syscalls += 2;
        serve(thread);
      }
    } else if (model === 'busy') {
      busyRounds++;
      for (let fd = 0; fd < connections; fd++) {
        syscalls++;
        entries++;
        if (!isReady(fd)) {
          wasted++;
          continue;
        }
        syscalls++;
        serve(fd);
      }
    } else if (ready.length > 0) {
      busyRounds++;
      if (model === 'select') {
        syscalls++;
        const flagged: number[] = [];
        for (let fd = 0; fd < connections; fd++) {
          entries++;
          if (isReady(fd)) flagged.push(fd);
        }
        let next = 0;
        for (let fd = 0; fd < connections; fd++) {
          userScan++;
          if (fd === flagged[next]) {
            next++;
            syscalls += 2;
            serve(fd);
          }
        }
      } else if (model === 'epoll') {
        syscalls++;
        for (const fd of ready) {
          entries++;
          syscalls += 2;
          serve(fd);
        }
      } else {
        syscalls++;
        for (const fd of ready) {
          entries++;
          serve(fd);
        }
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
