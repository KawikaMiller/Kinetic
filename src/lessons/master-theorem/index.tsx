import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A divide-and-conquer recurrence T(n) = a·T(n/b) + f(n) is solved by summing its recursion tree level by level, and the master theorem says which end of the tree wins: the leaves, all the levels together, or the root.',
    what: 'Level k of the tree has aᵏ subproblems of size n/bᵏ, so it does aᵏ·f(n/bᵏ) work, and the leaves total n^(log_b a). Compare f(n) with n^(log_b a). Case 1: f is polynomially smaller, the leaves dominate, T = Θ(n^(log_b a)). Case 2: they match. With f exactly n^(log_b a) every level does the same work; with an extra logᵏ n (the extended form) the polynomial parts still tie and the log factor makes the levels shrink slowly toward the leaves. Either way there are about log n levels, so T gains one more log. Case 3: f is polynomially bigger and passes the regularity check a·f(n/b) ≤ c·f(n) for some c < 1, so the root dominates and T = Θ(f(n)). Some recurrences fall between the cases, and then you sum the tree yourself. It builds on `recursion`, `sorting`, `big-o` and `logs-exponentials`.',
    analogy: 'A company where each manager splits a job among a reports, each getting 1/b of it, and spends f(n) hours coordinating. Whether the total is mostly front-line work, mostly management, or spread evenly depends on how fast the team grows compared with how fast the jobs shrink.',
    useCases: [
      'Predicting the cost of merge sort, binary search, Karatsuba multiplication and Strassen-style matrix products',
      'Judging whether a recursive split will actually beat a simple loop before writing it',
      'Seeing why closest pair, FFT and similar algorithms are n log n: linear work at each level',
      'Spotting a recurrence the basic theorem does not cover, so you sum the tree instead',
    ],
    why: '"Divide and conquer" sounds like an automatic n log n, and it isn\'t: halve-and-scan is linear, Karatsuba is n^1.585, Strassen n^2.807, binary search log n. Interviews and design reviews ask for these bounds, and the recursion tree is the tool that gives them and explains them.',
    watch: 'The level being summed is yellow: its nodes in the tree are solid yellow, its bar and its row in the table are yellow. Levels already summed are blue (tinted nodes, blue bars); levels not summed yet have grey bars and faint table rows. The dominant end, the leaf level in case 1 or the root in case 3, is green. The violet dashed line marks the leaves\' total, n^(log_b a). In the tree, "⋯ k" stands for k children not drawn, and the line under it counts the levels left out. Closest pair: the split line and the strip around it are yellow, points inside the strip are yellow, the best pair so far is green with a green segment, points outside the strip are grey (all blue before the first split), the strip-check bars are blue with the current level yellow, and the grey line marks 7 checks per point.',
  },
  tryThis: [
    'Load Merge sort and press play: all 13 levels (12 splits plus the leaves) do exactly 4,096 work at n = 4,096, so it is Θ(n log n).',
    'Load Halve and scan: the bars shrink level by level, the root wins, and it is Θ(n), not n log n.',
    'Load Karatsuba, then set a to 4: log₂ 4 = 2 exactly, f = n is now far below n², and the verdict becomes Θ(n²).',
    "Load Doesn't fit: the verdict says the basic theorem does not cover it, and the summed tree still gives Θ(n log log n).",
    'Switch Scene to Closest pair and press play: watch the strip at each split, and the strip-check bars stay under the 7-per-point line at every level.',
  ],
  keyIdeas: [
    'Level k does aᵏ·f(n/bᵏ) work, and the leaves total n^(log_b a).',
    'Compare f(n) with n^(log_b a): smaller, the leaves win; equal, add a log; bigger (and regular), the root wins.',
    'Divide and conquer is not automatically n log n: the balance of a, b and f decides.',
    'When f is off by only a log factor, the basic theorem is silent; sum the tree.',
  ],
  quiz: [
    {
      q: 'Halve and scan, T(n) = T(n/2) + n, is divide and conquer. What is its running time?',
      options: [
        'Θ(n): the scan at the root dominates, and the levels shrink',
        'Θ(n log n), like every divide-and-conquer algorithm on halves',
        'Θ(log n), because the problem is halved at every single level',
        'Θ(n²), because each level rescans what the level above saw',
      ],
      answer: 0,
      why: 'The levels do n, n/2, n/4 … work, a geometric series that sums to under 2n. With a = 1 there is only one subproblem per level, so nothing builds up. "Divide and conquer means n log n" only holds when every level does about n work, as in merge sort.',
    },
    {
      q: 'Karatsuba is T(n) = 3T(n/2) + n. Which case applies, and what is the bound?',
      options: [
        'Case 1: n is polynomially below n^1.585, so Θ(n^1.585)',
        'Case 2: the levels balance out, so it is Θ(n log n) overall',
        'Case 3: the linear work at the root dominates, so it is Θ(n)',
        'None: the master theorem needs a to equal b before it applies',
      ],
      answer: 0,
      why: 'log₂ 3 ≈ 1.585, and f(n) = n has exponent 1 < 1.585, so the leaves dominate: each level does 3/2 times the level above. Case 2 would need f to match n^1.585, and nothing requires a = b.',
    },
    {
      q: 'Besides f(n) growing polynomially faster than n^(log_b a), what does case 3 need?',
      options: [
        'Regularity: a·f(n/b) ≤ c·f(n) for some c < 1 and all large n',
        'Integrality: n must be an exact power of b for every input',
        'Balance: a must be equal to b so the levels stay the same',
        'Monotonicity: f must decrease as the subproblems shrink',
      ],
      answer: 0,
      why: 'Regularity makes the level totals shrink geometrically from the root down, so the root\'s f(n) dominates the sum. For f = n^p (log n)^q with q ≥ 0 it holds with c = a / b^p. Powers of b only make the tree tidy; they are not a condition of the theorem.',
    },
    {
      q: 'Why does the basic master theorem not solve T(n) = 2T(n/2) + n / log n?',
      options: [
        'n / log n is below n only by a log factor, not by any power n^ε',
        'n / log n is not a polynomial, and the theorem never allows logs',
        'With a = b the recursion never reaches its base case at all',
        "The tree's levels add up to infinity, so there is no bound",
      ],
      answer: 0,
      why: 'Case 1 needs f to be smaller by a factor n^ε, and case 2 needs f to match n^(log_b a) up to logᵏ n with k ≥ 0; n / log n sits between them. Logs are allowed (n log n is fine in case 2). Summing the tree gives n times a harmonic sum, Θ(n log log n).',
    },
  ],
};

export default lesson;
