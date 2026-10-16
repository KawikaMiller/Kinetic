import { breakEven, countedBreakEven, tableStates, chainParenthesis, chainStateCounts, chainTable, greedyByRatio, isSubsequence, knapsackPrefixOnly, knapsackRolling, knapsackTable, lisEndingAt, lisTails, nominalStates, tourCount, tspBitmask, tspLastOnly, tspMaskOnly } from './dp';
import { distances, KNAPSACK_DEFAULT, LIS_DEFAULT, CHAIN_DEFAULT, TSP_DEFAULT } from './presets';

const { items, cap } = KNAPSACK_DEFAULT;
const lis = lisEndingAt(LIS_DEFAULT);
const tails = lisTails(LIS_DEFAULT);
const chain = chainTable(CHAIN_DEFAULT);
const chainRow = chainTable(CHAIN_DEFAULT, 'row');
const dist = distances(TSP_DEFAULT.n, TSP_DEFAULT.seed);
const tsp = tspBitmask(dist);
/** The Catalan number C(m): groupings of m + 1 matrices. */
function catalan(m: number): number {
  let c = 1;
  for (let k = 0; k < m; k++) c = (c * 2 * (2 * k + 1)) / (k + 2);
  return Math.round(c);
}
const finalTails = tails.steps[tails.steps.length - 1].tails;

/** Every number the try-this lines, key ideas and quiz quote, computed from the models the scenes use. */
export const FACTS = {
  knapsackExact: knapsackTable(items, cap)[items.length][cap],
  knapsackUnbounded: knapsackRolling(items, cap, 'up')[items.length][cap],
  knapsackGreedy: greedyByRatio(items, cap).value,
  knapsackPrefix: knapsackPrefixOnly(items, cap).at(-1)!.value,
  knapsackCap: cap,
  lisLength: lis.length,
  lisComparisons: lis.comparisons,
  lisProbes: tails.probes,
  lisTails: finalTails.join(', '),
  lisTailsAreSubsequence: isSubsequence(finalTails, LIS_DEFAULT),
  chainCost: chain.answer,
  chainGrouping: chainParenthesis(chain.split, 1, CHAIN_DEFAULT.length - 1),
  chainRowCost: chainRow.answer,
  chainRowUnfilled: chainRow.unfilledReads,
  chainCells: chainStateCounts(CHAIN_DEFAULT.length - 1).interval,
  chainGroupings: catalan(CHAIN_DEFAULT.length - 2),
  chainCellsWithSplit: chainStateCounts(CHAIN_DEFAULT.length - 1).withSplit,
  tspCities: TSP_DEFAULT.n,
  tspBest: tsp.best,
  tspMask: tspMaskOnly(dist).best,
  tspLast: tspLastOnly(dist).best,
  tspStates: tableStates(TSP_DEFAULT.n),
  tspNominal: nominalStates(TSP_DEFAULT.n),
  tspTours: tourCount(TSP_DEFAULT.n),
  breakEven: breakEven(20),
  countedBreakEven: countedBreakEven(20),
};
