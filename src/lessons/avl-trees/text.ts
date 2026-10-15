import { plural } from '../../core/format';
import { CORRECT_CHOICE, balanceOf, type Case, type Choice, type PickOutcome, type PickState, type Rotation } from './model';

/** The signed balance factor as the badges and captions write it: +1, 0, −1. */
export const signed = (bf: number): string => (bf > 0 ? `+${bf}` : bf < 0 ? `−${-bf}` : '0');

export const CASE_NAME: Record<Case, string> = { LL: 'left-left', RR: 'right-right', LR: 'left-right', RL: 'right-left' };

/** What repairs each case, in words. */
export const CASE_FIX: Record<Case, string> = {
  LL: 'one right rotation',
  RR: 'one left rotation',
  LR: 'a left rotation on the child, then a right rotation',
  RL: 'a right rotation on the child, then a left rotation',
};

export const CHOICE_LABEL: Record<Choice, string> = {
  right: 'Rotate right',
  left: 'Rotate left',
  'left-right': 'Left, then right',
  'right-left': 'Right, then left',
};

/** The case each button is the textbook repair for. */
const CASE_OF_CHOICE = Object.fromEntries(Object.entries(CORRECT_CHOICE).map(([c, choice]) => [choice, c])) as Record<Choice, Case>;

export const rotationText = (r: Rotation): string => `${r.kind} rotation at ${r.down}`;
export const rotationCount = (n: number): string => plural(n, 'rotation');
export const fixCount = (n: number): string => plural(n, 'fix', 'fixes');

/** Scene 1: the two trees built from the same keys. */
export function compareCaption(f: { n: number; plainHeight: number; avlHeight: number; best: number; rotations: number }): string {
  const verdict =
    f.plainHeight === f.avlHeight
      ? 'This order did not hurt the plain tree: rotations earn their keep on lopsided orders.'
      : `That is ${plural(f.plainHeight - f.avlHeight, 'level')} more in the plain tree for the same keys.`;
  return `The same ${plural(f.n, 'key')} went into both trees, in the order given. The plain tree is ${plural(f.plainHeight, 'level')} tall; the AVL tree is ${f.avlHeight} (the best any tree of ${plural(f.n, 'node')} can do is ${f.best}) after ${rotationCount(f.rotations)}. ${verdict}`;
}

/** Scene 3: what the learner is looking at, from the stopped state and the last button pressed. */
export function pickCaption(state: PickState, attempt: { choice: Choice; outcome: PickOutcome } | null): string {
  const bf = balanceOf(state.tree, state.at);
  if (!attempt) {
    return `Inserting ${state.key} left ${state.at} out of balance (balance factor ${signed(bf)}). Pick the rotation that repairs it. A wrong pick is applied honestly, and you can undo it.`;
  }
  const { choice, outcome } = attempt;
  if (!outcome.applied) return `${CHOICE_LABEL[choice]} cannot be done: ${outcome.refusal}. Nothing changed.`;
  if (outcome.valid) {
    return `${CHOICE_LABEL[choice]} repairs the ${CASE_NAME[state.case]} case: every balance factor is inside −1 to +1 again, and the in-order keys have not moved.`;
  }
  const bad = outcome.unbalanced.map((k) => `${k} (${signed(balanceOf(outcome.tree, k))})`).join(', ');
  const swapped = outcome.unbalanced.some((k) => Math.sign(balanceOf(outcome.tree, k)) === -Math.sign(bf));
  const why = swapped
    ? `A single rotation on a ${CASE_NAME[state.case]} case just swaps which side is heavy.`
    : `${CHOICE_LABEL[choice]} is the repair for the ${CASE_NAME[CASE_OF_CHOICE[choice]]} case; this one is ${CASE_NAME[state.case]}.`;
  return `${CHOICE_LABEL[choice]} was applied honestly, and the tree is still out of balance at ${bad}. ${why}`;
}

/** Scene 5: the thinnest AVL tree of a height against the shortest tree with as many nodes. */
export function worstCaption(f: { height: number; nodes: number; shortest: number }): string {
  return f.shortest === f.height
    ? `The thinnest AVL tree of height ${f.height} has ${plural(f.nodes, 'node')}, and ${plural(f.nodes, 'node')} could not be shorter than ${f.shortest}: the two trees have the same height here.`
    : `The thinnest AVL tree of height ${f.height} has only ${plural(f.nodes, 'node')}; a perfectly packed tree of ${plural(f.nodes, 'node')} is just ${f.shortest} tall. AVL allows ${plural(f.height - f.shortest, 'extra level')} for the same keys.`;
}
