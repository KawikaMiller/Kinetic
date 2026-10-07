import { hash32 } from '../../core/hash';
import { isProbablePrime, trialFactor } from '../../core/numberTheory';
import type { TruthRow } from '../../core/truth';

/**
 * The proof builder's data model. Each claim offers every technique either as a script
 * (one line at a time, a fixed menu of candidate steps, exactly one acceptable per line)
 * or as a stall: the honest reason this route doesn't work here.
 */

export type Technique = 'direct' | 'contrapositive' | 'contradiction' | 'counterexample';
export const TECHNIQUES: readonly Technique[] = ['direct', 'contrapositive', 'contradiction', 'counterexample'];
export const TECHNIQUE_NAMES: Record<Technique, string> = {
  direct: 'Direct',
  contrapositive: 'Contrapositive',
  contradiction: 'Contradiction',
  counterexample: 'Counterexample',
};

/** What a line does in the proof, for its colour: an assumption, an ordinary step, the clash. */
export type LineRole = 'assume' | 'step' | 'clash' | 'conclude';

export interface Candidate {
  text: string;
  ok: boolean;
  /** For the accepted step: its justification. For a rejected one: why it's wrong. */
  reason: string;
}

export interface ProofLine {
  role: LineRole;
  candidates: readonly Candidate[];
}

export interface Script {
  kind: 'script';
  lines: readonly ProofLine[];
}

export interface Stall {
  kind: 'stall';
  /** Lines that do follow, shown before the point where the route gets stuck. */
  prefix: readonly string[];
  /** Why it's stuck, and what to try instead. */
  why: string;
}

export type Route = Script | Stall;

/** The propositional shape a technique relies on, re-read as a truth-table equivalence. */
export type Reading = 'implies' | 'contrapositive' | 'contradiction' | 'refute';

export interface Claim {
  id: string;
  label: string;
  statement: string;
  /** What p and q stand for in this claim's propositional reading. */
  p: string;
  q?: string;
  routes: Record<Technique, Route>;
}

export const READING_OF: Record<Technique, Reading> = {
  direct: 'implies',
  contrapositive: 'contrapositive',
  contradiction: 'contradiction',
  counterexample: 'refute',
};

/** The accepted candidate of a line (the data test proves there's exactly one). */
export const accepted = (line: ProofLine): Candidate => line.candidates.find((c) => c.ok)!;

/* ---------- propositional forms, as functions of a truth-table row ---------- */

const implies = (a: boolean, b: boolean) => !a || b;
const FALSUM = false;

export interface FormColumn {
  label: string;
  fn: (r: TruthRow) => boolean;
}

/**
 * The columns a technique's truth table shows. Direct: p → q alone (false only when p
 * holds and q fails, the one case the proof rules out). Contrapositive and contradiction:
 * the form proved, then the claim, which agree on every row.
 */
export const FORMS: Record<Exclude<Reading, 'refute'>, { vars: string[]; columns: FormColumn[] }> = {
  implies: { vars: ['p', 'q'], columns: [{ label: 'p → q', fn: (r) => implies(r.p, r.q) }] },
  contrapositive: {
    vars: ['p', 'q'],
    columns: [
      { label: '¬q → ¬p', fn: (r) => implies(!r.q, !r.p) },
      { label: 'p → q', fn: (r) => implies(r.p, r.q) },
    ],
  },
  contradiction: {
    vars: ['p'],
    columns: [
      { label: '¬p → ⊥', fn: (r) => implies(!r.p, FALSUM) },
      { label: 'p', fn: (r) => r.p },
    ],
  },
};

/* ---------- the counterexample hunt: Euler's n² + n + 41 ---------- */

export const EULER_MAX_N = 59;
export const euler = (n: number) => n * n + n + 41;

export interface EulerCheck {
  n: number;
  value: number;
  prime: boolean;
  /** Prime factors, smallest first (one entry when prime). */
  factors: number[];
}

export function checkEuler(n: number): EulerCheck {
  const value = euler(n);
  const prime = isProbablePrime(BigInt(value)).prime;
  return { n, value, prime, factors: trialFactor(BigInt(value)).factors.map(Number) };
}

/** The first n ≥ 0 where n² + n + 41 isn't prime. */
export function firstFailure(limit = EULER_MAX_N): number | null {
  for (let n = 0; n <= limit; n++) if (!checkEuler(n).prime) return n;
  return null;
}

/**
 * The order a line's chips are shown in: a fixed shuffle by a hash of each step's text, so
 * the accepted step isn't always first (the data lists it first) and the order never moves.
 */
export const displayOrder = (line: ProofLine): number[] =>
  line.candidates.map((c, i) => ({ i, h: hash32(c.text) })).sort((a, b) => a.h - b.h).map((x) => x.i);
