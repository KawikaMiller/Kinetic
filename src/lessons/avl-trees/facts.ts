import { opFrames } from './frames';
import { applyChoice, stopAtImbalance } from './model';
import { balanceOf, buildAvl, buildBalanced, buildBst, fibonacciSize, fibonacciTree, heightOf, inOrder } from '../../core/avl';
import { DELETE_DEFAULT_KEY, FIB_DEFAULT_HEIGHT, PICK_DEFAULT, REPAIR_DEFAULT, SORTED_KEYS, ZIGZAG_KEYS, caseBase, casePreset, deleteBase } from './presets';

/** Every number the lesson's text quotes, measured from the model once. */
const sorted = buildAvl(SORTED_KEYS);
const zigzag = buildAvl(ZIGZAG_KEYS);
const repairPreset = casePreset(REPAIR_DEFAULT);
const repair = opFrames(caseBase(REPAIR_DEFAULT), 'insert', repairPreset.key);
const repairLast = repair.frames[repair.frames.length - 1];
const pickPreset = casePreset(PICK_DEFAULT);
const pickState = stopAtImbalance(caseBase(PICK_DEFAULT), pickPreset.key)!;
const pickWrong = applyChoice(pickState, 'right');
const pickRight = applyChoice(pickState, 'left-right');
const thinDelete = opFrames(deleteBase(), 'delete', DELETE_DEFAULT_KEY).frames;
const thinDeleteLast = thinDelete[thinDelete.length - 1];
const fibNodes = fibonacciSize(FIB_DEFAULT_HEIGHT);

export const FACTS = {
  sortedCount: SORTED_KEYS.length,
  plainSortedHeight: heightOf(buildBst(SORTED_KEYS)),
  avlSortedHeight: heightOf(sorted.tree),
  avlSortedRotations: sorted.rotations,
  zigzagPlainHeight: heightOf(buildBst(ZIGZAG_KEYS)),
  zigzagRotations: zigzag.rotations,
  zigzagRoot: zigzag.tree.root as number,
  zigzagHeight: heightOf(zigzag.tree),
  repairKey: repairPreset.key,
  repairRotations: repairLast.rotations,
  repairFixes: repairLast.fixes,
  repairAt: repair.result.steps.find((s) => s.kind === 'unbalanced') as { at: number; case: string },
  pickKey: pickPreset.key,
  pickAt: pickState.at,
  pickBf: balanceOf(pickState.tree, pickState.at),
  pickWrongRoot: pickWrong.tree.root as number,
  pickWrongBf: balanceOf(pickWrong.tree, pickWrong.tree.root as number),
  pickRightValid: pickRight.valid,
  pickInOrderSame: inOrder(pickRight.tree).join() === inOrder(pickState.tree).join(),
  deleteKey: DELETE_DEFAULT_KEY,
  deleteHeight: heightOf(deleteBase()),
  deleteNodes: fibonacciSize(heightOf(deleteBase())),
  deleteRotations: thinDeleteLast.rotations,
  deleteFixes: thinDeleteLast.fixes,
  fibHeight: FIB_DEFAULT_HEIGHT,
  fibNodes,
  fibPackedHeight: heightOf(buildBalanced(inOrder(fibonacciTree(FIB_DEFAULT_HEIGHT)))),
};
