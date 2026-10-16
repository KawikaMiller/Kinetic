/** Scene 1: the four-word worked corpus, merged one pair at a time, by the greedy rule or by the learner's own choice. */
import { applyMerge, bestPair, initialState, pairKey, totalSymbols, trainMerges, type BpeState, type Pair, type PairCount } from './bpe';
import { CLASSIC_WORDS } from './corpus';

export const TOP_PAIRS = 5;
export const MAX_PATH = 24;

export const classicStart = (): BpeState => initialState(CLASSIC_WORDS, 'chars');

/** The state after merging `path` in order (every pair must exist when its turn comes). */
export function stateAfter(path: readonly Pair[]): BpeState {
  return path.reduce(applyMerge, classicStart());
}

/** What one chosen merge did next to the greedy one at the same moment. */
export interface StepReport {
  picked: Pair;
  /** Occurrences of the picked pair when it was merged. */
  pickedCount: number;
  /** Symbols the merge removed from the corpus (an occurrence merged away removes one symbol). */
  removed: number;
  /** The greedy choice at that moment, and the symbols it would have removed. */
  greedy: PairCount;
  greedyRemoved: number;
  isGreedy: boolean;
}

export function stepReports(path: readonly Pair[]): StepReport[] {
  const reports: StepReport[] = [];
  let state = classicStart();
  for (const picked of path) {
    const before = totalSymbols(state);
    const greedy = bestPair(state)!;
    const pickedCount = state.counts.get(pairKey(picked)) ?? 0;
    const next = applyMerge(state, picked);
    reports.push({
      picked,
      pickedCount,
      removed: before - totalSymbols(next),
      greedy,
      greedyRemoved: before - totalSymbols(applyMerge(state, greedy)),
      isGreedy: pairKey(picked) === pairKey(greedy),
    });
    state = next;
  }
  return reports;
}

/** Total corpus symbols after the same number of merges when every merge is the greedy one. */
export function greedyTotal(steps: number): number {
  return trainMerges(CLASSIC_WORDS, 'chars', steps).totals.at(-1)!;
}

/** The pair that the greedy rule picks next from this state, or null when no pair is left. */
export const nextGreedy = (state: BpeState): PairCount | null => bestPair(state);
