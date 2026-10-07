import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Counting is multiplying choices: n × (n−1) × … when order matters, then divide by k! when it doesn\'t. That\'s why counts explode so fast.',
    what: 'Picking k things from n in order gives P(n, k) = n × (n−1) × … × (n−k+1): n choices for the first, one fewer for the next. If order doesn\'t matter, every group of k was counted k! times (once per ordering), so C(n, k) = P(n, k) / k!. Allow repeats and the counts become nᵏ (in order) and C(n+k−1, k) (any order). Pascal\'s triangle lists every C(n, k), each the sum of the two above it. Because every extra item multiplies the total, doubling n doesn\'t double the count: it squares it or worse.',
    analogy: 'Choosing an outfit: 4 shirts × 3 trousers × 2 pairs of shoes is 24 outfits. Add one more pair of shoes and you get 36, not 25.',
    useCases: [
      'Test matrices: 10 boolean feature flags give 1,024 combinations to test, 20 give over a million',
      'Password and key strength: 26⁸ lower-case passwords versus 95⁸ printable ones',
      'Estimating brute-force search: trying every order of 10 services is 3,628,800 runs',
      'Probability: the chance of a poker hand or a lottery win is a count divided by C(n, k)',
    ],
    why: 'Engineers constantly have to size a search space: how many test cases, how many keys to brute-force, how many orderings a scheduler could pick. Telling P from C and knowing that counts multiply is the difference between "we can test them all" and "not before the sun burns out".',
    watch: 'Choice tree: the lettered tiles sit on top; in the tree the root is a grey dot and each node is a tile picked so far (on crowded levels, a small dot). The level being expanded is yellow, finished picks (leaves) turn blue, and when order stops mattering the leaves turn violet and merge into violet group boxes, one per combination. Edges are grey. Pascal: the cell matching your n and k is yellow, the two cells above it that sum to it are blue, the rest of the triangle has a light violet wash, and the counts table picks out the active column in yellow. Explosion: plain numbers, exact.',
  },
  tryThis: [
    'In Choice tree, play n = 4, k = 2: 4 branches, each splitting 3 ways, so 12 leaves.',
    'Switch "Order matters" to No: each pair appears twice (AB and BA), so 12 / 2 = 6 combinations.',
    'Try n = 6, k = 4: 360 leaves is too many to draw, so the tree stops after the third pick and says so.',
    'In Pascal, click C(6, 3) = 20: it\'s 10 + 10, the two cells above.',
    'In Explosion, drag Flags from 10 to 20: 1,024 becomes 1,048,576.',
  ],
  keyIdeas: [
    'Order matters: P(n, k) = n! / (n − k)!. Order doesn\'t: C(n, k) = P(n, k) / k!.',
    'With repeats: nᵏ in order, C(n + k − 1, k) in any order.',
    'C(n, k) = C(n − 1, k − 1) + C(n − 1, k): the next item is either in or out.',
    'Counts multiply, so doubling n squares 2ⁿ: 10 flags give 1,024 combinations, 20 give 1,048,576.',
  ],
  quiz: [
    {
      q: 'A team of 6 fills an on-call rota with three distinct roles: primary, secondary and tertiary. How many rotas are there?',
      options: ['120', '20', '216', '18'],
      answer: 0,
      why: 'The roles make order matter: 6 × 5 × 4 = 120. 20 is C(6, 3), the number of 3-person groups with no roles, which is the tempting mix-up. 216 = 6³ would let one person hold two roles.',
    },
    {
      q: 'Same 6 people, but now you just pick 3 of them to attend a meeting. How many choices?',
      options: ['20', '120', '18', '60'],
      answer: 0,
      why: 'C(6, 3) = 120 / 3! = 20. Each group of 3 appears 3! = 6 times among the 120 ordered picks, and a meeting doesn\'t care who was picked first.',
    },
    {
      q: 'You go from 10 feature flags to 20. How many on/off combinations are there now?',
      options: [
        'About a thousand times as many',
        'Exactly twice as many as before',
        'Ten more combinations than before',
        'About four times as many as before',
      ],
      answer: 0,
      why: '2²⁰ / 2¹⁰ = 2¹⁰ = 1,024: every new flag doubles the count, and ten new flags double it ten times. "Twice as many" is the linear intuition that makes test plans blow up.',
    },
    {
      q: 'How many 8-character passwords use only the lower-case letters a to z?',
      options: ['26⁸ ≈ 2.1·10¹¹', '26 × 8 = 208', 'C(26, 8) ≈ 1.6·10⁶', '8! = 40,320'],
      answer: 0,
      why: 'Each of the 8 positions has 26 options, letters can repeat and order matters: 26⁸ = 208,827,064,576. C(26, 8) would forbid repeated letters and ignore order, far too few.',
    },
  ],
};

export default lesson;
