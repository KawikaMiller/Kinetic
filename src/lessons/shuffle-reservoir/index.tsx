import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Fisher-Yates shuffles fairly in one pass by swapping each position with a random one not yet fixed; reservoir sampling keeps a fair random sample of a stream whose length you never learn. Small-looking changes to either make them biased.',
    what: 'Fisher-Yates walks the array once: at position i it swaps in a uniformly random element from positions i to n − 1, so the choices multiply to exactly n! equally likely paths, one per arrangement. The "naive" version that swaps with any position makes nⁿ paths, which can\'t split evenly over n! arrangements, so some come up more often. Reservoir sampling (Algorithm R) keeps the first k items, then keeps item i with probability k/i in a random slot, which leaves every item with the same k/n chance.',
    analogy: 'Fisher-Yates is drawing names from a hat one at a time and lining them up: each draw comes only from the names still in the hat. The naive shuffle keeps putting names back and redrawing from everyone, which quietly favours some orders.',
    useCases: [
      'Shuffling a playlist, a deck or a test order without favouring any arrangement',
      'Sampling log lines or events from a stream of unknown length in one pass',
      'Picking an unbiased A/B cohort or a random subset of users',
      'Randomising work assignment so no worker or shard is systematically favoured',
    ],
    why: 'Shuffles and samples look trivially easy, so the biased versions ship: a shuffle that favours some orders, a sample that over-represents early or late events. Knowing why Fisher-Yates is exact, and how to sample a stream without knowing its length, saves you from subtle unfairness in games, experiments and telemetry.',
    watch: 'Shuffle lab: in the array, the current index i is blue and the random pick j is violet (with i and j markers below), both flash yellow on the swap, and the settled region of a Fisher-Yates shuffle has a light green tint. The heatmap shows where each value ended up, in blue: darker means more often, and a red outline marks a cell more than 3 standard errors from the fair count. Exact n = 3: light blue bars and counts are the naive paths per arrangement, red counts are off the fair share, and green counts are Fisher-Yates\'s one path each. Reservoir: the arriving item and a just-admitted slot are yellow, items in the reservoir and the kept-count bars are blue, items that passed by or were evicted are grey, and the green dashed line is the exact k/n.',
  },
  tryThis: [
    'In Shuffle lab, step through a Fisher-Yates shuffle and watch the green settled region grow one position at a time.',
    'Pick Naive at n = 3 and press Run ×10,000: red outlines mark cells far off the fair 3,333.',
    'Open Exact n = 3: the 27 naive paths split 4, 5, 5, 5, 4, 4, because 27 isn\'t divisible by 6.',
    'Try Random comparator and Run ×10,000 to see what your browser\'s sort does with it.',
    'In Reservoir, set k = 3, n = 10 and Run ×10,000: every bar sits near 30%, first item and last.',
  ],
  keyIdeas: [
    'Fisher-Yates: swap position i with a random j in [i, n − 1]. n·(n−1)·…·1 = n! paths, one per arrangement.',
    'Swapping with any position makes nⁿ paths; n! never divides nⁿ for n ≥ 3, so that shuffle is biased.',
    'Reservoir sampling keeps item i with probability k/i, which gives every item k/n without knowing n in advance.',
    'Math.random is fine for playlists, not for anything security-related: that needs a cryptographic generator.',
  ],
  quiz: [
    {
      q: 'A shuffle visits each position i and swaps it with a random position anywhere in the array. Is every order equally likely?',
      options: [
        'No: its nⁿ paths can\'t split evenly over n! orders',
        'Yes: every swap is chosen uniformly at random',
        'Yes, as long as the random generator is good',
        'Only for arrays with an even number of items',
      ],
      answer: 0,
      why: 'Each step has n choices, so there are nⁿ equally likely paths; for n = 3 that\'s 27 paths over 6 orders, which can\'t be even (they split 4, 5, 5, 5, 4, 4). A uniform choice at each step isn\'t enough: the set of paths has to map evenly onto orders, which Fisher-Yates\'s shrinking range does.',
    },
    {
      q: 'You must keep a uniform sample of 100 log lines from a stream, and you don\'t know how long it will be. What works in one pass?',
      options: [
        'Keep line i with chance 100/i, replacing a random kept line',
        'Read the whole stream first, then pick 100 lines at random',
        'Keep every line with a fixed 1% chance as it goes past',
        'Keep the first 100 lines, since every line is equally random',
      ],
      answer: 0,
      why: 'That\'s reservoir sampling: every line ends up kept with probability 100/n, whatever n turns out to be. Reading everything first needs the whole stream stored; a fixed 1% gives a sample whose size depends on n; the first 100 lines over-represent the start.',
    },
    {
      q: 'In Fisher-Yates on 5 items, how many equally likely sequences of random choices are there?',
      options: ['120', '3,125', '25', '15'],
      answer: 0,
      why: 'The ranges shrink: 5 choices, then 4, 3, 2 and 1, so 5! = 120 paths, exactly one for each of the 120 orders. 3,125 = 5⁵ is the naive shuffle\'s count.',
    },
    {
      q: 'Reservoir sampling with k = 3 runs over a stream of 10 items. What is the chance that item 10, the last one, ends up in the sample?',
      options: ['3/10, like every item', '1/10, it had one chance', '3/3, it arrived last', '0, the slots were full'],
      answer: 0,
      why: 'Item 10 is kept with probability 3/10 when it arrives, and nothing comes after it to push it out. Earlier items are kept more often on arrival but can be evicted later; it works out to 3/10 for every item.',
    },
  ],
};

export default lesson;
