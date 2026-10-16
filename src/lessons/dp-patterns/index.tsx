import type { LessonModule } from '../../core/types';
import { FACTS as F } from './facts';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Dynamic programming becomes a recipe once you can name the state: say what a table cell stands for, and the transition, base case, fill order and answer cell follow from it.',
    what: 'The dynamic-programming lesson showed memoisation against tables on Fibonacci and LCS; this one is a catalogue. Four families, each with a state: knapsack (dp[i][w], or dp[w] reused in place), longest increasing subsequence (dp[i] ending at i), interval problems such as matrix-chain multiplication (dp[i][j]) and bitmask problems such as the travelling salesman (dp[mask][last]). For each, you choose the state before the table fills. A wrong choice is run for real and set beside a brute-force answer, so you see exactly what it cannot know: the remaining capacity, the last value, the split point, the city the path stands in.',
    analogy: 'A state is the answer to "what do I need to remember so I can decide the rest without looking back?": a chess player does not need the move history to choose a move, only the position.',
    useCases: [
      'Resource allocation and budgeting problems that are knapsack in disguise',
      'Diff, patience sorting and scheduling problems built on increasing subsequences',
      'Parsing and parenthesisation problems: optimal binary search trees, expression evaluation orders',
      'Small exact routing and assignment problems, where a bitmask table beats trying every order',
    ],
    why: 'Most DP interview questions and a fair share of real optimisation code are one of these four shapes. The skill is not remembering four recurrences but asking what the future depends on, then checking the fill order respects the dependencies.',
    watch: 'The cell being computed is yellow (--hi), the cells it reads are outlined in blue (--info), a finished cell is green (--ok) and an unfilled one is dim (--dim). Cells on the rebuilt solution are violet (--violet). A wrong state shows its answer in red (--bad) beside the correct one in green. In the knapsack grid each row is the array after one item; in the bitmask grid each row is a set of cities of the current size.',
  },
  tryThis: [
    `Knapsack, on the defaults: press play to the end. dp[w] filled downward says ${F.knapsackExact}, which matches. Now set Loop to capacity upward: the answer becomes ${F.knapsackUnbounded}, in red, because an item can be taken again. Greedy by value per weight scores ${F.knapsackGreedy}.`,
    `Knapsack, set State to dp[i] only: it says ${F.knapsackPrefix} where the real best is ${F.knapsackExact}, because it cannot see what capacity is left or what else it could have chosen.`,
    `Increasing subsequence, on the default array, play to the end on "ending at i": the length is ${F.lisLength}. The tails array below ends as ${F.lisTails}, which is not itself a subsequence of the input. The table made ${F.lisComparisons} pair checks, the tails array ${F.lisProbes} probes.`,
    `Interval DP, on the textbook dimensions: the cheapest cost is ${F.chainCost}, grouped as ${F.chainGrouping}. Switch Fill order to Row by row: the table reads ${F.chainRowUnfilled} cells that are not filled yet and answers ${F.chainRowCost}.`,
    `Bitmask DP, on the defaults (${F.tspCities} cities, seed 7): the best tour costs ${F.tspBest}. dp[mask] only says ${F.tspMask}, too high; dp[last] only says ${F.tspLast}, too low, because its walk revisits a city.`,
  ],
  keyIdeas: [
    `Name the state first: dp[i] alone gave ${F.knapsackPrefix} on the default knapsack where the real best is ${F.knapsackExact}, because it forgot the capacity.`,
    `Fill order is part of the algorithm: capacity upward turns 0/1 knapsack into unbounded knapsack (${F.knapsackUnbounded} against ${F.knapsackExact} here), and a row-by-row interval table read ${F.chainRowUnfilled} cells before they existed.`,
    `Interval tables are filled by increasing length because a cell needs shorter intervals: ${F.chainCells} cells stand in for ${F.chainGroupings} groupings on the textbook chain.`,
    `A bitmask table is exact but grows exponentially: ${F.tspStates} states at ${F.tspCities} cities (the loose size n x 2^n says ${F.tspNominal}) against ${F.tspTours} tours. The counted transitions drop below the tour count from n = ${F.countedBreakEven} on, and the loose bound n^2 x 2^n from n = ${F.breakEven}.`,
  ],
  quiz: [
    {
      q: 'Iterating the capacity upward in the one-array knapsack solves a different problem. Which one, and why?',
      options: [
        'Unbounded knapsack, since a cell just written is read again so an item is reused',
        'Fractional knapsack, since cells in the array can now hold a part of an item',
        'The same 0/1 problem, since both directions read cells that hold earlier answers',
        'A longest-path problem, since the array is walked from low capacity to high',
      ],
      answer: 0,
      why: `Downward, dp[w - wi] still holds the value from before this item. Upward, it has already been updated with this item, so the item can be counted again. On the default instance that is ${F.knapsackUnbounded} against the 0/1 answer ${F.knapsackExact}.`,
    },
    {
      q: 'Why does knapsack need the capacity in its state, rather than just dp[i], the best value over the first i items?',
      options: [
        'Whether item i fits depends on what is left, and dp[i] alone cannot say',
        'The capacity is a number, and a table needs numbers as its column headings',
        'Dropping it would make the table smaller but the answer cell unreachable',
        'The items would be tried in a different order, which changes the answer',
      ],
      answer: 0,
      why: `A state has to hold what the future depends on. With dp[i] alone the lesson's best attempt scores ${F.knapsackPrefix} on the default instance where ${F.knapsackExact} is possible, and the table does not get smaller in a way that helps.`,
    },
    {
      q: 'The tails array in the O(n log n) increasing-subsequence method ends as 1, 2, 3, 6 on the default input. What is it?',
      options: [
        'The smallest last value for each length, not a real subsequence',
        'One longest increasing subsequence of the input, in order',
        'The positions where each longer subsequence ends in the input',
        'The values left over once a longest subsequence is removed',
      ],
      answer: 0,
      why: `tails[k] is the smallest last value among increasing subsequences of length k + 1. Its length (${F.lisLength}) is the answer, but ${F.lisTails} is ${F.lisTailsAreSubsequence ? '' : 'not '}in order inside the input, so it is not a valid subsequence.`,
    },
    {
      q: 'In matrix-chain multiplication, why is dp[i][j] filled by increasing interval length rather than row by row?',
      options: [
        'A cell reads two shorter intervals, so those have to be filled before it',
        'Shorter intervals have lower costs, and the table is easier to read that way',
        'Row by row would visit the cells in a different order but give the same answer',
        'The brute force also goes by length, and the two have to be compared cell by cell',
      ],
      answer: 0,
      why: `Row by row the table reads cells that are still empty and counts them as 0: on the textbook chain it read ${F.chainRowUnfilled} such cells and answered ${F.chainRowCost} instead of ${F.chainCost}. Order is a dependency rule, not a style choice.`,
    },
  ],
};

export default lesson;
