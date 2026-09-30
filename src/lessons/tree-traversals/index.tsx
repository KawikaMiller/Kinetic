import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'There are four standard ways to visit every node of a tree, and they differ only in when a node is "written out" relative to its children.',
    what: "Pre-order writes a node before its children, in-order writes it between its left and right subtrees, and post-order writes it after both. All three are depth-first: a recursive function that goes as deep as it can, so the call stack remembers the way back. Level order is breadth-first instead: a queue hands out nodes one row at a time. Same tree, same nodes, four different output orders.",
    analogy: 'Pre-order is reading a book\'s table of contents: chapter, then its sections. Post-order is emptying a folder: you have to empty the subfolders before you can delete the folder itself.',
    useCases: [
      'Copying or saving (serialising) a tree: pre-order',
      'Printing a binary search tree in sorted order: in-order',
      'Freeing memory, deleting folders, or totalling folder sizes: post-order',
      'Drawing a tree UI row by row, or finding the shallowest match: level order',
    ],
    why: 'Trees are everywhere: the DOM, file systems, JSON, org charts, compilers\' syntax trees. Knowing which walk to use is a daily skill, and tree traversals are among the most common interview questions for juniors.',
    watch: "The node being handled right now is yellow. Nodes already written out turn green and appear, in order, on the Output tape. Violet nodes are waiting: on the call stack for the three depth-first orders (the violet edges trace the path back to the root), or in the queue for level order. In pre-order a node is written before its call finishes, so it shows green with a violet ring until its call returns. Dim nodes haven't been reached yet. The panel on the right is the call stack (the running call in yellow, the ones waiting below it in violet, matching their nodes) or the queue, front first. With the (3 + 4) × 2 tree in post-order, a violet RPN stack then evaluates the output. The chips under the tape say what each order is used for; the current one is yellow. In Remove a leaf mode, nodes that can't be removed are faded. Calls on empty children aren't shown: in real code they return immediately.",
  },
  tryThis: [
    'Press play in Pre-order, then switch Order to Post-order and watch the same tree come out differently.',
    'Pick the (3 + 4) × 2 tree in Post-order: the output is RPN, and a stack evaluates it to 14.',
    'Pick the BST tree in In-order: sorted. Now pick Letters in In-order: not sorted.',
    'Switch to Level order and watch the queue instead of the call stack.',
    'Set Click a node to Add a child, click some nodes, and replay.',
  ],
  keyIdeas: [
    'Pre, in and post differ only in when the node is written relative to its children.',
    'Depth-first orders use recursion (a call stack); level order uses a queue.',
    'In-order gives sorted output only on a binary search tree.',
    'Post-order of an expression tree is Reverse Polish Notation: no brackets, evaluated with a stack.',
  ],
  quiz: [
    {
      q: 'You run an in-order traversal on a tree. When is the output guaranteed to be sorted?',
      options: ['Always', 'Only when the tree is a binary search tree', 'Only when the tree is balanced', 'Never'],
      answer: 1,
      why: 'In-order visits left, node, right. That lists values in order only if everything on the left is smaller and everything on the right is bigger, which is the BST rule.',
    },
    {
      q: 'Which traversal would you use to delete every folder inside a folder?',
      options: ['Pre-order', 'In-order', 'Post-order', 'Level order'],
      answer: 2,
      why: 'A folder can only be removed once it\'s empty, so every child has to be handled before its parent.',
    },
    {
      q: 'Level-order traversal is driven by which data structure?',
      options: ['A stack', 'A queue', 'A hash map', 'A heap'],
      answer: 1,
      why: 'Children join the back of a queue and nodes leave from the front, so a whole row is handled before the next row starts.',
    },
    {
      q: 'Post-order on the tree for (3 + 4) × 2 gives 3 4 + 2 ×. What does that evaluate to?',
      options: ['11', '14', '24', 'It needs brackets to evaluate'],
      answer: 1,
      why: 'RPN with a stack: push 3, push 4, + gives 7, push 2, × gives 14. No brackets needed.',
    },
  ],
};

export default lesson;
