import { COMPARE_SEED, compareRuns } from './compare';
import { rbFrames } from './frames';
import { buildRb, checkRules, groupsOf, heightOf, insertKey, recolor, shortestPath, blackHeights, type FixCase, type RbStep } from './model';
import { DELETE_DEFAULT_KEY, RULES_KEYS, deleteBase, insertStart } from './presets';

/** Every number the lesson's text quotes, measured from the model once. */
const rules = buildRb(RULES_KEYS).tree;
const flipped = recolor(rules, 5);
const flippedRules = checkRules(flipped);

const caseSequence = (steps: readonly RbStep[]): FixCase[] => steps.flatMap((s) => (s.kind === 'violation' || s.kind === 'fix' ? [s.case] : []));

const uncle = insertStart('uncle-red', 0);
const uncleRun = rbFrames(uncle.base, 'insert', uncle.key);
const zig = insertStart('zigzag', 0);
const zigRun = rbFrames(zig.base, 'insert', zig.key);
const del = rbFrames(deleteBase(), 'delete', DELETE_DEFAULT_KEY);
const delRed = rbFrames(deleteBase(), 'delete', 12);
const sorted15 = buildRb(Array.from({ length: 15 }, (_, i) => i + 1)).tree;
const groups = groupsOf(sorted15);
const insert16 = insertKey(sorted15, 16, { record: true });
const random = compareRuns('random', COMPARE_SEED);
const sorted = compareRuns('sorted', COMPARE_SEED);
const last = random.n.length - 1;

const lastFrame = <T extends { rotations: number; recolors: number }>(frames: T[]) => frames[frames.length - 1];

export const FACTS = {
  rulesNodes: Object.keys(rules.nodes).length,
  rulesBlackHeight: blackHeights(rules).get(rules.root) as number,
  rulesLongest: heightOf(rules),
  rulesShortest: shortestPath(rules),
  flipDetail3: flippedRules[2].detail as string,
  flipDetail4: flippedRules[3].detail as string,
  uncleKey: uncle.key,
  uncleCases: caseSequence(uncleRun.result.steps),
  uncleRotations: lastFrame(uncleRun.frames).rotations,
  uncleRecolors: lastFrame(uncleRun.frames).recolors,
  zigKey: zig.key,
  zigCases: caseSequence(zigRun.result.steps),
  zigRotations: lastFrame(zigRun.frames).rotations,
  zigRecolors: lastFrame(zigRun.frames).recolors,
  deleteKey: DELETE_DEFAULT_KEY,
  deleteCases: caseSequence(del.result.steps),
  deleteRotations: lastFrame(del.frames).rotations,
  deleteRecolors: lastFrame(del.frames).recolors,
  redLeafFixes: caseSequence(delRed.result.steps).length,
  redLeafRecolors: lastFrame(delRed.frames).recolors,
  twos: groups.filter((g) => g.keys.length === 1).length,
  threes: groups.filter((g) => g.keys.length === 2).length,
  fours: groups.filter((g) => g.keys.length === 3).length,
  leafDepth: groups.filter((g) => g.children.length === 0)[0].depth,
  splits16: insert16.steps.filter((s) => s.kind === 'violation' && s.case === 'uncle-red').length,
  rotations16: insert16.rotations.length,
  seed: COMPARE_SEED,
  randomRbHeight: random.rbHeight[last],
  randomAvlHeight: random.avlHeight[last],
  randomRbInsertMean: random.rb.insert.meanRotations,
  randomAvlInsertMean: random.avl.insert.meanRotations,
  rbDeleteMax: random.rb.remove.maxRotations,
  avlDeleteMax: random.avl.remove.maxRotations,
  rbInsertMax: random.rb.insert.maxRotations,
  sortedRbHeight: sorted.rbHeight[sorted.n.length - 1],
  sortedAvlHeight: sorted.avlHeight[sorted.n.length - 1],
  bound: 2 * Math.log2(1023 + 1),
};
