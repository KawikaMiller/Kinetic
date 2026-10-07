/**
 * One-CPU scheduler simulation in whole ticks. Every number the lesson shows (the Gantt,
 * the ready queue, completion / turnaround / waiting / response, the compare table) comes
 * from `schedule()`.
 *
 * Each tick t runs in this order:
 *   1. jobs arriving at t join the ready queue (in table order), then jobs whose I/O ends at t;
 *   2. MLFQ only: every `boostEvery` ticks every job goes back to the top level;
 *   3. the running job is checked: SRTF preempts it for a strictly shorter job, RR when its
 *      quantum is used up and someone is waiting, MLFQ when its level's quantum is used up
 *      (and demotes it) or a higher level has work;
 *   4. a free CPU picks the next job (FCFS / RR: the front of the queue; SJF / SRTF: the
 *      shortest next CPU burst, ties to the front; MLFQ: the front of the highest busy level).
 *      Switching to a different job than the last one costs `switchCost` ticks first;
 *   5. the CPU runs one tick (or switches, or idles). A job that has used its whole burst
 *      finishes at t + 1; a job that has done `io.every` ticks of CPU blocks for `io.length`.
 */

export type Policy = 'fcfs' | 'sjf' | 'srtf' | 'rr' | 'mlfq';

export const POLICIES: { value: Policy; label: string; long: string }[] = [
  { value: 'fcfs', label: 'FCFS', long: 'First come, first served' },
  { value: 'sjf', label: 'SJF', long: 'Shortest job first' },
  { value: 'srtf', label: 'SRTF', long: 'Shortest remaining time first' },
  { value: 'rr', label: 'RR', long: 'Round robin' },
  { value: 'mlfq', label: 'MLFQ', long: 'Multi-level feedback queue' },
];

export const policyLabel = (p: Policy) => POLICIES.find((x) => x.value === p)!.label;

/** A job's CPU work comes in pieces: `every` ticks of CPU, then `length` ticks blocked on I/O, repeat. */
export interface IoPattern {
  every: number;
  length: number;
}

export interface Job {
  name: string;
  arrival: number;
  /** Total CPU ticks the job needs. */
  burst: number;
  io: IoPattern | null;
}

export interface ScheduleOpts {
  /** RR quantum, in ticks. */
  quantum: number;
  /** Ticks the CPU spends switching to a different job (0 = free). */
  switchCost: number;
  /** MLFQ: move every job back to the top level every this many ticks (0 = never). */
  boostEvery: number;
}

/** MLFQ levels' quanta, top level first. */
export const MLFQ_QUANTA = [2, 4, 8] as const;
export const MLFQ_LEVELS = MLFQ_QUANTA.length;
/** A job that has sat ready this many ticks in a row is flagged as starving. */
export const STARVE_TICKS = 8;
/** Safety stop for the simulation loop. */
const MAX_TICKS = 5000;

export type JobState = 'future' | 'ready' | 'running' | 'blocked' | 'done';

export type CpuTick = { kind: 'run'; job: number } | { kind: 'switch'; job: number } | { kind: 'idle' };

export type SchedEvent =
  | { kind: 'arrive'; job: number }
  | { kind: 'wake'; job: number }
  | { kind: 'boost' }
  | { kind: 'preempt'; job: number; reason: 'quantum' | 'shorter' | 'higher'; by?: number }
  | { kind: 'demote'; job: number; level: number }
  | { kind: 'renew'; job: number }
  | { kind: 'block'; job: number; until: number }
  | { kind: 'finish'; job: number }
  | { kind: 'dispatch'; job: number; cost: number };

/** The scheduler at time t, after its decisions, and what the CPU does during [t, t + 1). */
export interface Moment {
  t: number;
  events: SchedEvent[];
  /** Null at the final moment, when every job is done. */
  cpu: CpuTick | null;
  /** Ready queues, front first: one for most policies, MLFQ_LEVELS for MLFQ. */
  queues: number[][];
  states: JobState[];
  levels: number[];
  /** Ticks each job has spent ready (waiting) before t. */
  waited: number[];
  /** Ticks each job has been ready in a row up to t (0 when it isn't ready). */
  streak: number[];
  /** CPU ticks each job still needs at t. */
  remaining: number[];
  /** Each job's next CPU burst at t: what SJF and SRTF compare. */
  bursts: number[];
}

export interface JobStats {
  completion: number;
  turnaround: number;
  waiting: number;
  response: number;
  /** Ticks spent blocked on I/O. */
  io: number;
  /** First tick the job ran. */
  firstRun: number;
}

export interface Schedule {
  moments: Moment[];
  /** When the last job finished. */
  end: number;
  stats: JobStats[];
  busyTicks: number;
  switchTicks: number;
  idleTicks: number;
  /** Dispatches that paid a switch. */
  switches: number;
}

interface Live {
  remaining: number;
  sinceIo: number;
  state: JobState;
  level: number;
  slice: number;
  blockedUntil: number;
  firstRun: number;
  waited: number;
  streak: number;
  io: number;
  completion: number;
}

/** CPU ticks until the job's next I/O or its end: what SJF and SRTF compare. */
export function nextBurst(job: Job, remaining: number, sinceIo: number): number {
  return job.io ? Math.min(job.io.every - sinceIo, remaining) : remaining;
}

export function schedule(jobs: readonly Job[], policy: Policy, opts: ScheduleOpts): Schedule {
  if (jobs.length === 0) throw new RangeError('schedule needs at least one job');
  const levels = policy === 'mlfq' ? MLFQ_LEVELS : 1;
  const live: Live[] = jobs.map((j) => ({
    remaining: j.burst, sinceIo: 0, state: 'future', level: 0, slice: 0, blockedUntil: -1, firstRun: -1, waited: 0, streak: 0, io: 0, completion: -1,
  }));
  const queues: number[][] = Array.from({ length: levels }, () => []);
  const moments: Moment[] = [];
  const enqueue = (j: number) => {
    live[j].state = 'ready';
    queues[policy === 'mlfq' ? live[j].level : 0].push(j);
  };
  const burstOf = (j: number) => nextBurst(jobs[j], live[j].remaining, live[j].sinceIo);
  const anyReady = () => queues.some((q) => q.length > 0);
  /** Front of the queue, or the shortest next burst (ties to the front) for SJF / SRTF. */
  const pickIndex = (q: number[]) => {
    if (policy !== 'sjf' && policy !== 'srtf') return 0;
    let best = 0;
    q.forEach((j, i) => {
      if (burstOf(j) < burstOf(q[best])) best = i;
    });
    return best;
  };

  let running: number | null = null;
  let switching: { job: number; left: number } | null = null;
  let lastRan: number | null = null;
  let carried: SchedEvent[] = [];
  let busyTicks = 0;
  let switchTicks = 0;
  let idleTicks = 0;
  let switches = 0;

  for (let t = 0; ; t++) {
    if (t > MAX_TICKS) throw new RangeError('schedule ran too long');
    const events: SchedEvent[] = carried;
    carried = [];

    jobs.forEach((j, i) => {
      if (j.arrival === t) {
        enqueue(i);
        events.push({ kind: 'arrive', job: i });
      }
    });
    live.forEach((l, i) => {
      if (l.state === 'blocked' && l.blockedUntil === t) {
        enqueue(i);
        events.push({ kind: 'wake', job: i });
      }
    });

    if (policy === 'mlfq' && opts.boostEvery > 0 && t > 0 && t % opts.boostEvery === 0) {
      const order = queues.flat();
      queues.forEach((q) => q.splice(0));
      live.forEach((l) => {
        if (l.state !== 'done') {
          l.level = 0;
          l.slice = 0;
        }
      });
      queues[0].push(...order);
      events.push({ kind: 'boost' });
    }

    if (running !== null) {
      const r = running;
      const L = live[r];
      if (policy === 'srtf') {
        const q = queues[0];
        if (q.length > 0) {
          const best = q[pickIndex(q)];
          if (burstOf(best) < burstOf(r)) {
            events.push({ kind: 'preempt', job: r, reason: 'shorter', by: best });
            running = null;
            enqueue(r);
          }
        }
      } else if (policy === 'rr' && L.slice >= opts.quantum) {
        L.slice = 0;
        if (anyReady()) {
          events.push({ kind: 'preempt', job: r, reason: 'quantum' });
          running = null;
          enqueue(r);
        } else {
          events.push({ kind: 'renew', job: r });
        }
      } else if (policy === 'mlfq') {
        if (L.slice >= MLFQ_QUANTA[L.level]) {
          L.slice = 0;
          if (L.level < MLFQ_LEVELS - 1) {
            L.level++;
            events.push({ kind: 'demote', job: r, level: L.level });
          }
          if (anyReady()) {
            events.push({ kind: 'preempt', job: r, reason: 'quantum' });
            running = null;
            enqueue(r);
          } else if (L.level === MLFQ_LEVELS - 1) {
            events.push({ kind: 'renew', job: r });
          }
        } else if (queues.slice(0, L.level).some((q) => q.length > 0)) {
          events.push({ kind: 'preempt', job: r, reason: 'higher' });
          running = null;
          enqueue(r);
        }
      }
    }

    if (running === null && switching === null && anyReady()) {
      const q = queues.find((x) => x.length > 0)!;
      const [j] = q.splice(pickIndex(q), 1);
      if (policy === 'rr') live[j].slice = 0;
      const cost: number = opts.switchCost > 0 && lastRan !== null && lastRan !== j ? opts.switchCost : 0;
      events.push({ kind: 'dispatch', job: j, cost });
      if (cost > 0) {
        switching = { job: j, left: cost };
        switches++;
      } else {
        running = j;
        live[j].state = 'running';
      }
    }

    const done = live.every((l) => l.state === 'done');
    const cpu: CpuTick | null = done ? null : switching ? { kind: 'switch', job: switching.job } : running !== null ? { kind: 'run', job: running } : { kind: 'idle' };
    moments.push({
      t, events, cpu,
      queues: queues.map((q) => [...q]),
      states: live.map((l) => l.state),
      levels: live.map((l) => l.level),
      waited: live.map((l) => l.waited),
      streak: live.map((l) => l.streak),
      remaining: live.map((l) => l.remaining),
      bursts: jobs.map((_, i) => burstOf(i)),
    });
    if (done) break;

    // One tick of time passes.
    live.forEach((l, i) => {
      const switchingIn = switching?.job === i;
      if (l.state === 'ready' || switchingIn) {
        l.waited++;
        l.streak++;
      } else {
        l.streak = 0;
      }
      if (l.state === 'blocked') l.io++;
    });
    if (switching) {
      switchTicks++;
      switching.left--;
      if (switching.left === 0) {
        running = switching.job;
        live[running].state = 'running';
        lastRan = running;
        switching = null;
      }
    } else if (running !== null) {
      const r = running;
      const L = live[r];
      busyTicks++;
      if (L.firstRun < 0) L.firstRun = t;
      L.remaining--;
      L.sinceIo++;
      L.slice++;
      lastRan = r;
      const io = jobs[r].io;
      if (L.remaining === 0) {
        L.state = 'done';
        L.completion = t + 1;
        L.streak = 0;
        carried.push({ kind: 'finish', job: r });
        running = null;
      } else if (io && L.sinceIo >= io.every) {
        L.state = 'blocked';
        L.blockedUntil = t + 1 + io.length;
        L.sinceIo = 0;
        L.slice = 0;
        carried.push({ kind: 'block', job: r, until: L.blockedUntil });
        running = null;
      }
    } else {
      idleTicks++;
    }
  }

  const stats: JobStats[] = jobs.map((j, i) => {
    const l = live[i];
    return {
      completion: l.completion,
      turnaround: l.completion - j.arrival,
      waiting: l.waited,
      response: l.firstRun - j.arrival,
      io: l.io,
      firstRun: l.firstRun,
    };
  });
  return { moments, end: moments[moments.length - 1].t, stats, busyTicks, switchTicks, idleTicks, switches };
}

export type Metric = 'turnaround' | 'waiting' | 'response' | 'worstWait' | 'switches';

export const METRICS: { id: Metric; label: string }[] = [
  { id: 'turnaround', label: 'avg turnaround' },
  { id: 'waiting', label: 'avg waiting' },
  { id: 'response', label: 'avg response' },
  { id: 'worstWait', label: 'worst waiting' },
  { id: 'switches', label: 'job switches' },
];

export const average = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

export function metricsOf(s: Schedule): Record<Metric, number> {
  return {
    turnaround: average(s.stats.map((x) => x.turnaround)),
    waiting: average(s.stats.map((x) => x.waiting)),
    response: average(s.stats.map((x) => x.response)),
    worstWait: Math.max(...s.stats.map((x) => x.waiting)),
    switches: jobChanges(s),
  };
}

/** Number of job-to-job changes on the CPU (whether or not a switch cost was charged). */
export function jobChanges(s: Schedule): number {
  let last: number | null = null;
  let n = 0;
  for (const m of s.moments) {
    if (m.cpu?.kind !== 'run') continue;
    if (last !== null && m.cpu.job !== last) n++;
    last = m.cpu.job;
  }
  return n;
}

export interface Comparison {
  rows: { policy: Policy; values: Record<Metric, number> }[];
  /** Per metric, the policies with the lowest value (ties share the win). */
  winners: Record<Metric, Policy[]>;
  /** A policy that is best (or tied best) in every column, if there is one. */
  sweep: Policy | null;
}

const EPS = 1e-9;

export function compareAll(jobs: readonly Job[], opts: ScheduleOpts): Comparison {
  const rows = POLICIES.map((p) => {
    return { policy: p.value, values: metricsOf(schedule(jobs, p.value, opts)) };
  });
  const winners = {} as Record<Metric, Policy[]>;
  for (const { id } of METRICS) {
    const best = Math.min(...rows.map((r) => r.values[id]));
    winners[id] = rows.filter((r) => r.values[id] <= best + EPS).map((r) => r.policy);
  }
  const sweep = rows.find((r) => METRICS.every((m) => winners[m.id].includes(r.policy)))?.policy ?? null;
  return { rows, winners, sweep };
}

/** Share of the run the CPU spent switching rather than running jobs. */
export const switchOverhead = (s: Schedule) => (s.end === 0 ? 0 : s.switchTicks / s.end);

// ---------- presets ----------

const job = (name: string, arrival: number, burst: number, io: IoPattern | null = null): Job => ({ name, arrival, burst, io });

export type PresetId = 'textbook' | 'convoy' | 'interactive' | 'starvation' | 'tiny-quantum';

export interface Preset {
  id: PresetId;
  label: string;
  jobs: Job[];
  policy: Policy;
  opts: ScheduleOpts;
}

export const DEFAULT_OPTS: ScheduleOpts = { quantum: 4, switchCost: 0, boostEvery: 0 };

export const PRESETS: Preset[] = [
  { id: 'textbook', label: 'Textbook', policy: 'fcfs', opts: DEFAULT_OPTS, jobs: [job('P1', 0, 24), job('P2', 0, 3), job('P3', 0, 3)] },
  { id: 'convoy', label: 'Convoy', policy: 'fcfs', opts: DEFAULT_OPTS, jobs: [job('Big', 0, 12), job('A', 0, 2), job('B', 1, 2), job('C', 1, 2)] },
  {
    id: 'interactive', label: 'Interactive + batch', policy: 'mlfq', opts: { ...DEFAULT_OPTS, boostEvery: 20 },
    jobs: [job('Hog', 0, 16), job('Edit', 0, 4, { every: 1, length: 3 }), job('Shell', 1, 3, { every: 1, length: 4 })],
  },
  {
    id: 'starvation', label: 'Starvation', policy: 'sjf', opts: DEFAULT_OPTS,
    jobs: [job('Long', 0, 9), job('S1', 0, 2), job('S2', 2, 2), job('S3', 4, 2), job('S4', 6, 2), job('S5', 8, 2), job('S6', 10, 2)],
  },
  {
    id: 'tiny-quantum', label: 'Quantum too small', policy: 'rr', opts: { quantum: 1, switchCost: 1, boostEvery: 0 },
    jobs: [job('P1', 0, 4), job('P2', 0, 4), job('P3', 0, 4)],
  },
];

// ---------- editing the job table ----------

export const MAX_JOBS = 8;
export const MAX_ARRIVAL = 30;
export const MAX_BURST = 20;
export const MAX_IO = 9;

export type IoParse = { ok: true; value: IoPattern | null } | { ok: false; error: string };

/**
 * The I/O column: empty or "none" means no I/O; "2/4" means 2 ticks of CPU, then 4 ticks
 * of I/O, repeated. Anything else is refused with a sentence and the old value stays.
 */
export function parseIo(text: string): IoParse {
  const s = text.trim();
  if (s === '' || s.toLowerCase() === 'none') return { ok: true, value: null };
  const m = /^(\d{1,3})\s*\/\s*(\d{1,3})$/.exec(s);
  if (!m) return { ok: false, error: 'write it as cpu/io, like 2/4, or leave it empty for none.' };
  const every = Number(m[1]);
  const length = Number(m[2]);
  if (every < 1 || every > MAX_IO || length < 1 || length > MAX_IO) return { ok: false, error: `keep both numbers between 1 and ${MAX_IO}.` };
  return { ok: true, value: { every, length } };
}

export const formatIo = (io: IoPattern | null) => (io ? `${io.every}/${io.length}` : '');

/** Next free "P<n>" name. */
export function nextJobName(jobs: readonly Job[]): string {
  const taken = new Set(jobs.map((j) => j.name));
  for (let n = jobs.length + 1; ; n++) if (!taken.has(`P${n}`)) return `P${n}`;
}
