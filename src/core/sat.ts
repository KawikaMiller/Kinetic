/**
 * K4-4 core/sat: a small SAT toolkit for np-reductions, sat-solvers and formal-methods.
 *
 *  - `Cnf` and `parseCnf`: a formula as learner text, read through core/parseKit (positioned refusals, size caps,
 *    never `eval`).
 *  - `dpll`: the textbook DPLL search (unit propagation, then a branching rule) as a recorded trace of decisions,
 *    propagations, conflicts and backtracks. The same machine is exposed one step at a time (`startDpll`,
 *    `unitStep`, `decide`, `backtrack`, `autoStep`) for a lesson where the learner drives the search.
 *  - `replayTrace`: an independent checker that re-applies a trace and confirms every step was legal.
 *  - `bruteForce`: all 2^n assignments, the oracle for everything above.
 *  - `encodePackages` / `unsatCore`: a dependency-resolution encoding (ranges matched by core/semver) and a
 *    deletion-based unsatisfiable core.
 *
 * Conventions (pinned by tests, so lesson captions can quote them):
 *  - A literal is a non-zero integer: +v is variable v, -v is "not v"; variables are 1-based.
 *  - A **branch** is each tried value of a decision variable (both values of one variable count). A
 *    **propagation** is each forced assignment. A **conflict** is each falsified clause found.
 *  - Propagation scans the clauses in order and stops at the FIRST clause that is falsified (a conflict) or unit
 *    (a forced assignment), then rescans from clause 1.
 *  - Values are tried true first. The search is chronological backtracking: after a conflict it flips the most
 *    recent decision that has not been flipped yet.
 *  - The search stops as soon as every clause is satisfied; variables left unassigned read false in the model.
 */
import type { Rnd } from './random';
import { cursorOf, parseKitRows, type KitRead, type TokenRule } from './parseKit';
import { parseRange, satisfies } from './semver';

// ── Formulas ────────────────────────────────────────────────────────────

export type Literal = number;
export type Clause = readonly Literal[];

export interface Cnf {
  /** Variables are numbered 1 to `vars`. */
  vars: number;
  clauses: readonly Clause[];
  /** Display names, `names[v - 1]` for variable v; absent means x1, x2, ... */
  names?: readonly string[];
}

/** Hard size limits: the brute-force oracle walks 2^vars assignments, and the editors cap well below these. */
export const SAT_LIMITS = { maxVars: 16, maxClauses: 64, maxClauseLength: 8 } as const;

/** The refusal for a malformed or oversized formula, or null when it is fine. */
export function checkCnf(cnf: Cnf): string | null {
  if (!Number.isInteger(cnf.vars) || cnf.vars < 0) return 'The number of variables must be a whole number, 0 or more.';
  if (cnf.vars > SAT_LIMITS.maxVars) return `${cnf.vars} variables is over the limit of ${SAT_LIMITS.maxVars}.`;
  if (cnf.clauses.length > SAT_LIMITS.maxClauses) return `${cnf.clauses.length} clauses is over the limit of ${SAT_LIMITS.maxClauses}.`;
  for (const [i, clause] of cnf.clauses.entries()) {
    if (clause.length > SAT_LIMITS.maxClauseLength) return `Clause ${i + 1} has ${clause.length} literals; the limit is ${SAT_LIMITS.maxClauseLength}.`;
    for (const lit of clause) {
      if (!Number.isInteger(lit) || lit === 0 || Math.abs(lit) > cnf.vars) return `Clause ${i + 1} has the literal ${lit}, which is not a variable from 1 to ${cnf.vars}.`;
    }
  }
  return null;
}

function assertCnf(cnf: Cnf): void {
  const problem = checkCnf(cnf);
  if (problem) throw new RangeError(problem);
}

export const variableName = (cnf: Cnf, v: number): string => cnf.names?.[v - 1] ?? `x${v}`;
export const literalText = (cnf: Cnf, lit: Literal): string => (lit < 0 ? `not ${variableName(cnf, -lit)}` : variableName(cnf, lit));
export const clauseText = (cnf: Cnf, clause: Clause): string => `(${clause.map((l) => literalText(cnf, l)).join(' or ')})`;
/** The formula in the syntax `parseCnf` reads: "(a or not b) and (c)". */
export const formatCnf = (cnf: Cnf): string => cnf.clauses.map((c) => clauseText(cnf, c)).join(' and ');

type Values = readonly (boolean | null)[];
const literalHolds = (lit: Literal, values: Values): boolean | null => {
  const v = values[Math.abs(lit)];
  return v === null || v === undefined ? null : lit > 0 ? v : !v;
};

export type ClauseStatus = 'satisfied' | 'falsified' | 'unit' | 'open';

/** Where a clause stands under a partial assignment (`values[v]`, index 0 unused). A unit clause names its last free literal. */
export function clauseStatus(clause: Clause, values: Values): { status: ClauseStatus; unit?: Literal } {
  let free = 0;
  let last = 0;
  for (const lit of clause) {
    const holds = literalHolds(lit, values);
    if (holds === true) return { status: 'satisfied' };
    if (holds === null) {
      free++;
      last = lit;
    }
  }
  if (free === 0) return { status: 'falsified' };
  return free === 1 ? { status: 'unit', unit: last } : { status: 'open' };
}

/** Whether a complete model (`model[v - 1]` is variable v) satisfies every clause. */
export const satisfiesCnf = (cnf: Cnf, model: readonly boolean[]): boolean =>
  cnf.clauses.every((clause) => clause.some((lit) => (lit > 0 ? model[lit - 1] : !model[-lit - 1])));

// ── Reading a formula ───────────────────────────────────────────────────

export interface ParseCnfOptions {
  /** Most variables a free-form formula may use (default and ceiling: `SAT_LIMITS.maxVars`). */
  maxVars?: number;
  /** Most clauses (default and ceiling: `SAT_LIMITS.maxClauses`). */
  maxClauses?: number;
  /** Fewest and most literals in one clause (default 1 to `SAT_LIMITS.maxClauseLength`); 3 and 3 is 3-SAT. */
  clauseLength?: { min: number; max: number };
  /** A fixed variable table: only these names are accepted, in this order. Without it variables are numbered as they first appear. */
  variables?: readonly string[];
  /** Refuse a clause holding both x and not x (default false: allowed). */
  refuseTautology?: boolean;
  /** Longest line in characters (default 160). */
  maxLineChars?: number;
}

export type CnfParse = { ok: true; cnf: Cnf } | { ok: false; error: string; line: number; column?: number };

const NAME = /[\p{L}][\p{L}\p{N}_]*/u;
const WORD_END = '(?![\\p{L}\\p{N}_])';
const CNF_TOKENS: readonly TokenRule[] = [
  { kind: 'and', pattern: new RegExp(`(?:and${WORD_END}|&)`, 'iu') },
  { kind: 'or', pattern: new RegExp(`(?:or${WORD_END}|\\|)`, 'iu') },
  { kind: 'not', pattern: new RegExp(`(?:not${WORD_END}|[!~-])`, 'iu') },
  { kind: 'open', pattern: /\(/u },
  { kind: 'close', pattern: /\)/u },
  { kind: 'name', pattern: NAME },
];

/**
 * Read a formula typed one or more clauses per line: `a or not b or c`, `(a or b) and (not c)`, `-a | b`.
 * `or` (or `|`) joins literals, `and` (or `&`) joins clauses on a line, `not`, `!`, `~` or `-` negates, parentheses
 * are optional. Lines starting with `#` are comments. Every refusal names its line and column. No `eval`.
 */
export function parseCnf(text: string, options: ParseCnfOptions = {}): CnfParse {
  const maxVars = Math.min(options.maxVars ?? SAT_LIMITS.maxVars, SAT_LIMITS.maxVars);
  const maxClauses = Math.min(options.maxClauses ?? SAT_LIMITS.maxClauses, SAT_LIMITS.maxClauses);
  const length = options.clauseLength ?? { min: 1, max: SAT_LIMITS.maxClauseLength };
  const fixed = options.variables;
  const names: string[] = fixed ? [...fixed] : [];
  const lengthRefusal =
    length.min === length.max ? `a clause needs exactly ${length.min} literal${length.min === 1 ? '' : 's'}` : `a clause needs ${length.min} to ${length.max} literals`;
  let clauseCount = 0;

  const read = parseKitRows<Clause[]>(text, {
    tokens: CNF_TOKENS,
    maxRows: maxClauses,
    maxLineChars: options.maxLineChars ?? 160,
    noun: { one: 'line', many: 'lines' },
    empty: 'Write at least one clause.',
    row: (c): KitRead<Clause[]> => {
      const clauses: Clause[] = [];
      do {
        const open = c.accept('open');
        const first = c.peek();
        const literals: Literal[] = [];
        const seen = new Map<number, boolean>();
        do {
          const negated = c.accept('not') !== undefined;
          const name = c.accept('name');
          if (!name) return c.fail(negated ? 'expected a variable name after "not".' : 'expected a variable name.');
          let v = names.indexOf(name.text) + 1;
          if (v === 0) {
            if (fixed) return c.failAt(name, `"${name.text}" is not one of the allowed variables (${fixed.join(', ')}).`);
            if (names.length >= maxVars) return c.failAt(name, `more than ${maxVars} variables: "${name.text}" would be number ${names.length + 1}.`);
            names.push(name.text);
            v = names.length;
          }
          if (options.refuseTautology && seen.get(v) === negated) {
            return c.failAt(name, `${name.text} and not ${name.text} in one clause is always true: leave it out.`);
          }
          seen.set(v, !negated);
          literals.push(negated ? -v : v);
        } while (c.accept('or'));
        if (open && !c.accept('close')) return c.fail('expected ")" to close the clause.');
        if (literals.length < length.min || literals.length > length.max) {
          return first ? c.failAt(first, `${lengthRefusal}, and this one has ${literals.length}.`) : c.fail(lengthRefusal);
        }
        if (++clauseCount > maxClauses) return c.fail(`more than ${maxClauses} clauses; delete one first.`);
        clauses.push(literals);
      } while (c.accept('and'));
      return { ok: true, value: clauses };
    },
  });
  if (!read.ok) return read;
  return { ok: true, cnf: { vars: names.length, clauses: read.rows.flatMap((r) => r.value), names } };
}

// ── The oracle ──────────────────────────────────────────────────────────

/** Every satisfying assignment, as `model[v - 1]`, in counting order (variable 1 is the lowest bit, false before true). */
export function* models(cnf: Cnf): Generator<boolean[]> {
  assertCnf(cnf);
  const total = 2 ** cnf.vars;
  for (let bits = 0; bits < total; bits++) {
    const model = Array.from({ length: cnf.vars }, (_, i) => ((bits >> i) & 1) === 1);
    if (satisfiesCnf(cnf, model)) yield model;
  }
}

/** Try all 2^vars assignments: how many satisfy the formula, and the first (in `models` order). The oracle for `dpll`. */
export function bruteForce(cnf: Cnf): { satisfiable: boolean; count: number; model: boolean[] | null } {
  let count = 0;
  let model: boolean[] | null = null;
  for (const m of models(cnf)) {
    count++;
    model ??= m;
  }
  return { satisfiable: count > 0, count, model };
}

/** A seeded random k-SAT formula: every clause holds k distinct variables (ascending) with random signs. */
export function randomCnf(rnd: Rnd, vars: number, clauses: number, k = 3): Cnf {
  if (vars < k) throw new RangeError(`${k}-SAT needs at least ${k} variables, got ${vars}.`);
  const out: Literal[][] = [];
  for (let i = 0; i < clauses; i++) {
    const chosen = new Set<number>();
    while (chosen.size < k) chosen.add(1 + Math.floor(rnd() * vars));
    out.push([...chosen].sort((a, b) => a - b).map((v) => (rnd() < 0.5 ? -v : v)));
  }
  return { vars, clauses: out };
}

// ── DPLL ────────────────────────────────────────────────────────────────

export type Heuristic = 'first' | 'most-occurring';

export type SatEvent =
  | { kind: 'decide'; var: number; value: boolean; flipped: boolean }
  | { kind: 'propagate'; var: number; value: boolean; clause: number }
  | { kind: 'conflict'; clause: number }
  /** The search undoes everything back to this decision variable, which is flipped by the next `decide` event. */
  | { kind: 'backtrack'; var: number }
  | { kind: 'sat'; model: boolean[] }
  | { kind: 'unsat' };

export interface DpllStats {
  branches: number;
  propagations: number;
  conflicts: number;
}

export interface TrailEntry {
  var: number;
  value: boolean;
  reason: 'decision' | 'flip' | 'propagation';
  /** The clause that forced a propagation. */
  clause?: number;
}

interface Frame {
  var: number;
  value: boolean;
  flipped: boolean;
  /** Length of the trail before this decision was assigned. */
  trailLength: number;
}

export interface DpllState {
  readonly cnf: Cnf;
  /** `values[v]` for variable v (index 0 unused); null while unassigned. */
  readonly values: Values;
  readonly trail: readonly TrailEntry[];
  readonly stats: DpllStats;
  readonly trace: readonly SatEvent[];
  /** The falsified clause awaiting a backtrack, or null. */
  readonly conflict: number | null;
  readonly outcome: 'running' | 'sat' | 'unsat';
  /** The model once `outcome` is 'sat'. */
  readonly model: boolean[] | null;
  readonly frames: readonly Frame[];
}

/** A fresh search over `cnf` (refuses an oversized or malformed formula with a RangeError). */
export function startDpll(cnf: Cnf): DpllState {
  assertCnf(cnf);
  return {
    cnf,
    values: Array.from({ length: cnf.vars + 1 }, () => null),
    trail: [],
    stats: { branches: 0, propagations: 0, conflicts: 0 },
    trace: [],
    conflict: null,
    outcome: 'running',
    model: null,
    frames: [],
  };
}

const withValue = (values: Values, v: number, value: boolean | null): Values => values.map((x, i) => (i === v ? value : x));

/** One forced assignment or one conflict, by the scan rule in the file header; null when neither is available. */
export function unitStep(state: DpllState): DpllState | null {
  if (state.outcome !== 'running' || state.conflict !== null) return null;
  for (const [i, clause] of state.cnf.clauses.entries()) {
    const { status, unit } = clauseStatus(clause, state.values);
    if (status === 'falsified') {
      return {
        ...state,
        conflict: i,
        stats: { ...state.stats, conflicts: state.stats.conflicts + 1 },
        trace: [...state.trace, { kind: 'conflict', clause: i }],
      };
    }
    if (status === 'unit' && unit !== undefined) {
      const v = Math.abs(unit);
      const value = unit > 0;
      return {
        ...state,
        values: withValue(state.values, v, value),
        trail: [...state.trail, { var: v, value, reason: 'propagation', clause: i }],
        stats: { ...state.stats, propagations: state.stats.propagations + 1 },
        trace: [...state.trace, { kind: 'propagate', var: v, value, clause: i }],
      };
    }
  }
  return null;
}

export type DecideResult =
  | { ok: true; state: DpllState }
  | { ok: false; reason: 'finished' | 'pending-conflict' | 'unknown-variable' | 'assigned'; error: string };

/** Branch on variable `v` (true by default). Refused when the search is over, a conflict awaits a backtrack, or `v` already has a value. */
export function decide(state: DpllState, v: number, value = true): DecideResult {
  if (state.outcome !== 'running') return { ok: false, reason: 'finished', error: 'The search is over.' };
  if (state.conflict !== null) return { ok: false, reason: 'pending-conflict', error: 'A clause is falsified: backtrack first.' };
  if (!Number.isInteger(v) || v < 1 || v > state.cnf.vars) return { ok: false, reason: 'unknown-variable', error: `There is no variable ${v}.` };
  if (state.values[v] !== null) return { ok: false, reason: 'assigned', error: `${variableName(state.cnf, v)} already has a value (decided or forced).` };
  return { ok: true, state: assign(state, v, value, false) };
}

function assign(state: DpllState, v: number, value: boolean, flipped: boolean): DpllState {
  const frame: Frame = { var: v, value, flipped, trailLength: state.trail.length };
  return {
    ...state,
    values: withValue(state.values, v, value),
    trail: [...state.trail, { var: v, value, reason: flipped ? 'flip' : 'decision' }],
    frames: [...state.frames, frame],
    stats: { ...state.stats, branches: state.stats.branches + 1 },
    trace: [...state.trace, { kind: 'decide', var: v, value, flipped }],
  };
}

/**
 * After a conflict: undo back to the most recent decision not yet flipped and try its other value; with no such
 * decision the formula is unsatisfiable. Returns the state unchanged when no conflict is waiting.
 */
export function backtrack(state: DpllState): DpllState {
  if (state.outcome !== 'running' || state.conflict === null) return state;
  const frames = [...state.frames];
  while (frames.length > 0 && frames[frames.length - 1].flipped) frames.pop();
  const target = frames.pop();
  if (!target) return { ...state, conflict: null, outcome: 'unsat', frames: [], trace: [...state.trace, { kind: 'unsat' }] };
  let values = state.values;
  for (const entry of state.trail.slice(target.trailLength)) values = withValue(values, entry.var, null);
  const undone: DpllState = {
    ...state,
    values,
    trail: state.trail.slice(0, target.trailLength),
    frames,
    conflict: null,
    trace: [...state.trace, { kind: 'backtrack', var: target.var }],
  };
  return assign(undone, target.var, !target.value, true);
}

/** The variable a heuristic would branch on next (null when every variable has a value). */
export function pickVariable(state: DpllState, heuristic: Heuristic): number | null {
  const { cnf, values } = state;
  if (heuristic === 'first') {
    for (let v = 1; v <= cnf.vars; v++) if (values[v] === null) return v;
    return null;
  }
  const counts = new Array<number>(cnf.vars + 1).fill(0);
  for (const clause of cnf.clauses) {
    if (clauseStatus(clause, values).status === 'satisfied') continue;
    for (const lit of clause) if (values[Math.abs(lit)] === null) counts[Math.abs(lit)]++;
  }
  let best: number | null = null;
  for (let v = 1; v <= cnf.vars; v++) if (values[v] === null && (best === null || counts[v] > counts[best])) best = v;
  return best;
}

function finishSat(state: DpllState): DpllState {
  const model = Array.from({ length: state.cnf.vars }, (_, i) => state.values[i + 1] === true);
  return { ...state, outcome: 'sat', model, trace: [...state.trace, { kind: 'sat', model }] };
}

/** One automatic step: backtrack after a conflict, else propagate, else stop when satisfied, else branch by the heuristic. */
export function autoStep(state: DpllState, heuristic: Heuristic): DpllState {
  if (state.outcome !== 'running') return state;
  if (state.conflict !== null) return backtrack(state);
  const forced = unitStep(state);
  if (forced) return forced;
  if (state.cnf.clauses.every((c) => clauseStatus(c, state.values).status === 'satisfied')) return finishSat(state);
  const v = pickVariable(state, heuristic);
  if (v === null) return finishSat(state);
  const next = decide(state, v, true);
  return next.ok ? next.state : state;
}

export interface DpllResult {
  sat: boolean;
  /** `model[v - 1]` is variable v; null when unsatisfiable. */
  model: boolean[] | null;
  trace: readonly SatEvent[];
  stats: DpllStats;
}

/** Run DPLL to the end and return the verdict with the full trace. Iterative, so depth is never a stack problem. */
export function dpll(cnf: Cnf, options: { heuristic?: Heuristic } = {}): DpllResult {
  const heuristic = options.heuristic ?? 'first';
  let state = startDpll(cnf);
  while (state.outcome === 'running') state = autoStep(state, heuristic);
  return { sat: state.outcome === 'sat', model: state.model, trace: state.trace, stats: state.stats };
}

// ── Replaying a trace ───────────────────────────────────────────────────

export type ReplayResult = { ok: true; sat: boolean; model: boolean[] | null } | { ok: false; error: string; at: number };

/**
 * Re-apply a trace to `cnf` without any heuristic and check that every event was legal: decisions on free variables,
 * propagations of clauses that really were unit (on the literal named), conflicts on clauses really falsified,
 * backtracks that flip the most recent unflipped decision, a `sat` model that satisfies every clause, and an `unsat`
 * only after a conflict with nothing left to flip. Written separately from the search so it can disagree with it.
 */
export function replayTrace(cnf: Cnf, trace: readonly SatEvent[]): ReplayResult {
  assertCnf(cnf);
  const values: (boolean | null)[] = Array.from({ length: cnf.vars + 1 }, () => null);
  const trail: number[] = [];
  const frames: Frame[] = [];
  let pending = false;
  let pendingFlip: Frame | null = null;
  let verdict: { sat: boolean; model: boolean[] | null } | null = null;
  const fail = (at: number, error: string): ReplayResult => ({ ok: false, error, at });

  for (const [at, event] of trace.entries()) {
    if (verdict) return fail(at, 'events after the verdict');
    switch (event.kind) {
      case 'decide': {
        if (pending) return fail(at, 'a decision while a conflict is waiting for its backtrack');
        if (event.flipped) {
          if (!pendingFlip || pendingFlip.var !== event.var || pendingFlip.value === event.value) return fail(at, 'a flip that does not follow a backtrack of that variable');
          pendingFlip = null;
        } else if (pendingFlip) return fail(at, 'a backtrack must be followed by the flip of its variable');
        if (event.var < 1 || event.var > cnf.vars || values[event.var] !== null) return fail(at, `variable ${event.var} cannot be decided`);
        frames.push({ var: event.var, value: event.value, flipped: event.flipped, trailLength: trail.length });
        values[event.var] = event.value;
        trail.push(event.var);
        break;
      }
      case 'propagate': {
        const clause = cnf.clauses[event.clause];
        const { status, unit } = clause ? clauseStatus(clause, values) : { status: 'open' as const, unit: undefined };
        if (pending || pendingFlip || status !== 'unit' || unit !== (event.value ? event.var : -event.var)) return fail(at, `clause ${event.clause + 1} is not unit on that literal`);
        values[event.var] = event.value;
        trail.push(event.var);
        break;
      }
      case 'conflict': {
        const clause = cnf.clauses[event.clause];
        if (pending || pendingFlip || !clause || clauseStatus(clause, values).status !== 'falsified') return fail(at, `clause ${event.clause + 1} is not falsified`);
        pending = true;
        break;
      }
      case 'backtrack': {
        if (!pending) return fail(at, 'a backtrack with no conflict');
        while (frames.length > 0 && frames[frames.length - 1].flipped) frames.pop();
        const target = frames.pop();
        if (!target || target.var !== event.var) return fail(at, 'a backtrack to a decision that is not the latest unflipped one');
        for (const v of trail.splice(target.trailLength)) values[v] = null;
        pending = false;
        pendingFlip = target;
        break;
      }
      case 'sat': {
        if (pending || pendingFlip) return fail(at, 'sat while a conflict or flip is outstanding');
        const model = Array.from({ length: cnf.vars }, (_, i) => values[i + 1] === true);
        if (event.model.length !== cnf.vars || event.model.some((b, i) => b !== model[i])) return fail(at, 'the reported model differs from the assignment');
        if (!satisfiesCnf(cnf, model)) return fail(at, 'the model leaves a clause unsatisfied');
        verdict = { sat: true, model };
        break;
      }
      case 'unsat': {
        if (!pending || frames.some((f) => !f.flipped)) return fail(at, 'unsat while a branch is still untried');
        verdict = { sat: false, model: null };
        break;
      }
    }
  }
  return verdict ? { ok: true, ...verdict } : fail(trace.length, 'the trace ends without a verdict');
}

// ── Package resolution ──────────────────────────────────────────────────

/** `packages[name][version]` is that version's requirements, `{ otherPackage: range }`; `root` is what the project asks for. */
export interface PackageSpec {
  packages: Readonly<Record<string, Readonly<Record<string, Readonly<Record<string, string>>>>>>;
  root: Readonly<Record<string, string>>;
}

export type ClauseOrigin =
  | { kind: 'root'; pkg: string; range: string }
  | { kind: 'one-version'; pkg: string }
  | { kind: 'requires'; pkg: string; version: string; needs: string; range: string };

export interface PackageEncoding {
  cnf: Cnf;
  /** Variable v (1-based) is `variables[v - 1]`: this version of this package is installed. */
  variables: readonly { pkg: string; version: string }[];
  /** Why each clause exists, parallel to `cnf.clauses`, so a lesson can gloss it in plain words. */
  origins: readonly ClauseOrigin[];
}

/**
 * Encode "which versions can be installed" as CNF with one variable per (package, version):
 * the root's ranges become "one of the matching versions", at most one version of each package is installed
 * (pairwise exclusion), and a version that requires `needs@range` becomes "not this version, or one matching one"
 * (just "not this version" when nothing matches). Ranges are matched with core/semver, so they mean what npm means.
 * Clauses come in this order: root, then per package (in the given order) exclusions and requirements.
 */
export function encodePackages(spec: PackageSpec): PackageEncoding {
  const variables: { pkg: string; version: string }[] = [];
  const indexOf = new Map<string, number>();
  for (const [pkg, versions] of Object.entries(spec.packages)) {
    for (const version of Object.keys(versions)) {
      variables.push({ pkg, version });
      indexOf.set(`${pkg}@${version}`, variables.length);
    }
  }
  const matching = (pkg: string, range: string): number[] => {
    if (parseRange(range) === null) throw new RangeError(`"${range}" is not a version range.`);
    return Object.keys(spec.packages[pkg] ?? {}).filter((v) => satisfies(v, range)).map((v) => indexOf.get(`${pkg}@${v}`)!);
  };
  const clauses: Literal[][] = [];
  const origins: ClauseOrigin[] = [];
  const add = (clause: Literal[], origin: ClauseOrigin) => {
    clauses.push(clause);
    origins.push(origin);
  };
  for (const [pkg, range] of Object.entries(spec.root)) add(matching(pkg, range), { kind: 'root', pkg, range });
  for (const [pkg, versions] of Object.entries(spec.packages)) {
    const mine = Object.keys(versions).map((v) => indexOf.get(`${pkg}@${v}`)!);
    for (let a = 0; a < mine.length; a++) for (let b = a + 1; b < mine.length; b++) add([-mine[a], -mine[b]], { kind: 'one-version', pkg });
    for (const [version, requires] of Object.entries(versions)) {
      for (const [needs, range] of Object.entries(requires)) {
        add([-indexOf.get(`${pkg}@${version}`)!, ...matching(needs, range)], { kind: 'requires', pkg, version, needs, range });
      }
    }
  }
  const names = variables.map((v) => `${v.pkg}@${v.version}`);
  return { cnf: { vars: variables.length, clauses, names }, variables, origins };
}

/**
 * A minimal unsatisfiable subset by deletion: walk the clauses in order, drop each one, and keep it dropped when
 * the rest is still unsatisfiable. Returns the indices of the clauses that remain (every one is needed), or null
 * when the formula is satisfiable.
 */
export function unsatCore(cnf: Cnf, heuristic: Heuristic = 'first'): number[] | null {
  if (dpll(cnf, { heuristic }).sat) return null;
  let kept = cnf.clauses.map((_, i) => i);
  for (const i of [...kept]) {
    const without = kept.filter((k) => k !== i);
    if (!dpll({ ...cnf, clauses: without.map((k) => cnf.clauses[k]) }, { heuristic }).sat) kept = without;
  }
  return kept;
}
