import { bruteMinCut, kargerBound, PRESETS, repeat } from './karger';
import { meanAbsErrors, runCheckpoints, standardError } from './monteCarlo';
import { census, meanWitnessTries, rounds } from './primality';
import { graphOf, OPENING } from './presets';
import { expectedComparisons, fixedPivotWorst, median3Killer, quicksort, randomPivotCounts, shapeArray } from './sorting';

const SORT_N = OPENING.sort.n;
const sorted = shapeArray('sorted', SORT_N, OPENING.sort.seed);
const counts = randomPivotCounts(sorted, 1000, OPENING.sort.seed);
const killer = median3Killer(SORT_N);
const pi = runCheckpoints(OPENING.pi.seed).find((c) => c.n === 2 ** OPENING.pi.exponent)!;
const piMean = meanAbsErrors(OPENING.pi.seed);
const piAt = (n: number) => piMean.find((m) => m.n === n)!.error;
const mr = census(OPENING.primality.n, OPENING.primality.seed);
const mrRounds = rounds(OPENING.primality.n, OPENING.primality.rounds, OPENING.primality.seed);
const kargerGraph = graphOf(OPENING.karger.preset);
const kargerMin = bruteMinCut(kargerGraph);
const kargerBatch = repeat(kargerGraph, 1000, OPENING.karger.seed, kargerMin.size);
const expected = expectedComparisons(SORT_N);
const convertCounts = randomPivotCounts(shapeArray('random', SORT_N, OPENING.convert.seed), 1000, OPENING.convert.seed);
const overBudget = convertCounts.filter((c) => c > OPENING.convert.budget * expected).length / convertCounts.length;

/** Every number the try-this lines, key ideas and quiz quote, computed from the models the scenes use. */
export const FACTS = {
  sortN: SORT_N,
  firstOnSorted: quicksort(sorted, 'first').comparisons,
  firstWorst: fixedPivotWorst(SORT_N),
  medianOnSorted: quicksort(sorted, 'median3').comparisons,
  medianOnKiller: quicksort(killer, 'median3').comparisons,
  randomMean: Math.round(counts.reduce((s, c) => s + c, 0) / counts.length),
  randomOnKiller: Math.round(randomPivotCounts(killer, 1000, OPENING.sort.seed).reduce((s, c) => s + c, 0) / 1000),
  expected: Math.round(expected),
  piDarts: 2 ** OPENING.pi.exponent,
  piError: pi.error.toFixed(4),
  piSigma: standardError(2 ** OPENING.pi.exponent).toFixed(4),
  piRatio: (piAt(2 ** (OPENING.pi.exponent + 2)) / piAt(2 ** OPENING.pi.exponent)).toFixed(2),
  piMoreDarts: 2 ** (OPENING.pi.exponent + 2),
  mrN: String(OPENING.primality.n),
  mrLiars: mr.liars,
  mrBases: mr.bases,
  mrFermat: mr.fermat,
  mrRounds: mrRounds.length,
  mrWitness: mrRounds.some((r) => !r.passed),
  overBudget: (overBudget * 100).toFixed(1),
  huntMean: meanWitnessTries(OPENING.convert.n, 1000, OPENING.convert.seed).toFixed(2),
  kargerN: kargerGraph.n,
  kargerMin: kargerMin.size,
  kargerMinCuts: kargerMin.count,
  kargerBound: (kargerBound(kargerGraph.n) * 100).toFixed(1),
  kargerHits: kargerBatch.hits,
  kargerPercent: ((kargerBatch.hits / kargerBatch.runs) * 100).toFixed(1),
  presetCount: PRESETS.length,
};
