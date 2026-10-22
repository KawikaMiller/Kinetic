/**
 * Pure logic for the turing-machines lesson: the two tasks (binary increment, palindrome check),
 * the learner's tables' judging against oracles, the step-by-step frames and the steps-against-size
 * measurement. The machine itself (`Tm`, `runTm`, `mustParseTm`) is the shared `core/tm`, and the reference tables are `core/tmTables`.
 */
import { plural } from '../../core/format';
import { INCREMENT_REFERENCE, PALINDROME_REFERENCE } from '../../core/tmTables';
import { mulberry32, randInt } from '../../core/random';
import {
  mustParseTm, runTm, symbolAt, tapeText, tmStart, tmStep, TM_BLANK,
  type Tm, type TmConfig, type TmRule, type TmRun,
} from '../../core/tm';

export type TaskId = 'increment' | 'palindrome';

/** A run that has not stopped after this many moves is reported as "did not halt within N steps". */
export const STEP_BUDGET = 5000;
/** The longest input tape the learner may type. */
export const MAX_INPUT = 16;
/** Moves the stepper animates before it jumps to the end of a long run. */
export const FRAME_CAP = 400;
/** Seed of the longer strings the Check button adds. */
export const CHECK_SEED = 2718;
/** How many seeded longer strings Check adds on top of the short exhaustive ones. */
export const CHECK_EXTRA = 12;
/** Input lengths of the steps-against-size plot. */
export const PLOT_LENGTHS = { from: 1, to: 20 } as const;

export const ALPHABET: Record<TaskId, readonly string[]> = { increment: ['0', '1'], palindrome: ['a', 'b'] };
/** Check runs every string up to this length, then CHECK_EXTRA seeded longer ones up to CHECK_LONGEST. */
export const CHECK_EXHAUSTIVE: Record<TaskId, number> = { increment: 4, palindrome: 6 };
export const CHECK_LONGEST = 10;

export const INCREMENT_STARTER = `# Binary increment; head on the left end
q0 0 -> 0 R q0
q0 1 -> 1 R q0
q0 _ -> _ L q1`;

const CARRY_RULE = 'q1 1 -> 0 L q1';
const WRITE_RULE = 'q1 0 -> 1 S halt';

/** The carry rule deleted: a 1 under the head in q1 has no rule. */
export const INCREMENT_NO_CARRY = INCREMENT_REFERENCE.split('\n').filter((l) => l !== CARRY_RULE).join('\n');
/** `q1 0` writes 0 instead of 1: a 0 stays 0. */
export const INCREMENT_WRONG_WRITE = INCREMENT_REFERENCE.replace(WRITE_RULE, 'q1 0 -> 0 S halt');

export const PALINDROME_STARTER = `# Accept palindromes, reject the rest.
# Erase the first letter, walk right,
# check the last letter matches.
q0 a -> _ R qA
q0 b -> _ R qB
q0 _ -> _ S accept`;

export interface TaskSpec {
  id: TaskId;
  label: string;
  starter: string;
  reference: string;
  defaultInput: string;
  /** What the oracle says in words, for the Check report. */
  goal: string;
}

export const TASKS: Record<TaskId, TaskSpec> = {
  increment: {
    id: 'increment', label: 'Binary increment', starter: INCREMENT_STARTER, reference: INCREMENT_REFERENCE,
    defaultInput: '1011', goal: 'leave the number plus one on the tape',
  },
  palindrome: {
    id: 'palindrome', label: 'Palindrome check', starter: PALINDROME_STARTER, reference: PALINDROME_REFERENCE,
    defaultInput: 'aba', goal: 'halt in accept for a palindrome and in reject otherwise',
  },
};

/** The author's tables, parsed once. */
export const REFERENCE_MACHINES: Record<TaskId, Tm> = {
  increment: mustParseTm(INCREMENT_REFERENCE),
  palindrome: mustParseTm(PALINDROME_REFERENCE),
};

// ---- the oracles ----

/** The value of a binary string; the empty tape is 0. */
export const binaryValue = (s: string): bigint => BigInt(`0b${s || '0'}`);
export const isPalindrome = (s: string) => s === [...s].reverse().join('');

// ---- inputs ----

export type InputParse = { ok: true; value: string } | { ok: false; error: string };

/** The learner's tape: symbols from the task's alphabet, at most MAX_INPUT of them. */
export function parseTapeInput(text: string, alphabet: readonly string[]): InputParse {
  const typed = text.trim();
  if (typed.length > MAX_INPUT) return { ok: false, error: `The tape holds at most ${MAX_INPUT} symbols; this has ${typed.length}.` };
  const bad = [...typed].find((ch) => !alphabet.includes(ch));
  if (bad !== undefined) return { ok: false, error: `"${bad}" is not in this task's alphabet (${alphabet.join(', ')}).` };
  return { ok: true, value: typed };
}

/** Every string over `alphabet` up to `maxLen` symbols, shortest first, the empty string included. */
export function allStrings(alphabet: readonly string[], maxLen: number): string[] {
  const out = [''];
  let layer = [''];
  for (let n = 1; n <= maxLen; n++) {
    layer = layer.flatMap((s) => alphabet.map((a) => s + a));
    out.push(...layer);
  }
  return out;
}

/** The inputs Check runs: every short string, then seeded longer ones (half of them palindromes for the palindrome task). */
export function checkInputs(task: TaskId): string[] {
  const alphabet = ALPHABET[task];
  const exhaustive = CHECK_EXHAUSTIVE[task];
  const rnd = mulberry32(CHECK_SEED);
  const longer: string[] = [];
  for (let k = 0; k < CHECK_EXTRA; k++) {
    const len = randInt(exhaustive + 1, CHECK_LONGEST, rnd);
    const word = () => Array.from({ length: Math.ceil(len / 2) }, () => alphabet[randInt(0, alphabet.length - 1, rnd)]).join('');
    if (task === 'palindrome' && k % 2 === 0) {
      const half = word();
      const tail = [...half.slice(0, Math.floor(len / 2))].reverse().join('');
      longer.push(half + tail);
    } else {
      longer.push(word() + word().slice(0, Math.floor(len / 2)));
    }
  }
  return [...allStrings(alphabet, exhaustive), ...longer];
}

// ---- judging a run ----

export type Verdict =
  | { kind: 'right' }
  | { kind: 'wrong'; got: string; expected: string }
  | { kind: 'stuck'; state: string; read: string }
  | { kind: 'budget' };

/** What the run left, compared with the oracle for the task. */
export function judge(task: TaskId, input: string, run: TmRun): Verdict {
  if (run.status === 'stuck') return { kind: 'stuck', state: run.config.state, read: symbolAt(run.config, run.config.head) };
  if (run.status === 'budget-exhausted') return { kind: 'budget' };
  if (task === 'increment') {
    const tape = tapeText(run.config);
    const expected = (binaryValue(input) + 1n).toString(2);
    const readsAsNumber = /^[01]+$/.test(tape) && binaryValue(tape) === binaryValue(input) + 1n;
    return readsAsNumber ? { kind: 'right' } : { kind: 'wrong', got: tape || '(blank)', expected };
  }
  const expected = isPalindrome(input) ? 'accept' : 'reject';
  return run.config.state === expected ? { kind: 'right' } : { kind: 'wrong', got: run.config.state, expected };
}

export interface CaseResult {
  input: string;
  run: TmRun;
  verdict: Verdict;
}

export interface CheckReport {
  total: number;
  failures: CaseResult[];
  first: CaseResult | null;
}

export const runCase = (task: TaskId, tm: Tm, input: string): CaseResult => {
  const run = runTm(tm, input, { maxSteps: STEP_BUDGET });
  return { input, run, verdict: judge(task, input, run) };
};

/** Runs the table on `inputs` (the Check button's list by default) and keeps the failures. */
export function checkTable(task: TaskId, tm: Tm, inputs: readonly string[] = checkInputs(task)): CheckReport {
  const failures = inputs.map((s) => runCase(task, tm, s)).filter((c) => c.verdict.kind !== 'right');
  return { total: inputs.length, failures, first: failures[0] ?? null };
}

export const shown = (s: string) => (s === '' ? '(empty tape)' : s);

/** One sentence for a failing case, built from the case itself. */
export function describeCase(c: CaseResult, task: TaskId): string {
  const { verdict: v, run } = c;
  const head = `Input ${shown(c.input)}:`;
  if (v.kind === 'stuck') return `${head} stuck in ${v.state} reading ${v.read === TM_BLANK ? 'a blank' : v.read}, after ${plural(run.steps, 'step')}. No rule matches, so the machine stops without answering.`;
  if (v.kind === 'budget') return `${head} did not halt within ${STEP_BUDGET.toLocaleString('en-US')} steps. That is not a verdict on later steps.`;
  if (v.kind === 'wrong') {
    return task === 'increment'
      ? `${head} halted with the tape ${v.got}, but the number plus one is ${v.expected}.`
      : `${head} halted in ${v.got}, but this input should end in ${v.expected}.`;
  }
  return `${head} correct after ${plural(run.steps, 'step')}.`;
}

// ---- stepping ----

export type EndKind = 'running' | 'halted' | 'stuck' | 'budget';

export interface TmFrame {
  config: TmConfig;
  rule: TmRule | null;
  /** Tape cells the last move wrote a different symbol into. */
  changed: number[];
  step: number;
  end: EndKind;
  /** The run was too long to animate: this frame jumps to the end. */
  skipped: boolean;
}

const endOf = (status: TmRun['status']): EndKind => (status === 'budget-exhausted' ? 'budget' : status);

/** The moves of a run as frames, animated up to FRAME_CAP and then jumping to where the run ended. */
export function traceFrames(tm: Tm, input: string): TmFrame[] {
  let config = tmStart(tm, input);
  const frames: TmFrame[] = [{ config, rule: null, changed: [], step: 0, end: 'running', skipped: false }];
  const finish = (end: EndKind) => {
    frames[frames.length - 1] = { ...frames[frames.length - 1], end };
    return frames;
  };
  for (let step = 1; step <= FRAME_CAP + 1; step++) {
    const next = tmStep(tm, config);
    if (next.status !== 'moved') return finish(next.status);
    if (step > FRAME_CAP) break;
    const wroteAt = config.head;
    const changed = next.rule.write === symbolAt(config, wroteAt) ? [] : [wroteAt];
    config = next.config;
    frames.push({ config, rule: next.rule, changed, step, end: 'running', skipped: false });
  }
  const run = runTm(tm, input, { maxSteps: STEP_BUDGET });
  frames.push({ config: run.config, rule: null, changed: [], step: run.steps, end: endOf(run.status), skipped: true });
  return frames;
}
export type FrameStatus = 'running' | 'right' | 'wrong' | 'stuck' | 'budget';

/** Where a frame stands against the oracle: still running, stopped right, stopped wrong, stuck or out of budget. */
export function frameStatus(f: TmFrame, task: TaskId, input: string): FrameStatus {
  if (f.end === 'running') return 'running';
  if (f.end === 'stuck' || f.end === 'budget') return f.end;
  const verdict = judge(task, input, { status: 'halted', steps: f.step, config: f.config });
  return verdict.kind === 'right' ? 'right' : 'wrong';
}
/** The index of a rule in the parsed table (the CodePanel line that lights up). */
export const ruleIndex = (tm: Tm, rule: TmRule | null) => (rule ? tm.rules.indexOf(rule) : -1);

// ---- steps against input size ----

export interface SizePoint {
  n: number;
  steps: number | null;
  status: TmRun['status'];
}

/** The input of length n whose run the plot measures: all ones, or all a. */
export const sizeInput = (task: TaskId, n: number) => (task === 'increment' ? '1' : 'a').repeat(n);

export function stepsBySize(task: TaskId, tm: Tm): SizePoint[] {
  const out: SizePoint[] = [];
  for (let n = PLOT_LENGTHS.from; n <= PLOT_LENGTHS.to; n++) {
    const run = runTm(tm, sizeInput(task, n), { maxSteps: STEP_BUDGET });
    out.push({ n, steps: run.status === 'halted' ? run.steps : null, status: run.status });
  }
  return out;
}

/** Steps at length 2m divided by steps at length m, or null when either run did not halt. */
export function doublingRatio(points: readonly SizePoint[], m: number): number | null {
  const a = points.find((p) => p.n === m)?.steps;
  const b = points.find((p) => p.n === 2 * m)?.steps;
  return a == null || b == null || a === 0 ? null : b / a;
}

export const DOUBLING_FROM = 10;
/** Below this ratio, doubling the input about doubles the steps. */
export const LINEAR_BELOW = 2.5;
/** At or above this ratio, doubling the input about quadruples the steps. */
export const QUADRATIC_FROM = 3.2;

export const growthWord = (ratio: number) => (ratio < LINEAR_BELOW ? 'close to linear' : ratio >= QUADRATIC_FROM ? 'close to quadratic' : 'between linear and quadratic');

// ---- a table is data ----

/** A machine written on one line: rules `state,read,write,move,next` joined by `;`. */
export function encodeTable(tm: Tm): string {
  return tm.rules.map((r) => [r.state, r.read, r.write, r.move, r.next].join(',')).join(';');
}

export function decodeTable(text: string): Tm {
  const rules = text.split(';').map((part) => {
    const [state, read, write, move, next] = part.split(',');
    return `${state} ${read} -> ${write} ${move} ${next}`;
  });
  return mustParseTm(rules.join('\n'));
}
