import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: "Floyd's algorithm finds out whether a linked list loops, where the loop starts and how long it is, using just two pointers that move at different speeds.",
    what: "Slow moves one node per step, fast moves two. If the list ends, fast hits null and there's no loop. If it loops, fast can't escape, and once both are inside, fast closes the gap by exactly one node per step, so it lands on slow. Then put slow back at the head and move both one step at a time: they meet again exactly where the loop starts. Walking once round from there gives the loop's length.",
    analogy: 'Two runners on a track shaped like the letter ρ: a straight run-in, then a loop. The faster runner laps the slower one inside the loop; they can never just pass each other forever without being side by side at some moment.',
    useCases: [
      'Detecting a corrupted linked list or a cycle in pointer-based data',
      'Finding a duplicate number in an array without extra memory (a classic interview problem)',
      'Spotting when an iterated function, like a random-number generator, starts repeating',
      "Pollard's rho method for factoring numbers in cryptography",
    ],
    why: "A loop in a list makes naive traversal hang forever. Floyd finds it in linear time with constant memory, where a hash set would need memory for every node, and the fast/slow pointer pattern solves a whole family of interview problems.",
    watch: "Circles are list nodes and arrows are next pointers. Slow is blue with an S above it, fast is violet with an F; when they share a node it turns yellow with \"S F\". After the first meeting the meeting point keeps a yellow wash. The node where the loop starts turns green once phase 2 finds it, and during phase 3 the loop being measured is washed yellow with yellow arrows. With no cycle, the list ends in a dim null box. The proof panel fills in with this run's numbers once they meet. In Find the duplicate, the array's cells take the S and F markers below them, the cell slow is on lifts blue and the one fast is on lifts violet (yellow when they share it), and the cells holding the duplicate turn green at the end.",
  },
  tryThis: [
    'Play with μ = 4 and λ = 6: they meet at a node that is not the loop start, then phase 2 finds node 4.',
    'Set μ = 6 and λ = 3, a multiple: this time the meeting point is the start, and the proof panel shows why.',
    'Switch Loop to No cycle and play: fast runs into null, and the answer is "no loop".',
    'Set λ = 1 and watch fast catch slow on a node that points to itself.',
    'Open Find the duplicate, press New array a few times, and compare Floyd\'s 2 numbers with the hash set\'s count.',
  ],
  keyIdeas: [
    'Fast gains exactly one node per step inside the loop, so it can never skip over slow.',
    'The meeting point is usually not the loop start; restart one pointer at the head to find the start.',
    'After k slow steps, fast is a whole number of laps ahead: μ ≡ −a (mod λ).',
    'Two pointers, O(n) time, O(1) memory, where a hash set needs O(n) memory.',
  ],
  quiz: [
    {
      q: 'Slow and fast have just met inside a loop. Where does the loop start?',
      options: [
        'Not necessarily here: phase 2 walks from the head and the meeting point to find it',
        'Exactly where they met, because that is the first loop node fast can reach',
        'At the node just before the meeting point, where fast made its last jump',
        'At the head of the list, since every loop starts from the very first node',
      ],
      answer: 0,
      why: 'They meet a nodes into the loop, where μ + a is a multiple of λ. That is the start only when μ itself is a multiple of λ (like μ = 6, λ = 3). Otherwise you need phase 2: one pointer from the head, one from the meeting point, one step each.',
    },
    {
      q: 'Inside the loop, could fast keep jumping over slow forever without landing on it?',
      options: [
        'No: the gap shrinks by exactly one each step, so it must reach zero',
        'Yes: whenever the loop length is even, fast always skips right over slow',
        'Yes: fast moves two nodes, so it lands on every other node only',
        'No, but only because the loop is always shorter than the tail',
      ],
      answer: 0,
      why: "Measure how far fast is behind slow around the loop. Each step slow adds 1 and fast adds 2, so the gap drops by exactly 1: 3, 2, 1, 0. It can't go from 1 to −1. Loop length and parity don't matter.",
    },
    {
      q: "How much extra memory does Floyd's algorithm need on a list of n nodes?",
      options: ['O(1)', 'O(log n)', 'O(n)', 'O(n²)'],
      answer: 0,
      why: 'Just the two pointers (and a counter for λ), however long the list. Remembering visited nodes in a hash set also works, but that is the O(n) answer.',
    },
    {
      q: 'In find the duplicate, why does the walk i → a[i] from index 0 enter its loop at the duplicate value?',
      options: [
        "Values are 1 to n, so the walk can't stop, and the duplicate has two arrows into it",
        'Because sorting the array first puts the duplicate value right at the loop entrance',
        'Because index 0 always holds the duplicate, so the walk starts on the answer',
        'Because the largest value always points back to the smallest value in the array',
      ],
      answer: 0,
      why: 'There are n + 1 slots and only n possible values, so the walk never ends and must loop. The node where the tail joins the loop has two incoming arrows, which means two indices hold its number: the duplicate. Nothing is sorted, and index 0 is just where the tail begins.',
    },
  ],
};

export default lesson;
