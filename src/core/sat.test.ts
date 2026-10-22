import { describe, expect, it } from 'vitest';
import { mulberry32 } from './random';
import {
  autoStep, backtrack, bruteForce, checkCnf, clauseText, decide, dpll, encodePackages, formatCnf, models, parseCnf, pickVariable, randomCnf,
  replayTrace, SAT_LIMITS, startDpll, unitStep, unsatCore, type Cnf, type SatEvent,
} from './sat';

/** Hand-worked formulas from the sat-solvers and np-reductions specs. Variables are numbered in the order named. */
const F2: Cnf = { vars: 5, names: ['a', 'b', 'c', 'd', 'e'], clauses: [[-1, 2], [-2, 3], [-3, 4], [-4, -1], [1, 5], [-5, -2]] };
const H: Cnf = { vars: 8, clauses: [[1, 2], [3, 4], [5, 6], [7, 8], [7, -8], [-7, 8], [-7, -8]] };
const CHAIN: Cnf = { vars: 3, names: ['x', 'y', 'z'], clauses: [[1], [-1, 2], [-2, 3]] };
const F1: Cnf = { vars: 3, clauses: [[1, -2, 3], [-1, 2, -3]] };

/** An independent evaluator, deliberately not the module's: a clause holds when some literal agrees with the model. */
const holds = (cnf: Cnf, model: boolean[]) => cnf.clauses.every((c) => c.some((l) => model[Math.abs(l) - 1] === l > 0));

describe('the oracle, on hand-counted formulas', () => {
  it('F1 (np-reductions) has 8 - 2 = 6 satisfying assignments: clause 1 fails only on F,T,F and clause 2 only on T,F,T', () => {
    const r = bruteForce(F1);
    expect(r.count).toBe(6);
    const falsifying = [false, true, false].toString();
    expect([...models(F1)].map(String)).not.toContain(falsifying);
    expect([...models(F1)].map(String)).not.toContain([true, false, true].toString());
  });

  it('F2 has exactly 3 models, the broken-mode witness of the spec', () => {
    expect(bruteForce(F2).count).toBe(3);
  });

  it('counts a formula with no clauses as satisfied by every assignment, and an empty clause as satisfied by none', () => {
    expect(bruteForce({ vars: 3, clauses: [] }).count).toBe(8);
    expect(bruteForce({ vars: 3, clauses: [[]] })).toEqual({ satisfiable: false, count: 0, model: null });
  });

  it('refuses a formula over the size limits instead of walking 2^n assignments', () => {
    expect(() => bruteForce({ vars: SAT_LIMITS.maxVars + 1, clauses: [] })).toThrow(RangeError);
    expect(() => startDpll({ vars: SAT_LIMITS.maxVars + 1, clauses: [] })).toThrow(RangeError);
    expect(checkCnf({ vars: 3, clauses: [[4]] })).toMatch(/not a variable from 1 to 3/);
    expect(checkCnf({ vars: 3, clauses: [[0]] })).toMatch(/literal 0/);
    expect(checkCnf({ vars: 2, clauses: Array.from({ length: SAT_LIMITS.maxClauses + 1 }, () => [1]) })).toMatch(/over the limit/);
    expect(checkCnf({ vars: 9, clauses: [[1, 2, 3, 4, 5, 6, 7, 8, 9]] })).toMatch(/limit is 8/);
    expect(checkCnf(F2)).toBeNull();
  });
});

describe('DPLL, hand-worked vectors (counting convention: branch = each tried value, propagation = each forced assignment, conflict = each falsified clause)', () => {
  it('F2, first-unassigned: a=T forces b, c, d and falsifies clause 4; a=F forces e and not b; c=T forces d. 3 branches, 6 propagations, 1 conflict', () => {
    const r = dpll(F2);
    const expected: SatEvent[] = [
      { kind: 'decide', var: 1, value: true, flipped: false },
      { kind: 'propagate', var: 2, value: true, clause: 0 },
      { kind: 'propagate', var: 3, value: true, clause: 1 },
      { kind: 'propagate', var: 4, value: true, clause: 2 },
      { kind: 'conflict', clause: 3 },
      { kind: 'backtrack', var: 1 },
      { kind: 'decide', var: 1, value: false, flipped: true },
      { kind: 'propagate', var: 5, value: true, clause: 4 },
      { kind: 'propagate', var: 2, value: false, clause: 5 },
      { kind: 'decide', var: 3, value: true, flipped: false },
      { kind: 'propagate', var: 4, value: true, clause: 2 },
      { kind: 'sat', model: [false, false, true, true, true] },
    ];
    expect(r.trace).toEqual(expected);
    expect(r.stats).toEqual({ branches: 3, propagations: 6, conflicts: 1 });
    expect(r.model).toEqual([false, false, true, true, true]);
    expect(holds(F2, r.model!)).toBe(true);
  });

  it('H, first-unassigned: B(3) = 106 branches, 67 propagations, 54 conflicts from B(k) = 4 + 3B(k-1), P(k) = 3P(k-1) + 1, C(k) = 3C(k-1)', () => {
    const closed = (base: number, step: (prev: number) => number) => [1, 2, 3].reduce(step, base);
    const r = dpll(H);
    expect(r.sat).toBe(false);
    expect(r.stats).toEqual({
      branches: closed(2, (b) => 4 + 3 * b),
      propagations: closed(2, (p) => 3 * p + 1),
      conflicts: closed(2, (c) => 3 * c),
    });
    expect(r.stats).toEqual({ branches: 106, propagations: 67, conflicts: 54 });
  });

  it('H, most-occurring: y1 occurs in 4 unsatisfied clauses (ties go to the lowest index), so 2 branches, 2 propagations, 2 conflicts', () => {
    const state = startDpll(H);
    expect(pickVariable(state, 'most-occurring')).toBe(7);
    expect(pickVariable(state, 'first')).toBe(1);
    const r = dpll(H, { heuristic: 'most-occurring' });
    expect(r.sat).toBe(false);
    expect(r.stats).toEqual({ branches: 2, propagations: 2, conflicts: 2 });
  });

  it('a unit chain needs 0 decisions and 3 propagations', () => {
    const r = dpll(CHAIN);
    expect(r.stats).toEqual({ branches: 0, propagations: 3, conflicts: 0 });
    expect(r.model).toEqual([true, true, true]);
  });

  it('the most-occurring count skips satisfied clauses', () => {
    // After x1 = true, (x1 or x2) is satisfied, so x3 (in two open clauses) beats x2 (in none) and x1 is assigned.
    const cnf: Cnf = { vars: 3, clauses: [[1, 2], [1, 3], [-3, 2, 1], [3, 2], [-1, 3, 2]] };
    let s = startDpll(cnf);
    const first = decide(s, 1, true);
    expect(first.ok).toBe(true);
    if (first.ok) s = first.state;
    expect(pickVariable(s, 'most-occurring')).toBe(2);
  });

  it('an empty formula is satisfied with no decisions; an empty clause is a conflict with nothing to flip', () => {
    expect(dpll({ vars: 2, clauses: [] })).toMatchObject({ sat: true, model: [false, false], stats: { branches: 0 } });
    const r = dpll({ vars: 2, clauses: [[]] });
    expect(r.sat).toBe(false);
    expect(r.trace).toEqual([{ kind: 'conflict', clause: 0 }, { kind: 'unsat' }]);
  });
});

describe('stepping the search by hand (the learner drives sat-solvers scene 1)', () => {
  it('walks F2 exactly as the spec try-this does: decide a, four steps, backtrack, two steps', () => {
    let s = startDpll(F2);
    const d = decide(s, 1, true);
    if (!d.ok) throw new Error('decide refused');
    s = d.state;
    for (let i = 0; i < 4; i++) {
      const next = unitStep(s);
      if (!next) throw new Error('settled early');
      s = next;
    }
    expect(s.conflict).toBe(3);
    expect(clauseText(F2, F2.clauses[s.conflict])).toBe('(not d or not a)');
    expect(unitStep(s)).toBeNull();
    s = backtrack(s);
    expect(s.conflict).toBeNull();
    expect(s.values.slice(1)).toEqual([false, null, null, null, null]);
    s = unitStep(unitStep(s)!)!;
    expect(s.values.slice(1)).toEqual([false, false, null, null, true]);
  });

  it('refuses to decide a forced variable, during a conflict, and after the end', () => {
    let s = startDpll(F2);
    s = (decide(s, 1, true) as { ok: true; state: typeof s }).state;
    s = unitStep(s)!;
    const forced = decide(s, 2, false);
    expect(forced).toMatchObject({ ok: false, reason: 'assigned', error: 'b already has a value (decided or forced).' });
    expect(decide(s, 9)).toMatchObject({ ok: false, reason: 'unknown-variable' });
    while (s.conflict === null) s = unitStep(s)!;
    expect(decide(s, 5)).toMatchObject({ ok: false, reason: 'pending-conflict' });
    let done = startDpll(CHAIN);
    while (done.outcome === 'running') done = autoStep(done, 'first');
    expect(decide(done, 1)).toMatchObject({ ok: false, reason: 'finished' });
  });

  it('backtrack does nothing without a conflict', () => {
    const s = startDpll(F2);
    expect(backtrack(s)).toBe(s);
  });
});

describe('gate: DPLL against brute force on 1,000 seeded random 3-SAT formulas of 3 to 10 variables', () => {
  it('agrees on satisfiability for both heuristics, returns valid models, and every trace replays to the same verdict', () => {
    let sat = 0;
    let unsat = 0;
    for (let seed = 1; seed <= 1000; seed++) {
      const rnd = mulberry32(seed);
      const vars = 3 + (seed % 8);
      const cnf = randomCnf(rnd, vars, Math.floor(vars * (3 + 3 * rnd())));
      const oracle = bruteForce(cnf);
      for (const heuristic of ['first', 'most-occurring'] as const) {
        const r = dpll(cnf, { heuristic });
        expect(r.sat, `seed ${seed} ${heuristic}`).toBe(oracle.satisfiable);
        if (r.sat) expect(holds(cnf, r.model!), `model of seed ${seed} ${heuristic}`).toBe(true);
        else expect(r.model).toBeNull();
        const replay = replayTrace(cnf, r.trace);
        expect(replay, `replay of seed ${seed} ${heuristic}`).toEqual({ ok: true, sat: r.sat, model: r.model });
      }
      if (oracle.satisfiable) sat++;
      else unsat++;
    }
    // Both verdicts occur often, so the agreement above is not "everything is satisfiable".
    expect(sat).toBeGreaterThan(150);
    expect(unsat).toBeGreaterThan(150);
  });

  it('draws clauses of 3 distinct variables with ascending order, and the same seed gives the same formula', () => {
    const a = randomCnf(mulberry32(7), 8, 30);
    const b = randomCnf(mulberry32(7), 8, 30);
    expect(a).toEqual(b);
    for (const clause of a.clauses) {
      const vs = clause.map(Math.abs);
      expect(new Set(vs).size).toBe(3);
      expect(vs).toEqual([...vs].sort((x, y) => x - y));
    }
    expect(() => randomCnf(mulberry32(1), 2, 5)).toThrow(RangeError);
  });
});

describe('replayTrace can fail: it rejects traces that were tampered with', () => {
  const good = dpll(F2).trace;
  const replayWith = (edit: (t: SatEvent[]) => void) => {
    const t = [...good];
    edit(t);
    return replayTrace(F2, t);
  };

  it('accepts the genuine trace', () => {
    expect(replayTrace(F2, good)).toEqual({ ok: true, sat: true, model: [false, false, true, true, true] });
  });

  it('rejects a propagation of a clause that was not unit', () => {
    expect(replayWith((t) => (t[1] = { kind: 'propagate', var: 3, value: true, clause: 1 }))).toMatchObject({ ok: false, at: 1 });
  });

  it('rejects a conflict on a clause that is not falsified', () => {
    expect(replayWith((t) => (t[4] = { kind: 'conflict', clause: 0 }))).toMatchObject({ ok: false, at: 4 });
  });

  it('rejects a model that is not the assignment, and an unsat claimed while a branch is untried', () => {
    expect(replayWith((t) => (t[t.length - 1] = { kind: 'sat', model: [true, true, true, true, true] }))).toMatchObject({ ok: false });
    expect(replayWith((t) => t.splice(5, t.length - 5, { kind: 'unsat' }))).toMatchObject({ ok: false, error: expect.stringContaining('untried') });
  });

  it('rejects a trace with no verdict and one that decides a variable twice', () => {
    expect(replayWith((t) => t.pop())).toMatchObject({ ok: false, error: 'the trace ends without a verdict' });
    expect(replayWith((t) => (t[1] = { kind: 'decide', var: 1, value: true, flipped: false }))).toMatchObject({ ok: false });
  });
});

describe('parseCnf', () => {
  it('reads clauses one per line or joined by "and", with "not", "-", "!" and optional parentheses, numbering variables as they appear', () => {
    const r = parseCnf('a or not b\n(c) and (d or -a)\n! e | b');
    expect(r).toEqual({ ok: true, cnf: { vars: 5, names: ['a', 'b', 'c', 'd', 'e'], clauses: [[1, -2], [3], [4, -1], [-5, 2]] } });
  });

  it('skips blank and # comment lines, and keywords are not case-sensitive but names are', () => {
    const r = parseCnf('# first\n\nX OR NOT x');
    expect(r).toEqual({ ok: true, cnf: { vars: 2, names: ['X', 'x'], clauses: [[1, -2]] } });
  });

  it('round-trips through formatCnf', () => {
    const r = parseCnf('a or not b or c\nnot a or b');
    if (!r.ok) throw new Error('parse failed');
    expect(formatCnf(r.cnf)).toBe('(a or not b or c) and (not a or b)');
    expect(parseCnf(formatCnf(r.cnf))).toEqual(r);
  });

  it('does not read a variable called android as the keyword and', () => {
    const r = parseCnf('android or order');
    expect(r).toMatchObject({ ok: true, cnf: { names: ['android', 'order'] } });
  });

  it('refuses with the line and column', () => {
    expect(parseCnf('a or b\nc or ?')).toEqual({ ok: false, line: 2, column: 6, error: 'Line 2, column 6: unexpected "?".' });
    expect(parseCnf('a or')).toMatchObject({ ok: false, line: 1, error: 'Line 1, column 5: expected a variable name.' });
    expect(parseCnf('a or not')).toMatchObject({ ok: false, error: 'Line 1, column 9: expected a variable name after "not".' });
    expect(parseCnf('(a or b')).toMatchObject({ ok: false, error: 'Line 1, column 8: expected ")" to close the clause.' });
    expect(parseCnf('a b')).toMatchObject({ ok: false, error: expect.stringContaining('column 3') });
    expect(parseCnf('()')).toMatchObject({ ok: false, error: 'Line 1, column 2: expected a variable name.' });
    expect(parseCnf('  \n# only a comment')).toEqual({ ok: false, line: 1, error: 'Write at least one clause.' });
  });

  it('can insist on exactly 3 literals per clause (3-SAT), repeats allowed, naming the clause', () => {
    const three = { clauseLength: { min: 3, max: 3 } };
    expect(parseCnf('a or a or b', three)).toMatchObject({ ok: true, cnf: { clauses: [[1, 1, 2]] } });
    expect(parseCnf('a or b or c\nd or e', three)).toMatchObject({ ok: false, line: 2, error: 'Line 2, column 1: a clause needs exactly 3 literals, and this one has 2.' });
    expect(parseCnf('a or b or c or d', three)).toMatchObject({ ok: false, error: expect.stringContaining('and this one has 4') });
  });

  it('can fix the variable table and refuse tautologies', () => {
    const fixed = { variables: ['x1', 'x2', 'x3', 'x4'], refuseTautology: true };
    expect(parseCnf('x1 or not x2', fixed)).toEqual({ ok: true, cnf: { vars: 4, names: fixed.variables, clauses: [[1, -2]] } });
    expect(parseCnf('x1 or x5', fixed)).toMatchObject({ ok: false, error: 'Line 1, column 7: "x5" is not one of the allowed variables (x1, x2, x3, x4).' });
    expect(parseCnf('x1 or not x1', fixed)).toMatchObject({ ok: false, error: 'Line 1, column 11: x1 and not x1 in one clause is always true: leave it out.' });
    expect(parseCnf('x1 or not x1')).toMatchObject({ ok: true });
  });

  it('refuses more variables or clauses than the limits, and cannot be talked above the hard ceiling', () => {
    expect(parseCnf('a or b or c or d', { maxVars: 3 })).toMatchObject({ ok: false, error: 'Line 1, column 16: more than 3 variables: "d" would be number 4.' });
    const many = Array.from({ length: SAT_LIMITS.maxVars + 1 }, (_, i) => `v${i}`).join(' or ');
    const ceiling = parseCnf(many, { maxVars: 1000, clauseLength: { min: 1, max: 1000 } });
    expect(ceiling).toMatchObject({ ok: false, error: expect.stringContaining(`more than ${SAT_LIMITS.maxVars} variables`) });
    const lines = Array.from({ length: 6 }, () => 'a').join('\n');
    expect(parseCnf(lines, { maxClauses: 5 })).toMatchObject({ ok: false, line: 6, error: expect.stringContaining('more than 5') });
    expect(parseCnf('a and a and a and a', { maxClauses: 3 })).toMatchObject({ ok: false, error: expect.stringContaining('more than 3 clauses') });
    expect(parseCnf(`a or ${'b or '.repeat(60)}c`)).toMatchObject({ ok: false, error: expect.stringContaining('characters') });
  });

  it('never evaluates anything: code-shaped text is just refused', () => {
    expect(parseCnf('process.exit(1)')).toMatchObject({ ok: false });
    expect(parseCnf('a or b); alert(1')).toMatchObject({ ok: false });
  });
});

describe('package resolution', () => {
  const PACKAGES = {
    lib: { '1.0.0': { util: '*' }, '2.0.0': { util: '^2' } },
    util: { '1.0.0': {}, '2.0.0': {} },
  };
  const sorted = (clauses: readonly (readonly number[])[]) => clauses.map((c) => JSON.stringify(c)).sort();
  // The spec's preset clauses, in the spec's order: variables 1 lib1, 2 lib2, 3 util1, 4 util2.
  const SPEC_A: Cnf = { vars: 4, clauses: [[3], [1, 2], [-1, -2], [-3, -4], [-2, 4], [-1, 3, 4]] };
  const SPEC_B: Cnf = { vars: 4, clauses: [[2], [3], [-1, -2], [-3, -4], [-2, 4], [-1, 3, 4]] };

  it('encodes preset A (root needs lib any and util ^1) to the spec clauses, with names and origins', () => {
    const e = encodePackages({ packages: PACKAGES, root: { lib: '*', util: '^1' } });
    expect(e.cnf.vars).toBe(4);
    expect(e.cnf.names).toEqual(['lib@1.0.0', 'lib@2.0.0', 'util@1.0.0', 'util@2.0.0']);
    expect(sorted(e.cnf.clauses)).toEqual(sorted(SPEC_A.clauses));
    expect(e.origins).toHaveLength(e.cnf.clauses.length);
    expect(e.origins.filter((o) => o.kind === 'root')).toEqual([{ kind: 'root', pkg: 'lib', range: '*' }, { kind: 'root', pkg: 'util', range: '^1' }]);
    const lib2 = e.cnf.clauses.findIndex((c) => c.length === 2 && c[0] === -2 && c[1] === 4);
    expect(e.origins[lib2]).toEqual({ kind: 'requires', pkg: 'lib', version: '2.0.0', needs: 'util', range: '^2' });
    expect(clauseText(e.cnf, e.cnf.clauses[lib2])).toBe('(not lib@2.0.0 or util@2.0.0)');
  });

  it('A resolves by propagation alone (4 propagations, 0 branches) to the one install set lib 1.0.0 + util 1.0.0', () => {
    const r = dpll(SPEC_A);
    expect(r.stats).toEqual({ branches: 0, propagations: 4, conflicts: 0 });
    expect(r.model).toEqual([true, false, true, false]);
    const oracle = bruteForce(SPEC_A);
    expect(oracle.count).toBe(1);
    expect(oracle.model).toEqual([true, false, true, false]);
    const encoded = dpll(encodePackages({ packages: PACKAGES, root: { lib: '*', util: '^1' } }).cnf);
    expect(encoded.model).toEqual([true, false, true, false]);
    expect(encoded.stats.branches).toBe(0);
  });

  it('B (root needs lib ^2) is unsatisfiable, and the deletion core is exactly the four clauses that clash', () => {
    const e = encodePackages({ packages: PACKAGES, root: { lib: '^2', util: '^1' } });
    expect(sorted(e.cnf.clauses)).toEqual(sorted(SPEC_B.clauses));
    expect(bruteForce(SPEC_B).count).toBe(0);
    expect(dpll(SPEC_B).sat).toBe(false);
    const core = unsatCore(SPEC_B);
    expect(core).toEqual([0, 1, 3, 4]);
    expect(core!.map((i) => SPEC_B.clauses[i])).toEqual([[2], [3], [-3, -4], [-2, 4]]);
    for (const drop of core!) {
      const rest = { ...SPEC_B, clauses: core!.filter((i) => i !== drop).map((i) => SPEC_B.clauses[i]) };
      expect(bruteForce(rest).satisfiable, `dropping clause ${drop}`).toBe(true);
    }
    expect(unsatCore(e.cnf)!.map((i) => clauseText(e.cnf, e.cnf.clauses[i])).sort()).toEqual(
      ['(lib@2.0.0)', '(not lib@2.0.0 or util@2.0.0)', '(not util@1.0.0 or not util@2.0.0)', '(util@1.0.0)'].sort(),
    );
  });

  it('a satisfiable set has no core, and a requirement nothing can meet becomes a plain "not this version"', () => {
    expect(unsatCore(SPEC_A)).toBeNull();
    const e = encodePackages({ packages: { app: { '1.0.0': { missing: '^9' } }, missing: { '1.0.0': {} } }, root: { app: '*' } });
    expect(e.cnf.clauses).toContainEqual([-1]);
    expect(dpll(e.cnf).sat).toBe(false);
  });

  it('matches ranges with core/semver (caret and tilde), and refuses a range that is not one', () => {
    const e = encodePackages({ packages: { p: { '1.2.0': {}, '1.9.0': {}, '2.0.0': {} } }, root: { p: '~1.2.0' } });
    expect(e.cnf.clauses[0]).toEqual([1]);
    const caret = encodePackages({ packages: { p: { '1.2.0': {}, '1.9.0': {}, '2.0.0': {} } }, root: { p: '^1.2.0' } });
    expect(caret.cnf.clauses[0]).toEqual([1, 2]);
    expect(() => encodePackages({ packages: { p: { '1.0.0': {} } }, root: { p: 'not a range' } })).toThrow(RangeError);
  });
});
