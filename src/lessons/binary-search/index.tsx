import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: "Binary search finds an item in sorted data by checking the middle and throwing away half of what's left, every single step.",
    what: "Compare the target with the middle element. If the target is smaller it can only be in the left half; if bigger, the right half. Repeat on whatever half is left until you find it or run out. Each step halves the search space, so it takes O(log n) steps.",
    analogy: "The number-guessing game: \"higher or lower than 50?\" Nobody sensible guesses 1, then 2, then 3…",
    useCases: [
      "Database indexes and sorted lookups",
      "git bisect: finding the commit that broke the build",
      "Standard-library lower_bound / bisect functions on sorted arrays",
      "\"Binary search the answer\": the smallest capacity or timeout that still works",
    ],
    why: "It's the clearest demonstration of why sorted data is valuable and what O(log n) buys you. It's an interview regular, and off-by-one bugs in lo / hi / mid are a classic. Knowing the pattern lets you spot it in problems that don't look like search at all.",
    watch: "The top row is linear search, one box at a time. The bottom row is binary search: the yellow outline is the range that could still hold the target, and it halves every step. Yellow box = being checked, dimmed = ruled out, green = found. Compare the two check counters.",
  },
  tryThis: [
    'Press play and watch the yellow window shrink by half every check.',
    'Click any number to search for it instead.',
    'Crank the size to 40. Linear slows down a lot; binary barely notices.',
    'Hit "Search for a missing value": linear must check every single box.',
  ],
  keyIdeas: [
    'Only works on sorted data. That order is what lets you discard half.',
    'Each check halves the remaining range → O(log n).',
    '1,000,000 items needs at most 20 checks. A billion needs 30.',
    'Linear search is O(n): double the data, double the work.',
  ],
  quiz: [
    {
      q: 'Binary search requires the input to be…',
      options: ['Unique', 'Sorted', 'Numeric', 'Small'],
      answer: 1,
      why: 'Sorted order is what tells you which half the target cannot be in.',
    },
    {
      q: 'Roughly how many checks does binary search need for 1,000,000 items?',
      options: ['~20', '~1,000', '~500,000', '~1,000,000'],
      answer: 0,
      why: '2²⁰ ≈ 1,048,576, so twenty halvings get you down to one item.',
    },
    {
      q: 'You double the size of a sorted array. Worst-case binary search gets…',
      options: ['Twice as slow', 'Four times as slow', 'One extra check', 'No slower at all'],
      answer: 2,
      why: 'Doubling n adds exactly one more halving step: log₂(2n) = log₂(n) + 1.',
    },
  ],
};

export default lesson;
