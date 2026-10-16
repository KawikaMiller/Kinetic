import { describe, expect, it } from 'vitest';
import {
  BASE, BROKEN_SEED, DEFAULT_SCENARIO, H_AFTER, H_CRITICAL, L_AFTER, L_BEFORE, PROTOCOLS, RANGES, TASKS, blockingTime, inversionWindow, runsOf, scenarioFromSeed, schedule, verdictOf,
  waitingTicks, type Protocol, type Scenario, type Schedule, type TaskId,
} from './sched';

/**
 * A second scheduler, written from the definitions with its own data layout: every task is a list of operations, the lock
 * table is a plain map, and the effective priority is computed by the definition each tick. It returns who ran each tick.
 */
function reference(s: Scenario, protocol: Protocol): { ran: (TaskId | null)[]; finish: Record<TaskId, number | null> } {
  type Op = ['c', number] | ['lock'] | ['unlock'];
  const program: Record<TaskId, Op[]> = {
    H: [['lock'], ['c', H_CRITICAL], ['unlock'], ['c', H_AFTER]],
    M: [['c', s.lenM]],
    L: [['c', L_BEFORE], ['lock'], ...(s.csL > 0 ? [['c', s.csL] as Op] : []), ['unlock'], ['c', L_AFTER]],
  };
  const at: Record<TaskId, number> = { H: s.arrivalH, M: s.arrivalM, L: 0 };
  const remaining: Record<TaskId, Op[]> = { H: program.H.map((o) => [...o] as Op), M: program.M.map((o) => [...o] as Op), L: program.L.map((o) => [...o] as Op) };
  const waitingFor: Record<TaskId, boolean> = { H: false, M: false, L: false };
  const owner: { who: TaskId | null } = { who: null };
  const finish: Record<TaskId, number | null> = { H: null, M: null, L: null };
  const ran: (TaskId | null)[] = [];
  let previous: TaskId | null = null;

  const live = (k: TaskId, t: number) => at[k] <= t && finish[k] === null;
  const eff = (k: TaskId): number => {
    let p = BASE[k];
    if (protocol === 'ceiling' && owner.who === k) p = Math.max(p, BASE.H, BASE.L);
    if (protocol === 'inheritance' && owner.who === k) for (const w of TASKS) if (waitingFor[w]) p = Math.max(p, BASE[w]);
    return p;
  };

  for (let t = 0; t < 200 && TASKS.some((k) => finish[k] === null); t++) {
    let chosen: TaskId | null = null;
    for (let spin = 0; spin < 100 && chosen === null; spin++) {
      const candidates = TASKS.filter((k) => live(k, t) && !waitingFor[k]);
      if (candidates.length === 0) break;
      // highest effective priority; among equals the one that ran last tick, then H, M, L
      const order = [...candidates].sort((a, b) => eff(b) - eff(a) || (b === previous ? 1 : 0) - (a === previous ? 1 : 0) || TASKS.indexOf(a) - TASKS.indexOf(b));
      const k = order[0];
      const op = remaining[k][0];
      if (op[0] === 'lock') {
        if (owner.who === null) {
          owner.who = k;
          remaining[k].shift();
        } else waitingFor[k] = true;
      } else if (op[0] === 'unlock') {
        owner.who = null;
        remaining[k].shift();
        for (const w of TASKS) waitingFor[w] = false;
      } else chosen = k;
    }
    ran.push(chosen);
    if (chosen !== null) {
      const op = remaining[chosen][0] as ['c', number];
      op[1]--;
      if (op[1] === 0) remaining[chosen].shift();
      if (remaining[chosen].length === 0) finish[chosen] = t + 1;
    }
    previous = chosen;
  }
  return { ran, finish };
}

const protocolsOf = (p: Protocol) => ({ protocol: p });
const seeds = Array.from({ length: 500 }, (_, i) => i);

describe('the scheduler against a second scheduler', () => {
  it('runs the same task in every tick as the reference, over 500 seeded scenarios and all three protocols', () => {
    let compared = 0;
    for (const seed of seeds) {
      const s = scenarioFromSeed(seed);
      for (const protocol of PROTOCOLS) {
        const sch = schedule(s, protocolsOf(protocol));
        const ref = reference(s, protocol);
        expect(sch.ticks.map((r) => r.running), `seed ${seed} ${protocol}`).toEqual(ref.ran);
        expect(sch.finish).toEqual(ref.finish);
        compared++;
      }
    }
    expect(compared).toBe(1500);
  });

  it('every scenario the seeds make is inside the slider ranges, and the default scenario is too', () => {
    for (const seed of seeds) {
      const s = scenarioFromSeed(seed);
      (Object.keys(s) as (keyof Scenario)[]).forEach((k) => {
        expect(s[k]).toBeGreaterThanOrEqual(RANGES[k].min);
        expect(s[k]).toBeLessThanOrEqual(RANGES[k].max);
      });
    }
    (Object.keys(DEFAULT_SCENARIO) as (keyof Scenario)[]).forEach((k) => {
      expect(DEFAULT_SCENARIO[k]).toBeGreaterThanOrEqual(RANGES[k].min);
      expect(DEFAULT_SCENARIO[k]).toBeLessThanOrEqual(RANGES[k].max);
    });
  });
});

describe('invariants at every tick', () => {
  it('R has at most one holder, the running task has the highest effective priority among runnable tasks, the holder\'s priority follows the protocol, and priority is restored at unlock', () => {
    for (const seed of seeds) {
      const s = scenarioFromSeed(seed);
      for (const protocol of PROTOCOLS) {
        const sch = schedule(s, protocolsOf(protocol));
        let held = false;
        for (const rec of sch.ticks) {
          const label = `seed ${seed} ${protocol} tick ${rec.t}`;
          for (const e of rec.events) {
            if (e.kind === 'lock') {
              expect(held, `${label}: two holders`).toBe(false);
              held = true;
            }
            if (e.kind === 'unlock') {
              expect(held, `${label}: unlock without a holder`).toBe(true);
              held = false;
            }
          }
          const runnable = TASKS.filter((k) => rec.status[k] === 'running' || rec.status[k] === 'ready');
          if (rec.running !== null) for (const k of runnable) expect(rec.eff[rec.running], `${label}: ${k} outranks ${rec.running}`).toBeGreaterThanOrEqual(rec.eff[k]);
          else expect(runnable, `${label}: idle with runnable tasks`).toHaveLength(0);
          const blocked = TASKS.filter((k) => rec.status[k] === 'blocked');
          if (protocol === 'inheritance' && rec.holder !== null) {
            expect(rec.eff[rec.holder], label).toBe(Math.max(BASE[rec.holder], ...blocked.map((k) => BASE[k])));
          }
          if (protocol === 'ceiling' && rec.holder !== null) expect(rec.eff[rec.holder], label).toBe(Math.max(BASE.H, BASE.L));
          if (protocol === 'none') TASKS.forEach((k) => expect(rec.eff[k], label).toBe(BASE[k]));
          for (const e of rec.events) if (e.kind === 'unlock' && protocol !== 'none') expect(rec.eff[e.task], `${label}: not restored`).toBe(BASE[e.task]);
          expect(held, label).toBe(rec.holder !== null);
        }
      }
    }
  });

  it('a broken inheritance that forgets to restore the priority fails the "restored at unlock" invariant, and the test says so', () => {
    let violations = 0;
    let firstSeed = -1;
    for (const seed of seeds) {
      const sch = schedule(scenarioFromSeed(seed), { protocol: 'inheritance', forgetRestore: true });
      for (const rec of sch.ticks) {
        for (const e of rec.events) {
          if (e.kind === 'unlock' && rec.eff[e.task] !== BASE[e.task]) {
            violations++;
            if (firstSeed < 0) firstSeed = seed;
          }
        }
      }
    }
    expect(violations, 'the broken variant must violate "priorities are restored at unlock"').toBeGreaterThan(0);
    expect(firstSeed).toBeGreaterThanOrEqual(0);
    // and the correct protocol never does, over the same seeds
    for (const seed of seeds) {
      for (const rec of schedule(scenarioFromSeed(seed), { protocol: 'inheritance' }).ticks) {
        for (const e of rec.events) if (e.kind === 'unlock') expect(rec.eff[e.task]).toBe(BASE[e.task]);
      }
    }
  });
});

describe('the story the learner reproduces, hand-worked on the default scenario', () => {
  const run = (protocol: Protocol, over: Partial<Scenario> = {}) => schedule({ ...DEFAULT_SCENARIO, ...over }, protocolsOf(protocol));

  it('with no protocol M runs between: L locks at tick 1, H blocks at 3, M runs 4 to 11, L unlocks at 15 and H finishes at 18', () => {
    const sch = run('none');
    expect(sch.ticks.slice(0, 4).map((r) => r.running)).toEqual(['L', 'L', 'L', 'L']);
    expect(sch.ticks[3].events.map((e) => e.kind)).toContain('block');
    expect(sch.ticks.slice(4, 12).map((r) => r.running)).toEqual(Array.from({ length: 8 }, () => 'M'));
    expect(sch.ticks[15].events.map((e) => e.kind)).toContain('unlock');
    expect(sch.finish.H).toBe(18);
    // H waited from its arrival at 3 to its finish at 18, less the 3 ticks it ran: 12, against a critical section of 6
    expect(blockingTime(sch)).toBe(18 - 3 - (H_CRITICAL + H_AFTER));
    expect(blockingTime(sch)).toBe(12);
    expect(inversionWindow(sch)).toEqual([4, 5, 6, 7, 8, 9, 10, 11]);
    expect(verdictOf(sch)).toMatchObject({ met: false, slack: 12 - 18, window: 8, noInversion: false });
  });

  it('with inheritance L runs at 3 from the moment H blocks, M cannot cut in, and H finishes at 10', () => {
    const sch = run('inheritance');
    expect(sch.ticks[3].eff.L).toBe(3);
    expect(sch.ticks[3].events.map((e) => e.kind)).toContain('inherit');
    expect(sch.ticks.slice(1, 7).map((r) => r.running)).toEqual(['L', 'L', 'L', 'L', 'L', 'L']);
    expect(sch.ticks[7].eff.L).toBe(BASE.L);
    expect(sch.finish.H).toBe(10);
    expect(blockingTime(sch)).toBe(4);
    expect(inversionWindow(sch)).toEqual([]);
    expect(verdictOf(sch)).toMatchObject({ met: true, slack: 2 });
  });

  it('with the ceiling L runs at 3 from its lock, H is held back (ready, never blocked on R) until the unlock, and finishes at 10', () => {
    const sch = run('ceiling');
    expect(sch.ticks[1].eff.L).toBe(3);
    expect(sch.ticks.some((r) => r.status.H === 'blocked')).toBe(false);
    expect(waitingTicks(sch)).toEqual([3, 4, 5, 6]);
    expect(sch.finish.H).toBe(10);
    expect(blockingTime(sch)).toBe(4);
  });

  it('lengthening M lengthens H\'s wait one for one with no protocol, and leaves it unchanged with inheritance and the ceiling, for M = 1 to 20', () => {
    const base = blockingTime(run('none', { lenM: 1 }))!;
    for (let len = 1; len <= 20; len++) {
      expect(blockingTime(run('none', { lenM: len })), `M=${len}`).toBe(base + len - 1);
      expect(blockingTime(run('inheritance', { lenM: len })), `M=${len}`).toBe(4);
      expect(blockingTime(run('ceiling', { lenM: len })), `M=${len}`).toBe(4);
    }
  });

  it('the band the lesson draws is the inversion window: H waits and the running task is neither H nor the holder', () => {
    const sch = run('none');
    const independent = sch.ticks.filter((r) => (r.status.H === 'blocked' || r.status.H === 'ready') && r.running !== 'H' && r.running !== r.holder && r.running !== null).map((r) => r.t);
    expect(inversionWindow(sch)).toEqual(independent);
    expect(runsOf(independent)).toEqual([[4, 12]]);
    expect(runsOf([])).toEqual([]);
    expect(runsOf([1, 2, 4, 7, 8])).toEqual([[1, 3], [4, 5], [7, 9]]);
  });
});

describe('bounds over 500 seeded scenarios', () => {
  it('with one lock, inheritance and the ceiling keep H\'s blocking at or under L\'s critical section', () => {
    for (const seed of seeds) {
      const s = scenarioFromSeed(seed);
      for (const protocol of ['inheritance', 'ceiling'] as Protocol[]) {
        const sch = schedule(s, protocolsOf(protocol));
        expect(blockingTime(sch)!, `seed ${seed} ${protocol}`).toBeLessThanOrEqual(s.csL);
      }
    }
  });

  it('with no protocol, a named seed has H waiting longer than the critical section because M ran, found by trace and by counterfactual', () => {
    const failing = seeds.filter((seed) => {
      const s = scenarioFromSeed(seed);
      return blockingTime(schedule(s, protocolsOf('none')))! > s.csL;
    });
    expect(failing.length).toBeGreaterThan(0);
    expect(failing[0]).toBe(BROKEN_SEED);
    const s = scenarioFromSeed(BROKEN_SEED);
    const none = schedule(s, protocolsOf('none'));
    // the trace: during the inversion window the task running was M, not the holder
    const window = inversionWindow(none);
    expect(window.length).toBeGreaterThan(0);
    expect(window.every((t) => none.ticks[t].running === 'M')).toBe(true);
    expect(blockingTime(none)!).toBeGreaterThan(s.csL);
    // counterfactual 1: the same scenario with inheritance holds the bound and has no window
    const inherit = schedule(s, protocolsOf('inheritance'));
    expect(blockingTime(inherit)!).toBeLessThanOrEqual(s.csL);
    expect(inversionWindow(inherit)).toEqual([]);
    // counterfactual 2: with M arriving after everything is over, no protocol is needed
    const noM = schedule({ ...s, arrivalM: 99 }, protocolsOf('none'));
    expect(blockingTime(noM)!).toBeLessThanOrEqual(s.csL);
    expect(inversionWindow(noM)).toEqual([]);
  });

  it('H arriving before L ever locks is a valid scenario with no inversion, and a zero-length critical section blocks nobody', () => {
    for (const protocol of PROTOCOLS) {
      const early = schedule({ ...DEFAULT_SCENARIO, arrivalH: 0 }, protocolsOf(protocol));
      expect(verdictOf(early).noInversion, protocol).toBe(true);
      expect(blockingTime(early)).toBe(0);
      expect(inversionWindow(early)).toEqual([]);
      const zero = schedule({ ...DEFAULT_SCENARIO, csL: 0 }, protocolsOf(protocol));
      expect(blockingTime(zero), protocol).toBe(0);
      expect(inversionWindow(zero)).toEqual([]);
    }
    const atOne = schedule({ ...DEFAULT_SCENARIO, arrivalH: L_BEFORE }, protocolsOf('none'));
    expect(verdictOf(atOne).noInversion).toBe(true);
  });
});

describe('the watchdog', () => {
  const stalled = (sch: Schedule, threshold: number): number | null => {
    // the first tick at the end of which H has been unable to run for more than `threshold` ticks in a row, read from a run without a watchdog
    let run = 0;
    for (const r of sch.ticks) {
      run = r.status.H === 'ready' || r.status.H === 'blocked' ? run + 1 : 0;
      if (run > threshold) return r.t + 1;
    }
    return null;
  };

  it('fires exactly when H has waited longer than the threshold, for every threshold and every protocol', () => {
    for (const protocol of PROTOCOLS) {
      const free = schedule(DEFAULT_SCENARIO, protocolsOf(protocol));
      for (let threshold = RANGES.watchdog.min; threshold <= RANGES.watchdog.max; threshold++) {
        const dog = schedule(DEFAULT_SCENARIO, { protocol, watchdog: threshold });
        const expected = stalled(free, threshold);
        expect(dog.resetAt, `${protocol} threshold ${threshold}`).toBe(expected);
        if (expected !== null) {
          expect(dog.ticks.at(-1)!.events.map((e) => e.kind)).toContain('reset');
          expect(dog.finish.H).toBeNull();
        } else expect(dog.finish.H).not.toBeNull();
      }
    }
  });

  it('with the Pathfinder-like settings (threshold 8) the reset happens with no protocol and disappears with inheritance', () => {
    const none = schedule(DEFAULT_SCENARIO, { protocol: 'none', watchdog: 8 });
    expect(none.resetAt).toBe(12);
    expect(none.finish.H).toBeNull();
    const inherit = schedule(DEFAULT_SCENARIO, { protocol: 'inheritance', watchdog: 8 });
    expect(inherit.resetAt).toBeNull();
    expect(inherit.finish.H).toBe(10);
  });
});
