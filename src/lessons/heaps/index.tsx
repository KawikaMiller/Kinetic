import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: "A heap always knows its smallest (or largest) item, and can add an item or remove the top in O(log n). It's the engine behind every priority queue.",
    what: "A min-heap is a complete binary tree where every parent is ≤ its children, so the minimum sits at the root. It's stored in a plain array with no pointers: the children of index i live at 2i+1 and 2i+2, and its parent at ⌊(i−1)/2⌋. Inserting adds at the end and sifts the item up; removing the top moves the last item to the root and sifts it down. Each is at most one swap per level.",
    analogy: "A hospital triage line: new patients can arrive in any order, but whoever is most urgent is always seen next, without re-sorting the whole waiting room.",
    useCases: [
      "Priority queues: job schedulers, timers, OS process scheduling",
      "Dijkstra's shortest path and A* (always expand the cheapest option next)",
      "Top-k problems: the 10 largest values in a stream of millions",
      "Heapsort, and merging many sorted lists (k-way merge)",
    ],
    why: "Whenever you repeatedly need \"the most important thing next\" from changing data, a heap beats sorting over and over. It shows up in schedulers, pathfinding and stream processing, and it's a classic interview tool for top-k and median problems. It also shows how a tree can live inside an array.",
    watch: "The top row is the array that actually stores the heap; the tree below is the same data drawn as a tree, and every item moves in both at once. Yellow items are being compared, violet ones just swapped, blue is a newly inserted or moved-in item, and green means settled or the current minimum (the Min stat turns blue while a moved-in item is still sinking from the root). The formula chip shows the index maths for parents and children. Extracted items stack up on the right in the order they'd run.",
  },
  tryThis: [
    'Insert a random task and follow it up the tree: one comparison with its parent per level.',
    'Extract min a few times: the run order on the right comes out smallest-first.',
    'Watch the formula chip during a swap: parent and child are found with arithmetic, not pointers.',
    'Heapify a random array and watch it get fixed bottom-up.',
  ],
  keyIdeas: [
    'Min-heap rule: every parent ≤ its children, so the minimum is at the root.',
    'Stored in an array: children of i at 2i+1 and 2i+2, parent at ⌊(i−1)/2⌋.',
    'Insert (sift up) and extract-min (sift down) are both O(log n); peeking at the min is O(1).',
    'A heap is only partially sorted: siblings can be in any order.',
  ],
  quiz: [
    {
      q: 'In a min-heap stored as an array, where are the children of index 3?',
      options: ['4 and 5', '6 and 7', '7 and 8', '1 and 2'],
      answer: 2,
      why: '2·3+1 = 7 and 2·3+2 = 8.',
    },
    {
      q: 'After removing the root of a min-heap, what moves into the root first?',
      options: ['The smaller child', 'The last item in the array', 'The largest item', 'Nothing, the tree shrinks from the top'],
      answer: 1,
      why: 'Moving the last item up keeps the tree complete; then it sifts down to restore heap order.',
    },
    {
      q: 'Which is a heap bad at?',
      options: ['Finding the smallest value', 'Removing the smallest value', 'Adding a new value', 'Finding any given value'],
      answer: 3,
      why: "Heap order only relates parents to children, so searching for an arbitrary value may mean checking everything: O(n).",
    },
    {
      q: "Is a min-heap's array sorted from smallest to largest?",
      options: [
        'Yes: the array is always sorted ascending',
        'No: only each parent is ≤ its children',
        'Yes, once you have run heapify on it',
        'Only the bottom row is kept in order',
      ],
      answer: 1,
      why: 'The starting heap here is [2, 5, 3, 8, …]: 5 comes before 3. Siblings and cousins can be in any order; only parent-to-child pairs are ordered.',
    },
  ],
};

export default lesson;
