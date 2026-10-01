import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A sliding window keeps a running answer for a stretch of the data and moves its edges instead of recomputing, turning "check every sub-range" into one pass.',
    what: "Keep two indexes, l and r, marking a window. Move r right to let the next item in; when the window breaks a rule (a repeated letter, a sum that's big enough), move l right to push items out. Because both edges only ever move forward, each item enters once and leaves at most once: at most 2n moves, O(n) instead of the O(n²) of trying every range. The running state (a sum, a count of letters) is updated as items come and go, never rebuilt.",
    analogy: 'A caterpillar crawling along a branch: the front stretches forward, the back catches up. It never jumps back to the start.',
    useCases: [
      'Longest or shortest sub-array or substring meeting a rule (a classic interview family)',
      'Moving averages and rolling sums over time series and metrics',
      'Rate limiters counting requests in the last N seconds',
      'Network flow control: TCP\'s window of bytes in flight',
    ],
    why: "It's one of the handful of patterns behind a huge share of array and string problems, and it's how real systems compute rolling metrics without storing everything. It also teaches the habit of updating state incrementally instead of recomputing it.",
    watch: "The yellow bracket (marked l and r) is the current window, and the cells inside it are tinted yellow. A cell lifts green as it enters and turns red as it leaves; cells the window has left behind are dimmed. The violet bracket is the best window found so far. In No repeats, the table on the right is the letter count inside the window, with a repeated letter in red. The counters compare moves made (never more than 2n) with what brute force would need: every window for No repeats and Shortest, or re-adding each of the n − k + 1 windows for Max sum of k.",
  },
  tryThis: [
    'Press play on No repeats with abcabcbb: when a letter repeats, watch l move up one step at a time while r waits.',
    'Pick bbbbb: every new b pushes the old one straight out.',
    'Switch Problem to Max sum of k and try each k: one number in, one number out.',
    'In Shortest ≥ target, raise the target until no window is big enough.',
    'Compare the Moves counter with Brute force on your own text.',
  ],
  keyIdeas: [
    'Both edges only move forward, so each item enters once and leaves at most once: O(n).',
    'Shrinking moves l up one step; the window never restarts from scratch.',
    'Keep the window\'s state (sum, counts) up to date as items enter and leave.',
    'The "shrink while it still works" trick needs a sum that can\'t go up when you remove an item, so no negative numbers.',
  ],
  quiz: [
    {
      q: "The window 'abc' meets another 'a'. What happens next?",
      options: [
        "Move l just past the old 'a'; r stays where it is",
        "Move r back and rescan from just after the old 'a'",
        "Move r back to the old 'a' and try again",
        "Clear the window and start over at the new 'a'",
      ],
      answer: 0,
      why: 'Everything between the old a and r is still valid, so only the left edge moves. Moving r back would recheck items and lose the O(n) guarantee.',
    },
    {
      q: 'On an array of n items, at most how many window moves does a sliding window make?',
      options: ['n moves', '2n moves', 'n log n moves', 'n² moves'],
      answer: 1,
      why: 'Every item enters once when r passes it and leaves at most once when l passes it: n entries plus up to n exits.',
    },
    {
      q: 'For "maximum sum of k consecutive numbers", how does the window get its new sum after sliding?',
      options: [
        'Subtract the one that left, add the one that entered',
        'Add up all k numbers in the new window again',
        'Sort the window, then add up its k numbers',
        'Multiply the old sum by the window size k',
      ],
      answer: 0,
      why: "That's the whole trick: two operations per slide instead of k. Re-adding all k numbers works but throws the speed-up away.",
    },
  ],
};

export default lesson;
