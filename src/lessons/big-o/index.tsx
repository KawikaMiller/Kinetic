import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: "Big-O describes how an algorithm's work grows as its input grows. It tells you whether code that's fast today will still be fast at 1,000× the data.",
    what: "Big-O ignores exact timings and constants and keeps only the growth rate. O(n) means doubling the input roughly doubles the work, O(n²) means doubling it quadruples the work, and O(1) means input size doesn't matter at all. It's usually quoted for the worst case.",
    analogy: "Finding a word by reading every page of a dictionary is O(n). Using alphabetical order to jump to the right section is O(log n). Comparing every page with every other page is O(n²).",
    useCases: [
      "Picking data structures: a Set lookup is O(1), scanning an array is O(n)",
      "Spotting the nested loop that's fine in tests and melts in production",
      "Design reviews: \"this is quadratic in the number of users\"",
      "Nearly every technical interview",
    ],
    why: "It's the shared vocabulary for performance. Juniors are expected to recognise the common classes, avoid accidental O(n²), and explain trade-offs out loud. Without it you can't predict whether code will survive real data.",
    watch: "Each coloured curve is one complexity class, and the chips above the chart show or hide them. Drag n and watch them pull apart: at small n they're bunched together, at large n only the class matters. In the race each lane fills as its class does its work at the same speed, so any difference in finish time is pure growth rate. The cards at the bottom turn the counts into real time at 1 µs per operation.",
  },
  tryThis: [
    'Play the tour, then drag n up to 32 and watch O(n²) and O(2ⁿ) shoot off the chart.',
    'Start the operations race at n = 10, then again at n = 20. Feel the difference.',
    'Switch the Y axis to Log so every curve fits on screen.',
    'Set n to 1 billion in the readout. O(n²) takes ~31,700 years, O(log n) takes 30 µs.',
  ],
  keyIdeas: [
    'Big-O describes how work grows with input size, not how fast code runs today.',
    'Drop constants and small terms: 3n² + 5n + 2 is just O(n²).',
    'Rough ranking: 1 < log n < n < n log n < n² < 2ⁿ.',
    'At small n everything is fast. At big n the class is all that matters.',
  ],
  quiz: [
    {
      q: 'A function loops over an array, and inside that loop it loops over the array again. What is its complexity?',
      options: ['O(n)', 'O(2n)', 'O(n²)', 'O(log n)'],
      answer: 2,
      why: 'n iterations of an n-length inner loop = n × n operations. O(2n) would be two loops one after the other, not one inside the other.',
    },
    {
      q: 'Which of these is O(n)?',
      options: ['5n + 1000', 'n²/100 + n', '20 log n + 5', '2ⁿ + 1000'],
      answer: 0,
      why: 'Constants and lower-order terms are dropped, so 5n + 1000 grows linearly. n²/100 looks small, but its n² term still wins once n is large.',
    },
    {
      q: 'An O(2ⁿ) algorithm takes 1 second at n = 30. Roughly how long at n = 31?',
      options: ['~1 second', '~2 seconds', '~31 seconds', '~1 minute'],
      answer: 1,
      why: 'Each extra item doubles the work: 2³¹ is twice 2³⁰.',
    },
  ],
};

export default lesson;
