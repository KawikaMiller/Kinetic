import { describe, expect, it } from 'vitest';
import {
  ADVERSARY_ROUNDS, SUSPEND_STEPS, adversaryRun, casInit, casRun, casStep, executionStats, firstAttempt, suspendedRun,
} from './counter';
import {
  MAX_OPS, MAX_THREADS, MODES, PRESETS, addOp, hazardWhy, initialState, invariant, programError, removeLastOp, replay, search, stepThread, actions,
  type Config, type Mode, type Op, type StackState,
} from './stack';

const preset = (id: string) => PRESETS.find((p) => p.id === id)!.programs;

// ── Scene 1: counts against a plain recursion, written without the explorer ──────────────────

/** Executions of n CAS-incrementing threads by recursion over (x, per-thread phase and remembered value): count by failed CASes. */
function bruteExecutions(n: number): Map<number, number> {
  const byRetries = new Map<number, number>();
  const go = (x: number, phase: ('load' | 'cas' | 'done')[], old: number[], failed: number): void => {
    if (phase.every((p) => p === 'done')) { byRetries.set(failed, (byRetries.get(failed) ?? 0) + 1); return; }
    phase.forEach((p, t) => {
      const setPhase = (q: 'load' | 'cas' | 'done') => phase.map((v, i) => (i === t ? q : v));
      if (p === 'load') go(x, setPhase('cas'), old.map((o, i) => (i === t ? x : o)), failed);
      else if (p === 'cas') {
        if (x === old[t]) go(x + 1, setPhase('done'), old, failed);
        else go(x, setPhase('load'), old, failed + 1);
      }
    });
  };
  go(0, new Array(n).fill('load'), new Array(n).fill(0), 0);
  return byRetries;
}

describe('the CAS counter', () => {
  it('execution counts equal a brute-force recursion: 6 and 498, with 0/1/2/3 retries = 6/60/216/216 for three threads', () => {
    for (const n of [2, 3]) {
      const brute = bruteExecutions(n);
      const stats = executionStats(n);
      expect(stats.byRetries).toEqual([...brute.keys()].sort().map((k) => brute.get(k)));
      expect(stats.executions).toBe([...brute.values()].reduce((a, b) => a + b, 0));
      expect(stats.truncated).toBe(false);
      expect(stats.finalValues).toEqual([n]);
    }
    expect(executionStats(2).executions).toBe(6);
    expect(executionStats(3).executions).toBe(498);
    expect(executionStats(3).byRetries).toEqual([6, 60, 216, 216]);
    expect(executionStats(2).byRetries).toEqual([2, 4]);
  });

  it('2 threads by hand: L1 C1 L2 C2 and L2 C2 L1 C1 retry nothing (2); the four others fail exactly one CAS (4)', () => {
    const word = (w: number[]) => casRun(2, w.flatMap((t) => [t])).state;
    // Each word lists threads; every CAS-phase step after the load follows its thread's second appearance.
    expect(word([0, 0, 1, 1]).failed).toBe(0);
    expect(word([1, 1, 0, 0]).failed).toBe(0);
    for (const w of [[0, 1, 0, 1], [0, 1, 1, 0], [1, 0, 1, 0], [1, 0, 0, 1]]) expect(word(w).failed).toBe(1);
    expect(firstAttempt(2).retrying).toBe(4);
    expect(firstAttempt(2).interleavings).toBe(6);
  });

  /** Unique permutations of the multiset {0,0,1,1,...}: the independent source of "every interleaving". */
  function words(n: number): number[][] {
    const out: number[][] = [];
    const left = new Array<number>(n).fill(2);
    const build = (w: number[]): void => {
      if (w.length === 2 * n) { out.push(w); return; }
      left.forEach((c, t) => { if (c > 0) { left[t] -= 1; build([...w, t]); left[t] += 1; } });
    };
    build([]);
    return out;
  }

  it('the interleavings with no retry equal the ones where an unlocked read-add-write keeps every update (2 and 3 threads), written separately', () => {
    for (const n of [2, 3]) {
      const clean = new Set<string>();
      const keeps = new Set<string>();
      for (const w of words(n)) {
        const seen = new Array<number>(n).fill(0);
        const oldC = new Array<number>(n).fill(-1);
        const oldU = new Array<number>(n).fill(-1);
        let xc = 0; let xu = 0; let fails = 0;
        for (const t of w) {
          if (seen[t]++ === 0) { oldC[t] = xc; oldU[t] = xu; continue; }
          if (xc === oldC[t]) xc += 1; else fails += 1;
          xu = oldU[t] + 1;
        }
        if (fails === 0) clean.add(w.join(''));
        if (xu === n) keeps.add(w.join(''));
      }
      expect([...clean].sort()).toEqual([...keeps].sort());
      const f = firstAttempt(n);
      expect(f.sameSet).toBe(true);
      expect(f.interleavings).toBe(words(n).length);
      expect(f.unlockedKeepsAll).toBe(keeps.size);
    }
    // 3 threads: 6!/(2!2!2!) = 90 interleavings; final 3 in 6, 2 in 36, 1 in 48 (counted by the loop above).
    expect(firstAttempt(3).unlockedByFinal).toEqual([0, 48, 36, 6]);
    expect(firstAttempt(3).interleavings).toBe(90);
  });

  it('control extremes: 2 and 3 threads work; one beyond each is refused with the stated limit', () => {
    expect(() => casInit(2)).not.toThrow();
    expect(() => casInit(3)).not.toThrow();
    expect(() => casInit(1)).toThrow('Use 2 or 3 threads: that is 1.');
    expect(() => casInit(4)).toThrow('Use 2 or 3 threads: that is 4.');
    expect(casRun(2, [5]).refusedAt).toBe(0);
    expect(casRun(2, [0, 0, 0]).refusedAt).toBe(2);
    expect(casStep(casRun(2, [0, 0]).state, 0)).toBeNull();
  });

  it('a failed CAS says what x is now and what the thread expected', () => {
    const r = casRun(2, [0, 1, 0, 1]);
    expect(r.steps[3].text).toBe('cas(x, 0, 1) fails: x is now 1, you expected 0; retry');
    expect(r.steps[3].failed).toBe(true);
  });
});

// ── Scene 2: the stack ──────────────────────────────────────────────────

/** Shortest violating schedule length by iterative deepening over every schedule: no state set, no explorer. */
function shortestByDeepening(programs: readonly (readonly Op[])[], cfg: Config, limit: number): number | null {
  const dfs = (s: StackState, left: number): boolean => {
    if (invariant(s)) return true;
    if (left === 0) return false;
    return actions(programs, cfg, s).some((a) => dfs(a.next, left - 1));
  };
  const init = initialState(programs);
  for (let d = 0; d <= limit; d++) if (dfs(init, d)) return d;
  return null;
}

describe('the stack under plain CAS', () => {
  it('hand-worked ABA via reuse: the 15-step schedule reaches "B is on the stack and on the free list", and no earlier step breaks anything', () => {
    // T1: load head (A), load A.next (B), then stalls. T2: pop A (3 steps), pop B (3), free B, free A, new = allocate A, load head, store A.next, cas (4).
    // Free list after the two frees: A then B (most recently freed first), so `new` hands A back. T1's CAS(head, A, B) then succeeds.
    const picks = [0, 0, ...Array(3).fill(1), ...Array(3).fill(1), 1, 1, ...Array(4).fill(1), 0];
    expect(picks).toHaveLength(15);
    const r = replay(preset('reuse'), { mode: 'plain' }, picks);
    expect(r.refusedAt).toBeNull();
    expect(r.broken).toEqual({ message: 'B is on the stack and on the free list', atStep: 15 });
    expect(r.state.head.node).toBe('B');
    expect(r.state.free).toEqual(['B']);
    expect(r.state.threads[0].regs[0]).toBe('A');
  });

  it('the explorer\'s shortest path is 15 steps, equal to iterative deepening over every schedule (nothing shorter breaks it)', () => {
    const r = search(preset('reuse'), { mode: 'plain' });
    expect(r.violation!.path).toHaveLength(15);
    expect(r.violation!.message).toBe('B is on the stack and on the free list');
    expect(shortestByDeepening(preset('reuse'), { mode: 'plain' }, 15)).toBe(15);
    expect(shortestByDeepening(preset('reuse'), { mode: 'plain' }, 14)).toBeNull();
  });

  it('ABA by re-push breaks plain CAS with "B is on the stack and held by T2", on the shortest path', () => {
    const r = search(preset('repush'), { mode: 'plain' });
    expect(r.violation!.message).toBe('B is on the stack and held by T2');
    expect(shortestByDeepening(preset('repush'), { mode: 'plain' }, 13)).toBe(r.violation!.path.length);
  });

  it('two poppers pass in every mode: the plain mode does not fail everywhere', () => {
    for (const mode of MODES) {
      const r = search(preset('poppers'), { mode });
      expect(r.violation).toBeNull();
      expect(r.truncated).toBe(false);
    }
  });
});

describe('the fixes, run over the same programs', () => {
  const run = (id: string, mode: Mode) => search(preset(id), { mode });

  it('ABA via reuse: tagged and hazard pass exhaustively; the state counts equal an independent search keyed on the whole state', () => {
    for (const mode of ['tagged', 'hazard'] as const) {
      const r = run('reuse', mode);
      expect(r.violation).toBeNull();
      expect(r.truncated).toBe(false);
      const programs = preset('reuse');
      const seen = new Set<string>();
      const visit = (s: StackState): void => {
        const k = JSON.stringify(s);
        if (seen.has(k)) return;
        seen.add(k);
        for (const a of actions(programs, { mode }, s)) visit(a.next);
      };
      visit(initialState(programs));
      expect(seen.size).toBe(r.states);
    }
    expect(run('reuse', 'tagged').states).toBe(166);
    expect(run('reuse', 'hazard').states).toBe(536);
  });

  it('ABA by re-push: tagged passes, hazard pointers do not, and the page says why', () => {
    expect(run('repush', 'tagged').violation).toBeNull();
    const hz = run('repush', 'hazard');
    expect(hz.violation).not.toBeNull();
    expect(hz.violation!.path).toHaveLength(18);
    expect(hazardWhy(preset('repush'), { mode: 'hazard' }, hz)).toContain('never frees a node');
    expect(hazardWhy(preset('reuse'), { mode: 'hazard' }, run('reuse', 'hazard'))).toBeNull();
  });

  it('with a third thread that also pops: plain still fails at depth 15, tagged and hazard pass within the budget', () => {
    const three = [preset('reuse')[0], preset('reuse')[1], ['pop'] as Op[]];
    expect(search(three, { mode: 'plain' }).violation!.path).toHaveLength(15);
    for (const mode of ['tagged', 'hazard'] as const) {
      const r = search(three, { mode });
      expect(r.violation).toBeNull();
      expect(r.truncated).toBe(false);
    }
  });

  it('counterfactuals: a tag that is never incremented fails like plain CAS; hazard pointers that do not publish fail like plain', () => {
    expect(search(preset('reuse'), { mode: 'tagged', quirks: { staticTag: true } }).violation!.message).toBe('B is on the stack and on the free list');
    expect(search(preset('reuse'), { mode: 'hazard', quirks: { noPublish: true } }).violation!.message).toBe('B is on the stack and on the free list');
  });

  it('a truncated search never claims exhaustion', () => {
    const r = search(preset('reuse'), { mode: 'hazard' }, 50);
    expect(r.truncated).toBe(true);
    expect(r.violation).toBeNull();
  });
});

describe('the invariant', () => {
  it('holds in the initial state and names a cycle, a double place and a lost node', () => {
    const s = initialState(preset('poppers'));
    expect(invariant(s)).toBeNull();
    expect(invariant({ ...s, next: { ...s.next, C: 'A' } })).toBe('The stack has a cycle: C leads back to A');
    expect(invariant({ ...s, free: ['C'] })).toBe('C is on the stack and on the free list');
    expect(invariant({ ...s, head: { node: 'B', tag: 0 } })).toBe('A is lost: no stack, list or thread has it');
  });
});

describe('editing the programs: every control at its minimum, its maximum and one beyond', () => {
  it('manipulation 1: building the ABA by hand, picking threads until the invariant fires, names the node', () => {
    const programs = preset('repush');
    // T1 loads head and A.next and stalls; T2 pops A, pops B and pushes A back; T1's CAS then succeeds.
    const picks = [0, 0, ...Array(9).fill(1), 0];
    const r = replay(programs, { mode: 'plain' }, picks);
    expect(r.broken?.message).toBe('B is on the stack and held by T2');
    expect(r.broken?.atStep).toBe(12);
    // Before T1's CAS nothing is wrong.
    expect(replay(programs, { mode: 'plain' }, picks.slice(0, 11)).broken).toBeNull();
  });

  it('manipulation 2: "pop r2" is not offered with an empty register: push r2 on a thread that has not popped is refused with its reason', () => {
    expect(addOp([], 'push r2')).toEqual({ ok: false, message: 'r2 is empty: pop first' });
    expect(addOp([], 'free r1')).toEqual({ ok: false, message: 'r1 is empty: pop first' });
    expect(addOp(['pop', 'pop'], 'pop')).toEqual({ ok: false, message: 'r1 and r2 are both full: free or push one of them before the next pop' });
    expect(addOp(['pop'], 'push r1')).toEqual({ ok: true, ops: ['pop', 'push r1'] });
    expect(programError(['pop', 'push r2'])).toEqual({ index: 1, message: 'r2 is empty: pop first' });
  });

  it('manipulation 3: in hazard mode the "ABA by re-push" program still fails, and the lines on screen say why', () => {
    const r = search(preset('repush'), { mode: 'hazard' });
    expect(r.violation).not.toBeNull();
    expect(hazardWhy(preset('repush'), { mode: 'hazard' }, r)).toBe(
      'Hazard pointers protect reclamation, not a program that recycles a node itself: this program never frees a node, so nothing is deferred and the stale CAS still succeeds.',
    );
  });

  it('five operations per thread are accepted; a sixth is refused; the empty program and removing from it work', () => {
    const five: Op[] = ['pop', 'push r1', 'pop', 'push r1', 'pop'];
    expect(programError(five)).toBeNull();
    expect(addOp(five, 'push r1')).toEqual({ ok: false, message: `At most ${MAX_OPS} operations per thread.` });
    expect(removeLastOp([])).toEqual([]);
    expect(removeLastOp(five)).toHaveLength(4);
  });

  it('1 to 3 threads are searched; 0 and 4 are refused with the limit', () => {
    expect(() => search([['pop']], { mode: 'plain' })).not.toThrow();
    expect(() => search([['pop'], ['pop'], ['pop']], { mode: 'plain' })).not.toThrow();
    expect(() => search([], { mode: 'plain' })).toThrow(`Use 1 to ${MAX_THREADS} threads: that is 0.`);
    expect(() => search([['pop'], ['pop'], ['pop'], ['pop']], { mode: 'plain' })).toThrow('that is 4');
  });

  it('new with an empty free list allocates nothing and finishes; pop on an empty stack returns nothing', () => {
    const s = initialState([['new']]);
    const a = stepThread([['new']], { mode: 'plain' }, s, 0)!;
    expect(a.label.text).toBe('allocate: the free list is empty, nothing to push');
    expect(a.next.threads[0].phase).toBe('done');
    const empty: StackState = { ...initialState([['pop']]), head: { node: null, tag: 0 } };
    expect(stepThread([['pop']], { mode: 'plain' }, empty, 0)!.next.threads[0].phase).toBe('done');
  });

  it('every preset is a valid program', () => {
    for (const p of PRESETS) for (const prog of p.programs) expect(programError(prog)).toBeNull();
  });
});

// ── Scene 3 ─────────────────────────────────────────────────────────────

describe('lock-free is not wait-free', () => {
  it('lock held by a suspended thread: T2 completes 0 increments in 20 steps; the CAS counter lets T2 finish', () => {
    const lock = suspendedRun('lock');
    expect(lock.steps).toHaveLength(SUSPEND_STEPS);
    expect(lock.completed).toEqual([0, 0]);
    expect(suspendedRun('cas').completed[1]).toBe(SUSPEND_STEPS / 2);
    expect(suspendedRun('fetch_add').completed[1]).toBe(SUSPEND_STEPS);
  });

  it('adversary: each round T2 completes a load and CAS between T1\'s load and CAS, so T1 fails once per round (closed form: rounds failures, 0 completions)', () => {
    const a = adversaryRun('cas');
    expect(a.failed).toEqual([ADVERSARY_ROUNDS, 0]);
    expect(a.completed).toEqual([0, ADVERSARY_ROUNDS]);
    expect(a.steps).toHaveLength(4 * ADVERSARY_ROUNDS);
    expect(ADVERSARY_ROUNDS).toBe(12);
    expect(a.steps.filter((s) => s.thread === 1 && s.kind === 'failed')).toHaveLength(12);
  });

  it('fetch_add on the same schedule completes T1 in one step and gives both threads all rounds', () => {
    const f = adversaryRun('fetch_add');
    expect(f.t1Steps).toBe(1);
    expect(f.completed).toEqual([ADVERSARY_ROUNDS, ADVERSARY_ROUNDS]);
  });

  it('the run is replayed from the CAS rule itself: casRun on the same schedule fails T1 each round', () => {
    const round = [0, 1, 1, 0];
    const r = casRun(2, [...round, 0]);
    // After round one T1's CAS failed; T1 then retries (loads again), so a second round continues the same pattern.
    expect(r.state.failed).toBe(1);
    expect(r.state.ok).toBe(1);
  });
});
