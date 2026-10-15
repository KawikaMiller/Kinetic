/**
 * Menu predictors for the halting-problem lesson, the scoreboard against ground truth, and D:
 * the machine built from a predictor that does the opposite of what the predictor says about
 * D run on D, and is then actually run. Every predictor is a toy from a menu, and the theorem
 * is not about this menu: it says no program of any kind can do the job.
 */
import { runTm } from '../../core/tm';
import { D_HALTS, D_LOOPS, LIBRARY, probe, TRUTHS, truthFromProbe, type LibraryMachine, type Probe, type Truth } from './machines';

export type PredictorKind = 'budget' | 'cycle' | 'alwaysLoops' | 'alwaysHalts';
export type Verdict = 'HALTS' | 'LOOPS' | 'UNKNOWN';

export interface Predictor {
  kind: PredictorKind;
  /** Steps a `budget` predictor runs (the slider). */
  budget: number;
  /** May answer UNKNOWN instead of guessing (budget and cycle only). */
  allowUnknown: boolean;
}

export const BUDGET_RANGE = { min: 10, max: 500 } as const;
export const DEFAULT_BUDGET = 50;
/** A `cycle` predictor stops watching after this many steps and guesses LOOPS. */
export const CYCLE_GUESS_STEPS = 1000;

export const KIND_LABEL: Record<PredictorKind, string> = {
  budget: 'Run N steps',
  cycle: 'Watch for a repeat',
  alwaysLoops: 'Always LOOPS',
  alwaysHalts: 'Always HALTS',
};

/** Only these two have a limit to give up at, so only they can say UNKNOWN. */
export const canSayUnknown = (kind: PredictorKind) => kind === 'budget' || kind === 'cycle';
export const usesBudget = (kind: PredictorKind) => kind === 'budget';

/** The predictor with its hidden settings pinned: a control that is not shown never changes an answer. */
export function effective(p: Predictor): Predictor {
  return { kind: p.kind, budget: usesBudget(p.kind) ? p.budget : DEFAULT_BUDGET, allowUnknown: canSayUnknown(p.kind) && p.allowUnknown };
}

export type Basis = 'ran-to-halt' | 'repeat' | 'cutoff' | 'fixed';

export interface Answer {
  verdict: Verdict;
  basis: Basis;
  /** The limit the answer gave up at, for `cutoff`. */
  limit?: number;
  /** For `repeat`: the step where the configuration came back. */
  at?: number;
}

/** What a predictor says about running a machine on its input. */
export function predict(p: Predictor, m: LibraryMachine): Answer {
  const e = effective(p);
  if (e.kind === 'alwaysLoops') return { verdict: 'LOOPS', basis: 'fixed' };
  if (e.kind === 'alwaysHalts') return { verdict: 'HALTS', basis: 'fixed' };
  const limit = e.kind === 'budget' ? e.budget : CYCLE_GUESS_STEPS;
  const run = probe(m.tm, m.input, { maxSteps: limit, watchRepeats: e.kind === 'cycle' });
  return fromProbe(run, limit, e.allowUnknown);
}

function fromProbe(run: Probe, limit: number, allowUnknown: boolean): Answer {
  if (run.kind === 'halted') return { verdict: 'HALTS', basis: 'ran-to-halt' };
  if (run.kind === 'repeat') return { verdict: 'LOOPS', basis: 'repeat', at: run.at };
  return { verdict: allowUnknown ? 'UNKNOWN' : 'LOOPS', basis: 'cutoff', limit };
}

/**
 * What a simulating predictor says about D run on its own description. Simulating D means
 * simulating D's call to the predictor on D, which simulates D again: the nesting deepens
 * with every level, no configuration repeats and the simulation never finishes within a limit.
 */
export function predictSelf(p: Predictor): Answer {
  const e = effective(p);
  if (e.kind === 'alwaysLoops') return { verdict: 'LOOPS', basis: 'fixed' };
  if (e.kind === 'alwaysHalts') return { verdict: 'HALTS', basis: 'fixed' };
  const limit = e.kind === 'budget' ? e.budget : CYCLE_GUESS_STEPS;
  return fromProbe({ kind: 'cutoff', steps: limit }, limit, e.allowUnknown);
}

export type Outcome = 'right' | 'wrong' | 'unanswered';

export interface Row {
  id: string;
  name: string;
  truth: Truth;
  answer: Answer;
  outcome: Outcome;
}

const outcomeOf = (verdict: Verdict, truth: Truth): Outcome => {
  if (verdict === 'UNKNOWN') return 'unanswered';
  return (verdict === 'HALTS') === (truth.kind === 'halts') ? 'right' : 'wrong';
};

/** What D does after being told `verdict`, by running one of two real machines. */
export interface DRun {
  verdict: Verdict;
  action: 'halts at once' | 'repeats a configuration';
  probe: Probe;
  truth: Truth;
}

/** D: loop if the predictor says HALTS, otherwise halt at once. The chosen behaviour is executed, not asserted. */
export function runD(p: Predictor): DRun {
  const { verdict } = predictSelf(p);
  const loops = verdict === 'HALTS';
  const tm = loops ? D_LOOPS : D_HALTS;
  const run = probe(tm, '', { maxSteps: 50, watchRepeats: true });
  const truth = truthFromProbe(run);
  return { verdict, action: loops ? 'repeats a configuration' : 'halts at once', probe: run, truth };
}

export interface Scoreboard {
  rows: Row[];
  /** The ninth row: D run on its own description. */
  d: Row;
  right: number;
  wrong: number;
  unanswered: number;
  total: number;
}

export function scoreboard(p: Predictor): Scoreboard {
  const rows: Row[] = LIBRARY.map((m) => {
    const truth = TRUTHS.get(m.id)!;
    const answer = predict(p, m);
    return { id: m.id, name: m.name, truth, answer, outcome: outcomeOf(answer.verdict, truth) };
  });
  const d = runD(p);
  const dRow: Row = {
    id: 'd', name: 'D run on its own description', truth: d.truth, answer: predictSelf(p),
    outcome: outcomeOf(d.verdict, d.truth),
  };
  const all = [...rows, dRow];
  const count = (o: Outcome) => all.filter((r) => r.outcome === o).length;
  return { rows, d: dRow, right: count('right'), wrong: count('wrong'), unanswered: count('unanswered'), total: all.length };
}

/** The busy-beaver style facts about a halting library machine, from `runTm` (used for the optional tape run). */
export const stepsToHalt = (m: LibraryMachine, maxSteps: number) => runTm(m.tm, m.input, { maxSteps });
