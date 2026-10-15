import type { LessonModule } from '../../core/types';
import { FACTS as F } from './facts';
import { Stage } from './Stage';
import { caseList } from './text';

const n = (v: number) => v.toLocaleString('en-US');

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A red-black tree colours every node red or black under four rules, and a short fix-up of recolours and at most a couple of rotations after each insert or delete keeps the longest path within twice the shortest.',
    what: `A red-black tree is a search tree where every node is red or black, the root is black, a red node never has a red child, and every path from a node down to a nil leaf holds the same number of black nodes. Those rules cannot hold on a lopsided tree, so the tree stays within a factor of two of balanced: not perfect, but a height of about 2 log2(n + 1) at the worst. A new node is red, and if that breaks the no-red-red rule the fix-up looks at the uncle: a red uncle means recolouring and moving up, a black uncle means one or two rotations and done. Seen as 2-3-4 nodes (each black node with its red children), the same rules say all leaves sit at one depth, and a red uncle is a 4-node splitting.`,
    analogy: 'A filing system with a strict house rule: you may leave a few folders slightly out of place, but the rule about never stacking two flagged folders and keeping the same number of dividers in every drawer means no drawer ever gets more than twice as deep as another.',
    useCases: [
      'Ordered maps and sets in language libraries, where lookups, inserts and deletes all stay logarithmic',
      'Schedulers and timers that keep items ordered by a key and remove the smallest one often',
      'A reason to know that a balanced tree does not have to be perfectly balanced to be fast',
      'The base for understanding B-trees, since a red-black tree is a 2-3-4 tree in disguise',
    ],
    why: 'It shows the other way to keep a tree balanced: loose rules and cheap repairs instead of tight rules and more rotations, which is the trade behind the ordered maps you use every day.',
    watch: 'A red node is pink with an R under it and a black node is grey with a B, so colour is never the only cue (B2 means black with black-height 2). Rings mark roles: yellow is the node being fixed, blue the uncle or sibling, red a broken rule, violet a node just changed or the spot that is one black short. In the 2-3-4 view a dashed violet box is one multiway node. In the comparison plot amber is the red-black tree, blue is the AVL tree and the grey dashed curves are the two height bounds.',
  },
  tryThis: [
    `In The four rules, press node 5 to flip it red: rule 3 breaks (${F.flipDetail3}) and so does rule 4 (${F.flipDetail4}). Press it again and every rule holds.`,
    `In Insert and fix-up, press play on the default (insert ${F.uncleKey}): the cases are ${caseList(F.uncleCases)}, with ${F.uncleRotations} rotations and ${F.uncleRecolors} recolours. Then press Zig-zag 30, 10, 20 and play: ${caseList(F.zigCases)}, ${F.zigRotations} rotations and ${F.zigRecolors} recolours.`,
    `In Delete, press play on the default (delete ${F.deleteKey}): the fix-up runs ${caseList(F.deleteCases)} with ${F.deleteRotations} rotation and ${F.deleteRecolors} recolours. Then press Delete 12: a red leaf, with ${F.redLeafRecolors} recolours and no fix-up.`,
    `In The 2-3-4 view, on the default sorted 1 to 15: ${F.twos} 2-nodes, ${F.threes} 3-nodes and ${F.fours} 4-node, all leaf nodes ${F.leafDepth} levels down. Press Insert with the default key 16: it splits ${F.splits16} 4-node and makes ${F.rotations16} rotation.`,
    `In AVL vs red-black (random order, seed ${F.seed}): both end ${F.randomRbHeight} levels tall, the red-black tree makes ${F.randomRbInsertMean.toFixed(2)} rotations per insert on average against ${F.randomAvlInsertMean.toFixed(2)}, and its worst delete needs ${F.rbDeleteMax} rotations against ${F.avlDeleteMax}. Then choose Sorted order: the red-black tree ends ${F.sortedRbHeight} levels tall against ${F.sortedAvlHeight}.`,
  ],
  keyIdeas: [
    'The four rules (red or black, black root, no red child of a red node, equal black count down each path) keep the longest path no more than twice the shortest, so the tree is loosely balanced, not perfectly.',
    `After an insert the uncle's colour picks the repair: a red uncle recolours and moves up, a black uncle rotates and ends; in the seeded runs an insert needed up to ${F.rbInsertMax} rotations and a delete up to ${F.rbDeleteMax}, which matches CLRS's bounds as I recall them.`,
    'Regroup each black node with its red children and the tree is a 2-3-4 tree: a red uncle is a 4-node splitting, and rule 4 says the leaf nodes share one depth.',
    `Against AVL it is looser, not faster across the board: on sorted keys it ends ${F.sortedRbHeight} levels tall against ${F.sortedAvlHeight}, but its worst delete is ${F.rbDeleteMax} rotations against ${F.avlDeleteMax} (random order, ${n(1023)} keys).`,
  ],
  quiz: [
    {
      q: `A red-black tree is built by inserting 1,023 keys in sorted order. How tall does it get?`,
      options: [
        `${F.sortedRbHeight} levels: taller than a perfect tree, yet under the 2 log2(n + 1) = ${Math.round(F.bound)} bound`,
        '10 levels, since the rules keep a red-black tree perfectly balanced',
        '1,023 levels, since sorted keys always build a chain in a search tree',
        `${F.sortedAvlHeight / 2} levels, since the recolouring halves the height of a plain tree`,
      ],
      answer: 0,
      why: `The rules bound the height at about 2 log2(n + 1), not at the perfect ${F.sortedAvlHeight}: here the red-black tree ends ${F.sortedRbHeight} levels tall against ${F.sortedAvlHeight} for AVL. A chain is what a plain tree builds, and the recolouring does not halve anything: it stops one path from getting more than twice another.`,
    },
    {
      q: 'A new red node sits under a red parent, and the parent\'s sibling (the uncle) is red. What does the fix-up do?',
      options: [
        'Recolours the parent and uncle black and the grandparent red, then checks the grandparent',
        'Rotates the grandparent once and swaps the two colours around it, which finishes the whole repair',
        'Rotates the parent first and then the grandparent, to make a line',
        'Recolours only the new node black, since one black node removes the clash',
      ],
      answer: 0,
      why: 'With a red uncle there is no need to rotate: recolouring pushes the red up two levels and keeps the black counts equal. The trouble can then reappear at the grandparent, so the check continues upward. The rotations belong to a black uncle, where there is no spare red to push up.',
    },
    {
      q: 'In the 2-3-4 view, what is the uncle-red case?',
      options: [
        'A 4-node splitting: its middle key moves up into the parent',
        'Two 2-nodes merging into one 3-node under their parent',
        'A key joining a 3-node, which becomes a 4-node',
        'A rotation between two 3-nodes that swaps their middle keys',
      ],
      answer: 0,
      why: `A black node with two red children is a 4-node, and inserting under it makes it too full: the parent and uncle turn black and the grandparent red, which is the middle key moving up and the other two splitting apart. In the lesson, inserting 16 into sorted 1 to 15 splits ${F.splits16} 4-node.`,
    },
    {
      q: 'Deleting a red leaf changes no colours, but deleting a black node needs a fix-up. Why?',
      options: [
        'Each path through the removed spot now has one black node fewer, which breaks rule 4',
        'Its parent becomes red at once, which breaks rule 3 for its sibling',
        'The tree loses its root, which breaks rule 2 until a rotation repairs it',
        'Its key was the largest, which breaks the order a search tree needs',
      ],
      answer: 0,
      why: `A red node adds nothing to any black count, so removing one changes none of the paths' totals: ${F.redLeafRecolors} recolours in the lesson. A black node is counted on each path through it, so those paths come up one short, which is the double-black spot the fix-up ring marks. Removing a key keeps the search order intact.`,
    },
  ],
};

export default lesson;
