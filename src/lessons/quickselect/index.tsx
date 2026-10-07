import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Quickselect finds the k-th smallest value, such as the median, by partitioning around a pivot and keeping only the side that holds index k: expected O(n) work, no full sort needed.',
    what: 'It is quick sort with one recursive call instead of two. A partition puts the pivot in its sorted position, smaller values left and larger right; if the pivot landed on k you are done, otherwise only the side containing k can hold the answer, and the other side is never looked at again. With good pivots the live range shrinks by a constant factor each round, so the total work is a geometric series: O(n).',
    analogy: 'Finding the middle-height person in a crowd: pick someone, send shorter people left and taller people right, then ignore the group that cannot contain the middle and repeat with the other.',
    useCases: [
      'Medians and percentiles, such as p50 and p99 latency, without sorting every sample',
      'C++ `std::nth_element` and partial sorts: the top 10 of a leaderboard',
      'Picking split values when building k-d trees and other space-partitioning indexes',
      'Median filters in image processing, which need many small medians fast',
    ],
    why: 'Sorting to find one order statistic does far more work than you need, and percentiles show up everywhere in monitoring and data work. The pivot lesson matters too: the same bad pivot rule that makes `sorting`\'s quick sort quadratic on sorted input does it here, and random or median-of-three pivots are the standard fix.',
    watch: 'Cells are the array, with indices above. The box with lo and hi labels is the live range, its idle cells tinted yellow, and the solid yellow cell is the pivot. The blue i marker is where the next small value will go; the violet j marker and violet cell are the value being compared. Faded grey cells have been thrown away and are never touched again. The grey k marker is the index being searched for (markers on the same cell share one label, like i·k), and the green cell is the answer. In the race panel, the yellow bar is quickselect\'s comparisons so far and the violet bar is a full quick sort\'s total with the same pivot rule.',
  },
  tryThis: [
    'Pick Sorted with Pivot set to Last and play: each round throws away just one value, and the race panel shows the formula.',
    'Keep Sorted and switch Pivot to Median of 3: the same median search drops to 13 comparisons, because the first pivot lands right on the median.',
    'Set Find to Smallest on Sorted with Pivot Last: quickselect and the full quick sort tie at 66 comparisons each.',
    'Choose Random and press New seed a few times: the comparison count changes, the answer never does.',
    'Let a search finish and read the k smallest panel: they are all there, just not in order.',
  ],
  keyIdeas: [
    'Partition, then keep only the side holding index k: with random pivots that is expected O(n) comparisons, under 4n for the median.',
    'A bad pivot rule on unlucky input, like the last element on sorted data, degrades to about n²/2 comparisons.',
    'When it finishes, everything left of k is no bigger than the answer: the k smallest values come free, unordered.',
    'Median-of-medians picks a pivot guaranteed near the middle, making the worst case O(n), but its constant factor keeps it rare in practice.',
  ],
  quiz: [
    {
      q: 'What is the least work needed to find the median of a million unsorted numbers?',
      options: [
        'Expected O(n): partition and keep only the side holding the median',
        'O(n log n): the median is only known once everything is sorted',
        'O(n²): every value must be compared with every other value',
        'O(log n): binary search straight to the middle of the array',
      ],
      answer: 0,
      why: 'Quickselect with random pivots expects fewer than 4n comparisons, and median-of-medians even guarantees O(n). Sorting does more than needed, because it orders both of the sides you would throw away. Binary search only works on an array that is already sorted.',
    },
    {
      q: 'Last-element pivots, input already sorted, n values, searching for the smallest. How many comparisons?',
      options: ['n(n − 1)/2', 'n − 1', 'about n log₂ n', 'about 2n'],
      answer: 0,
      why: 'Each pivot is the largest value in its range, so it lands at the end and each round removes one value: (n − 1) + (n − 2) + … + 1. n − 1 is the cost of one partition, and there are n − 1 of them. Random or median-of-three pivots avoid this on sorted input.',
    },
    {
      q: 'Quickselect has just found k = 3. Which is true of a[0], a[1] and a[2]?',
      options: [
        'They are the 3 smallest values, in no particular order',
        'They are the 3 smallest values, already in sorted order',
        'They are whatever values happened to start at the front',
        'They are the 3 values nearest to the answer in size',
      ],
      answer: 0,
      why: 'Every partition put values no bigger than the pivot on its left, and the side left of k was never thrown away, so the front three are the 3 smallest. Nothing ordered them among themselves, though, which is why a partial sort sorts that prefix as a separate step.',
    },
    {
      q: 'Why does median-of-three beat last-element pivots on sorted input?',
      options: [
        'On sorted input the middle value is the median: an even split',
        'It makes fewer comparisons per round than a last-element pivot',
        'It checks three values, so it never picks a bad pivot again',
        'It sorts the range a little first, which speeds up the scan',
      ],
      answer: 0,
      why: 'Sampling the first, middle and last of a sorted range returns the middle one, which halves the range every round. It costs 2 or 3 extra comparisons per round, not fewer, and it is no guarantee: inputs built to fool it exist, which is what median-of-medians is for.',
    },
  ],
};

export default lesson;
