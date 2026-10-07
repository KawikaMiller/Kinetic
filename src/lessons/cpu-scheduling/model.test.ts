import { describe, expect, it } from 'vitest';
import { mulberry32, randInt } from '../../core/random';
import {
  compareAll, DEFAULT_OPTS, MLFQ_QUANTA, metricsOf, parseIo, POLICIES, PRESETS, schedule, STARVE_TICKS,
  type Job, type Policy, type ScheduleOpts,
} from './model';

const job = (name: string, arrival: number, burst: number, io: Job['io'] = null): Job => ({ name, arrival, burst, io });
const TEXTBOOK = [job('P1', 0, 24), job('P2', 0, 3), job('P3', 0, 3)];
const avgWait = (jobs: Job[], p: Policy, opts: ScheduleOpts = DEFAULT_OPTS) => metricsOf(schedule(jobs, p, opts)).waiting;
const ALL: Policy[] = POLICIES.map((p) => p.value);

/** Which job runs in each tick, as a string of names: "P1P1P2…", "." for idle, "~" for a switch. */
const trace = (jobs: Job[], p: Policy, opts: ScheduleOpts = DEFAULT_OPTS) =>
  schedule(jobs, p, opts)
    .moments.filter((m) => m.cpu)
    .map((m) => (m.cpu!.kind === 'run' ? jobs[m.cpu!.job].name : m.cpu!.kind === 'idle' ? '.' : '~'))
    .join(' ');

function randomJobs(seed: number, withIo: boolean): Job[] {
  const rnd = mulberry32(seed);
  const n = randInt(1, 7, rnd);
  return Array.from({ length: n }, (_, i) =>
    job(`J${i}`, randInt(0, 12, rnd), randInt(1, 12, rnd), withIo && rnd() < 0.5 ? { every: randInt(1, 4, rnd), length: randInt(1, 5, rnd) } : null),
  );
}

describe('textbook values (P1 = 24, P2 = 3, P3 = 3, all at t = 0)', () => {
  it('FCFS averages 17 ticks of waiting', () => expect(avgWait(TEXTBOOK, 'fcfs')).toBe(17));
  it('SJF averages 3', () => expect(avgWait(TEXTBOOK, 'sjf')).toBe(3));
  it('RR with q = 4 averages 17/3', () => expect(avgWait(TEXTBOOK, 'rr', { ...DEFAULT_OPTS, quantum: 4 })).toBeCloseTo(17 / 3, 10));
  it('RR with q = 4 runs P1 for one quantum, then P2, P3, then P1 to the end', () => {
    const s = schedule(TEXTBOOK, 'rr', { ...DEFAULT_OPTS, quantum: 4 });
    expect(s.stats.map((x) => x.completion)).toEqual([30, 7, 10]);
  });
});

describe('hand-worked schedules', () => {
  it('SRTF preempts for a strictly shorter arrival', () => {
    // A: 0..8; B arrives at 1 with 4 < 7 left; C at 2 with 9; D at 3 with 5 (the classic example).
    const jobs = [job('A', 0, 8), job('B', 1, 4), job('C', 2, 9), job('D', 3, 5)];
    const s = schedule(jobs, 'srtf', DEFAULT_OPTS);
    expect(s.stats.map((x) => x.completion)).toEqual([17, 5, 26, 10]);
    expect(metricsOf(s).waiting).toBe(6.5);
  });
  it('a switch cost delays the next job and is counted as overhead, not work', () => {
    const s = schedule([job('A', 0, 2), job('B', 0, 2)], 'fcfs', { ...DEFAULT_OPTS, switchCost: 1 });
    expect(trace([job('A', 0, 2), job('B', 0, 2)], 'fcfs', { ...DEFAULT_OPTS, switchCost: 1 })).toBe('A A ~ B B');
    expect(s.switchTicks).toBe(1);
    expect(s.busyTicks).toBe(4);
    expect(s.stats[1].waiting).toBe(3);
  });
  it('the CPU idles until the first arrival', () => {
    expect(trace([job('A', 2, 1)], 'fcfs')).toBe('. . A');
  });
  it('I/O blocks a job and lets the other one run', () => {
    // E: 1 tick of CPU, then 2 of I/O, twice; H runs while E is blocked.
    const jobs = [job('E', 0, 2, { every: 1, length: 2 }), job('H', 0, 3)];
    expect(trace(jobs, 'rr', { ...DEFAULT_OPTS, quantum: 4 })).toBe('E H H H E');
    const s = schedule(jobs, 'rr', { ...DEFAULT_OPTS, quantum: 4 });
    expect(s.stats[0].io).toBe(2);
  });
});

describe('MLFQ', () => {
  it('demotes a job that uses its whole quantum, level by level', () => {
    const s = schedule([job('A', 0, 20), job('B', 0, 20)], 'mlfq', DEFAULT_OPTS);
    const demotions = s.moments.flatMap((m) => m.events.filter((e) => e.kind === 'demote').map((e) => ({ t: m.t, ...e })));
    // Each job uses its level-0 quantum (2), then its level-1 quantum (4).
    expect(demotions).toEqual([
      { t: MLFQ_QUANTA[0], kind: 'demote', job: 0, level: 1 },
      { t: 2 * MLFQ_QUANTA[0], kind: 'demote', job: 1, level: 1 },
      { t: 2 * MLFQ_QUANTA[0] + MLFQ_QUANTA[1], kind: 'demote', job: 0, level: 2 },
      { t: 2 * MLFQ_QUANTA[0] + 2 * MLFQ_QUANTA[1], kind: 'demote', job: 1, level: 2 },
    ]);
  });
  it('keeps a job that blocks before its quantum ends at the top level', () => {
    const s = schedule([job('Hog', 0, 16), job('Edit', 0, 4, { every: 1, length: 3 })], 'mlfq', DEFAULT_OPTS);
    expect(s.moments.every((m) => m.levels[1] === 0)).toBe(true);
    expect(s.moments.at(-1)!.levels[0]).toBe(MLFQ_LEVELS_BOTTOM);
  });
  it('a boost puts every job back on the top level', () => {
    const boostEvery = 10;
    const s = schedule([job('A', 0, 20), job('B', 0, 20), job('C', 0, 20)], 'mlfq', { ...DEFAULT_OPTS, boostEvery });
    const atBoost = s.moments.find((m) => m.t === boostEvery)!;
    const before = s.moments.find((m) => m.t === boostEvery - 1)!;
    expect(before.levels.some((l) => l > 0)).toBe(true);
    expect(atBoost.events.some((e) => e.kind === 'boost')).toBe(true);
    expect(atBoost.levels).toEqual([0, 0, 0]);
    expect(atBoost.queues.slice(1).every((q) => q.length === 0)).toBe(true);
  });
  it('a higher level preempts a lower one', () => {
    const s = schedule([job('A', 0, 10), job('B', 5, 2)], 'mlfq', DEFAULT_OPTS);
    const m = s.moments.find((x) => x.t === 5)!;
    expect(m.events).toContainEqual({ kind: 'preempt', job: 0, reason: 'higher' });
    expect(m.cpu).toEqual({ kind: 'run', job: 1 });
  });
});
const MLFQ_LEVELS_BOTTOM = MLFQ_QUANTA.length - 1;

describe('invariants on 300 seeded random job sets, every policy', () => {
  const sets = Array.from({ length: 300 }, (_, i) => ({ seed: i + 1, io: i % 2 === 0, cost: i % 3 === 0 ? 1 : 0 }));
  for (const policy of ALL) {
    it(`${policy}: never idle with work waiting; busy = sum of bursts; turnaround = waiting + burst + I/O`, () => {
      for (const { seed, io, cost } of sets) {
        const jobs = randomJobs(seed, io);
        const opts = { quantum: 1 + (seed % 8), switchCost: cost, boostEvery: seed % 4 === 0 ? 15 : 0 };
        const s = schedule(jobs, policy, opts);
        for (const m of s.moments) {
          if (m.cpu?.kind === 'idle') expect(m.queues.flat()).toEqual([]);
        }
        expect(s.busyTicks).toBe(jobs.reduce((a, j) => a + j.burst, 0));
        expect(s.busyTicks + s.switchTicks + s.idleTicks).toBe(s.end);
        s.stats.forEach((x, i) => {
          expect(x.turnaround).toBe(x.waiting + jobs[i].burst + x.io);
          expect(x.response).toBeGreaterThanOrEqual(0);
          expect(x.response).toBeLessThanOrEqual(x.waiting);
        });
        if (cost === 0) expect(s.switchTicks).toBe(0);
      }
    });
  }
  it('SRTF has the lowest average waiting time when there is no I/O and no switch cost', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const jobs = randomJobs(seed, false);
      const opts = { quantum: 1 + (seed % 8), switchCost: 0, boostEvery: seed % 2 ? 0 : 12 };
      const srtf = avgWait(jobs, 'srtf', opts);
      for (const p of ALL) expect(srtf).toBeLessThanOrEqual(avgWait(jobs, p, opts) + 1e-9);
    }
  });
});

describe('presets', () => {
  it('Convoy: FCFS makes the short jobs wait behind the big one; SJF does not', () => {
    const { jobs } = PRESETS.find((p) => p.id === 'convoy')!;
    expect(avgWait(jobs, 'fcfs')).toBeGreaterThan(2 * avgWait(jobs, 'sjf'));
  });
  it('Starvation: under SJF the long job waits past the starving threshold, but not under RR', () => {
    const { jobs } = PRESETS.find((p) => p.id === 'starvation')!;
    const sjf = schedule(jobs, 'sjf', DEFAULT_OPTS);
    expect(Math.max(...sjf.moments.map((m) => m.streak[0]))).toBeGreaterThanOrEqual(STARVE_TICKS);
    expect(sjf.stats[0].firstRun).toBe(12);
    const rr = schedule(jobs, 'rr', DEFAULT_OPTS);
    expect(Math.max(...rr.moments.map((m) => m.streak[0]))).toBeLessThan(STARVE_TICKS);
  });
  it('Quantum too small: half the run is switching', () => {
    const p = PRESETS.find((x) => x.id === 'tiny-quantum')!;
    const s = schedule(p.jobs, p.policy, p.opts);
    expect(s.busyTicks).toBe(12);
    expect(s.switchTicks).toBe(11);
  });
  it('Interactive + batch: MLFQ answers the interactive jobs faster than FCFS', () => {
    const p = PRESETS.find((x) => x.id === 'interactive')!;
    expect(metricsOf(schedule(p.jobs, 'mlfq', p.opts)).response).toBeLessThan(metricsOf(schedule(p.jobs, 'fcfs', p.opts)).response);
  });
  it('compare all: only Convoy has a policy that wins (or ties) every column, and it is SJF', () => {
    const sweeps = Object.fromEntries(PRESETS.map((p) => [p.id, compareAll(p.jobs, p.opts).sweep]));
    expect(sweeps).toEqual({ textbook: null, convoy: 'sjf', interactive: null, starvation: null, 'tiny-quantum': null });
  });
  it('Starvation: SJF has the best average wait but the worst single wait', () => {
    const p = PRESETS.find((x) => x.id === 'starvation')!;
    const c = compareAll(p.jobs, p.opts);
    expect(c.winners.waiting).toContain('sjf');
    expect(c.winners.worstWait).toEqual(['fcfs']);
  });
  it('compare all reports a sweep when one policy really is best everywhere', () => {
    // One job: every policy ties on every metric, so the first one listed sweeps.
    expect(compareAll([job('A', 0, 3)], DEFAULT_OPTS).sweep).toBe('fcfs');
  });
});

describe('parseIo', () => {
  it('reads cpu/io pairs and "none"', () => {
    expect(parseIo('2/4')).toEqual({ ok: true, value: { every: 2, length: 4 } });
    expect(parseIo(' 1 / 9 ')).toEqual({ ok: true, value: { every: 1, length: 9 } });
    expect(parseIo('')).toEqual({ ok: true, value: null });
    expect(parseIo('  ')).toEqual({ ok: true, value: null });
    expect(parseIo('None')).toEqual({ ok: true, value: null });
  });
  it.each(['-1/2', '0/3', '2/0', '2/10', '1e400', '😀', '<b>2/3</b>', '2,3', '2/', '/3', '12345678901234567890123/1', '1.5/2'])('refuses %s', (s) => {
    expect(parseIo(s).ok).toBe(false);
  });
});
