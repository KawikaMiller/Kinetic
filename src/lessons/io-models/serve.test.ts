import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import {
  ACTIVE_STEPS, CONNECTION_STEPS, MODELS, ROUNDS, STACK_BYTES, makeSchedule, overheadShare, runModel, workTicks, ENTRY_TICKS, SYSCALL_TICKS, WAKE_TICKS,
} from './serve';

const SEEDS = Array.from({ length: 200 }, (_, i) => i);

/** A brute-force reference: replay the seeded draws fd by fd and count ready fds per round, without the model's lists. */
function readyPerRound(connections: number, pct: number, seed: number): number[] {
  const rnd = mulberry32(seed);
  const counts: number[] = [];
  for (let r = 0; r < ROUNDS; r++) {
    let k = 0;
    for (let fd = 0; fd < connections; fd++) if (rnd() < pct / 100) k++;
    counts.push(k);
  }
  return counts;
}

describe('every model serves exactly the same events', () => {
  it('over 200 seeded schedules each event is handled once, none lost, none invented, in all five models', () => {
    for (const [connections, pct] of [[10, 50], [100, 5], [30, 100], [300, 1]] as const) {
      for (const seed of SEEDS) {
        const schedule = makeSchedule(connections, pct, seed);
        const wanted = schedule.flatMap((ready, round) => ready.map((conn) => `${round}:${conn}`)).sort();
        for (const model of MODELS) {
          const got = runModel(model, connections, schedule).served.map((s) => `${s.round}:${s.conn}`).sort();
          expect(got, `${model} C=${connections} a=${pct}% seed ${seed}`).toEqual(wanted);
          expect(new Set(got).size).toBe(got.length);
        }
      }
    }
  });

  it('the schedule\'s ready counts equal an independent per-fd replay of the same seed', () => {
    for (const [connections, pct] of [[10, 50], [1000, 1], [100, 20]] as const) {
      for (const seed of SEEDS.slice(0, 20)) {
        expect(makeSchedule(connections, pct, seed).map((r) => r.length)).toEqual(readyPerRound(connections, pct, seed));
      }
    }
  });
});

describe('the counters against closed forms (K ready requests in total, R busy rounds)', () => {
  const settings = CONNECTION_STEPS.flatMap((c) => ACTIVE_STEPS.map((a) => [c, a] as const));
  it('select and poll examine C entries per call, epoll returns k, thread-per-connection has C threads of 8 MiB of virtual stack', () => {
    for (const [connections, pct] of settings) {
      const schedule = makeSchedule(connections, pct, 5);
      const counts = readyPerRound(connections, pct, 5);
      const K = counts.reduce((a, b) => a + b, 0);
      const R = counts.filter((k) => k > 0).length;
      const id = `C=${connections} a=${pct}%`;
      const sel = runModel('select', connections, schedule);
      expect([sel.entries, sel.syscalls, sel.userScan], id).toEqual([R * connections, R + 2 * K, R * connections]);
      const ep = runModel('epoll', connections, schedule);
      expect([ep.entries, ep.syscalls, ep.setupSyscalls], id).toEqual([K, R + 2 * K, connections]);
      const ur = runModel('uring', connections, schedule);
      expect([ur.entries, ur.syscalls], id).toEqual([K, R]);
      const busy = runModel('busy', connections, schedule);
      expect([busy.syscalls, busy.entries, busy.wasted], id).toEqual([ROUNDS * connections + K, ROUNDS * connections, ROUNDS * connections - K]);
      const blocking = runModel('blocking', connections, schedule);
      expect([blocking.threads, blocking.stackBytes, blocking.syscalls, blocking.entries], id).toEqual([connections, connections * STACK_BYTES, 2 * K, 0]);
      for (const m of ['select', 'epoll', 'uring'] as const) expect(runModel(m, connections, schedule).threads).toBe(1);
    }
  });

  it('10,000 idle connections and 5 ready: select examines 10,000 per call, epoll 5', () => {
    const schedule: number[][] = Array.from({ length: ROUNDS }, (_, r) => (r === 0 ? [1, 2, 3, 4, 5] : []));
    const sel = runModel('select', 10000, schedule);
    const ep = runModel('epoll', 10000, schedule);
    expect([sel.entries, ep.entries]).toEqual([10000, 5]);
    expect(runModel('blocking', 10000, schedule).stackBytes).toBe(10000 * 8 * 1024 * 1024);
  });

  it('overhead ticks are exactly syscalls, entries and wake-ups priced at the named constants, and the share is computed from them', () => {
    const schedule = makeSchedule(1000, 2, 11);
    const c = runModel('select', 1000, schedule);
    expect(c.overheadTicks).toBe(c.syscalls * SYSCALL_TICKS + (c.entries + c.userScan) * ENTRY_TICKS);
    const b = runModel('blocking', 1000, schedule);
    expect(b.overheadTicks).toBe(b.syscalls * SYSCALL_TICKS + b.served.length * WAKE_TICKS);
    expect(overheadShare(c, 4)).toBeCloseTo(c.overheadTicks / (c.overheadTicks + workTicks(c, 4)), 12);
  });

  it('at 1,000 connections and 2% active epoll and io_uring cost fewer overhead ticks than select and a busy poll', () => {
    const schedule = makeSchedule(1000, 2, 11);
    const cost = (m: (typeof MODELS)[number]) => runModel(m, 1000, schedule).overheadTicks;
    expect(cost('epoll')).toBeLessThan(cost('select'));
    expect(cost('uring')).toBeLessThan(cost('epoll'));
    expect(cost('select')).toBeLessThan(cost('busy'));
  });
});
