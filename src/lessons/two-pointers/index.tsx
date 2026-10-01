import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Two pointers walk an array from two positions at once, so one pass does work that would otherwise need a loop inside a loop.',
    what: "Put one index at each end of a sorted array. Compare what they point at, then move the one that brings you closer to the goal: every move rules out a whole row of pairs, so you finish in at most n − 1 steps instead of checking all n(n − 1)/2 pairs. The same idea runs both pointers in one direction too: a slow pointer marks where results go while a fast one scans ahead.",
    analogy: 'Finding two books whose prices add up to your gift card: start with the cheapest and the priciest. Over budget? Put the priciest back. Under? Swap the cheap one for the next one up.',
    useCases: [
      'Pair and triple sums on sorted data (the classic interview warm-up)',
      'Checking palindromes and reversing arrays in place',
      'Removing duplicates or compacting an array without extra memory',
      'Merging two sorted lists, as in merge sort',
    ],
    why: "It's the first trick for turning an O(n²) nested loop into O(n), and interviewers reach for it constantly. It also teaches you to ask what order in the data lets you rule things out, which is the idea behind binary search and many faster algorithms.",
    watch: "Pair sum: the blue ▲ is L and the violet ▲ is R under the array. The two cells being added light up yellow, turn green when they hit the target, and cells outside L…R are dimmed. The small grid on the right is every possible pair: yellow is the pair checked now, green the answer, and each check greys out a whole row or column it proved impossible (a dashed outline). On the unsorted preset, the real answer it wrongly threw away turns red in both the array and the grid. Palindrome: matching ends turn green, a mismatch turns red. Remove duplicates: blue ▲ is slow, violet ▲ is fast, the green bracket is the unique part, yellow is the value being compared, and a cell flashes green when a new value is written; leftover cells dim at the end.",
  },
  tryThis: [
    'Press play on the Sorted preset and watch the pair grid grey out a row or column per check.',
    'Pick No solution: the pointers meet after at most n − 1 checks and prove there is no pair.',
    'Pick Unsorted (breaks it): two pointers says no pair, then the caption shows the one it missed.',
    'Type your own array and target and press Apply.',
    'Switch Problem to Remove duplicates and watch slow and fast move in the same direction.',
  ],
  keyIdeas: [
    'Sorted order is what lets one comparison rule out a whole row or column of pairs.',
    'Each step moves a pointer, so the pair search takes at most n − 1 checks: O(n) instead of O(n²).',
    'Opposite ends squeeze inwards; slow/fast pointers move the same way to compact data in place.',
    'On unsorted data the elimination proof breaks and the answer can be wrong.',
  ],
  quiz: [
    {
      q: 'You run the pair-sum two-pointer loop on an unsorted array. What happens?',
      options: [
        'It can report "no pair" even when one exists',
        'It still finds any pair, just more slowly',
        'It throws an error because the input is unsorted',
        'It sorts the array first automatically',
      ],
      answer: 0,
      why: "Moving R left only proves R's pairs impossible when every value to its left is smaller. Without sorted order that proof is false, so real answers get skipped, silently: nothing checks the order or throws.",
    },
    {
      q: 'arr[L] + arr[R] is bigger than the target. Which move is safe?',
      options: ['Move L right', 'Move R left', 'Move both', 'Restart from the ends'],
      answer: 1,
      why: 'Every partner of arr[R] from L onwards is at least arr[L], so every pair with R is too big. Dropping R is safe; moving L would only make the sum bigger.',
    },
    {
      q: 'At most how many checks does the pair search make on n sorted numbers?',
      options: ['log₂ n', 'n − 1', 'n(n − 1)/2', 'n²'],
      answer: 1,
      why: 'Each check moves one pointer one step closer to the other, and they start n − 1 apart.',
    },
    {
      q: 'After removing duplicates in place, what does the function return?',
      options: [
        'k, the count of unique values, now in the first k cells',
        'A new, shorter array holding only the unique values',
        'Nothing: the array is resized to fit the uniques',
        'The index where the last duplicate was found',
      ],
      answer: 0,
      why: "In-place algorithms don't allocate a new array. They rewrite the front and report how much of it is valid.",
    },
  ],
};

export default lesson;
