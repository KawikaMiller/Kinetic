/** Captions and stat text, every number taken from the model on screen. Plain strings, so tests can read them. */
import { pct } from '../../core/format';
import {
  COUNTER_NAMES, PREDICTOR_LABELS, accuracy, missCount, totalCycles, type PredictorKind, type Step,
} from './predictor';
import type { LoopCost, Speculation } from './scenarios';

export const n = (v: number) => v.toLocaleString('en-US');
export const word = (taken: boolean) => (taken ? 'taken' : 'not taken');
const plural = (count: number, one: string, many = `${one}s`) => `${n(count)} ${count === 1 ? one : many}`;

/** What the predictor was looking at when it guessed. */
export function stateNote(step: Step): string {
  const s = step.before;
  switch (s.kind) {
    case 'static-taken': return 'always guesses taken';
    case 'static-not-taken': return 'always guesses not taken';
    case 'one-bit': return `the last outcome was ${word(s.last)}`;
    case 'two-bit': return `counter ${s.counter}, ${COUNTER_NAMES[s.counter]}`;
    case 'two-level': return `history ${historyText(s.history, s.bits)} picks counter ${s.table[s.history]}, ${COUNTER_NAMES[s.table[s.history]]}`;
  }
}

/** A history as T and N, oldest first. */
export const historyText = (history: number, bits: number) =>
  Array.from({ length: bits }, (_, i) => ((history >> (bits - 1 - i)) & 1 ? 'T' : 'N')).join('');

export interface LabTotals {
  branches: number;
  misses: number;
  instructions: number;
  cycles: number;
  accuracy: number;
  /** Instructions per cycle: 1 would be a pipeline that never loses a cycle. */
  ipc: number;
}

export function labTotals(steps: readonly Step[], penalty: number, every: number): LabTotals {
  const misses = missCount(steps);
  const instructions = steps.length * every;
  const cycles = totalCycles(instructions, misses, penalty);
  return { branches: steps.length, misses, instructions, cycles, accuracy: accuracy(steps), ipc: cycles === 0 ? 1 : instructions / cycles };
}

export function stepCaption(step: Step, penalty: number, totals: LabTotals): string {
  const verdict = step.hit ? 'hit, nothing lost' : `miss, ${n(penalty)} cycles lost`;
  return `Branch ${n(step.index + 1)}: the predictor (${stateNote(step)}) guessed ${word(step.guess)}; the branch was ${word(step.taken)}: ${verdict}. So far ${plural(totals.misses, 'miss', 'misses')} in ${n(totals.branches)}, ${n(totals.cycles)} cycles.`;
}

export const labIntro = (kind: PredictorKind, branches: number) =>
  `${PREDICTOR_LABELS[kind]} on a stream of ${n(branches)} branches. Press play or step: each branch shows the guess, the outcome, and what a miss costs.`;

/** The sorted-versus-unsorted scene's one-sentence reading of the current setting. */
export function sortedCaption(order: 'sorted' | 'unsorted', cost: LoopCost, penalty: number): string {
  if (cost.branchless) {
    return `Branchless: the select is done with arithmetic, so there is no data-dependent branch to guess. ${n(cost.instructions)} instructions, 0 misses, ${n(cost.cycles)} cycles, whatever the data order.`;
  }
  const shape = `${n(cost.taken)} of ${n(cost.iterations)} branches are taken and the outcome changes ${plural(cost.transitions, 'time')}`;
  return `${order === 'sorted' ? 'Sorted' : 'Unsorted'} data: ${shape}, so the predictor misses ${n(cost.misses)} of ${n(cost.iterations)} branches (${pct(cost.misses / cost.iterations)}) and the loop takes ${n(cost.cycles)} cycles: ${n(cost.instructions)} instructions plus ${n(cost.misses)} x ${n(penalty)}.`;
}

export function speculationCaption(s: Speculation): string {
  if (s.guessRight) {
    return `Right guess: the CPU ran ahead on it, ${plural(s.inFlightYounger, 'younger instruction')} ${s.inFlightYounger === 1 ? 'is' : 'are'} in flight when the branch resolves at stage ${n(s.depth)}, and every one of them is kept. Nothing is lost.`;
  }
  return `Wrong guess: ${plural(s.inFlightYounger, 'younger instruction')} fetched down the guessed path ${s.inFlightYounger === 1 ? 'is' : 'are'} flushed when the branch resolves at stage ${n(s.depth)}: ${n(s.lostCycles)} fetch cycles spent on discarded work. Discarded work can still leave traces in shared structures such as caches.`;
}
