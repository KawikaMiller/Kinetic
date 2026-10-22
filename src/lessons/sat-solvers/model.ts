import { mulberry32 } from '../../core/random';
import {
  autoStep, backtrack, bruteForce, clauseStatus, clauseText, decide, dpll, encodePackages, randomCnf, startDpll, unitStep, unsatCore, variableName,
  type ClauseOrigin, type Cnf, type DpllState, type DpllStats, type PackageEncoding, type PackageSpec, type SatEvent,
} from '../../core/sat';

/** The six-clause formula of scene 1: unit propagation, a conflict, a backtrack. */
export const F2: Cnf = { vars: 5, names: ['a', 'b', 'c', 'd', 'e'], clauses: [[-1, 2], [-2, 3], [-3, 4], [-4, -1], [1, 5], [-5, -2]] };

/** The scene 2 formula: three free pairs and a contradiction hidden in the last four clauses (variables 1-6 are x1-x6, 7 and 8 are y1 and y2). */
export const H: Cnf = {
  vars: 8,
  names: ['x1', 'x2', 'x3', 'x4', 'x5', 'x6', 'y1', 'y2'],
  clauses: [[1, 2], [3, 4], [5, 6], [7, 8], [7, -8], [-7, 8], [-7, -8]],
};

export type SolverMode = 'correct' | 'broken';

export const allSatisfied = (state: DpllState): boolean => state.cnf.clauses.every((c) => clauseStatus(c, state.values).status === 'satisfied');

/** The search stops the moment every clause holds: finish it as a model when that has happened. */
export const settle = (state: DpllState): DpllState =>
  state.outcome === 'running' && state.conflict === null && allSatisfied(state) ? autoStep(state, 'first') : state;

/** The broken solver's whole bug: when a clause is falsified it gives up with UNSAT instead of flipping the latest decision. */
export const giveUp = (state: DpllState): DpllState =>
  state.conflict === null ? state : { ...state, conflict: null, outcome: 'unsat', frames: [], trace: [...state.trace, { kind: 'unsat' }] };

/** Backtrack as the chosen solver does it. */
export const backtrackWith = (state: DpllState, mode: SolverMode): DpllState => (mode === 'broken' ? giveUp(state) : backtrack(state));

export type Move = { ok: true; state: DpllState } | { ok: false; text: string };

/** The learner decides variable `v` to `value`, or is refused with the reason in words. */
export function tryDecide(state: DpllState, v: number, value: boolean): Move {
  const cnf = state.cnf;
  const name = variableName(cnf, v);
  const entry = state.trail.find((t) => t.var === v);
  if (entry && state.outcome === 'running') {
    if (entry.reason === 'propagation' && entry.clause !== undefined) {
      return {
        ok: false,
        text: `${name} is already forced ${entry.value ? 'true' : 'false'} by clause ${entry.clause + 1} ${clauseText(cnf, cnf.clauses[entry.clause])}, so a decision on it would repeat or contradict a forced value. Pick an unassigned variable.`,
      };
    }
    return { ok: false, text: `${name} is already decided ${entry.value ? 'true' : 'false'}. Pick an unassigned variable.` };
  }
  const r = decide(state, v, value);
  if (r.ok) return { ok: true, state: settle(r.state) };
  if (r.reason === 'pending-conflict') return { ok: false, text: 'A clause is falsified: press Backtrack before deciding anything else.' };
  if (r.reason === 'finished') return { ok: false, text: 'The search is over: press Reset to start again.' };
  return { ok: false, text: r.error };
}

/** One propagation (or the conflict it finds); refused with the reason when nothing is forced or a conflict is waiting. */
export function tryStep(state: DpllState): Move {
  if (state.outcome !== 'running') return { ok: false, text: 'The search is over: press Reset to start again.' };
  if (state.conflict !== null) return { ok: false, text: 'A clause is falsified: press Backtrack to undo the latest decision and try its other value.' };
  const next = unitStep(state);
  if (next) return { ok: true, state: settle(next) };
  return { ok: false, text: 'Nothing is forced: decide a variable.' };
}

/** What Declare UNSAT does: it is refused while any branch is untried. */
export function tryDeclareUnsat(state: DpllState): Move {
  if (state.outcome === 'unsat') return { ok: false, text: 'The search already ended with UNSAT.' };
  if (state.outcome === 'sat') return { ok: false, text: 'Not UNSAT: the search found a model.' };
  const untried = state.frames.filter((f) => !f.flipped).at(-1);
  if (untried) {
    return { ok: false, text: `Not yet: ${variableName(state.cnf, untried.var)} = ${untried.value ? 'false' : 'true'} is untried, so the search has not covered every case.` };
  }
  if (state.conflict === null) return { ok: false, text: 'Not yet: no clause is falsified and no branch has failed, so nothing is ruled out.' };
  return { ok: true, state: backtrack(state) };
}

/** Run propagation, conflicts and backtracks until the search needs a decision from the learner (or ends). */
export function runUntilDecision(start: DpllState, mode: SolverMode = 'correct'): DpllState {
  let state = settle(start);
  while (state.outcome === 'running') {
    if (state.conflict !== null) {
      state = backtrackWith(state, mode);
      continue;
    }
    const next = unitStep(state);
    if (!next) break;
    state = settle(next);
  }
  return state;
}

/** The learner picks the branching variable (true first); everything forced follows until the next choice. */
export function pickBranch(state: DpllState, v: number, mode: SolverMode = 'correct'): Move {
  const r = tryDecide(state, v, true);
  return r.ok ? { ok: true, state: runUntilDecision(r.state, mode) } : r;
}

export function finishWith(state: DpllState, heuristic: 'first' | 'most-occurring', mode: SolverMode = 'correct'): DpllState {
  let s = state;
  while (s.outcome === 'running') s = s.conflict !== null && mode === 'broken' ? giveUp(s) : autoStep(s, heuristic);
  return s;
}

/** The broken solver run to its verdict: it never flips a decision. */
export function brokenDpll(cnf: Cnf): DpllState {
  return finishWith(startDpll(cnf), 'first', 'broken');
}

export const modelText = (cnf: Cnf, model: readonly boolean[]): string => model.map((b, i) => `${variableName(cnf, i + 1)} = ${b ? 'T' : 'F'}`).join(', ');

// The search tree

export interface SearchNode {
  id: string;
  /** The decision this branch made; null for the start node. */
  decision: { var: number; value: boolean; flipped: boolean } | null;
  forced: number;
  end: 'open' | 'conflict' | 'sat';
  children: SearchNode[];
}

/** The decision tree a trace walked: one node per tried value, each holding what propagation forced under it. */
export function buildSearchTree(trace: readonly SatEvent[]): SearchNode {
  let counter = 0;
  const make = (decision: SearchNode['decision']): SearchNode => ({ id: `n${counter++}`, decision, forced: 0, end: 'open', children: [] });
  const root = make(null);
  const path: SearchNode[] = [root];
  const top = () => path[path.length - 1];
  for (const e of trace) {
    if (e.kind === 'decide') {
      const node = make({ var: e.var, value: e.value, flipped: e.flipped });
      top().children.push(node);
      path.push(node);
    } else if (e.kind === 'propagate') {
      top().forced++;
    } else if (e.kind === 'conflict') {
      top().end = 'conflict';
    } else if (e.kind === 'backtrack') {
      while (path.length > 1 && top().decision?.var !== e.var) path.pop();
      path.pop();
    } else if (e.kind === 'sat') {
      top().end = 'sat';
    }
  }
  return root;
}

export const MAX_TREE_DEPTH = 4;
export const countDescendants = (n: SearchNode): number => n.children.reduce((sum, c) => sum + 1 + countDescendants(c), 0);

export interface DrawnNode {
  id: string;
  label: string;
  end: SearchNode['end'] | 'more';
  children: string[];
}

/** The tree flattened for drawing, cut below `maxDepth` where a "+n more" leaf says how many nodes were left out. */
export function drawnTree(root: SearchNode, cnf: Cnf, maxDepth = MAX_TREE_DEPTH): Map<string, DrawnNode> {
  const out = new Map<string, DrawnNode>();
  const visit = (n: SearchNode, depth: number) => {
    const label = n.decision ? `${variableName(cnf, n.decision.var)}=${n.decision.value ? 'T' : 'F'}` : 'start';
    const kids: string[] = [];
    out.set(n.id, { id: n.id, label, end: n.end, children: kids });
    if (depth >= maxDepth) {
      const hidden = countDescendants(n);
      if (hidden > 0) {
        const id = `${n.id}-more`;
        out.set(id, { id, label: `+${hidden}`, end: 'more', children: [] });
        kids.push(id);
      }
      return;
    }
    for (const c of n.children) {
      kids.push(c.id);
      visit(c, depth + 1);
    }
  };
  visit(root, 0);
  return out;
}

// Scene 3: a heuristic over seeded random formulas

export const WINDOW_VARS = 8;
export const WINDOW_CLAUSES = 30;
export const WINDOW_SIZE = 200;
export const DEFAULT_WINDOW_START = 1;

export interface WindowRun {
  seed: number;
  first: DpllStats;
  most: DpllStats;
  satisfiable: boolean;
  firstSat: boolean;
  mostSat: boolean;
  brokenSat: boolean;
}

export const formulaForSeed = (seed: number): Cnf => randomCnf(mulberry32(seed), WINDOW_VARS, WINDOW_CLAUSES);

export function runWindow(start: number, size = WINDOW_SIZE): WindowRun[] {
  return Array.from({ length: size }, (_, i) => {
    const seed = start + i;
    const cnf = formulaForSeed(seed);
    const first = dpll(cnf, { heuristic: 'first' });
    const most = dpll(cnf, { heuristic: 'most-occurring' });
    return {
      seed, first: first.stats, most: most.stats, satisfiable: bruteForce(cnf).satisfiable, firstSat: first.sat, mostSat: most.sat,
      brokenSat: brokenDpll(cnf).outcome === 'sat',
    };
  });
}

export interface WindowSummary {
  size: number;
  verdictsAgree: number;
  satisfiable: number;
  meanFirst: number;
  meanMost: number;
  /** Formulas the never-flips solver calls UNSAT although a model exists. */
  brokenWrong: number;
  /** The lowest seed in the window it gets wrong, or null. */
  lowestBrokenSeed: number | null;
}

export function summariseWindow(runs: readonly WindowRun[]): WindowSummary {
  const mean = (f: (r: WindowRun) => number) => runs.reduce((s, r) => s + f(r), 0) / Math.max(1, runs.length);
  const wrong = runs.filter((r) => !r.brokenSat && r.satisfiable);
  return {
    size: runs.length,
    verdictsAgree: runs.filter((r) => r.firstSat === r.mostSat && r.firstSat === r.satisfiable).length,
    satisfiable: runs.filter((r) => r.satisfiable).length,
    meanFirst: mean((r) => r.first.branches),
    meanMost: mean((r) => r.most.branches),
    brokenWrong: wrong.length,
    lowestBrokenSeed: wrong.length > 0 ? Math.min(...wrong.map((r) => r.seed)) : null,
  };
}

// Scene 4: package resolution

export type RootRange = '*' | '^1' | '^2';
export const ROOT_RANGES: readonly { value: RootRange; label: string }[] = [
  { value: '*', label: 'any' },
  { value: '^1', label: '^1' },
  { value: '^2', label: '^2' },
];

/** Two packages, two versions each: lib 1.0.0 takes any util, lib 2.0.0 needs util ^2. */
export const PACKAGES: PackageSpec['packages'] = {
  lib: { '1.0.0': { util: '*' }, '2.0.0': { util: '^2' } },
  util: { '1.0.0': {}, '2.0.0': {} },
};

export const rangeWords = (range: string): string => (range === '*' ? 'any version' : range);

export function glossOrigin(o: ClauseOrigin): string {
  if (o.kind === 'root') return `the project asks for ${o.pkg} ${rangeWords(o.range)}`;
  if (o.kind === 'one-version') return `at most one version of ${o.pkg} can be installed`;
  return `${o.pkg} ${o.version} requires ${o.needs} ${rangeWords(o.range)}`;
}

export interface Resolution {
  encoding: PackageEncoding;
  sat: boolean;
  stats: DpllStats;
  installed: string[];
  /** Indices of the clauses that clash (deletion core); null when the set resolves. */
  core: number[] | null;
}

export const encodeRoot = (lib: RootRange, util: RootRange): PackageEncoding => encodePackages({ packages: PACKAGES, root: { lib, util } });

export function resolve(lib: RootRange, util: RootRange): Resolution {
  const encoding = encodeRoot(lib, util);
  const r = dpll(encoding.cnf);
  return {
    encoding,
    sat: r.sat,
    stats: r.stats,
    installed: r.model ? encoding.variables.filter((_, i) => r.model![i]).map((v) => `${v.pkg} ${v.version}`) : [],
    core: unsatCore(encoding.cnf),
  };
}

export const PRESET_A = { lib: '*', util: '^1' } as const;
export const PRESET_B = { lib: '^2', util: '^1' } as const;
