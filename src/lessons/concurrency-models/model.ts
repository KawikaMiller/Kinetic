/**
 * One workload on four runtimes. R requests arrive together; each needs a short CPU step, an I/O wait,
 * and a short CPU step. A deterministic millisecond-by-millisecond schedule runs them on C cores under
 * each runtime's own rules. Every constant is illustrative, and nothing is measured on the learner's machine.
 */

// ── illustrative constants (each wears a chip on screen) ──────────────────

export const CPU_MS = 1;
export const IO_MS = 100;
export const HOG_MS = 200;
/** Stack reserved per OS thread, MB: an illustrative figure, since defaults differ by OS and runtime. */
export const STACK_MB = 1;
/** How long the toy OS lets a thread run before another ready thread gets the core. */
export const QUANTUM_MS = 10;
/** The request the fault buttons act on. */
export const FAULT_REQUEST = 7;
/** Requests drawn as lanes on the timeline (the stats cover all of them). */
export const SHOWN_REQUESTS = 10;

export type Runtime = 'threads' | 'events' | 'actors' | 'csp';
export type Fault = 'none' | 'hog' | 'crash';

export const RUNTIMES: { id: Runtime; label: string }[] = [
  { id: 'threads', label: 'OS threads' },
  { id: 'events', label: 'Event loop' },
  { id: 'actors', label: 'Actors' },
  { id: 'csp', label: 'CSP channels' },
];

export interface Params {
  runtime: Runtime;
  requests: number;
  cores: number;
  /** OS threads in the pool (threads). */
  pool: number;
  /** Actors, each with one mailbox (actors). */
  actors: number;
  /** Workers pulling from the channel (csp); 0 is refused. */
  workers: number;
  /** Channel buffer size (csp); 0 is an unbuffered rendezvous. */
  buffer: number;
  fault: Fault;
  /** The safety net: a try/catch, a recover, a supervisor. Off is the default behaviour. */
  net: boolean;
}

export const RANGES = {
  requests: { min: 10, max: 200, step: 10 },
  cores: { min: 1, max: 8 },
  pool: { min: 1, max: 200 },
  actors: { min: 1, max: 16 },
  workers: { min: 0, max: 16 },
  buffer: { min: 0, max: 20 },
} as const;

export const DEFAULT_PARAMS: Params = { runtime: 'threads', requests: 100, cores: 4, pool: 100, actors: 4, workers: 4, buffer: 0, fault: 'none', net: false };

/** Controls a runtime does not show must not move its numbers: the others are pinned to constants. */
export function normalise(p: Params): Params {
  return {
    ...p,
    pool: p.runtime === 'threads' ? p.pool : DEFAULT_PARAMS.pool,
    actors: p.runtime === 'actors' ? p.actors : DEFAULT_PARAMS.actors,
    workers: p.runtime === 'csp' ? p.workers : DEFAULT_PARAMS.workers,
    buffer: p.runtime === 'csp' ? p.buffer : DEFAULT_PARAMS.buffer,
    net: p.fault === 'crash' ? p.net : false,
  };
}

/** The sentence refusing a setup the model would only stall on, or null. */
export function refusal(p: Params): string | null {
  if (p.runtime !== 'csp' || p.workers > 0) return null;
  return p.buffer === 0
    ? 'Nobody to receive: the sender would block forever. Add a worker.'
    : `No workers: the sender fills the buffer of ${p.buffer} and then blocks forever. Add a worker.`;
}

// ── what each runtime does by default: the decision table ─────────────────

/** What fails when the fault hits: nothing, one request, one actor's whole mailbox, or the whole process. */
export type Scope = 'none' | 'request' | 'mailbox' | 'process';
/** Who waits behind the fault. */
export type Delays = 'nobody' | 'bystanders-on-the-core' | 'everyone' | 'same-mailbox';

export interface Outcome {
  fails: Scope;
  delays: Delays;
  /** One line for the table; each is "default behaviour", never a universal rule. */
  text: string;
}

const PLAIN: Outcome = { fails: 'none', delays: 'nobody', text: 'nothing goes wrong' };

export const OUTCOMES: Record<Runtime, Record<Fault, { off: Outcome; on: Outcome }>> = {
  threads: {
    none: { off: PLAIN, on: PLAIN },
    hog: {
      off: { fails: 'none', delays: 'bystanders-on-the-core', text: `${HOG_MS} ms of CPU goes to one request, and the OS time-slices it, so the other threads carry on` },
      on: { fails: 'none', delays: 'bystanders-on-the-core', text: `${HOG_MS} ms of CPU goes to one request, and the OS time-slices it, so the other threads carry on` },
    },
    crash: {
      off: { fails: 'request', delays: 'nobody', text: 'the thread dies and its request fails; the pool is one thread smaller (a Java thread with an uncaught exception ends)' },
      on: { fails: 'request', delays: 'nobody', text: 'the exception is caught: its request fails, the thread lives on' },
    },
  },
  events: {
    none: { off: PLAIN, on: PLAIN },
    hog: {
      off: { fails: 'none', delays: 'everyone', text: `the loop cannot run anything else for ${HOG_MS} ms: every other request waits` },
      on: { fails: 'none', delays: 'everyone', text: `the loop cannot run anything else for ${HOG_MS} ms: every other request waits` },
    },
    crash: {
      off: { fails: 'process', delays: 'nobody', text: 'an unhandled exception in a callback ends the whole process (Node by default): every unfinished request fails' },
      on: { fails: 'request', delays: 'nobody', text: 'the error is handled: its request fails, the loop carries on' },
    },
  },
  actors: {
    none: { off: PLAIN, on: PLAIN },
    hog: {
      off: { fails: 'none', delays: 'same-mailbox', text: 'requests queued behind it in the same mailbox wait; other actors do not' },
      on: { fails: 'none', delays: 'same-mailbox', text: 'requests queued behind it in the same mailbox wait; other actors do not' },
    },
    crash: {
      off: { fails: 'mailbox', delays: 'nobody', text: 'with no supervisor the actor dies and the requests queued for it are lost' },
      on: { fails: 'request', delays: 'nobody', text: 'a supervisor restarts the actor; the failing request is dropped and, in this toy, its mailbox is kept' },
    },
  },
  csp: {
    none: { off: PLAIN, on: PLAIN },
    hog: {
      off: { fails: 'none', delays: 'bystanders-on-the-core', text: `one worker is busy for ${HOG_MS} ms; the other workers keep taking requests` },
      on: { fails: 'none', delays: 'bystanders-on-the-core', text: `one worker is busy for ${HOG_MS} ms; the other workers keep taking requests` },
    },
    crash: {
      off: { fails: 'process', delays: 'nobody', text: 'an unrecovered panic in a goroutine ends the whole program (Go by default): every unfinished request fails' },
      on: { fails: 'request', delays: 'nobody', text: 'the panic is recovered in the worker: its request fails, the worker carries on' },
    },
  },
};

export const outcomeOf = (p: Params): Outcome => OUTCOMES[p.runtime][p.fault][p.net ? 'on' : 'off'];

// ── the schedule ──────────────────────────────────────────────────────────

export type SegKind = 'cpu' | 'wait' | 'io';
export interface Seg {
  req: number;
  kind: SegKind;
  start: number;
  end: number;
  /** The faulty request's CPU step when it is the slow handler. */
  hog?: boolean;
}
export type MarkKind = 'crash' | 'restart' | 'finish';
export interface Mark {
  req: number;
  kind: MarkKind;
  at: number;
}

export interface Run {
  params: Params;
  /** The time the last request finished or failed. */
  makespan: number;
  /** Finish time of each request (index = request number), null when it failed. */
  finish: (number | null)[];
  /** When each failed request failed. */
  failedAt: (number | null)[];
  segs: Seg[];
  marks: Mark[];
  finished: number;
  failed: number;
  /** The most threads, workers or actors holding at least one unfinished request at once. */
  peakConcurrent: number;
  /** The most cores busy at once. */
  peakCores: number;
  osThreads: number;
  memoryMb: number;
  /** Toy count: one per block and per wake of a thread or worker, one per preemption. */
  switches: number;
  /** CPU steps run as callbacks or messages (event loop and actors). */
  callbacks: number;
  /** The first time each request was taken by a thread or worker (csp and threads), by request number. */
  startedAt: (number | null)[];
  /** Finish time of the earliest-finishing request other than the faulty one. */
  bystanderFinish: number | null;
  /** csp: when the sender handed over its last request, null when it never got to. */
  senderDone: number | null;
}

interface Turn {
  req: number;
  seg: 0 | 2;
  remaining: number;
  waitFrom: number;
  ranFor: number;
  fibre: number;
}

const fibreCount = (p: Params): number => {
  if (p.runtime === 'threads') return Math.min(p.pool, p.requests);
  if (p.runtime === 'csp') return Math.min(p.workers, p.requests);
  if (p.runtime === 'actors') return Math.min(p.actors, p.requests);
  return 1;
};

/** Which actor (or the one loop) a request belongs to. */
const mailboxOf = (p: Params, req: number): number => (p.runtime === 'actors' ? (req - 1) % fibreCount(p) : 0);

export function simulate(raw: Params): Run {
  const p = normalise(raw);
  const error = refusal(p);
  if (error) throw new Error(error);
  const R = p.requests;
  const threadLike = p.runtime === 'threads' || p.runtime === 'csp';
  const preempts = p.runtime === 'threads';
  const F = fibreCount(p);
  const firstStepMs = (req: number) => (p.fault === 'hog' && req === FAULT_REQUEST ? HOG_MS : CPU_MS);

  const finish: (number | null)[] = Array.from({ length: R + 1 }, () => null);
  const failedAt: (number | null)[] = Array.from({ length: R + 1 }, () => null);
  const startedAt: (number | null)[] = Array.from({ length: R + 1 }, () => null);
  const owner: number[] = Array.from({ length: R + 1 }, () => -1);
  const segs: Seg[] = [];
  const marks: Mark[] = [];
  const dead: boolean[] = Array.from({ length: F }, () => false);
  const cur: (number | null)[] = Array.from({ length: F }, () => null);
  const busy: boolean[] = Array.from({ length: F }, () => false);
  const mail: Turn[][] = Array.from({ length: F }, () => []);
  const unresolvedOn: number[] = Array.from({ length: F }, () => 0);
  const cores: (Turn | null)[] = Array.from({ length: p.cores }, () => null);
  const ready: Turn[] = [];
  const deliveries: { at: number; req: number }[] = [];
  const pending: number[] = [];
  let resolved = 0;
  let switches = 0;
  let callbacks = 0;
  let peakConcurrent = 0;
  let peakCores = 0;
  let endedAt: number | null = null;

  const isOpen = (req: number) => finish[req] === null && failedAt[req] === null;
  const fail = (req: number, at: number) => {
    if (!isOpen(req)) return;
    failedAt[req] = at;
    resolved++;
    if (!threadLike) unresolvedOn[mailboxOf(p, req)]--;
  };
  const done = (req: number, at: number) => {
    finish[req] = at;
    resolved++;
    marks.push({ req, kind: 'finish', at });
    if (!threadLike) unresolvedOn[mailboxOf(p, req)]--;
  };

  if (threadLike) for (let r = 1; r <= R; r++) pending.push(r);
  else {
    for (let r = 1; r <= R; r++) {
      unresolvedOn[mailboxOf(p, r)]++;
      mail[mailboxOf(p, r)].push({ req: r, seg: 0, remaining: firstStepMs(r), waitFrom: 0, ranFor: 0, fibre: mailboxOf(p, r) });
    }
  }

  const killProcess = (at: number) => {
    for (let r = 1; r <= R; r++) fail(r, at);
    endedAt = at;
  };

  const crash = (req: number, fibre: number, at: number) => {
    marks.push({ req, kind: 'crash', at });
    fail(req, at);
    if (p.net) {
      if (p.runtime === 'actors') marks.push({ req, kind: 'restart', at });
      if (threadLike) cur[fibre] = null;
      else busy[fibre] = false;
      return;
    }
    if (p.runtime === 'threads') {
      dead[fibre] = true;
      cur[fibre] = null;
    } else if (p.runtime === 'actors') {
      dead[fibre] = true;
      busy[fibre] = false;
      mail[fibre] = [];
      for (let r = 1; r <= R; r++) if (mailboxOf(p, r) === fibre) fail(r, at);
    } else killProcess(at);
  };

  let t = 0;
  while (resolved < R && endedAt === null) {
    // a. I/O replies arrive
    const arriving = deliveries.filter((d) => d.at === t).sort((a, b) => a.req - b.req);
    for (const { req } of arriving) {
      if (!isOpen(req)) continue;
      const turn: Turn = { req, seg: 2, remaining: CPU_MS, waitFrom: t, ranFor: 0, fibre: threadLike ? owner[req] : mailboxOf(p, req) };
      if (threadLike) {
        switches++;
        ready.push(turn);
      } else mail[turn.fibre].push(turn);
    }
    // b. idle threads or workers take the next request
    if (threadLike) {
      for (let f = 0; f < F; f++) {
        if (dead[f] || cur[f] !== null || pending.length === 0) continue;
        const req = pending.shift()!;
        cur[f] = req;
        owner[req] = f;
        startedAt[req] = t;
        if (t > 0) segs.push({ req, kind: 'wait', start: 0, end: t });
        ready.push({ req, seg: 0, remaining: firstStepMs(req), waitFrom: t, ranFor: 0, fibre: f });
      }
    } else {
      // c. an idle actor (or the loop) starts the next message in its mailbox
      for (let f = 0; f < F; f++) {
        if (dead[f] || busy[f] || mail[f].length === 0) continue;
        busy[f] = true;
        ready.push(mail[f].shift()!);
      }
    }
    // stall guard: nothing can ever happen again
    if (!cores.some(Boolean) && ready.length === 0 && deliveries.every((d) => d.at < t)) {
      for (let r = 1; r <= R; r++) fail(r, t);
      endedAt = t;
      break;
    }
    // d. the OS preempts a thread that has used its slice while another waits
    if (preempts) {
      cores.forEach((turn, i) => {
        if (turn && turn.ranFor >= QUANTUM_MS && turn.remaining > 0 && ready.length > 0) {
          turn.ranFor = 0;
          turn.waitFrom = t;
          ready.push(turn);
          cores[i] = null;
          switches++;
        }
      });
    }
    // e. free cores take the next ready turns, oldest first
    for (let i = 0; i < cores.length; i++) {
      if (cores[i] !== null || ready.length === 0) continue;
      const turn = ready.shift()!;
      if (t > turn.waitFrom) segs.push({ req: turn.req, kind: 'wait', start: turn.waitFrom, end: t });
      cores[i] = turn;
    }
    // f. every busy core runs one millisecond
    let running = 0;
    for (const turn of cores) {
      if (!turn) continue;
      running++;
      segs.push({ req: turn.req, kind: 'cpu', start: t, end: t + 1, hog: turn.seg === 0 && p.fault === 'hog' && turn.req === FAULT_REQUEST });
      turn.remaining--;
      turn.ranFor++;
    }
    peakCores = Math.max(peakCores, running);
    // g. turns that finished this millisecond
    for (let i = 0; i < cores.length; i++) {
      const turn = cores[i];
      if (!turn || turn.remaining > 0) continue;
      cores[i] = null;
      const end = t + 1;
      if (!threadLike) callbacks++;
      if (turn.seg === 0) {
        if (p.fault === 'crash' && turn.req === FAULT_REQUEST) {
          crash(turn.req, turn.fibre, end);
          if (endedAt !== null) break;
        } else {
          segs.push({ req: turn.req, kind: 'io', start: end, end: end + IO_MS });
          deliveries.push({ at: end + IO_MS, req: turn.req });
          if (threadLike) switches++;
          else busy[turn.fibre] = false;
        }
      } else {
        done(turn.req, end);
        if (threadLike) cur[turn.fibre] = null;
        else busy[turn.fibre] = false;
      }
    }
    // h. concurrency: fibres holding an unfinished request
    const holding = threadLike ? cur.filter((c) => c !== null).length : unresolvedOn.filter((n) => n > 0).length;
    peakConcurrent = Math.max(peakConcurrent, holding);
    t++;
  }

  const makespan = endedAt ?? t;
  const clipped = mergeSegs(endedAt === null ? segs : segs.filter((s) => s.start < makespan).map((s) => ({ ...s, end: Math.min(s.end, makespan) })));
  const osThreads = p.runtime === 'threads' ? F : p.runtime === 'events' ? 1 : p.cores;
  let bystanderFinish: number | null = null;
  for (let r = 1; r <= R; r++) {
    const f = finish[r];
    if (r !== FAULT_REQUEST && f !== null && (bystanderFinish === null || f < bystanderFinish)) bystanderFinish = f;
  }
  return {
    params: p,
    makespan,
    finish,
    failedAt,
    segs: clipped,
    marks,
    finished: finish.filter((f) => f !== null).length,
    failed: failedAt.filter((f) => f !== null).length,
    peakConcurrent,
    peakCores,
    osThreads,
    memoryMb: osThreads * STACK_MB,
    switches,
    callbacks,
    startedAt,
    bystanderFinish,
    senderDone: p.runtime === 'csp' ? senderDoneAt(p, startedAt) : null,
  };
}

/** Joins back-to-back pieces of the same kind (a CPU step drawn millisecond by millisecond becomes one bar). */
export function mergeSegs(raw: readonly Seg[]): Seg[] {
  const sorted = raw.slice().sort((a, b) => a.req - b.req || a.start - b.start || a.end - b.end);
  const out: Seg[] = [];
  for (const s of sorted) {
    const last = out.at(-1);
    if (last && last.req === s.req && last.kind === s.kind && !last.hog === !s.hog && s.start <= last.end) last.end = Math.max(last.end, s.end);
    else out.push({ ...s });
  }
  return out;
}

/** When the sender of a channel (buffer K) has handed over its last request: item j goes in once item j - K has been taken. */
export function senderDoneAt(p: Params, startedAt: readonly (number | null)[]): number | null {
  const R = p.requests;
  const sendTime = (j: number): number | null => {
    if (p.buffer > 0 && j <= p.buffer) return 0;
    return startedAt[p.buffer === 0 ? j : j - p.buffer] ?? null;
  };
  return sendTime(R);
}

// ── the readouts ──────────────────────────────────────────────────────────

/** What the same run would be without the fault: the baseline the bystander figure is read against. */
export const withoutFault = (p: Params): Params => ({ ...p, fault: 'none', net: false });
