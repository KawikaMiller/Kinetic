// A simulated server shutting down during a deploy. Pure logic. Timings are illustrative;
// the signal behaviour follows Linux signal(7).

export type Mode = 'none' | 'graceful' | 'slow' | 'pid1';

/** Seconds. */
export const SIGTERM_AT = 10;
/** How long the load balancer keeps sending after SIGTERM, until it notices (endpoint removal, a failed readiness check). */
export const LB_LAG = 2;
/** Closing the database pool at the end of a graceful shutdown. */
export const POOL_CLOSE = 0.5;
/** Kubernetes' terminationGracePeriodSeconds default. */
export const DEFAULT_GRACE = 30;
export const EXIT_CODE = { clean: 0, sigterm: 128 + 15, sigkill: 128 + 9 } as const;

export interface Request {
  id: string;
  start: number;
  dur: number;
  label: string;
}

/** Long-ish requests (uploads, reports), so the drain is visible at this scale. */
const BASE: Request[] = [
  { id: 'r1', start: 1, dur: 6, label: 'upload' },
  { id: 'r2', start: 4, dur: 9, label: 'report' },
  { id: 'r3', start: 7, dur: 8, label: 'upload' },
  { id: 'r4', start: 9, dur: 5, label: 'checkout' },
  { id: 'r5', start: 10.8, dur: 3, label: 'search' },
  { id: 'r6', start: 11.5, dur: 4, label: 'search' },
  { id: 'r7', start: 13, dur: 3, label: 'search' },
];
/** The "too slow" preset adds one long export that can outlast the grace period. */
const EXPORT: Request = { id: 'r8', start: 6, dur: 42, label: 'CSV export' };

export const requestsFor = (mode: Mode): Request[] => (mode === 'slow' ? [...BASE, EXPORT].sort((a, b) => a.start - b.start) : BASE);

export type Fate = 'done' | 'drained' | 'cut' | 'refused' | 'elsewhere';

export interface RequestRun extends Request {
  fate: Fate;
  /** When it stopped: finished, cut, or (refused) when it arrived. */
  end: number;
}

export interface ShutdownRun {
  mode: Mode;
  grace: number;
  requests: RequestRun[];
  /** The app noticed SIGTERM (a handler ran). */
  handled: boolean;
  /** When the app stopped accepting new connections. */
  stopListening: number;
  lbRemoved: number;
  exitAt: number;
  exitCode: number;
  killed: boolean;
}

/**
 * - none: no handler, so SIGTERM's default action terminates the process at once.
 * - graceful / slow: the handler fails readiness, waits LB_LAG for the load balancer to
 *   notice, closes the listening socket, waits for in-flight requests, closes the DB pool
 *   and exits 0. If that isn't done by SIGTERM + grace, SIGKILL ends it.
 * - pid1: the app runs under `sh -c` as PID 1. The shell doesn't forward SIGTERM, and the
 *   kernel doesn't apply default actions to a namespace's init for signals it has no handler
 *   for, so nothing happens until SIGKILL.
 */
export function shutdown(mode: Mode, grace = DEFAULT_GRACE): ShutdownRun {
  const reqs = requestsFor(mode);
  const lbRemoved = SIGTERM_AT + LB_LAG;
  const deadline = SIGTERM_AT + grace;
  const handled = mode === 'graceful' || mode === 'slow';
  const stopListening = mode === 'none' ? SIGTERM_AT : handled ? lbRemoved : deadline;
  // Requests the process accepts: anything that arrives while it's listening and the LB still sends here.
  const accepted = reqs.filter((r) => r.start < Math.min(stopListening, lbRemoved));
  let exitAt: number;
  let exitCode: number;
  if (mode === 'none') {
    exitAt = SIGTERM_AT;
    exitCode = EXIT_CODE.sigterm;
  } else if (handled) {
    const drained = Math.max(lbRemoved, ...accepted.map((r) => r.start + r.dur)) + POOL_CLOSE;
    exitAt = Math.min(drained, deadline);
    exitCode = drained <= deadline ? EXIT_CODE.clean : EXIT_CODE.sigkill;
  } else {
    exitAt = deadline;
    exitCode = EXIT_CODE.sigkill;
  }
  const killed = exitCode === EXIT_CODE.sigkill;
  const requests = reqs.map((r): RequestRun => {
    const finish = r.start + r.dur;
    if (r.start >= lbRemoved) return { ...r, fate: 'elsewhere', end: r.start };
    if (r.start >= stopListening || r.start >= exitAt) return { ...r, fate: 'refused', end: r.start };
    if (finish <= exitAt) return { ...r, fate: finish > SIGTERM_AT ? 'drained' : 'done', end: finish };
    return { ...r, fate: 'cut', end: exitAt };
  });
  return { mode, grace, requests, handled, stopListening, lbRemoved, exitAt, exitCode, killed };
}

// ---- Signals ---------------------------------------------------------------------

export interface SignalInfo {
  name: string;
  /** x86 and ARM Linux numbering (signal(7)); Alpha, SPARC and MIPS differ for some. */
  number: number;
  action: 'terminate' | 'terminate + core' | 'ignore' | 'stop';
  catchable: boolean;
  use: string;
}

export const SIGNALS: SignalInfo[] = [
  { name: 'SIGHUP', number: 1, action: 'terminate', catchable: true, use: 'terminal closed; daemons often reload config' },
  { name: 'SIGINT', number: 2, action: 'terminate', catchable: true, use: 'Ctrl-C in a terminal' },
  { name: 'SIGKILL', number: 9, action: 'terminate', catchable: false, use: 'kill now: no handler, no cleanup' },
  { name: 'SIGTERM', number: 15, action: 'terminate', catchable: true, use: 'please shut down (kill, docker stop, Kubernetes)' },
  { name: 'SIGCHLD', number: 17, action: 'ignore', catchable: true, use: 'a child exited or stopped' },
  { name: 'SIGSTOP', number: 19, action: 'stop', catchable: false, use: 'pause the process (SIGCONT resumes)' },
];

// ---- Children and zombies --------------------------------------------------------

export type ChildCase = 'no-reap' | 'reap' | 'orphan';

export interface Proc {
  pid: number;
  ppid: number;
  name: string;
  state: 'running' | 'zombie';
}

export const PARENT_PID = 7;
export const CHILD_PID = 12;

/**
 * The process table after each step: 0 both running; 1 the child exits (or, for orphan,
 * the parent exits first); 2 what follows. A zombie is a child that has exited but whose
 * parent hasn't collected its exit status with wait().
 */
export function procTable(c: ChildCase, step: number): Proc[] {
  const parent: Proc = { pid: PARENT_PID, ppid: 1, name: 'server', state: 'running' };
  const child: Proc = { pid: CHILD_PID, ppid: PARENT_PID, name: 'worker', state: 'running' };
  const init: Proc = { pid: 1, ppid: 0, name: 'init', state: 'running' };
  if (step === 0) return [init, parent, child];
  if (c === 'orphan') {
    // The parent is gone; the child is re-parented to PID 1 (or a subreaper).
    if (step === 1) return [init, { ...child, ppid: 1 }];
    // When it exits, init reaps it.
    return [init];
  }
  const exited = { ...child, state: 'zombie' as const };
  if (c === 'reap') return step === 1 ? [init, parent, exited] : [init, parent];
  return [init, parent, exited];
}

export const isZombie = (p: Proc) => p.state === 'zombie';
