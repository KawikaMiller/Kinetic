import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A sort that only compares items needs about n log₂ n comparisons on its worst input, but counting sort and radix sort never compare: they use the keys as indices or digits, so they run in linear time when keys have a small range or a fixed number of digits.',
    what: 'Every comparison sort is a yes/no decision tree: each comparison is a fork and each finished order a leaf. n items have n! orders, so the tree has n! leaves and must be at least ⌈log₂ n!⌉ deep, which grows like n log₂ n. Counting sort dodges this by counting how many items have each key and placing them by position; LSD radix sort runs a stable pass like that once per digit, least significant first.',
    analogy: 'Sorting post by postcode with pigeonholes: you never compare two letters, you just read one digit and drop the letter in that hole, then gather the holes in order.',
    useCases: [
      'Counting sort for integers with a small known range: ages, exam scores, byte values',
      'Radix sort for fixed-width keys: 32-bit integers, IPv4 addresses, fixed-length codes',
      'GPU sorting libraries, which use radix sort for plain integer and float keys',
      'Interview questions on why n log n is the floor, and when it is not',
    ],
    why: 'You will be told that sorting is O(n log n), and that is only true for sorts that compare. Knowing the lower bound, and the assumptions that get around it (small key range, few digits), tells you when a linear-time sort is a real win and when its memory cost rules it out. It builds on `sorting` and `logs-exponentials`.',
    watch: 'Lower bound: each box in the tree is one comparison. The yellow box is the question being asked now, violet boxes and edges are the path taken, and the leaf reached turns green; grey "yes" and "no" sit beside each fork. In the chart, the blue line is ⌈log₂ n!⌉ and the violet line is n log₂ n. Counting sort: the yellow cell is the item or key handled now, the count row has a blue tint and the next-slot row a violet one. Each item\'s letter and colour (a amber, b pink, c sky, d orange) tell equal keys apart in input order; dimmed input items are placed, and placed output items get a green outline. Radix sort: the underlined yellow digit is the one this pass sorts by and the yellow number is the one dropping; numbers in a bucket are tinted blue. At the end the strip turns green if it is sorted, or the first pair out of order turns red.',
  },
  tryThis: [
    'In Lower bound, press the input 1 2 3, then 2 3 1: the first finishes after 2 comparisons, the second needs 3.',
    'Press Start over and use Yes and No to reach every leaf: four of the six sit 3 comparisons deep.',
    'In Counting sort, play Duplicates and watch 4a, 4b and 4c land in the output in that order.',
    'In Radix sort, pick Shared digits and switch Buckets to Newest first: the strip ends unsorted, and the caption names the pair.',
    'Type 1000 or -1 into Numbers and press Apply: this demo sorts 0-999, so it refuses them.',
  ],
  keyIdeas: [
    'A comparison sort is a decision tree with n! leaves, so its worst case needs at least ⌈log₂ n!⌉ comparisons, about n log₂ n.',
    'Counting sort uses keys as array indices: n + k work and no comparisons, but one counter for each of the k possible keys.',
    'LSD radix sort runs a stable pass per digit, least significant first; stability is what makes the passes add up.',
    'Bucket sort splits the key range into buckets and sorts each one: about linear when keys are spread evenly, slower when they clump.',
  ],
  quiz: [
    {
      q: 'Radix sort sorts n three-digit numbers in about 3n steps. Does that disprove the n log n lower bound?',
      options: [
        'No: the bound only covers sorts that learn the order by comparing',
        'Yes: the bound was a rule of thumb, and radix sort beats it',
        'No: radix sort secretly makes n log n comparisons inside',
        'Yes: the bound holds for small n but fails for large n',
      ],
      answer: 0,
      why: 'The decision-tree argument counts yes/no comparisons between items. Radix sort reads digits instead, relying on the keys having a fixed number of them, and never compares two numbers, so the bound says nothing about it. It does not hide comparisons either: it reads one digit per number per pass.',
    },
    {
      q: 'Why must every comparison sort make 3 comparisons on some input of three distinct items?',
      options: [
        'Six orders need six leaves, and 2 levels hold only 4',
        'Each item has to be compared with both of the others',
        'The sort has to check that its output is in order',
        'Three items always take three swaps to rearrange',
      ],
      answer: 0,
      why: 'Each run is a root-to-leaf path in a yes/no tree, and each of the 3! = 6 orders needs its own leaf. A tree 2 levels deep has at most 4 leaves, so some path is 3 long. "Each item compared with both others" is tempting, but the input 1 2 3 finishes after a < b and b < c without ever comparing a with c.',
    },
    {
      q: 'In LSD radix sort, why does each pass have to be stable?',
      options: [
        'So ties on this digit stay in lower-digit order',
        'Unstable passes would need more than 10 buckets',
        'Stability lets a pass skip numbers already placed',
        'Without it the hundreds pass would have to go first',
      ],
      answer: 0,
      why: 'After the ones pass, 431 sits before 433. The tens pass drops both into bucket 3, and only first-in, first-out keeps 431 ahead; newest first flips them. It is not about reads or buckets: every pass reads one digit of every number into 10 buckets either way.',
    },
    {
      q: 'You need to sort a million 64-bit integers. Why not use counting sort?',
      options: [
        'It needs a counter for each of 2⁶⁴ possible keys',
        'Counting sort cannot handle duplicate keys at all',
        'It only works when the input is nearly sorted already',
        'It is stable, and stable sorts are too slow at that size',
      ],
      answer: 0,
      why: 'Its cost is n + k, where k is the number of possible keys, and the count array has k slots: 2⁶⁴ of them is far beyond any memory. Radix sort over the 8 bytes (8 passes of 256 buckets) or a comparison sort is the practical choice. Duplicates are no problem: counting them is the whole idea.',
    },
  ],
};

export default lesson;
