import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: "Dynamic programming solves a problem by breaking it into overlapping subproblems and solving each one exactly once, saving the answers instead of recomputing them.",
    what: "Many recursive problems ask the same smaller questions over and over; naive Fibonacci recomputes fib(3) many times. DP stores each subproblem's answer in a table. Top-down (memoization) keeps the natural recursion and caches results as they come back. Bottom-up (tabulation) fills the table from the smallest cases upward in an order where every cell's inputs are already done. Either way, exponential work often becomes polynomial.",
    analogy: "If someone asks you 7 + 8 + 5 + 3 and then adds + 4, you don't re-add everything: you remember 23 and add 4. DP is that, applied systematically.",
    useCases: [
      "Diff tools and version control (longest common subsequence, edit distance)",
      "Spell-checkers and DNA sequence alignment",
      "Route planning, resource allocation and scheduling (knapsack-style problems)",
      "Text wrapping, parsing, and many classic interview problems",
    ],
    why: "DP is the go-to technique whenever brute force explodes but the problem has overlapping subproblems and optimal substructure. Recognising those two properties is a core mid-level skill: it turns \"this will never finish\" into \"this runs in milliseconds\", and DP questions are a staple of technical interviews.",
    watch: "In Fibonacci, the row is the memo table: yellow is being computed, violet cells are waiting on recursion, a blue flash is a cache hit, and green values are saved. Arrows show which earlier cells a value is built from. The chart compares calls needed by naive recursion (red) and memoization (green). In the LCS table, each cell's arrows point to the cells it depends on (the yellow arrow is the one it used), and the green path at the end is the walk back that recovers the answer.",
  },
  tryThis: [
    'Fibonacci, Top-down, n = 10: count the blue cache hits. Each one is a whole subtree the naive version would recompute.',
    'Switch to Bottom-up: the same table, filled left to right with no recursion at all.',
    'LCS, Bottom-up: watch each cell look up, left and diagonally. Matches take the diagonal and add 1.',
    'LCS, Top-down on DYNAMIC / PROGRAM: some cells are never computed because the answer never needed them.',
  ],
  keyIdeas: [
    'DP needs overlapping subproblems and optimal substructure.',
    'Top-down = recursion + a cache (memoization). Bottom-up = fill a table in dependency order.',
    'fib(n): naive is exponential; with DP it is O(n).',
    'Recover the actual answer, not just its size, by walking back through the table.',
  ],
  quiz: [
    {
      q: 'What makes a problem a good fit for dynamic programming?',
      options: [
        'It can be sorted',
        'Its subproblems overlap and the best answer is built from best sub-answers',
        'It uses a graph',
        'It has no recursion',
      ],
      answer: 1,
      why: 'Overlapping subproblems give you something worth caching; optimal substructure lets you build the answer from cached pieces.',
    },
    {
      q: 'How many distinct subproblems does fib(n) have?',
      options: ['About n', 'About n²', 'About 2ⁿ', 'Just 1'],
      answer: 0,
      why: 'Only fib(0) … fib(n): n + 1 of them. Naive recursion solves them exponentially many times; DP solves each once.',
    },
    {
      q: 'In the LCS table, what does a cell use when the two letters match?',
      options: ['The cell above', 'The cell to the left', 'The diagonal cell up-left, plus 1', 'The maximum of the whole row'],
      answer: 2,
      why: 'A match extends the best answer for both strings without those letters, which lives diagonally up-left.',
    },
  ],
};

export default lesson;
