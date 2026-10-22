import { describe, expect, it } from 'vitest';
import { bruteForce, clauseText, replayTrace, startDpll, dpll, type Cnf, type DpllState } from '../../core/sat';
import { satisfies } from '../../core/semver';
import {
  F2, H, PACKAGES, PRESET_A, PRESET_B, ROOT_RANGES, backtrackWith, brokenDpll, buildSearchTree, countDescendants, DEFAULT_WINDOW_START, drawnTree, finishWith,
  formulaForSeed, glossOrigin, pickBranch, resolve, runWindow, summariseWindow, tryDeclareUnsat, tryDecide, tryStep, WINDOW_SIZE,
} from './model';

// Independent oracle: every assignment, evaluated clause by clause.
const holds = (cnf: Cnf, bits: number) => cnf.clauses.every((c) => c.some((l) => (((bits >> (Math.abs(l) - 1)) & 1) === 1) === l > 0));
const countModels = (cnf: Cnf) => Array.from({ length: 2 ** cnf.vars }, (_, b) => b).filter((b) => holds(cnf, b)).length;

const must = (m: ReturnType<typeof tryStep>): DpllState => {
  if (!m.ok) throw new Error(m.text);
  return m.state;
};

describe('F2 by hand: decide a = true, four steps, backtrack, two steps, decide c', () => {
  // a = T (branch 1); clause 1 forces b (prop 1), clause 2 forces c (prop 2), clause 3 forces d (prop 3), clause 4 (not d or not a) is falsified (conflict 1).
  // Backtrack: a = F (branch 2); clause 5 forces e (prop 4), clause 6 forces not b (prop 5); decide c = T (branch 3); clause 3 forces d (prop 6): every clause holds.
  it('try-this 1 to 4 reach 3 branches, 6 propagations, 1 conflict and the model a F, b F, c T, d T, e T', () => {
    let s = must(tryDecide(startDpll(F2), 1, true));
    for (let i = 0; i < 3; i++) s = must(tryStep(s));
    expect(s.conflict).toBeNull();
    s = must(tryStep(s));
    expect(s.conflict).toBe(3);
    s = backtrackWith(s, 'correct');
    s = must(tryStep(s));
    s = must(tryStep(s));
    expect([s.values[1], s.values[2], s.values[3], s.values[4], s.values[5]]).toEqual([false, false, null, null, true]);
    const refused = tryDecide(s, 2, true);
    expect(refused.ok).toBe(false);
    s = must(tryDecide(s, 3, true));
    s = must(tryStep(s));
    expect(s.outcome).toBe('sat');
    expect(s.model).toEqual([false, false, true, true, true]);
    expect(s.stats).toEqual({ branches: 3, propagations: 6, conflicts: 1 });
    expect(countModels(F2)).toBe(3);
    expect(holds(F2, 0b11100)).toBe(true); // c, d, e true, a and b false
    expect(replayTrace(F2, s.trace)).toMatchObject({ ok: true, sat: true });
  });

  it('manipulation 1: deciding b after a is decided true is refused with the forcing clause and nothing changes', () => {
    const s = must(tryStep(must(tryDecide(startDpll(F2), 1, true))));
    const r = tryDecide(s, 2, false);
    expect(r).toEqual({
      ok: false,
      text: 'b is already forced true by clause 1 (not a or b), so a decision on it would repeat or contradict a forced value. Pick an unassigned variable.',
    });
    expect(s.stats.branches).toBe(1);
    expect(tryDecide(s, 1, false).ok).toBe(false);
    expect(tryDecide(startDpll(F2), 2, false).ok).toBe(true);
  });

  it('manipulation 2: Declare UNSAT while a = false is untried is refused, and allowed once every branch failed', () => {
    let s = must(tryDecide(startDpll(F2), 1, true));
    for (let i = 0; i < 4; i++) s = must(tryStep(s));
    expect(tryDeclareUnsat(s)).toEqual({ ok: false, text: 'Not yet: a = false is untried, so the search has not covered every case.' });
    expect(tryDeclareUnsat(startDpll(F2)).ok).toBe(false);
    // a formula whose only branch fails: (x) and (not x or y) and (not y), solved with no decision at all
    const chain: Cnf = { vars: 2, names: ['x', 'y'], clauses: [[1], [-1, 2], [-2]] };
    let c = startDpll(chain);
    while (c.conflict === null) c = must(tryStep(c));
    const declared = tryDeclareUnsat(c);
    expect(declared.ok).toBe(true);
    if (declared.ok) expect(declared.state.outcome).toBe('unsat');
    expect(bruteForce(chain).count).toBe(0);
  });

  it('the broken solver gives up at the first conflict and calls the satisfiable F2 UNSAT', () => {
    const s = brokenDpll(F2);
    expect(s.outcome).toBe('unsat');
    expect(countModels(F2)).toBe(3);
    expect(dpll(F2).sat).toBe(true);
    expect(replayTrace(F2, s.trace)).toMatchObject({ ok: false });
  });
});

describe('H by hand and by recurrence', () => {
  // B(k) = branches below k untouched pairs: B(0) = 2 (the y subtree), B(k) = (1 + 2 + 2 B(k-1)) + (1 + B(k-1)) = 4 + 3 B(k-1)
  // P(k) = 3 P(k-1) + 1 with P(0) = 2; C(k) = 3 C(k-1) with C(0) = 2.
  const recur = (k: number, f: (prev: number) => number, base: number): number => (k === 0 ? base : f(recur(k - 1, f, base)));

  it('first-unassigned gives the closed-form 106 branches, 67 propagations and 54 conflicts, and H is unsatisfiable', () => {
    const r = finishWith(startDpll(H), 'first');
    expect(r.stats).toEqual({ branches: recur(3, (b) => 4 + 3 * b, 2), propagations: recur(3, (p) => 3 * p + 1, 2), conflicts: recur(3, (c) => 3 * c, 2) });
    expect(r.stats).toEqual({ branches: 106, propagations: 67, conflicts: 54 });
    expect(countModels(H)).toBe(0);
    expect(r.outcome).toBe('unsat');
  });

  it('try-this 5: picking y1 as the first branch ends with 2 branches, 2 propagations and 2 conflicts', () => {
    const r = must(pickBranch(startDpll(H), 7));
    expect(r.outcome).toBe('unsat');
    expect(r.stats).toEqual({ branches: 2, propagations: 2, conflicts: 2 });
    expect(finishWith(startDpll(H), 'most-occurring').stats).toEqual({ branches: 2, propagations: 2, conflicts: 2 });
  });

  it('picking x1 first does not change the verdict but costs more branches than y1', () => {
    let s = startDpll(H);
    const preference = [1, 3, 5, 7, 2, 4, 6, 8];
    while (s.outcome === 'running') s = must(pickBranch(s, preference.find((v) => s.values[v] === null)!));
    expect(s.outcome).toBe('unsat');
    expect(s.stats.branches).toBeGreaterThan(2);
  });

  it('a unit chain makes 0 decisions and 3 propagations', () => {
    const chain: Cnf = { vars: 3, names: ['x', 'y', 'z'], clauses: [[1], [-1, 2], [-2, 3]] };
    const r = dpll(chain);
    expect(r.stats).toEqual({ branches: 0, propagations: 3, conflicts: 0 });
    expect(countModels(chain)).toBe(1);
  });
});

describe('the search tree', () => {
  it('F2 first-unassigned walks 3 branches: a = T (conflict), a = F, then c = T (model)', () => {
    const r = dpll(F2);
    const tree = buildSearchTree(r.trace);
    expect(countDescendants(tree)).toBe(r.stats.branches);
    const [aTrue, aFalse] = tree.children;
    expect(aTrue.decision).toEqual({ var: 1, value: true, flipped: false });
    expect(aTrue).toMatchObject({ forced: 3, end: 'conflict' });
    expect(aFalse.decision).toEqual({ var: 1, value: false, flipped: true });
    expect(aFalse.forced).toBe(2);
    expect(aFalse.children).toHaveLength(1);
    expect(aFalse.children[0]).toMatchObject({ decision: { var: 3, value: true }, forced: 1, end: 'sat' });
  });

  it('collapsed below depth 4, the drawn nodes plus the "+n more" counts add up to every branch of the 106', () => {
    const r = dpll(H);
    const tree = buildSearchTree(r.trace);
    expect(countDescendants(tree)).toBe(106);
    const drawn = drawnTree(tree, H);
    let decisions = 0;
    let hidden = 0;
    for (const n of drawn.values()) {
      if (n.end === 'more') hidden += Number(n.label.slice(1));
      else if (n.label !== 'start') decisions++;
    }
    expect(decisions + hidden).toBe(106);
    const depthOf = (id: string): number => {
      let deepest = 0;
      const walk = (k: string, d: number) => {
        deepest = Math.max(deepest, d);
        for (const c of drawn.get(k)!.children) walk(c, d + 1);
      };
      walk(id, 0);
      return deepest;
    };
    expect(depthOf('n0')).toBeLessThanOrEqual(5); // four levels of branches plus a "+n more" leaf
  });
});

describe('a heuristic over 200 seeded formulas', () => {
  const runs = runWindow(DEFAULT_WINDOW_START);
  const summary = summariseWindow(runs);

  it('both heuristics agree with brute force on every one of the 200 formulas, and mean branches are no worse for most-occurring', () => {
    expect(runs).toHaveLength(WINDOW_SIZE);
    for (const r of runs) {
      const sat = countModels(formulaForSeed(r.seed)) > 0;
      expect(r.satisfiable, `seed ${r.seed}`).toBe(sat);
      expect(r.firstSat, `seed ${r.seed}`).toBe(sat);
      expect(r.mostSat, `seed ${r.seed}`).toBe(sat);
    }
    expect(summary.verdictsAgree).toBe(200);
    expect(summary.meanMost).toBeLessThanOrEqual(summary.meanFirst);
    expect(summary.satisfiable).toBeGreaterThan(100);
    expect(summary.satisfiable).toBeLessThan(WINDOW_SIZE - 9);
  });

  it('the broken solver is wrong on a share well under 90% of seeds, first at the pinned seed, for the stated reason', () => {
    const wrongSeeds = runs.filter((r) => !r.brokenSat && countModels(formulaForSeed(r.seed)) > 0).map((r) => r.seed);
    expect(summary.brokenWrong).toBe(wrongSeeds.length);
    expect(wrongSeeds.length / 200).toBeLessThan(0.9);
    expect(wrongSeeds.length / 200).toBeGreaterThan(0.2);
    expect(summary.lowestBrokenSeed).toBe(Math.min(...wrongSeeds));
    expect(summary.lowestBrokenSeed).toBe(BROKEN_SEED);
    expect(BROKEN_SEED).toBeGreaterThan(0);
    const cnf = formulaForSeed(BROKEN_SEED);
    expect(brokenDpll(cnf).outcome).toBe('unsat'); // reports UNSAT ...
    expect(bruteForce(cnf).satisfiable).toBe(true); // ... but a model exists
    expect(dpll(cnf).sat).toBe(true);
    for (const r of runs) expect(r.firstSat === r.satisfiable).toBe(true); // the fixed solver is right on all 200
  });

  it('another window start gives other formulas, and the same start the same ones', () => {
    expect(formulaForSeed(5)).toEqual(formulaForSeed(5));
    expect(formulaForSeed(5)).not.toEqual(formulaForSeed(6));
    expect(runWindow(1000).length).toBe(200);
  });
});

describe('package resolution', () => {
  const sorted = (clauses: readonly (readonly number[])[]) => clauses.map((c) => [...c].sort((a, b) => a - b).join(',')).sort();

  it('preset A resolves to lib 1.0.0 and util 1.0.0 by propagation alone: 4 propagations, 0 branches, the one model of 16', () => {
    const r = resolve(PRESET_A.lib, PRESET_A.util);
    expect(sorted(r.encoding.cnf.clauses)).toEqual(sorted([[3], [1, 2], [-1, -2], [-3, -4], [-2, 4], [-1, 3, 4]]));
    expect(r.sat).toBe(true);
    expect(r.stats).toEqual({ branches: 0, propagations: 4, conflicts: 0 });
    expect(r.installed).toEqual(['lib 1.0.0', 'util 1.0.0']);
    expect(countModels(r.encoding.cnf)).toBe(1);
    expect(r.core).toBeNull();
  });

  it('preset B is unsatisfiable and the deletion core is exactly the four clauses that clash; dropping any one makes it satisfiable', () => {
    const r = resolve(PRESET_B.lib, PRESET_B.util);
    expect(r.sat).toBe(false);
    expect(countModels(r.encoding.cnf)).toBe(0);
    const core = r.core!;
    expect(sorted(core.map((i) => r.encoding.cnf.clauses[i]))).toEqual(sorted([[2], [3], [-3, -4], [-2, 4]]));
    for (const drop of core) {
      const rest = { ...r.encoding.cnf, clauses: core.filter((i) => i !== drop).map((i) => r.encoding.cnf.clauses[i]) };
      expect(countModels(rest), `without clause ${drop}`).toBeGreaterThan(0);
    }
    expect(core.map((i) => glossOrigin(r.encoding.origins[i])).sort()).toEqual(
      ['at most one version of util can be installed', 'lib 2.0.0 requires util ^2', 'the project asks for lib ^2', 'the project asks for util ^1'].sort(),
    );
  });

  it('all nine choices agree with brute force, and an installed set honours every range', () => {
    for (const lib of ROOT_RANGES) {
      for (const util of ROOT_RANGES) {
        const r = resolve(lib.value, util.value);
        expect(r.sat, `${lib.label}/${util.label}`).toBe(countModels(r.encoding.cnf) > 0);
        if (!r.sat) continue;
        const [libV, utilV] = [r.installed.find((s) => s.startsWith('lib'))!.split(' ')[1], r.installed.find((s) => s.startsWith('util'))!.split(' ')[1]];
        expect(satisfies(libV, lib.value)).toBe(true);
        expect(satisfies(utilV, util.value)).toBe(true);
        expect(satisfies(utilV, Object.values(PACKAGES.lib[libV])[0])).toBe(true);
        expect(r.installed).toHaveLength(2);
      }
    }
    expect(clauseText(resolve('*', '^1').encoding.cnf, [-2, 4])).toBe('(not lib@2.0.0 or util@2.0.0)');
  });
});

/** The lowest seed in 1 to 200 on which the never-flips solver calls a satisfiable formula UNSAT (found by the independent oracle above). */
const BROKEN_SEED = 3;
