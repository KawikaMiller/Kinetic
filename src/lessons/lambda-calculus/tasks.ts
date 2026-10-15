/**
 * The build tasks: the learner writes a term T; Check applies T to Church numerals or booleans,
 * reduces in normal order and compares the normal form with the expected one up to alpha
 * equivalence (de Bruijn keys). The first input that fails is reported with the normal form produced.
 */
import { alphaEqual } from './debruijn';
import { run, type Run } from './reduce';
import { app, describeValue, named, numeral, print, type NamedId, type Term } from './term';

export type TaskId = 'succ' | 'add' | 'mul' | 'and' | 'not';

/** Steps Check allows for one case. */
export const CHECK_BUDGET = 500;
/** Numerals 0 to this are the inputs of the arithmetic tasks. */
export const MAX_INPUT = 4;

interface Case {
  label: string;
  args: Term[];
  expected: Term;
}

export interface Task {
  id: TaskId;
  label: string;
  goal: string;
  /** The term the field starts with: it fails, so the learner has something to fix. */
  starter: string;
  hint: string;
  /** Named terms offered as chips (never the answer itself). */
  helpers: readonly NamedId[];
  cases: readonly Case[];
}

const upTo = (n: number) => Array.from({ length: n + 1 }, (_, i) => i);
const bool = (b: boolean) => named(b ? 'true' : 'false');
const pairs = (f: (a: number, b: number) => number, op: string): Case[] =>
  upTo(MAX_INPUT).flatMap((a) => upTo(MAX_INPUT).map((b) => ({ label: `${op} ${a} ${b}`, args: [numeral(a), numeral(b)], expected: numeral(f(a, b)) })));

export const TASKS: Record<TaskId, Task> = {
  succ: {
    id: 'succ', label: 'succ', goal: 'add one to a numeral', starter: 'λn.n', helpers: [],
    hint: 'succ = λn.λf.λx.f (n f x): apply f once more than n does.',
    cases: upTo(MAX_INPUT).map((n) => ({ label: `succ ${n}`, args: [numeral(n)], expected: numeral(n + 1) })),
  },
  add: {
    id: 'add', label: 'add', goal: 'add two numerals', starter: 'λm.λn.m', helpers: ['succ'],
    hint: 'add = λm.λn.λf.λx.m f (n f x): apply f n times, then m more times.',
    cases: pairs((a, b) => a + b, 'add'),
  },
  mul: {
    id: 'mul', label: 'mul', goal: 'multiply two numerals', starter: 'λm.λn.m', helpers: ['add', 'succ'],
    hint: 'mul = λm.λn.λf.m (n f): apply (apply f n times) m times.',
    cases: pairs((a, b) => a * b, 'mul'),
  },
  and: {
    id: 'and', label: 'and', goal: 'be true only when both booleans are true', starter: 'λp.λq.p', helpers: ['true', 'false', 'if'],
    hint: 'and = λp.λq.p q p: if p is true the answer is q, otherwise p itself (false).',
    cases: [true, false].flatMap((p) => [true, false].map((q) => ({ label: `and ${p} ${q}`, args: [bool(p), bool(q)], expected: bool(p && q) }))),
  },
  not: {
    id: 'not', label: 'not', goal: 'flip a boolean', starter: 'λb.b', helpers: ['true', 'false', 'if'],
    hint: 'not = λb.λt.λf.b f t: a boolean picks one of two arguments, so hand it the two swapped.',
    cases: [true, false].map((b) => ({ label: `not ${b}`, args: [bool(b)], expected: bool(!b) })),
  },
};

export const TASK_IDS: readonly TaskId[] = ['succ', 'add', 'mul', 'and', 'not'];

export interface Failure {
  label: string;
  produced: Term;
  end: Run['end'];
  /** What the produced term reads as, for the message. */
  reads: string;
  expected: Term;
}

export interface CheckResult {
  total: number;
  /** The first case that failed, or null when every case passed. */
  failure: Failure | null;
}

/** Applies T to each case's arguments, reduces in normal order and compares with the expected normal form. */
export function checkTerm(task: Task, t: Term): CheckResult {
  for (const c of task.cases) {
    const r = run(c.args.reduce((fn, arg) => app(fn, arg), t), 'normal', CHECK_BUDGET);
    const produced = r.terms[r.terms.length - 1];
    if (r.end.kind !== 'normal' || !alphaEqual(produced, c.expected)) {
      return { total: task.cases.length, failure: { label: c.label, produced, end: r.end, reads: describeValue(produced), expected: c.expected } };
    }
  }
  return { total: task.cases.length, failure: null };
}

export const printFailure = (f: Failure) => `${f.label}: ${print(f.produced)} (${f.reads})`;
