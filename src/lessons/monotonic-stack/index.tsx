import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A monotonic stack keeps its items in sorted order by popping anything the new item beats, which answers "what is the next bigger thing?" for every position in one pass.',
    what: "Scan left to right with a stack of indices still waiting for an answer. When a new value arrives, it pops every waiting item it beats, and for each one it is the answer. Then it waits itself. The stack's values stay in order (never rising from bottom to top), which is what \"monotonic\" means. A deque version, with removals at both ends, keeps the maximum of a sliding window at its front.",
    analogy: 'People in a queue for a view, each waiting for someone taller to stand in front of them. A tall newcomer settles it for every shorter person at once, and none of them ever needs checking again.',
    useCases: [
      'Next greater or smaller element: stock spans, days until a warmer day',
      'Sliding-window maximum or minimum over a time series, in O(n)',
      'Largest rectangle in a histogram, and the maximal-rectangle-in-a-grid problem built on it',
      'Trimming a number to its smallest form by removing k digits',
    ],
    why: 'It turns a family of "look ahead until something bigger" problems from O(n²) into O(n), and it is a classic interview pattern. The counting argument behind it, each item pushed once and popped at most once, is the same amortized reasoning you will use for many other one-pass algorithms.',
    watch: 'Bars are the values, drawn to scale. The yellow bar with the yellow triangle under it is the scan cursor. Violet bars and the violet rows in the Stack (or Deque) panel are the indices waiting there; the blue bar and the blue row are the item popped in this step. Grey bars are already settled, and outlined bars are not reached yet. In Next warmer day, a green arrow runs from each popped day to the day that answered it (the newest is thicker), the green number under a bar is its wait in days, and dimmed bars with a grey "–" never get a warmer day. In Window maximum, the dashed yellow box is the current window and the green number under a bar is the maximum of the window ending there. In Largest rectangle, the dashed blue box is the rectangle of the bar just popped, with its area above it, and the green outline is the best rectangle so far.',
  },
  tryThis: [
    'Play A week in Next warmer day: when 72 arrives, it settles two days at once.',
    'Pick Equal days: a day of the same temperature does not pop, because only strictly warmer counts.',
    'Pick Big pop and watch seven days pop while the scan sits on the last day, yet Stack comparisons still stays under 2n.',
    'Switch Problem to Window maximum and try each k on Falling and Rising: one keeps a full deque, the other keeps just one index.',
    'In Largest rectangle, try Classic, then type your own heights in Values and press Apply.',
  ],
  keyIdeas: [
    'Each index is pushed once and popped at most once, so the whole scan is at most 2n operations: O(n).',
    'An item that loses to a newer one can never be the answer for anything later, so it can be thrown away.',
    'The stack stays sorted, so the item to compare against is always on top.',
    'A deque lets old items leave at the front while beaten ones leave at the back: sliding-window max in O(n).',
  ],
  quiz: [
    {
      q: 'The scan has a loop that pops inside a loop over the input. What is its running time on n values?',
      options: [
        'O(n), since each index is pushed once and popped once at most',
        'O(n²), since each new value can pop up to n waiting values',
        'O(n log n), since the stack is kept in sorted order like a heap',
        'O(n²) in the worst case, though it is fast for random input',
      ],
      answer: 0,
      why: 'One step can pop many items, but an item popped is gone for good, so all the pops together number at most n. Add n pushes and the total is at most 2n. The tempting O(n²) counts the worst single step n times, but those big steps can\'t keep happening.',
    },
    {
      q: 'In "days until a warmer day", day 2 and day 3 are both 72. When day 3 arrives, what happens to day 2?',
      options: [
        'It stays on the stack: 72 is not warmer than 72',
        'It is popped, and its answer is set to 1 day later',
        'It is popped with no answer, as a tie',
        'Day 3 replaces it on the stack instead',
      ],
      answer: 0,
      why: 'The rule is strictly greater, so an equal day is not an answer and day 2 keeps waiting. Popping on ties would answer "1 day" for a day that did not get warmer at all.',
    },
    {
      q: 'For sliding-window maximum, why can an index leave the deque at the back?',
      options: [
        'A newer value at least as big arrived, so it can never be a max again',
        'It is the oldest index, so it has just slid out of the window',
        'The deque already holds k items, and the back end makes room for one more',
        'Its value is the largest in the window, so it is already reported',
      ],
      answer: 0,
      why: 'While the newer, bigger value is in the window, the older smaller one can never be the maximum, and the newer one stays in the window longer. Leaving because it is too old happens at the front, not the back.',
    },
    {
      q: 'In largest rectangle, bar 4 (height 6) is popped by bar 5, and bar 2 is now on top of the stack. Which bars can its rectangle cover?',
      options: ['Bars 3 and 4', 'Bars 2 to 4', 'Bars 4 and 5', 'Only bar 4'],
      answer: 0,
      why: 'Bar 5 is no taller, so the rectangle stops before it. Bar 2 is shorter (that is why it is still below on the stack), so it stops after it. Bar 3 must have been at least as tall, since it was popped earlier, so it is covered: bars 3 and 4.',
    },
  ],
};

export default lesson;
