import { describe, expect, it } from 'vitest';
import { atMostOneLeader, electionScenario, type ElectionState } from './electionExample';
import { causal, checkInvariants, convergent, forSeeds, linearizable, MAX_HISTORY_OPS, sequential, type RegisterOp, type Safety } from './invariants';

const election = electionScenario;

describe('forSeeds on a deliberately broken two-leader protocol', () => {
  const broken = election('broken', true);

  it('catches it, reporting the lowest failing seed, and that seed fails on its own', () => {
    const verdict = forSeeds(200, broken, [atMostOneLeader]);
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.message).toMatch(/two leaders at once/);
    expect(verdict.rule).toBe(0);
    for (let seed = 0; seed < verdict.seed; seed++) expect(checkInvariants(broken(seed), [atMostOneLeader]).ok, `seed ${seed}`).toBe(true);
    const alone = checkInvariants(broken(verdict.seed), [atMostOneLeader]);
    expect(alone.ok).toBe(false);
  });

  it('is not always broken: the failure depends on the seed, which is the point of running many', () => {
    const failing = Array.from({ length: 200 }, (_, seed) => seed).filter((seed) => !checkInvariants(broken(seed), [atMostOneLeader]).ok);
    expect(failing.length).toBeGreaterThan(0);
    expect(failing.length).toBeLessThan(200);
  });

  it('shortens the trace by cutting it at the violating event, and is reproducible', () => {
    const a = forSeeds(200, broken, [atMostOneLeader]);
    const b = forSeeds(200, broken, [atMostOneLeader]);
    expect(a).toEqual(b);
    if (a.ok) throw new Error('expected a violation');
    const full = broken(a.seed);
    full.run();
    expect(a.trace.length).toBeLessThan(full.trace.length);
    expect(a.trace).toEqual(full.trace.slice(0, a.trace.length));
    expect(a.trace.at(-1)!.t).toBe(a.time);
  });

  it('honours a seed range', () => {
    const first = forSeeds(200, broken, [atMostOneLeader]);
    if (first.ok) throw new Error('expected a violation');
    expect(forSeeds({ from: first.seed + 1, to: first.seed + 1 }, broken, [atMostOneLeader])).toEqual({ ok: true, seeds: 0 });
    const later = forSeeds({ from: first.seed + 1, to: 400 }, broken, [atMostOneLeader]);
    expect(later.ok ? Infinity : later.seed).toBeGreaterThan(first.seed);
  });
});

describe('the fixed protocol', () => {
  it('holds "at most one leader" on 500 seeds with delay, loss, duplication, partition, crash, pause and clock skew', () => {
    const verdict = forSeeds(500, election('fixed', true), [atMostOneLeader]);
    expect(verdict).toEqual({ ok: true, seeds: 500 });
  });

  it('is safe by design, not by luck: the same seeds that break the broken one pass', () => {
    const seeds = Array.from({ length: 200 }, (_, seed) => seed);
    const brokenFails = seeds.filter((s) => !checkInvariants(election('broken', true)(s), [atMostOneLeader]).ok);
    for (const s of brokenFails) expect(checkInvariants(election('fixed', true)(s), [atMostOneLeader]).ok).toBe(true);
  });

  it('liveness is a separate claim: with no faults exactly one leader emerges', () => {
    for (let seed = 0; seed < 50; seed++) {
      const c = election('fixed', false)(seed);
      c.run();
      const leaders = Object.values(c.snapshot().nodes).filter((n) => n.state?.leader);
      expect(leaders, `seed ${seed}`).toHaveLength(1);
    }
  });

  it('with faults a leader may never emerge: safety held, liveness was never promised', () => {
    const stuck = Array.from({ length: 200 }, (_, seed) => seed).some((seed) => {
      const c = election('fixed', true)(seed);
      c.run();
      return Object.values(c.snapshot().nodes).every((n) => !n.state?.leader);
    });
    expect(stuck).toBe(true);
  });
});

describe('checkInvariants', () => {
  it('checks the initial state and every event, naming the failing rule and step', () => {
    const c = election('broken', false)(1);
    const never: Safety<ElectionState> = () => null;
    const tooMany: Safety<ElectionState> = (s) => (s.step >= 3 ? `step ${s.step}` : null);
    const r = checkInvariants(c, [never, tooMany]);
    expect(r).toMatchObject({ ok: false, rule: 1, step: 3, message: 'step 3' });
  });

  it('a violation in the initial state is step 0', () => {
    const r = checkInvariants(election('broken', false)(1), [() => 'always wrong']);
    expect(r).toMatchObject({ ok: false, step: 0, time: 0 });
  });

  it('passes with the step count when nothing breaks, and respects until and maxEvents', () => {
    const ok = checkInvariants(election('fixed', false)(1), [atMostOneLeader]);
    expect(ok.ok).toBe(true);
    const bounded = checkInvariants(election('fixed', false)(1), [], { until: 15 });
    expect(bounded).toMatchObject({ ok: true });
    expect(bounded.ok && bounded.steps).toBeLessThan(ok.ok ? ok.steps : 0);
    expect(checkInvariants(election('fixed', false)(1), [], { maxEvents: 2 })).toEqual({ ok: true, steps: 2 });
  });
});

/* ---------- register histories ---------- */

const op =(process: string, kind: 'write' | 'read', value: unknown, invoke: number, response: number, key?: string): RegisterOp => ({
  process, kind, value, invoke, response, key,
});

/** Satisfies every model. */
const fresh = [op('A', 'write', 1, 0, 10), op('B', 'read', 1, 20, 30), op('B', 'write', 2, 40, 50), op('A', 'read', 2, 60, 70)];

/** A read that returns the initial value after a write completed: sequential, not linearizable. */
const stale = [op('A', 'write', 1, 0, 2), op('B', 'read', null, 5, 6)];

/** Two clients see two concurrent writes in opposite orders: causal, not sequential. */
const split = [
  op('P1', 'write', 1, 0, 1),
  op('P2', 'write', 2, 0, 1),
  op('P3', 'read', 1, 2, 3),
  op('P3', 'read', 2, 4, 5),
  op('P4', 'read', 2, 2, 3),
  op('P4', 'read', 1, 4, 5),
];

/** P3 sees y=2 (which depends on x=1) but then reads the old x: not even causal. */
const effectWithoutCause = [
  op('P1', 'write', 1, 0, 1, 'x'),
  op('P2', 'read', 1, 2, 3, 'x'),
  op('P2', 'write', 2, 4, 5, 'y'),
  op('P3', 'read', 2, 6, 7, 'y'),
  op('P3', 'read', null, 8, 9, 'x'),
];

/** A client writes, then reads the old value back: violates even its own program order. */
const forgetsOwnWrite = [op('A', 'write', 1, 0, 1), op('A', 'read', null, 2, 3)];

describe('register history checkers', () => {
  it('a well-behaved history satisfies every model', () => {
    expect(linearizable(fresh)).toBeNull();
    expect(sequential(fresh)).toBeNull();
    expect(causal(fresh)).toBeNull();
    expect(convergent(fresh)).toBeNull();
  });

  it('linearizable: concurrent operations may take effect in either order', () => {
    const both = [op('A', 'write', 1, 0, 10), op('B', 'read', null, 2, 4), op('C', 'read', 1, 3, 5)];
    expect(linearizable(both)).toBeNull();
    const impossible = [op('A', 'write', 1, 0, 10), op('B', 'read', 1, 2, 4), op('C', 'read', null, 5, 6)];
    expect(linearizable(impossible)).not.toBeNull();
  });

  it('stale read: sequential and causal, but not linearizable', () => {
    expect(linearizable(stale)).toMatch(/real time/);
    expect(sequential(stale)).toBeNull();
    expect(causal(stale)).toBeNull();
  });

  it('opposite orders: causal, but neither sequential nor linearizable', () => {
    expect(causal(split)).toBeNull();
    expect(sequential(split)).toMatch(/own order/);
    expect(linearizable(split)).not.toBeNull();
  });

  it('effect without cause: violates causal (and so every stronger model)', () => {
    expect(causal(effectWithoutCause)).toMatch(/P3/);
    expect(sequential(effectWithoutCause)).not.toBeNull();
    expect(linearizable(effectWithoutCause)).not.toBeNull();
  });

  it('forgetting your own write violates sequential, and causal, and linearizable', () => {
    expect(sequential(forgetsOwnWrite)).not.toBeNull();
    expect(causal(forgetsOwnWrite)).not.toBeNull();
    expect(linearizable(forgetsOwnWrite)).not.toBeNull();
  });

  it('each model is strictly stronger than the next on these histories', () => {
    const verdicts = (h: RegisterOp[]) => [linearizable(h), sequential(h), causal(h)].map((v) => v === null);
    expect(verdicts(fresh)).toEqual([true, true, true]);
    expect(verdicts(stale)).toEqual([false, true, true]);
    expect(verdicts(split)).toEqual([false, false, true]);
    expect(verdicts(effectWithoutCause)).toEqual([false, false, false]);
  });

  it('a read of a value nobody wrote is flagged by causal, and the initial value can be changed', () => {
    expect(causal([op('A', 'read', 9, 0, 1)])).toMatch(/no one wrote/);
    expect(linearizable([op('A', 'read', 0, 0, 1)], { initial: 0 })).toBeNull();
    expect(linearizable([op('A', 'read', null, 0, 1)], { initial: 0 })).not.toBeNull();
  });

  it('registers are independent per key', () => {
    const h = [op('A', 'write', 1, 0, 1, 'x'), op('B', 'read', null, 5, 6, 'y'), op('B', 'read', 1, 7, 8, 'x')];
    expect(linearizable(h)).toBeNull();
  });

  it('convergent: after the last write, late reads must agree', () => {
    const settled = [op('A', 'write', 1, 0, 1), op('B', 'read', null, 2, 3), op('B', 'read', 1, 10, 11), op('C', 'read', 1, 10, 11)];
    expect(convergent(settled)).toMatch(/disagree/);
    expect(convergent(settled, { settleMs: 8 })).toBeNull();
    const diverged = [op('A', 'write', 1, 0, 1), op('B', 'read', 1, 50, 51), op('C', 'read', null, 50, 51)];
    expect(convergent(diverged, { settleMs: 10 })).toMatch(/1 vs null/);
  });

  it('rejects nonsense and over-long histories instead of hanging', () => {
    expect(() => linearizable([op('A', 'write', 1, 5, 1)])).toThrow(RangeError);
    const long = Array.from({ length: MAX_HISTORY_OPS + 1 }, (_, i) => op('A', 'write', i, i, i));
    expect(() => sequential(long)).toThrow(RangeError);
  });
});
