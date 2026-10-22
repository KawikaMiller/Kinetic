import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import {
  ATOMIC, BUDGET, EFFECTS, MAX_PROCESSES, MAX_STEPS, MAX_TEXT, NAIVE, PETERSON, PRESETS, atomicLockClosedForm, atomicLockStates, check, checkState, compile, initialState, randomTest,
  runNaiveCode, scheduleOf, stepText, transitions, type Check, type Effect, type Spec, type State,
} from './spec';

const withGuard = (spec: Spec, step: number, guard: string): Spec => ({ ...spec, steps: spec.steps.map((s, i) => (i === step ? { ...s, guard } : s)) });
const pathLabels = (c: Check) => (c.kind === 'violation' || c.kind === 'deadlock' ? c.path.map((p) => `${p.label.actor}: ${p.label.text}`) : []);

describe('Peterson, against an independent closure of its 128 combinations', () => {
  /** A hand-coded Peterson machine over (pc0, pc1, flag0, flag1, turn): no interpreter, no explorer. */
  function petersonReachable(): Set<string> {
    const seen = new Set<string>();
    const start = [0, 0, 0, 0, 0];
    const stack = [start];
    while (stack.length) {
      const [pc0, pc1, f0, f1, turn] = stack.pop()!;
      const key = `${pc0}${pc1}${f0}${f1}${turn}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const pcs = [pc0, pc1];
      const flags = [f0, f1];
      for (let p = 0; p < 2; p++) {
        const q = 1 - p;
        const np = [...pcs];
        const nf = [...flags];
        let nt = turn;
        if (pcs[p] === 0) { nf[p] = 1; np[p] = 1; }
        else if (pcs[p] === 1) { nt = q; np[p] = 2; }
        else if (pcs[p] === 2) { if (!(flags[q] === 0 || turn === p)) continue; np[p] = 3; }
        else { nf[p] = 0; np[p] = 0; }
        stack.push([np[0], np[1], nf[0], nf[1], nt]);
      }
    }
    return seen;
  }

  it('20 reachable states out of the 4 x 4 x 2 x 2 x 2 = 128 combinations, mutual exclusion holds in all of them, and no deadlock', () => {
    const closure = petersonReachable();
    expect(closure.size).toBe(20);
    expect([...closure].some((k) => k[0] === '3' && k[1] === '3')).toBe(false);
    const r = check(PETERSON);
    expect(r).toEqual({ kind: 'holds', states: 20 });
  });
});

describe('hand vectors', () => {
  it('naive flag lock: the shortest violation is 4 steps (P0 check, P1 check, P0 take, P1 take); a lower bound is 2 + 2', () => {
    const r = check(NAIVE);
    expect(r.kind).toBe('violation');
    expect(pathLabels(r)).toEqual(['P0: step 0: pass when lock == 0', 'P1: step 0: pass when lock == 0', 'P0: step 1: lock = 1', 'P1: step 1: lock = 1']);
    // Each process needs 2 steps to reach pc 2, so both in the critical section needs 2 + 2 = 4: nothing shorter exists.
  });

  it('Peterson with the wait guard replaced by true: violation in 6 steps (3 + 3)', () => {
    const r = check(withGuard(PETERSON, 2, 'true'));
    expect(r.kind).toBe('violation');
    expect(r.kind === 'violation' && r.steps).toBe(6);
  });

  it('Peterson with its first two steps swapped: a different 6-step trace, with the guard unchanged', () => {
    const swapped: Spec = { ...PETERSON, steps: [PETERSON.steps[1], PETERSON.steps[0], PETERSON.steps[2], PETERSON.steps[3]] };
    const r = check(swapped);
    expect(r.kind).toBe('violation');
    expect(r.kind === 'violation' && r.steps).toBe(6);
    // P0 gives the turn, P1 gives the turn, P1 sets its flag and passes the wait (flagOther == 0), P0 sets its flag and passes (turn == me).
    expect(pathLabels(r)).toEqual([
      'P0: step 0: turn = 1', 'P1: step 0: turn = 0', 'P1: step 1: flag1 = 1', 'P1: step 2: pass when flagOther == 0 || turn == me', 'P0: step 1: flag0 = 1', 'P0: step 2: pass when flagOther == 0 || turn == me',
    ]);
  });

  it('Peterson with the guard flagOther == 0: no mutual-exclusion violation, a deadlock after 4 steps (both flags up, both waiting)', () => {
    const r = check(withGuard(PETERSON, 2, 'flagOther == 0'));
    expect(r.kind).toBe('deadlock');
    expect(r.kind === 'deadlock' && r.steps).toBe(4);
    const withoutDeadlock = check({ ...withGuard(PETERSON, 2, 'flagOther == 0'), deadlock: false });
    expect(withoutDeadlock.kind).toBe('holds');
  });

  it('the atomic lock: 8, 20, 48, 112, 256 states for N = 2 to 6, equal to 2^N + N 2^(N-1) (4+4, 8+12, 16+32, 32+80, 64+192); N = 1 is 3', () => {
    expect([2, 3, 4, 5, 6].map((n) => atomicLockStates(n).states)).toEqual([8, 20, 48, 112, 256]);
    expect([2, 3, 4, 5, 6].map(atomicLockClosedForm)).toEqual([8, 20, 48, 112, 256]);
    expect(atomicLockStates(1).states).toBe(3);
    for (let n = 1; n <= MAX_PROCESSES; n++) {
      expect(atomicLockStates(n).states).toBe(atomicLockClosedForm(n));
      expect(atomicLockStates(n).truncated).toBe(false);
    }
  });

  it('the atomic lock count by combinatorics (the argument behind the closed form, not a reachability search): all idle or waiting with lock 0 is 2^N, one critical with lock 1 and the rest idle or waiting is N 2^(N-1)', () => {
    for (let n = 1; n <= MAX_PROCESSES; n++) {
      let lockFree = 0;
      let held = 0;
      for (let mask = 0; mask < 3 ** n; mask++) {
        const pcs = Array.from({ length: n }, (_, i) => Math.floor(mask / 3 ** i) % 3);
        const critical = pcs.filter((x) => x === 2).length;
        if (critical === 0) lockFree += 1;
        if (critical === 1) held += 1;
      }
      // pcs in {0,1}^n with lock 0: 2^n states; exactly one pc 2: n x 2^(n-1) states.
      expect(lockFree).toBe(2 ** n);
      expect(held).toBe(n * 2 ** (n - 1));
    }
  });
});

describe('counterexamples are replayed through the interpreter, and are the shortest', () => {
  /** Shortest violating or deadlocked schedule by iterative deepening over every schedule: no state set, no explorer. */
  function deepest(spec: Spec, limit: number): number | null {
    const c = compile(spec);
    if (!c.ok) throw new Error(c.error);
    const dfs = (s: State, left: number): boolean => {
      if (checkState(c.value, s) !== null) return true;
      return left > 0 && transitions(c.value, s).some((t) => dfs(t.next, left - 1));
    };
    for (let d = 0; d <= limit; d++) if (dfs(initialState(spec.n), d)) return d;
    return null;
  }

  it('every counterexample replays step by step to the violating state', () => {
    for (const spec of [NAIVE, withGuard(PETERSON, 2, 'true'), withGuard(PETERSON, 2, 'flagOther == 0')]) {
      const r = check(spec);
      if (r.kind !== 'violation' && r.kind !== 'deadlock') throw new Error('expected a counterexample');
      const compiled = compile(spec);
      if (!compiled.ok) throw new Error(compiled.error);
      let s = initialState(spec.n);
      for (const step of r.path) {
        const next = transitions(compiled.value, s).find((t) => t.label.process === step.label.process);
        expect(next).toBeDefined();
        s = next!.next;
        expect(s).toEqual(step.state);
      }
      expect(checkState(compiled.value, s)).not.toBeNull();
    }
  });

  it('on the presets and on 200 seeded mutations (a guard, an effect, a swapped pair), the explorer\'s shortest length equals iterative deepening to depth 8', () => {
    const rnd = mulberry32(8);
    const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)];
    const guards = ['true', 'false', 'lock == 0', 'turn == me', 'flagOther == 0', 'flagOther == 0 || turn == me', 'flagOther == 0 && turn == me', 'lock == 1'];
    const mutate = (spec: Spec): Spec => {
      const kind = Math.floor(rnd() * 3);
      const k = Math.floor(rnd() * spec.steps.length);
      if (kind === 0) return withGuard(spec, k, pick(guards));
      if (kind === 1) return { ...spec, steps: spec.steps.map((s, i) => (i === k ? { ...s, effect: pick(EFFECTS) } : s)) };
      const j = (k + 1) % spec.steps.length;
      const steps = spec.steps.map((s, i) => (i === k ? spec.steps[j] : i === j ? spec.steps[k] : s));
      return { ...spec, steps };
    };
    const specs = [...PRESETS.map((p) => p.spec), ...Array.from({ length: 200 }, () => mutate(pick(PRESETS).spec))];
    let counterexamples = 0;
    for (const spec of specs) {
      const r = check(spec);
      expect(r.kind).not.toBe('refused');
      const shortest = r.kind === 'violation' || r.kind === 'deadlock' ? r.steps : null;
      const found = deepest(spec, 8);
      if (shortest !== null && shortest <= 8) { expect(found).toBe(shortest); counterexamples += 1; } else expect(found).toBeNull();
    }
    expect(counterexamples).toBeGreaterThan(0);
  });

  it('over 200 seeded single-guard mutations of Peterson, the share that fails is strictly between 0 and 90%', () => {
    const rnd = mulberry32(81);
    const pool = ['true', 'false', 'lock == 0', 'turn == me', 'turn == other', 'flagOther == 0', 'flagOther == 0 || turn == me', 'flagOther == 0 && turn == me', 'flagOther == 1 || turn == me'];
    let failing = 0;
    for (let i = 0; i < 200; i++) {
      const spec = withGuard(PETERSON, Math.floor(rnd() * PETERSON.steps.length), pool[Math.floor(rnd() * pool.length)]);
      const r = check(spec);
      if (r.kind === 'violation' || r.kind === 'deadlock') failing += 1;
    }
    expect(failing / 200).toBeGreaterThan(0);
    expect(failing / 200).toBeLessThan(0.9);
    expect(check(PETERSON).kind).toBe('holds');
  });
});

describe('failure kinds', () => {
  it('guard true gives a mutual-exclusion violation (not a deadlock) at 6 steps; flagOther == 0 gives a deadlock (not a violation) at 4; intact Peterson passes', () => {
    expect(check(withGuard(PETERSON, 2, 'true')).kind).toBe('violation');
    expect(check(withGuard(PETERSON, 2, 'flagOther == 0')).kind).toBe('deadlock');
    expect(check(PETERSON).kind).toBe('holds');
  });

  it('the exhaustive search says "truncated" when its budget is cut, and never "holds"', () => {
    const r = check(PETERSON, 5);
    expect(r.kind).toBe('truncated');
    expect(BUDGET).toBe(250_000);
  });
});

describe('typed text: nothing evaluates, everything is refused with a reason', () => {
  const refused = (spec: Spec) => {
    const c = check(spec);
    return c.kind === 'refused' ? c.message : null;
  };
  it('a call, an assignment and a template are refused with "not supported here" and never run', () => {
    for (const bad of ['lock.toString()', 'lock = 1', '`${lock}`', 'new Date()', 'x => x', 'lock++']) {
      expect(refused(withGuard(PETERSON, 2, bad)), bad).toContain('not supported here');
    }
    expect(refused({ ...PETERSON, invariant: 'process.exit()' })).toContain('not supported here');
  });

  it('manipulation 1: deleting the turn clause from Peterson\'s guard reports a deadlock after 4 steps, not a violated mutual exclusion', () => {
    const r = check(withGuard(PETERSON, 2, 'flagOther == 0'));
    expect(r.kind).toBe('deadlock');
    expect(r.kind === 'deadlock' && r.steps).toBe(4);
    expect(check({ ...withGuard(PETERSON, 2, 'flagOther == 0'), deadlock: false }).kind).not.toBe('violation');
  });

  it('manipulation 2: setting the guard to true gives a 6-step shortest path that replays to two critical processes', () => {
    const spec = withGuard(PETERSON, 2, 'true');
    const r = check(spec);
    expect(r.kind === 'violation' && r.steps).toBe(6);
    expect(r.kind === 'violation' && r.path[5].state.pcs).toEqual([3, 3]);
  });

  it('manipulation 3: an invariant typed with an unknown name is refused with core/expr\'s message', () => {
    expect(refused({ ...PETERSON, invariant: 'crit0 + crit7 <= 1' })).toBe('Invariant: ReferenceError: crit7 is not defined');
    expect(refused(withGuard(PETERSON, 2, 'flagTheirs == 0'))).toBe('Guard of step 2: ReferenceError: flagTheirs is not defined');
    expect(refused({ ...PETERSON, invariant: 'Object == 1' })).toBe('Invariant: not supported here: "Object"');
  });

  it('a guard that throws at run time is a refusal with the message, never a crash', () => {
    const msg = refused(withGuard(PETERSON, 2, 'lock.a.b == 1'));
    expect(msg).toContain('TypeError');
  });

  it('for more than two processes, other and flagOther are refused with the stated reason', () => {
    const three: Spec = { ...ATOMIC, n: 3, invariant: 'crit <= 1' };
    expect(refused(withGuard(three, 0, 'flagOther == 0'))).toBe('Guard of step 0: flagOther: this name exists only for two processes.');
    expect(refused(withGuard(three, 0, 'other == 0'))).toBe('Guard of step 0: other: this name exists only for two processes.');
    expect(refused({ ...three, steps: three.steps.map((s, i) => (i === 0 ? { ...s, effect: 'turn = other' as Effect } : s)) })).toBe('Effect of step 0: turn = other: this name exists only for two processes.');
  });
});

describe('control extremes: N, steps, text length, each at its minimum, maximum and one beyond', () => {
  it('processes: 1 and 6 run, 0 and 7 are refused with the stated limit', () => {
    expect(check({ ...ATOMIC, n: 1, invariant: 'crit <= 1' }).kind).toBe('holds');
    expect(check({ ...ATOMIC, n: 6, invariant: 'crit <= 1' }).kind).toBe('holds');
    expect(check({ ...ATOMIC, n: 0 }).kind).toBe('refused');
    const seven = check({ ...ATOMIC, n: 7 });
    expect(seven.kind === 'refused' && seven.message).toBe('At most 6 processes: the state space grows by about 2x per process.');
    expect(() => atomicLockStates(7)).toThrow('At most 6 processes');
  });

  it('steps: 1 and 6 run, 0 and 7 are refused', () => {
    const six: Spec = { ...ATOMIC, steps: Array.from({ length: MAX_STEPS }, () => ({ guard: 'true', effect: 'none' as Effect })), critical: 5 };
    expect(check(six).kind).not.toBe('refused');
    expect(check({ ...six, steps: six.steps.slice(0, 1), critical: 0 }).kind).not.toBe('refused');
    expect(check({ ...six, steps: [], critical: 0 }).kind).toBe('refused');
    const seven = check({ ...six, steps: [...six.steps, six.steps[0]] });
    expect(seven.kind === 'refused' && seven.message).toBe('At most 6 steps: that is 7.');
  });

  it('text: 200 characters run, 201 are refused with the limit', () => {
    const pad = (n: number) => `lock == 0${' '.repeat(n - 'lock == 0'.length)}`;
    expect(pad(MAX_TEXT)).toHaveLength(200);
    expect(check(withGuard(NAIVE, 0, pad(MAX_TEXT))).kind).not.toBe('refused');
    const over = check(withGuard(NAIVE, 0, pad(MAX_TEXT + 1)));
    expect(over.kind === 'refused' && over.message).toBe('Guard of step 0: at most 200 characters: this one has 201.');
  });
});

describe('random testing for contrast: 200 seeded schedules of the same interpreter', () => {
  it('Peterson holds on all 200 seeds; the naive lock fails on some of them with a lowest failing seed that is not 0; a failing seed is a real violation', () => {
    const peterson = randomTest(PETERSON);
    expect(peterson).toEqual({ failing: 0, total: 200, lowestFailingSeed: null });
    const naive = randomTest(NAIVE);
    if ('error' in naive) throw new Error(naive.error);
    expect(naive.failing).toBeGreaterThan(0);
    expect(naive.lowestFailingSeed).toBeGreaterThan(0);
    expect(check(NAIVE).kind).toBe('violation');
  });
});

describe('the counterexample as a test case', () => {
  it('replaying the naive lock\'s shortest schedule against lesson-authored code ends with both in the critical section and the lock taken', () => {
    const r = check(NAIVE);
    if (r.kind !== 'violation') throw new Error('expected a violation');
    const schedule = scheduleOf(r.path);
    expect(schedule).toEqual([0, 1, 0, 1]);
    const code = runNaiveCode(schedule);
    expect(code.inside).toEqual([true, true]);
    expect(code.lock).toBe(1);
    expect(r.path[r.path.length - 1].state.pcs).toEqual([2, 2]);
  });

  it('one process at a time never puts both inside: P1 sees the lock taken', () => {
    const code = runNaiveCode([0, 0, 1, 1]);
    expect(code.inside).toEqual([true, false]);
  });

  it('stepText fills in me and other', () => {
    expect(stepText(PETERSON, 1, 0)).toBe('step 1: turn = 1');
    expect(stepText(PETERSON, 0, 1)).toBe('step 0: flag1 = 1');
    expect(stepText(PETERSON, 2, 0)).toBe('step 2: pass when flagOther == 0 || turn == me');
  });
});

describe('random testing is a fair contrast (kickoff rule 29) and checks the initial state', () => {
  const peterWith = (guard: string): Spec => setStepGuard(guard);
  function setStepGuard(guard: string): Spec { return { ...PETERSON, steps: PETERSON.steps.map((s, k) => (k === 2 ? { ...s, guard } : s)) }; }

  it('every broken mode the lesson shows fails on at most 90% of the 200 seeds, with a lowest failing seed above 0, while the exhaustive check fails it', () => {
    for (const spec of [NAIVE, peterWith('true'), peterWith('flagOther == 0')]) {
      const r = randomTest(spec);
      if ('error' in r) throw new Error(r.error);
      expect(r.failing).toBeGreaterThan(0);
      expect(r.failing / r.total).toBeLessThanOrEqual(0.9);
      expect(r.lowestFailingSeed).toBeGreaterThan(0);
      expect(check(spec).kind === 'violation' || check(spec).kind === 'deadlock').toBe(true);
    }
  });

  it('a failing initial state fails every seed (and the exhaustive leg says so in 0 steps)', () => {
    const noStart = { ...NAIVE, steps: NAIVE.steps.map((s, k) => (k === 0 ? { ...s, guard: 'false' } : s)) };
    expect(randomTest(noStart)).toEqual({ failing: 200, total: 200, lowestFailingSeed: 1 });
    const c = check(noStart);
    expect(c.kind === 'deadlock' && c.steps).toBe(0);
    expect(randomTest({ ...PETERSON, invariant: 'pc0 > 0' })).toEqual({ failing: 200, total: 200, lowestFailingSeed: 1 });
  });
});
