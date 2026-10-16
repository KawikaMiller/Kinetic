/** The numbers the try-this entries and the quiz quote, computed from each scene's opening state by the models the scenes draw. */
import { labTotals } from './captions';
import { missCount, run, type PredictorKind } from './predictor';
import { LAB_LENGTH, PATTERN_PRESETS, labOpening, labOutcomes, loopConfig, loopCost, sortedOpening, speculation, speculationOpening } from './scenarios';

const preset = (id: string) => PATTERN_PRESETS.find((p) => p.id === id)!.pattern;

/** Misses over the whole 64-branch lab run, from the lab's opening settings with one thing changed. */
function labMisses(kind: PredictorKind, patternId: string, initialCounter = labOpening().initialCounter): number {
  const open = labOpening();
  const outcomes = labOutcomes({ kind: 'pattern', pattern: preset(patternId) });
  return missCount(run({ kind, initialCounter, historyBits: open.historyBits }, outcomes));
}

export function labFacts() {
  const open = labOpening();
  const loop = labOutcomes(open.source);
  const totals = labTotals(run({ kind: open.kind, initialCounter: open.initialCounter, historyBits: open.historyBits }, loop), open.penalty, open.every);
  return {
    branches: LAB_LENGTH,
    loopTwoBit: labMisses('two-bit', 'loop'),
    loopOneBit: labMisses('one-bit', 'loop'),
    loopCycles: totals.cycles,
    altTwoBitWeak: labMisses('two-bit', 'alternating', 1),
    altTwoBitDefault: labMisses('two-bit', 'alternating', 2),
    altOneBit: labMisses('one-bit', 'alternating', 1),
    pairsOneBit: labMisses('one-bit', 'pairs'),
    pairsTwoBit: labMisses('two-bit', 'pairs'),
  };
}

export function sortedFacts() {
  const open = sortedOpening();
  const cfg = loopConfig(open.kind);
  const unsorted = loopCost('unsorted', cfg, open.penalty, false);
  const sorted = loopCost('sorted', cfg, open.penalty, false);
  const branchless = loopCost('unsorted', cfg, open.penalty, true);
  return {
    penalty: open.penalty,
    unsortedMisses: unsorted.misses,
    sortedMisses: sorted.misses,
    unsortedCycles: unsorted.cycles,
    sortedCycles: sorted.cycles,
    branchlessCycles: branchless.cycles,
    iterations: unsorted.iterations,
    unsortedTransitions: unsorted.transitions,
    sortedTransitions: sorted.transitions,
  };
}

export function speculationFacts() {
  const open = speculationOpening();
  const deep = 15;
  return {
    depth: open.depth,
    flushed: speculation(open.depth, false).flushed,
    deep,
    deepFlushed: speculation(deep, false).flushed,
    deepLost: speculation(deep, false).lostCycles,
  };
}
