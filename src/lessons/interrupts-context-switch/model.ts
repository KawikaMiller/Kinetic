/**
 * Interrupts and context switches on one CPU core, as pure data the stage draws.
 *
 * - `switchScript()` is the step-through: a timer tick preempting a thread, or a thread
 *   blocking on I/O, with every register save and restore done for real on `Regs` values,
 *   so a thread always resumes with exactly what was saved.
 * - `fire()` is the interrupt-sources sandbox: timer, disk, network and keypress handlers,
 *   and the rule for when one causes a reschedule.
 * - `overhead()` / `switchesPerSecond()` are the cost maths.
 *
 * Times are illustrative (HZ = 250, so a 4 ms tick; switch costs in µs). Kernel work in the
 * step-through is drawn wider than to scale so it can be seen at all.
 */

/** Illustrative timer tick: HZ = 250. */
export const TICK_MS = 4;
export const HZ = 1000 / TICK_MS;
/** Width each kernel step is drawn with on the timeline: NOT to scale (real ones are µs). */
export const KERNEL_STEP_MS = 0.25;
/** Illustrative instructions a thread retires per ms of user time (only moves PC and RAX). */
export const INSTR_PER_MS = 1000;

export type ThreadId = 'A' | 'B';
export const THREADS: readonly ThreadId[] = ['A', 'B'];

export interface Regs {
  pc: number;
  sp: number;
  flags: number;
  rax: number;
  rbx: number;
}

export const REG_NAMES: readonly (keyof Regs)[] = ['pc', 'sp', 'flags', 'rax', 'rbx'];

/** A thread's registers after `ms` of running user code (deterministic, so tests can predict it). */
export function runFor(r: Regs, ms: number): Regs {
  const n = Math.round(ms * INSTR_PER_MS);
  const rax = r.rax + n;
  return { ...r, pc: r.pc + 4 * n, rax, rbx: r.rbx ^ (n & 0xff), flags: rax % 2 === 0 ? 0x246 : 0x202 };
}

export const sameRegs = (a: Regs, b: Regs) => REG_NAMES.every((k) => a[k] === b[k]);

export interface ThreadInfo {
  id: ThreadId;
  process: string;
  /** Address-space id: which page tables the CPU must use for this thread. */
  asid: number;
  start: Regs;
}

/** Thread A, and thread B either in the same process (shares A's address space) or another one. */
export function threadsFor(sameProcess: boolean): Record<ThreadId, ThreadInfo> {
  return {
    A: { id: 'A', process: 'editor', asid: 1, start: { pc: 0x401a30, sp: 0x7ffd_e000, flags: 0x202, rax: 7, rbx: 0x10 } },
    B: sameProcess
      ? { id: 'B', process: 'editor', asid: 1, start: { pc: 0x402c10, sp: 0x7f3a_1000, flags: 0x246, rax: 42, rbx: 0x20 } }
      : { id: 'B', process: 'player', asid: 2, start: { pc: 0x55e0_4400, sp: 0x7ffc_9000, flags: 0x246, rax: 42, rbx: 0x20 } },
  };
}

export type ThreadState = 'running' | 'ready' | 'blocked';

export type Phase =
  | 'run' // a thread runs in user mode
  | 'irq' // an interrupt arrives: finish the instruction, enter the kernel
  | 'handler' // the interrupt handler decides
  | 'syscall' // a thread traps in with read()
  | 'save' // registers into the PCB
  | 'pick' // the scheduler chooses
  | 'mm' // switch page tables (process switch only)
  | 'load' // registers out of the PCB
  | 'iret' // back to user mode
  | 'resume'; // back to user mode in the same thread, nothing switched

export type IrqSource = 'timer' | 'disk' | 'network' | 'key';

export interface Segment {
  lane: ThreadId | 'kernel';
  start: number;
  end: number;
  kind: 'run' | 'kernel' | 'ready' | 'blocked';
}

export interface Step {
  phase: Phase;
  /** Clock after this step, in ms. */
  t: number;
  mode: 'user' | 'kernel';
  /** Whose registers are in the CPU (null between a save and a load). */
  cpu: { owner: ThreadId; regs: Regs } | null;
  /** Saved registers; null while that thread's registers live in the CPU. */
  pcb: Record<ThreadId, Regs | null>;
  /** The register set moving this step (save or load). */
  flight: ThreadId | null;
  asid: number;
  states: Record<ThreadId, ThreadState>;
  /** The thread the step is about. */
  subject: ThreadId;
  source?: IrqSource;
  /** For 'load' and 'resume': the thread's registers equal what was saved for it. */
  roundTrip?: boolean;
  /** For 'pick': whether the address space has to change. */
  newAsid?: boolean;
  /** For a timer 'handler': false when the tick finds nobody else to run. */
  switches?: boolean;
}

export interface Script {
  steps: Step[];
  segments: Segment[];
  end: number;
  threads: Record<ThreadId, ThreadInfo>;
}

export type SwitchKind = 'involuntary' | 'voluntary';

/**
 * The step-through.
 * involuntary: A runs a full tick, the timer preempts it, B runs, the next tick switches back to A.
 * voluntary: B calls read() and blocks, A runs; the disk interrupt wakes B without a switch;
 * the next timer tick preempts A and B resumes.
 */
export function switchScript(kind: SwitchKind, sameProcess: boolean): Script {
  const threads = threadsFor(sameProcess);
  const first: ThreadId = kind === 'involuntary' ? 'A' : 'B';
  const other = (x: ThreadId): ThreadId => (x === 'A' ? 'B' : 'A');
  let t = 0;
  let mode: Step['mode'] = 'user';
  let cpu: Step['cpu'] = { owner: first, regs: threads[first].start };
  const pcb: Record<ThreadId, Regs | null> = { A: null, B: null };
  pcb[other(first)] = threads[other(first)].start;
  let asid = threads[first].asid;
  const states: Record<ThreadId, ThreadState> = { A: 'ready', B: 'ready' };
  states[first] = 'running';
  /** The last registers saved for each thread: what its next load must give back. */
  const saved: Record<ThreadId, Regs | null> = { ...pcb };
  const steps: Step[] = [];
  const segments: Segment[] = [];

  /** Advance the clock; idle threads get ready / blocked bars over the same span. */
  const span = (ms: number, lane: Segment['lane'], kindOf: Segment['kind']) => {
    segments.push({ lane, start: t, end: t + ms, kind: kindOf });
    for (const id of THREADS) {
      if (lane === id) continue;
      if (states[id] === 'ready' || states[id] === 'blocked') segments.push({ lane: id, start: t, end: t + ms, kind: states[id] as 'ready' | 'blocked' });
    }
    t += ms;
  };
  const push = (phase: Phase, subject: ThreadId, extra: Partial<Step> = {}) =>
    steps.push({ phase, t, mode, cpu: cpu && { ...cpu, regs: { ...cpu.regs } }, pcb: { ...pcb }, flight: null, asid, states: { ...states }, subject, ...extra });

  const runUser = (id: ThreadId, ms: number) => {
    span(ms, id, 'run');
    cpu = { owner: id, regs: runFor(cpu!.regs, ms) };
    push('run', id);
  };
  const kernelStep = (phase: Phase, subject: ThreadId, extra: Partial<Step> = {}) => {
    span(KERNEL_STEP_MS, 'kernel', 'kernel');
    push(phase, subject, extra);
  };
  /** Save `from` (if still in the CPU), pick `to`, switch page tables if needed, load `to`, return to user. */
  const contextSwitch = (from: ThreadId, to: ThreadId) => {
    pcb[from] = { ...cpu!.regs };
    saved[from] = pcb[from];
    cpu = null;
    if (states[from] === 'running') states[from] = 'ready';
    kernelStep('save', from, { flight: from });
    const newAsid = threads[to].asid !== asid;
    kernelStep('pick', to, { newAsid });
    if (newAsid) {
      asid = threads[to].asid;
      kernelStep('mm', to);
    }
    const regs = pcb[to]!;
    cpu = { owner: to, regs };
    pcb[to] = null;
    states[to] = 'running';
    kernelStep('load', to, { flight: to, roundTrip: saved[to] !== null && sameRegs(regs, saved[to]!) });
    mode = 'user';
    push('iret', to);
  };
  const enterKernel = (phase: 'irq' | 'syscall', subject: ThreadId, source?: IrqSource) => {
    mode = 'kernel';
    kernelStep(phase, subject, source ? { source } : {});
  };

  push('run', first);
  if (kind === 'involuntary') {
    runUser('A', TICK_MS);
    enterKernel('irq', 'A', 'timer');
    kernelStep('handler', 'A', { source: 'timer', switches: true });
    contextSwitch('A', 'B');
    runUser('B', 2 * TICK_MS - t);
    enterKernel('irq', 'B', 'timer');
    kernelStep('handler', 'B', { source: 'timer', switches: true });
    contextSwitch('B', 'A');
    runUser('A', 3 * TICK_MS - t);
  } else {
    runUser('B', TICK_MS / 2);
    enterKernel('syscall', 'B');
    states.B = 'blocked';
    kernelStep('handler', 'B', { source: 'disk' });
    contextSwitch('B', 'A');
    // The tick at 4 ms still fires: B is blocked and nobody else is ready, so A keeps the CPU.
    runUser('A', TICK_MS - t);
    enterKernel('irq', 'A', 'timer');
    kernelStep('handler', 'A', { source: 'timer', switches: false });
    mode = 'user';
    push('resume', 'A', { roundTrip: true });
    runUser('A', 1.5 * TICK_MS - t);
    enterKernel('irq', 'A', 'disk');
    states.B = 'ready';
    kernelStep('handler', 'A', { source: 'disk' });
    mode = 'user';
    push('resume', 'A', { roundTrip: true });
    runUser('A', 2 * TICK_MS - t);
    enterKernel('irq', 'A', 'timer');
    kernelStep('handler', 'A', { source: 'timer', switches: true });
    contextSwitch('A', 'B');
    runUser('B', 3 * TICK_MS - t);
  }
  return { steps, segments: mergeSegments(segments), end: t, threads };
}

/** Join touching segments on the same lane with the same kind (kernel bars only when they're for the same source). */
export function mergeSegments<T extends { lane: string; start: number; end: number; kind: string; source?: IrqSource }>(segs: readonly T[]): T[] {
  const out: T[] = [];
  const sorted = [...segs].sort((a, b) => (a.lane === b.lane ? a.start - b.start : a.lane < b.lane ? -1 : 1));
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (last && last.lane === s.lane && last.kind === s.kind && last.source === s.source && Math.abs(last.end - s.start) < 1e-9) last.end = s.end;
    else out.push({ ...s });
  }
  return out;
}

/** Segments clipped to time `now`. */
export const segmentsUntil = <T extends { start: number; end: number }>(segs: readonly T[], now: number): T[] =>
  segs.filter((s) => s.start < now - 1e-9).map((s) => ({ ...s, end: Math.min(s.end, now) }));

// ---------- the cost of switching ----------

/** Share of CPU time lost to switching: cost / (slice + cost). Any unit, as long as both match. */
export const overhead = (slice: number, cost: number) => cost / (slice + cost);
/** Switches per second when every slice ends in a switch; slice and cost in µs. */
export const switchesPerSecond = (sliceUs: number, costUs: number) => 1_000_000 / (sliceUs + costUs);
/** Above this the overhead readout turns --bad. */
export const OVERHEAD_BAD = 0.05;
/** Slice choices for the cost slider, µs. */
export const SLICES_US = [20, 50, 100, 250, 500, 1000, 2000, 4000, 10_000] as const;
export const COST_MIN_US = 1;
export const COST_MAX_US = 50;

// ---------- interrupt sources sandbox ----------

export type SandboxThread = 'A' | 'B' | 'C';
export const SANDBOX_THREADS: readonly SandboxThread[] = ['A', 'B', 'C'];
/** What each sandbox thread waits on at the start (A computes, B reads a file, C is a shell). */
export const WAITS_ON: Record<SandboxThread, IrqSource | null> = { A: null, B: 'disk', C: 'key' };
/** Ticks a thread may run before the timer preempts it (illustrative). */
export const SLICE_TICKS = 2;
/** Gap before a device interrupt in the sandbox (illustrative). */
export const DEVICE_GAP_MS = 1;
/** Drawn width of a handler on the sandbox timeline (NOT to scale). */
export const HANDLER_MS = 0.4;
/** Interrupts (automatic ticks included) before the sandbox asks for a reset. */
export const SANDBOX_MAX_EVENTS = 14;

export interface SandboxSeg {
  lane: SandboxThread | 'kernel';
  start: number;
  end: number;
  kind: 'run' | 'kernel' | 'ready' | 'blocked';
  source?: IrqSource;
}

export interface Sandbox {
  now: number;
  running: SandboxThread;
  /** Ticks the running thread has had since it was dispatched. */
  ticks: number;
  /** Tick boundaries handled so far: the next one is due at (tickCount + 1) × TICK_MS. */
  tickCount: number;
  states: Record<SandboxThread, ThreadState>;
  segments: SandboxSeg[];
  log: Outcome[];
}

export interface Outcome {
  source: IrqSource;
  at: number;
  woke: SandboxThread | null;
  /** Timer only: the running thread's slice is used up. */
  sliceUp: boolean;
  reschedule: boolean;
  from: SandboxThread;
  to: SandboxThread;
  /** A tick the learner didn't ask for: time crossed a tick boundary on the way to a device interrupt. */
  auto: boolean;
  /** When it was due. A tick that comes due while another handler runs is delivered right after it. */
  due: number;
}

export function sandboxStart(): Sandbox {
  return { now: 0, running: 'A', ticks: 0, tickCount: 0, states: { A: 'running', B: 'blocked', C: 'blocked' }, segments: [], log: [] };
}

const waker: Record<IrqSource, SandboxThread | null> = { timer: null, disk: 'B', network: null, key: 'C' };

/** The next tick boundary not yet handled. */
export const nextTickDue = (s: Sandbox) => (s.tickCount + 1) * TICK_MS;

/** When this source's interrupt lands: the next tick (right away if it came due during a handler), or a short gap for a device. */
export function nextAt(s: Sandbox, source: IrqSource): number {
  return source === 'timer' ? Math.max(nextTickDue(s), s.now) : s.now + DEVICE_GAP_MS;
}

/** Next ready thread after `from`, in A, B, C order, wrapping; null when none is ready. */
function nextReady(states: Record<SandboxThread, ThreadState>, from: SandboxThread): SandboxThread | null {
  const i = SANDBOX_THREADS.indexOf(from);
  for (let k = 1; k <= SANDBOX_THREADS.length; k++) {
    const id = SANDBOX_THREADS[(i + k) % SANDBOX_THREADS.length];
    if (states[id] === 'ready') return id;
  }
  return null;
}

/**
 * Fire `source` at the next moment it can happen. The timer keeps ticking on its own, so any
 * tick boundary crossed on the way to a device interrupt is fired first, as an automatic tick.
 */
export function fire(s: Sandbox, source: IrqSource): Sandbox {
  if (source === 'timer') return fireAt(s, 'timer', nextAt(s, 'timer'), false);
  const due = nextAt(s, source);
  let w = s;
  while (nextTickDue(w) <= due + 1e-9) w = fireAt(w, 'timer', nextAt(w, 'timer'), true);
  return fireAt(w, source, Math.max(due, w.now), false);
}

/**
 * The running thread runs until the interrupt, the handler runs, and then:
 * - timer: one more tick for the running thread; if that uses up its slice and another
 *   thread is ready, reschedule to it (round robin);
 * - disk / key: wake the thread blocked on that device (it becomes ready, it does NOT run yet);
 * - network: the packet is buffered; nobody here waits on a socket, so nothing wakes.
 * Only the timer reschedules in this model; a woken thread waits for the next tick.
 */
function fireAt(s: Sandbox, source: IrqSource, at: number, auto: boolean): Sandbox {
  const segments = [...s.segments];
  const states = { ...s.states };
  const idleBars = (from: number, to: number) => {
    for (const id of SANDBOX_THREADS) {
      if (states[id] === 'ready' || states[id] === 'blocked') segments.push({ lane: id, start: from, end: to, kind: states[id] as 'ready' | 'blocked' });
    }
  };
  segments.push({ lane: s.running, start: s.now, end: at, kind: 'run' });
  idleBars(s.now, at);
  const end = at + HANDLER_MS;
  segments.push({ lane: 'kernel', start: at, end, kind: 'kernel', source });
  idleBars(at, end);

  const sleeper = waker[source];
  const woke = sleeper && states[sleeper] === 'blocked' ? sleeper : null;
  if (woke) states[woke] = 'ready';
  let ticks = s.ticks;
  let sliceUp = false;
  let running = s.running;
  if (source === 'timer') {
    ticks++;
    sliceUp = ticks >= SLICE_TICKS;
  }
  const next = sliceUp ? nextReady(states, running) : null;
  const reschedule = next !== null;
  const from = running;
  if (next) {
    states[running] = 'ready';
    states[next] = 'running';
    running = next;
    ticks = 0;
  } else if (sliceUp) {
    ticks = 0;
  }
  return {
    now: end, running, ticks, tickCount: s.tickCount + (source === 'timer' ? 1 : 0), states, segments: mergeSegments(segments),
    log: [...s.log, { source, at, woke, sliceUp, reschedule, from, to: running, auto, due: source === 'timer' ? nextTickDue(s) : at }],
  };
}
