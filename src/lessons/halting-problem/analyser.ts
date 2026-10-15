/**
 * A sound but incomplete analyser, the kind that real static analysers resemble: it answers
 * yes (halts) when a run reaches a halting state within its limit, no (loops) when a run
 * repeats a configuration, and maybe otherwise. Its yes and no answers rest on a run, so they
 * are right; the price is the maybes.
 */
import { LIBRARY, probe, TRUTHS, type LibraryMachine, type Truth } from './machines';

export interface AnalyserRow {
  id: string;
  name: string;
  verdict: 'yes' | 'no' | 'maybe';
  truth: Truth;
}

export const ANALYSER_RANGE = { min: 10, max: 500 } as const;
export const DEFAULT_ANALYSER_LIMIT = 50;

export function analyse(m: LibraryMachine, limit: number): AnalyserRow {
  const run = probe(m.tm, m.input, { maxSteps: limit, watchRepeats: true });
  const verdict = run.kind === 'halted' ? 'yes' : run.kind === 'repeat' ? 'no' : 'maybe';
  return { id: m.id, name: m.name, verdict, truth: TRUTHS.get(m.id)! };
}

export const analyseAll = (limit: number): AnalyserRow[] => LIBRARY.map((m) => analyse(m, limit));
