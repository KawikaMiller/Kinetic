import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A prefix-sum array stores running totals once, so the sum of any range is a single subtraction; a difference array does the reverse and makes range updates two writes each.',
    what: "prefix[i] is the total of everything before index i, so it has n + 1 entries and starts at 0. The sum of a[l..r] is then prefix[r + 1] − prefix[l]: build once in O(n), answer each query in O(1). A difference array flips it around: to add v to a whole range, write +v where the range starts and −v just past where it ends; one running-sum pass at the end turns those marks into the updated array.",
    analogy: "A car's odometer: to know how far you drove between two stops, subtract the readings. You don't re-drive the trip.",
    useCases: [
      'Dashboards answering "total sales between two dates" instantly',
      'Range-sum and subarray-sum interview problems',
      'Summed-area tables for fast image blurs and feature detection',
      'Booking and calendar systems applying many range updates in one pass',
    ],
    why: "It's the simplest example of trading a little precomputation for fast answers later, a trade you'll make everywhere from caches to database indexes. The n + 1 layout is also where most people meet their first off-by-one bug, and seeing why it's n + 1 makes those bugs go away.",
    watch: "Range sums: yellow bars and the yellow bracket under the array are the selected range. Above them, the staircase climbs by each value, with a dashed blue line marking the range's base level; the blue dot is prefix[l], the violet dot is prefix[r + 1], the risers inside the range are yellow, and the yellow bracket beside the staircase is their difference, the range sum. The two strips repeat this as numbers: blue ▲ and violet ▲ point at the two prefix entries used. The bars below compare the cost of 1,000 queries. Difference array: the current update chip is yellow, a +v mark lifts green at the range's start, a −v mark turns red just past its end, and the yellow ▲ Σ is the running sum rebuilding the result, where cells not rebuilt yet are dimmed.",
  },
  tryThis: [
    'Drag the From l and To r sliders: the sum is always the violet height minus the blue one.',
    'Set l = r: a single value is still prefix[r + 1] − prefix[r].',
    'Read the caption: prefix[r] − prefix[l] is always short by exactly a[r].',
    'Switch Mode to Difference array and press play: each update is just a + and a −.',
    'Try Short updates: on a tiny array the difference array doesn\'t win, and the caption says so.',
  ],
  keyIdeas: [
    'prefix has n + 1 entries: prefix[0] = 0 and prefix[i + 1] = prefix[i] + a[i].',
    'sum(a[l..r]) = prefix[r + 1] − prefix[l]: O(1) per query after an O(n) build.',
    'A difference array makes a range update two writes; one running-sum pass applies them all.',
    'Precomputing pays off when you ask many questions of data that rarely changes.',
  ],
  quiz: [
    {
      q: 'With prefix[0] = 0 and prefix[i + 1] = prefix[i] + a[i], what is the sum of a[l..r]?',
      options: ['prefix[r] − prefix[l]', 'prefix[r + 1] − prefix[l]', 'prefix[r + 1] − prefix[l + 1]', 'prefix[r] − prefix[l − 1]'],
      answer: 1,
      why: 'prefix[r + 1] includes a[r]; prefix[l] stops just before a[l]. prefix[r] − prefix[l] is the classic off-by-one that drops a[r].',
    },
    {
      q: 'You have 1,000,000 values and 1,000 range queries. Roughly what does the prefix approach cost?',
      options: ['About 1,000 steps', 'About 1,001,000 steps', 'About 1,000,000,000 steps', 'It depends on the values'],
      answer: 1,
      why: 'One O(n) build (1,000,000) plus O(1) per query (1,000). Adding each range up could take up to 1,000 × 1,000,000.',
    },
    {
      q: 'To add 5 to every cell in [2, 6] with a difference array, you write…',
      options: ['+5 at every index 2…6', '+5 at 2 and −5 at 6', '+5 at 2 and −5 at 7', '+5 at 7 and −5 at 2'],
      answer: 2,
      why: 'The running sum picks up +5 at index 2 and keeps it until the −5 at 7 cancels it, just past the end of the range.',
    },
  ],
};

export default lesson;
