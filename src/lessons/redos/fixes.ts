/** The defender's scene as a pure function: every control in, what a service would do with the request out. */
import { BUDGET, backtrackVisits, lazyDfaVisits, letters, nfaVisits, type Engine } from './engines';
import { anchored, patternById, type PatternId } from './patterns';

/** Budgets the segmented control offers: tight, middling, the lesson's own. */
export const BUDGETS = [10_000, 100_000, BUDGET] as const;

/** Bounds of the input-length cap control (characters, `!` included). */
export const CAP_MIN = 8;
export const CAP_MAX = 40;

/** The patterns the fixes scene can rewrite: the three that grow. */
export type RiskyId = Exclude<PatternId, 'linear'>;

export interface FixesState {
  pattern: RiskyId;
  /** Letters before the `!`. */
  letters: number;
  engine: Engine;
  /** Use the rewritten pattern with no overlap. */
  rewrite: boolean;
  capOn: boolean;
  /** Longest input (characters) the boundary accepts when the cap is on. */
  cap: number;
  /** The backtracking engine's budget; the other engines do not use it. */
  budget: number;
}

export type Verdict = 'answered' | 'cut-off' | 'refused';

export interface FixesOutcome {
  /** The pattern as run, with its anchors. */
  shown: string;
  /** Characters in the input. */
  length: number;
  verdict: Verdict;
  /** Visits spent (0 when the input was refused before any matching). */
  visits: number;
}

export function fixesOutcome(s: FixesState): FixesOutcome {
  const p = patternById(s.pattern);
  const source = s.rewrite ? p.rewrite : p.source;
  const subject = letters(s.letters);
  const base = { shown: anchored(source), length: subject.length };
  if (s.capOn && subject.length > s.cap) return { ...base, verdict: 'refused', visits: 0 };
  if (s.engine === 'backtracking') {
    const r = backtrackVisits(source, subject, s.budget);
    return { ...base, verdict: r.gaveUp ? 'cut-off' : 'answered', visits: r.visits };
  }
  const visits = s.engine === 'nfa' ? nfaVisits(source, subject).visits : lazyDfaVisits(source, subject).visits;
  return { ...base, verdict: 'answered', visits };
}

