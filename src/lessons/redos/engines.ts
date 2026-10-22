/**
 * What the three kinds of engine cost on a lesson pattern, counted in one unit: a VISIT is one (part of the
 * pattern, position in the text) pair examined, repeats counted. For the backtracking matcher a visit is one
 * attempt of one pattern part at one position; for the NFA simulation it is one state read at one position;
 * for a lazy DFA it is one table lookup per character plus the NFA states inside each DFA state the first time
 * it is built. Visits are counted, never timed: they say nothing about the speed of a real engine.
 */
import { LINE_TERMINATORS, matchAt, runNfa } from '../../core/regex';
import { subsetName } from '../../core/automata';
import { machineOf, parsedOf } from './patterns';

/** The backtracking matcher's budget: past it the stage says it gave up, never that it hangs. */
export const BUDGET = 2_000_000;

/** The longest text a learner can type, and the longest run of letters the sliders offer. */
export const MAX_TEXT_CHARS = 40;
export const MAX_LETTERS = MAX_TEXT_CHARS - 1;

export type Engine = 'backtracking' | 'nfa' | 'lazy-dfa';

export interface BacktrackVisits {
  /** Visits counted (the budget when it was reached). */
  visits: number;
  gaveUp: boolean;
  matched: boolean;
}

/** n letters `a` followed by `!`: the failing input shape every scene uses. */
export const letters = (n: number): string[] => [...'a'.repeat(n), '!'];

/** Past this many cached runs (typed text can make many) the cache starts over. */
const CACHE_LIMIT = 400;
const runCache = new Map<string, BacktrackVisits>();

/** The backtracking matcher on `subject`, full match, with its budget. Cached by pattern, subject and budget. */
export function backtrackVisits(source: string, subject: readonly string[], budget = BUDGET): BacktrackVisits {
  const key = `${source}\u0000${subject.join('')}\u0000${budget}`;
  const hit = runCache.get(key);
  if (hit) return hit;
  const r = matchAt(parsedOf(source).root, subject, 0, { budget, mustEnd: true });
  const result = { visits: r.steps, gaveUp: r.status === 'budget', matched: r.status === 'match' };
  if (runCache.size >= CACHE_LIMIT) runCache.clear();
  runCache.set(key, result);
  return result;
}

/** The Thompson NFA simulation: states read while reading the whole text. */
export function nfaVisits(source: string, subject: readonly string[]): { visits: number; matched: boolean } {
  const run = runNfa(machineOf(source), subject, 'full');
  return { visits: run.work, matched: run.accepted };
}

/** A lazy DFA: one lookup per character, plus the size of each DFA state when it is first built (then cached). */
export function lazyDfaVisits(source: string, subject: readonly string[]): { visits: number; matched: boolean; statesBuilt: number } {
  const run = runNfa(machineOf(source), subject, 'full');
  const built = new Set<string>();
  let visits = subject.length;
  for (const set of run.sets) {
    const name = subsetName(set);
    if (!built.has(name)) {
      built.add(name);
      visits += set.length;
    }
  }
  return { visits, matched: run.accepted, statesBuilt: built.size };
}

export interface Point {
  n: number;
  visits: number;
  gaveUp: boolean;
}

/** Backtracking visits on n letters then `!`, for n = from..to. */
export function growthSeries(source: string, from: number, to: number): Point[] {
  return Array.from({ length: to - from + 1 }, (_, i) => {
    const n = from + i;
    const r = backtrackVisits(source, letters(n));
    return { n, visits: r.visits, gaveUp: r.gaveUp };
  });
}

export type TextParse = { ok: true; value: string[] } | { ok: false; error: string };

/** The learner's text, as characters: at most MAX_TEXT_CHARS, no line breaks, refused with the position that is wrong. */
export function parseText(text: string): TextParse {
  const chars = [...text];
  if (chars.length > MAX_TEXT_CHARS) return { ok: false, error: `Position ${MAX_TEXT_CHARS + 1}: the text is limited to ${MAX_TEXT_CHARS} characters.` };
  const lineBreak = chars.findIndex((c) => LINE_TERMINATORS.has(c));
  if (lineBreak >= 0) return { ok: false, error: `Position ${lineBreak + 1}: line breaks are not allowed here.` };
  return { ok: true, value: chars };
}
