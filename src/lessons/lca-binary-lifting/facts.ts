import { PATH_SIZES, SHORT_TABLE_WITNESS, T0_PARENTS, brokenReport, buildTable, kthAncestor, lca, levelsFor, naiveLca, pathStats } from './model';

const table = buildTable(T0_PARENTS);
const run108 = lca(table, 10, 8);
const run1011 = lca(table, 10, 11);
const kth = kthAncestor(table, 10, 5)!;
const path = PATH_SIZES.map((n) => pathStats(n));
const broken = brokenReport(7);
const { parents, query } = SHORT_TABLE_WITNESS;

/** The numbers the default tree T0 and the path sizes put in the summary, try-this and quiz. All come from the model. */
export const FACTS = {
  nodes: T0_PARENTS.length,
  levels: table.levels,
  entries: T0_PARENTS.length * table.levels,
  level1: table.up[1].join(', '),
  level2: table.up[2].join(', '),
  liftTo: run108.lift[0].to,
  answer108: run108.answer,
  jumps108: run108.jumps,
  steps108: naiveLca(T0_PARENTS, 10, 8).steps,
  answer1011: run1011.answer,
  jumps1011: run1011.jumps,
  kthAnswer: kth.node,
  kthJumps: kth.jumps.length,
  millionLevels: levelsFor(1_000_000),
  path1024Jumps: path[3].jumps,
  path1024Steps: path[3].steps,
  path1024Entries: path[3].entries,
  path16Jumps: path[0].jumps,
  path16Steps: path[0].steps,
  trees: broken.trees,
  shortFails: broken.shortFails,
  noEqualiseFails: broken.noEqualiseFails,
  witnessParents: parents.join(', '),
  witnessQuery: query.join(', '),
};
