/**
 * formal-methods: a tiny guarded-command language and its interpreter. NOT TLA+ syntax. N processes run the same
 * program of at most 6 steps; a step has a guard (typed text, run by `core/expr`, never `eval`), an effect chosen from
 * a list, and moves the process to the next step (the last step wraps to step 0). The checker is `core/explore`.
 *
 * Variables are small integers: flag0, flag1, ... (one per process), turn and lock, all starting at 0. A process is in
 * its critical section when its pc equals the critical step. A model is checked, not a program: the pass message says so.
 */
import { evaluate, parseExpr, runTree, EvalError, Unsupported, type ExprNode, type Value } from '../../core/expr';
import { explore, type ActionLabel, type PathStep, type Transition } from '../../core/explore';
import { mulberry32 } from '../../core/random';

export const MAX_PROCESSES = 6;
export const MAX_STEPS = 6;
export const MAX_TEXT = 200;
export const BUDGET = 250_000;

export const EFFECTS = ['none', 'flagMe = 1', 'flagMe = 0', 'turn = other', 'turn = me', 'lock = 1', 'lock = 0'] as const;
export type Effect = (typeof EFFECTS)[number];

export interface Step { guard: string; effect: Effect }
export interface Spec {
  /** How many processes run the program. */
  n: number;
  steps: Step[];
  /** The pc at which a process counts as being in its critical section. */
  critical: number;
  /** The property, typed text: it must hold in every reachable state. */
  invariant: string;
  /** Also report states where no process can run. */
  deadlock: boolean;
}

export interface State { pcs: number[]; flags: number[]; turn: number; lock: number }

const TWO_ONLY = 'this name exists only for two processes';
export const defaultInvariant = (n: number): string => (n === 2 ? 'crit0 + crit1 <= 1' : 'crit <= 1');

// ── The presets ─────────────────────────────────────────────────────────

export const PETERSON: Spec = {
  n: 2,
  steps: [
    { guard: 'true', effect: 'flagMe = 1' },
    { guard: 'true', effect: 'turn = other' },
    { guard: 'flagOther == 0 || turn == me', effect: 'none' },
    { guard: 'true', effect: 'flagMe = 0' },
  ],
  critical: 3,
  invariant: defaultInvariant(2),
  deadlock: true,
};
export const NAIVE: Spec = {
  n: 2,
  steps: [{ guard: 'lock == 0', effect: 'none' }, { guard: 'true', effect: 'lock = 1' }, { guard: 'true', effect: 'lock = 0' }],
  critical: 2,
  invariant: defaultInvariant(2),
  deadlock: true,
};
export const ATOMIC: Spec = {
  n: 2,
  steps: [{ guard: 'true', effect: 'none' }, { guard: 'lock == 0', effect: 'lock = 1' }, { guard: 'true', effect: 'lock = 0' }],
  critical: 2,
  invariant: defaultInvariant(2),
  deadlock: true,
};
export const PRESETS: readonly { id: string; label: string; spec: Spec }[] = [
  { id: 'peterson', label: "Peterson's algorithm", spec: PETERSON },
  { id: 'naive', label: 'naive flag lock', spec: NAIVE },
  { id: 'atomic', label: 'atomic test-and-set', spec: ATOMIC },
];

// ── Compiling the typed text ────────────────────────────────────────────

export class SpecFault extends Error {}

interface Compiled { spec: Spec; guards: ExprNode[]; invariant: ExprNode }
export type Compile = { ok: true; value: Compiled } | { ok: false; error: string };

function namesOf(node: ExprNode): string[] {
  switch (node.k) {
    case 'name': return [node.v];
    case 'member': return [...namesOf(node.obj), ...(typeof node.prop === 'string' ? [] : namesOf(node.prop))];
    case 'unary': return namesOf(node.arg);
    case 'binary': return [...namesOf(node.l), ...namesOf(node.r)];
    case 'ternary': return [...namesOf(node.test), ...namesOf(node.then), ...namesOf(node.else)];
    default: return [];
  }
}

const guardNames = (n: number): Set<string> => new Set(['me', 'flagMe', 'turn', 'lock', ...(n === 2 ? ['other', 'flagOther'] : [])]);
const invariantNames = (n: number): Set<string> =>
  new Set(['crit', 'turn', 'lock', ...Array.from({ length: n }, (_, p) => [`crit${p}`, `flag${p}`, `pc${p}`]).flat()]);

/** Parse typed text: the reason in words when it cannot be used (core/expr's own message for what it does not run). */
function parse(text: string, where: string, allowed: Set<string>, n: number): { ok: true; node: ExprNode } | { ok: false; error: string } {
  if (text.length > MAX_TEXT) return { ok: false, error: `${where}: at most ${MAX_TEXT} characters: this one has ${text.length}.` };
  let node: ExprNode;
  try {
    node = parseExpr(text);
  } catch (e) {
    if (e instanceof Unsupported) return { ok: false, error: `${where}: not supported here: ${e.message}` };
    throw e;
  }
  for (const name of namesOf(node)) {
    if (allowed.has(name)) continue;
    if (n !== 2 && (name === 'other' || name === 'flagOther')) return { ok: false, error: `${where}: ${name}: ${TWO_ONLY}.` };
    const probe = evaluate(name, []);
    return { ok: false, error: `${where}: ${probe.ok ? name : probe.error}` };
  }
  return { ok: true, node };
}

/** Check the spec's limits and parse every typed field. */
export function compile(spec: Spec): Compile {
  if (!Number.isInteger(spec.n) || spec.n < 1) return { ok: false, error: 'Use at least 1 process.' };
  if (spec.n > MAX_PROCESSES) return { ok: false, error: `At most ${MAX_PROCESSES} processes: the state space grows by about 2x per process.` };
  if (spec.steps.length < 1) return { ok: false, error: 'The program needs at least 1 step.' };
  if (spec.steps.length > MAX_STEPS) return { ok: false, error: `At most ${MAX_STEPS} steps: that is ${spec.steps.length}.` };
  if (spec.critical < 0 || spec.critical >= spec.steps.length) return { ok: false, error: `The critical step is a step number from 0 to ${spec.steps.length - 1}.` };
  const twoOnly = spec.n !== 2 ? spec.steps.findIndex((s) => s.effect === 'turn = other') : -1;
  if (twoOnly >= 0) return { ok: false, error: `Effect of step ${twoOnly}: turn = other: ${TWO_ONLY}.` };
  const guards: ExprNode[] = [];
  for (const [k, s] of spec.steps.entries()) {
    const g = parse(s.guard, `Guard of step ${k}`, guardNames(spec.n), spec.n);
    if (!g.ok) return g;
    guards.push(g.node);
  }
  const inv = parse(spec.invariant, 'Invariant', invariantNames(spec.n), spec.n);
  if (!inv.ok) return inv;
  return { ok: true, value: { spec, guards, invariant: inv.node } };
}

// ── The interpreter ─────────────────────────────────────────────────────

export function initialState(n: number): State {
  return { pcs: Array.from({ length: n }, () => 0), flags: Array.from({ length: n }, () => 0), turn: 0, lock: 0 };
}

const otherOf = (p: number): number => 1 - p;

function guardScope(s: State, p: number, n: number): Record<string, Value> {
  return { me: p, flagMe: s.flags[p], turn: s.turn, lock: s.lock, ...(n === 2 ? { other: otherOf(p), flagOther: s.flags[otherOf(p)] } : {}) };
}

function invariantScope(s: State, critical: number): Record<string, Value> {
  const crits = s.pcs.map((pc) => (pc === critical ? 1 : 0));
  return {
    crit: crits.reduce<number>((a, b) => a + b, 0), turn: s.turn, lock: s.lock,
    ...Object.fromEntries(s.pcs.flatMap((pc, p) => [[`crit${p}`, crits[p]], [`flag${p}`, s.flags[p]], [`pc${p}`, pc]])),
  };
}

/** Run a parse tree on one scope; a guard or invariant that throws becomes a SpecFault, never a crash. */
function run(node: ExprNode, scope: Record<string, Value>, where: string): Value {
  try {
    return runTree(node, [scope]);
  } catch (e) {
    if (e instanceof Unsupported) throw new SpecFault(`${where}: not supported here: ${e.message}`);
    if (e instanceof EvalError) throw new SpecFault(`${where}: ${e.message}`);
    throw e;
  }
}

/** The step in words, with me and other filled in: "turn = 1", "flag0 = 1". */
export function stepText(c: Spec, k: number, p: number): string {
  const { guard, effect } = c.steps[k];
  const what = effect === 'none' ? 'pass' : effect.replace('flagMe', `flag${p}`).replace('other', String(otherOf(p))).replace('me', String(p));
  return `step ${k}: ${what}${guard === 'true' ? '' : ` when ${guard}`}`;
}

function applyEffect(s: State, p: number, effect: Effect, next: number): State {
  const pcs = s.pcs.map((x, i) => (i === p ? next : x));
  switch (effect) {
    case 'flagMe = 1': return { ...s, pcs, flags: s.flags.map((f, i) => (i === p ? 1 : f)) };
    case 'flagMe = 0': return { ...s, pcs, flags: s.flags.map((f, i) => (i === p ? 0 : f)) };
    case 'turn = other': return { ...s, pcs, turn: otherOf(p) };
    case 'turn = me': return { ...s, pcs, turn: p };
    case 'lock = 1': return { ...s, pcs, lock: 1 };
    case 'lock = 0': return { ...s, pcs, lock: 0 };
    default: return { ...s, pcs };
  }
}

export interface Label extends ActionLabel { process: number; step: number }

export function transitions(c: Compiled, s: State): Transition<State, Label>[] {
  const out: Transition<State, Label>[] = [];
  for (let p = 0; p < c.spec.n; p++) {
    const k = s.pcs[p];
    if (!run(c.guards[k], guardScope(s, p, c.spec.n), `Guard of step ${k}`)) continue;
    const next = applyEffect(s, p, c.spec.steps[k].effect, (k + 1) % c.spec.steps.length);
    out.push({ label: { actor: `P${p}`, text: stepText(c.spec, k, p), process: p, step: k }, next });
  }
  return out;
}

export const stateKey = (s: State): string => JSON.stringify([s.pcs, s.flags, s.turn, s.lock]);

export const DEADLOCK_MESSAGE = 'deadlock: no step can run';
export const violationMessage = (c: Spec): string => `invariant violated: ${c.invariant}`;

/** null while the state is fine; else the message for the first failing check. */
export function checkState(c: Compiled, s: State): string | null {
  if (!run(c.invariant, invariantScope(s, c.spec.critical), 'Invariant')) return violationMessage(c.spec);
  if (c.spec.deadlock && transitions(c, s).length === 0) return DEADLOCK_MESSAGE;
  return null;
}

// ── Checking ────────────────────────────────────────────────────────────

export type Check =
  | { kind: 'holds'; states: number }
  | { kind: 'truncated'; states: number }
  | { kind: 'violation' | 'deadlock'; states: number; steps: number; path: PathStep<State, Label>[] }
  | { kind: 'refused'; message: string };

export function check(spec: Spec, budget: number = BUDGET): Check {
  const compiled = compile(spec);
  if (!compiled.ok) return { kind: 'refused', message: compiled.error };
  const c = compiled.value;
  try {
    const r = explore<State, Label>({
      init: initialState(spec.n),
      actions: (s) => transitions(c, s),
      key: stateKey,
      invariant: (s) => checkState(c, s),
      maxStates: budget,
    });
    if (r.violation) return { kind: r.violation.message === DEADLOCK_MESSAGE ? 'deadlock' : 'violation', states: r.states, steps: r.violation.path.length, path: r.violation.path };
    return r.truncated ? { kind: 'truncated', states: r.states } : { kind: 'holds', states: r.states };
  } catch (e) {
    if (e instanceof SpecFault) return { kind: 'refused', message: e.message };
    throw e;
  }
}

/** The number of reachable states of the atomic lock with `n` processes: 2^n + n 2^(n-1). */
export const atomicLockClosedForm = (n: number): number => 2 ** n + n * 2 ** (n - 1);

/** Reachable states of the three-step atomic lock for n processes, by the explorer. */
export function atomicLockStates(n: number): { states: number; truncated: boolean } {
  if (!Number.isInteger(n) || n < 1) throw new RangeError('Use at least 1 process.');
  if (n > MAX_PROCESSES) throw new RangeError(`At most ${MAX_PROCESSES} processes: the state space grows by about 2x per process.`);
  const r = check({ ...ATOMIC, n, invariant: 'crit <= 1', deadlock: false });
  if (r.kind === 'refused') throw new RangeError(r.message);
  return { states: r.states, truncated: r.kind === 'truncated' };
}

// ── Random testing, for contrast: seeded schedules, the same interpreter ────────────────────

export const SEEDS_FROM = 1;
export const SEEDS_TO = 200;
/**
 * Short on purpose: a schedule this long reaches the bug on some seeds and misses it on others (the naive lock fails
 * on 46 of 200 seeds), which is the contrast with the exhaustive leg. Thirty steps made every broken mode fail on
 * over 90% of the seeds, which shows nothing about sampling (kickoff decisions, rule 29).
 */
export const RANDOM_STEPS = 6;

export interface RandomRun { failing: number; total: number; lowestFailingSeed: number | null }

/** Run `SEEDS_TO` seeded random schedules of `RANDOM_STEPS` steps, checking the property after each. */
export function randomTest(spec: Spec): RandomRun | { error: string } {
  const compiled = compile(spec);
  if (!compiled.ok) return { error: compiled.error };
  const c = compiled.value;
  let failing = 0;
  let lowest: number | null = null;
  try {
    const initial = initialState(spec.n);
    const failsAtStart = checkState(c, initial) !== null;
    for (let seed = SEEDS_FROM; seed <= SEEDS_TO; seed++) {
      if (failsAtStart) { failing += 1; lowest ??= seed; continue; }
      const next = mulberry32(seed);
      let s = initial;
      for (let i = 0; i < RANDOM_STEPS; i++) {
        const moves = transitions(c, s);
        if (moves.length === 0) break;
        s = moves[Math.floor(next() * moves.length)].next;
        if (checkState(c, s) !== null) { failing += 1; lowest ??= seed; break; }
      }
    }
  } catch (e) {
    if (e instanceof SpecFault) return { error: e.message };
    throw e;
  }
  return { failing, total: SEEDS_TO - SEEDS_FROM + 1, lowestFailingSeed: lowest };
}

// ── Scene 3: the counterexample as a test case against lesson-authored code ──────────────────

export interface CodeState { lock: number; inside: boolean[]; checked: boolean[] }

/**
 * The naive lock as straight-line code (not the interpreter): `if (lock === 0) { lock = 1; enter }`, with the check
 * and the take as separate steps. A schedule lists which process runs next. A pure function, not a real thread.
 */
export function runNaiveCode(schedule: readonly number[]): CodeState {
  const s: CodeState = { lock: 0, inside: [false, false], checked: [false, false] };
  for (const p of schedule) {
    if (s.inside[p]) continue;
    if (!s.checked[p]) { s.checked[p] = s.lock === 0; continue; }
    s.lock = 1;
    s.inside[p] = true;
  }
  return s;
}

/** The schedule a counterexample path takes: who ran at each step. */
export const scheduleOf = (path: readonly PathStep<State, Label>[]): number[] => path.map((s) => s.label.process);
