import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: "Sorting algorithms put data in order. They trade simplicity, speed and memory against each other, and the shape of the input changes which one wins.",
    what: "Bubble, insertion and selection sort compare neighbours or scan for the minimum: simple, but O(n²). Merge sort and quicksort split the problem in half and solve the halves, reaching O(n log n). The sort() in real languages is a hybrid built from these ideas (Timsort, introsort).",
    analogy: "Insertion sort is how most people sort a hand of cards: pick up each new card and slide it into place among the ones already in your hand.",
    useCases: [
      "Ordering search results, feeds and leaderboards",
      "Making data binary-searchable, and enabling merges and de-duplication",
      "Database ORDER BY, and sorting files too big to fit in memory",
      "Knowing what your language's sort() does, and whether it's stable",
    ],
    why: "You'll rarely write a sort in production, but sorting is where divide-and-conquer, best vs. worst case, stability, and in-place vs. extra memory all become visible. Those ideas come back everywhere, and sorting is an interview staple.",
    watch: "Each bar is a value; its height is its size. Yellow bars are being compared, violet ones are moving, blue is the pivot or current minimum, and green is locked in its final place. A dashed blue box marks the part being worked on (insertion's sorted hand, merge's halves, quick's partition) and bars outside it are dimmed. Watch the counters, then try Race all 5 with the Nearly sorted input.",
  },
  tryThis: [
    'Watch bubble sort push the biggest bar to the right on every pass.',
    'Switch to Quick and follow the blue pivot. Where does it land?',
    'Pick "Nearly sorted" and compare Insertion against Selection.',
    'Hit "Race all 5" at 40 bars and see who finishes first.',
  ],
  keyIdeas: [
    'Bubble, insertion and selection are simple but O(n²).',
    'Merge and quick sort divide the problem, so they run in O(n log n).',
    'Input shape matters: insertion flies on nearly-sorted data; quicksort hates bad pivots.',
    'Merge sort is guaranteed n log n but needs extra memory; quicksort sorts in place.',
  ],
  quiz: [
    {
      q: 'After one full pass of bubble sort, what is guaranteed?',
      options: ['The smallest value is first', 'The largest value is last', 'Half the array is sorted', 'Nothing yet'],
      answer: 1,
      why: 'The biggest value wins every comparison it is in, so it gets carried all the way to the end.',
    },
    {
      q: 'Which sort does the fewest comparisons on an already nearly-sorted array?',
      options: ['Selection', 'Insertion', 'Bubble without early exit', 'They all do the same'],
      answer: 1,
      why: 'Each item only slides a short way, so insertion sort approaches O(n). Selection always scans everything.',
    },
    {
      q: 'Quicksort degrades to O(n²) when…',
      options: ['The array is random', 'The pivot keeps splitting the range very unevenly', 'There are duplicate values', 'n is even'],
      answer: 1,
      why: 'A pivot that is always the min or max (e.g. last element of sorted input) peels off only one item per level.',
    },
  ],
};

export default lesson;
