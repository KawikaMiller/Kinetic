import type { LessonModule } from '../../core/types';
import { FACTS as F } from './facts';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'An AVL tree is a search tree that rotates a few nodes after each insert or delete so that no node leans more than one level, which keeps the height near log n instead of letting it grow into a chain.',
    what: `A plain binary search tree built from sorted keys is a linked list: the keys 1 to ${F.sortedCount} give a tree ${F.plainSortedHeight} levels tall. An AVL tree stores each node's balance factor, the height of its right subtree minus the height of its left, and keeps it between −1 and +1. When an insert or delete pushes a node to ±2, a rotation (or two) re-hangs a few nodes so the tree is balanced again. A rotation changes who is the parent of whom, never the left-to-right order of the keys, so the tree stays a valid search tree. The same ${F.sortedCount} sorted keys end ${F.avlSortedHeight} levels tall after ${F.avlSortedRotations} rotations.`,
    analogy: 'A shelf of books on a balance beam: when one side gets too heavy you do not re-sort the books, you slide a few of them across the pivot until the beam sits level, and the order along the beam never changes.',
    useCases: [
      'Ordered maps and sets that must stay fast for any insertion order',
      'Indexes in memory where lookups far outnumber updates, since AVL trees are the more tightly balanced choice',
      'Interview staples: rotations are the building block behind red-black trees and treaps too',
      'A reason to prefer a balanced tree over a plain one whenever the input arrives sorted or nearly sorted',
    ],
    why: 'Knowing why a plain search tree degrades, and that a handful of local rotations repair it, explains the guarantees behind the ordered maps you use daily and lets you reason about what an insert or delete costs.',
    watch: 'A node is a circle with its key inside and its balance factor (height of right minus height of left) written under it. Blue is the node being looked at or the walk down, green means checked and inside the rule, red means out of balance, and violet marks the two nodes a rotation just moved. In the first scene the deepest path is red in the plain tree and green in the AVL tree. The small z, y, x and T1 to T4 sketch shows the case being repaired, with z as the red node and the triangles as whole subtrees.',
  },
  tryThis: [
    `In Plain vs AVL, with Sorted 1 to ${F.sortedCount} (the default): the plain tree is ${F.plainSortedHeight} levels tall, a chain, while the AVL tree is ${F.avlSortedHeight} levels after ${F.avlSortedRotations} rotations. Then press Zig-zag 30, 10, 20: the plain tree is ${F.zigzagPlainHeight} levels, and the AVL tree needs ${F.zigzagRotations} rotations (one double rotation) and ends with ${F.zigzagRoot} on top, ${F.zigzagHeight} levels tall.`,
    `In Step the repair, press play on the default (insert ${F.repairKey}): ${F.repairAt.at} goes out of balance, one rotation fixes it (${F.repairRotations} rotation, ${F.repairFixes} fix), and the checked nodes turn green.`,
    `In You pick the rotation, Puzzle 3 (the default): press Rotate right and the tree is still out of balance, with ${F.pickWrongRoot} now at ${F.pickWrongBf > 0 ? '+' : ''}${F.pickWrongBf}; press Undo, then Left, then right, and the tree is a valid AVL tree again.`,
    `In Delete and the cost, press play on the default (delete ${F.deleteKey} from the thinnest tree of height ${F.deleteHeight}): the delete needs ${F.deleteRotations} rotations across ${F.deleteFixes} ancestors, where an insert needs one repair at the very most.`,
    `In The worst case, at height ${F.fibHeight} (the default): the thinnest AVL tree has ${F.fibNodes} nodes, while a packed tree of ${F.fibNodes} nodes is only ${F.fibPackedHeight} levels tall.`,
  ],
  keyIdeas: [
    'A rotation changes who is the parent of whom and leaves the in-order sequence of keys alone, so the tree is still a search tree afterwards: nothing is re-sorted or rebuilt.',
    `An AVL tree keeps each balance factor between −1 and +1: the keys 1 to ${F.sortedCount} inserted in order end ${F.avlSortedHeight} levels tall in an AVL tree and ${F.plainSortedHeight} in a plain one.`,
    'Left-left and right-right are repaired by one rotation, left-right and right-left by two; a single rotation on a double case just swaps which side is heavy.',
    'An insert needs no more than one repair (one single or one double rotation), while a delete can need a repair at several ancestors on the way up; the height stays under about 1.44 log2(n + 2), a classic bound quoted from memory.',
  ],
  quiz: [
    {
      q: 'A node is rotated to repair an AVL tree. What does the rotation leave unchanged?',
      options: [
        'The left-to-right order of the keys, which stays sorted',
        'Which node is the parent of which, apart from the two moved',
        'The heights stored on the nodes that were rotated',
        'The node that sits at the root of the whole tree',
      ],
      answer: 0,
      why: 'A rotation re-hangs a node and one of its children, so parents, stored heights and sometimes the root change. What it cannot change is the in-order sequence, which is why the tree is still a valid search tree afterwards without any sorting.',
    },
    {
      q: `After inserting ${F.pickKey}, node ${F.pickAt} has balance factor ${F.pickBf < 0 ? '−' : '+'}${Math.abs(F.pickBf)} and its left child leans right. Which repair fixes it?`,
      options: [
        'A left rotation on the child, then a right rotation',
        'One right rotation on the node that is out of balance',
        'One left rotation on the node that is out of balance',
        'A right rotation on the child, then a left rotation',
      ],
      answer: 0,
      why: `The heavy child leans the other way, so this is the left-right case. One right rotation just swaps which side is heavy: in the lesson, ${F.pickWrongRoot} ends at ${F.pickWrongBf > 0 ? '+' : ''}${F.pickWrongBf}. Straightening the child first with a left rotation turns it into a left-left case that one right rotation finishes.`,
    },
    {
      q: `Keys 1 to ${F.sortedCount} are inserted in increasing order into an AVL tree. How many levels tall is it?`,
      options: [
        `${F.avlSortedHeight}, a perfect tree`,
        `${F.sortedCount}, one level per key`,
        `${Math.ceil(F.sortedCount / 2)}, about half the keys`,
        `${F.avlSortedHeight + 3}, a little under a chain`,
      ],
      answer: 0,
      why: `Each rotation keeps the tree level, so sorted input ends as a perfect tree of ${F.avlSortedHeight} levels after ${F.avlSortedRotations} rotations. The plain tree on the same keys is a chain of ${F.plainSortedHeight}, which is the whole reason rotations exist.`,
    },
    {
      q: 'How many repairs can one insert need, and how many can one delete need?',
      options: [
        'An insert needs at most one; a delete can need one at several ancestors',
        'Both need at most one repair, since the tree stays near balance',
        'A delete needs none, because removing a node only makes the tree shorter',
        'Both can need a repair at several ancestors on the way back up',
      ],
      answer: 0,
      why: `Fixing the lowest unbalanced ancestor after an insert restores the height it had before, so nothing above it changes. A delete can shorten a subtree and leave an ancestor out of balance again, so repairs can climb: in the lesson, deleting ${F.deleteKey} from the thinnest tree of height ${F.deleteHeight} repairs ${F.deleteFixes} ancestors.`,
    },
  ],
};

export default lesson;
