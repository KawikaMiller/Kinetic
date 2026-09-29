import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: "A binary search tree keeps keys sorted in a branching shape: smaller keys to the left, bigger to the right, so search, insert and delete take one comparison per level.",
    what: "Each node has at most two children. The rule is that everything in a node's left subtree is smaller and everything in its right subtree is bigger. Searching starts at the root and goes left or right at each node, discarding a whole subtree each time, like binary search. That makes operations O(height): about log n when the tree is bushy, but n when it degenerates into a chain.",
    analogy: "A game of twenty questions where every answer is \"smaller\" or \"bigger\": each answer rules out one whole branch of possibilities.",
    useCases: [
      "Ordered maps and sets: Java TreeMap, C++ std::map (red-black trees underneath)",
      "Range queries: \"everything between 20 and 40\", or finding the next key after x",
      "Database and file-system indexes (their wide cousins, B-trees)",
      "Schedulers and interval lookups that need sorted, changing data",
    ],
    why: "BSTs are where you learn that the shape of a data structure decides its performance. The same keys can give a fast tree or a slow linked list depending on insertion order, which is exactly why production code uses self-balancing versions. Tree reasoning (recursion, height, traversals) also comes up constantly in mid-level work and interviews.",
    watch: "Each circle is a node. Yellow is the node being compared right now, violet nodes and edges are the path taken, green is a key found or placed, and red is a node being deleted or an empty spot (null) where a key would have been. During a two-child delete, the dashed blue path finds the successor. The in-order walk fills the strip at the bottom in sorted order.",
  },
  tryThis: [
    'Insert a few keys and watch each one walk down, one comparison per level, to an empty spot.',
    'Delete 30 (two children): watch the successor get found and move up into its place.',
    'Press "Sorted order", then search for 88. Ten keys, ten comparisons: it has become a linked list.',
    'Run an In-order walk on any tree: the output is always sorted.',
  ],
  keyIdeas: [
    'Left subtree < node < right subtree, at every node.',
    'Search, insert and delete cost O(height): about log n if balanced, n if not.',
    'Inserting sorted data builds a chain; self-balancing trees (AVL, red-black) fix that with rotations.',
    'Deleting a node with two children means swapping in its in-order successor.',
  ],
  quiz: [
    {
      q: 'In a BST, where is the smallest key?',
      options: ['At the root', 'At the leftmost node', 'At the deepest leaf', 'At the rightmost node'],
      answer: 1,
      why: 'Keep going left from the root: every step left finds something smaller, until there is no left child.',
    },
    {
      q: 'You insert 1, 2, 3, …, 1000 in that order into a plain BST. Searching for 1000 takes about…',
      options: ['10 comparisons', '32 comparisons', '500 comparisons', '1,000 comparisons'],
      answer: 3,
      why: 'Every key goes to the right of the previous one, so the tree is a 1,000-long chain. Balanced trees avoid this.',
    },
    {
      q: 'What does an in-order traversal of a BST produce?',
      options: ['The keys in insertion order', 'The keys in sorted order', 'The keys level by level', 'Only the leaves'],
      answer: 1,
      why: 'Left subtree, then node, then right subtree is exactly smallest-to-largest given the BST rule.',
    },
  ],
};

export default lesson;
