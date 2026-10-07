import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'P is the class of yes/no problems you can solve in polynomial time; NP is the class where a proposed yes-answer can be checked in polynomial time. Every P problem is in NP, and whether the two are equal is the biggest open question in computer science.',
    what: 'P and NP are classes of decision problems. In NP, a "yes" comes with a certificate (a subset, an assignment, a tour) that a polynomial-time verifier can check. NP does not mean "not polynomial": every problem in P is in NP. A problem is NP-hard if every NP problem reduces to it in polynomial time, and NP-complete if it is NP-hard and also in NP: subset sum, SAT, 3-colouring and the decision version of travelling salesman are examples. Nobody has proven P ≠ NP, but no polynomial algorithm is known for any NP-complete problem. It builds on `big-o`, `logs-exponentials`, `backtracking` and `combinatorics`.',
    analogy: 'A jigsaw puzzle: checking a finished puzzle takes a glance, but finishing one can take all afternoon. NP is "easy to check"; P is "easy to do".',
    useCases: [
      'Recognising that scheduling, packing or selection under constraints is NP-hard before promising an exact optimal answer',
      'Choosing heuristics, approximation algorithms or solvers (SAT, ILP) instead of brute force',
      'Spotting pseudo-polynomial wins: a knapsack or subset-sum DP is fine when the numbers are small',
      'Understanding why some security assumptions rest on problems believed to be hard',
    ],
    why: 'Mid-level engineers meet NP-hard problems disguised as product requirements: timetables, delivery routes, bin packing, feature selection. Recognising one early saves weeks spent on an exact algorithm that cannot scale, and points you at the heuristics, approximations and special cases that actually work.',
    watch: 'Check vs solve: numbers you chose, and the subset brute force is trying, are yellow; a subset that passes the check is green and one that fails is red; unchosen numbers after a check are grey. The verify counter is green (the cheap side) and the brute-force counter orange (the costly side); on the plot, 2ⁿ is the orange curve, n the green one, and the current n a yellow line. The DP table colours reachable sums blue, the target column green, and unreachable cells grey outlines. Pseudo-polynomial trap: DP table cells orange, brute-force subsets sky blue, input length violet, the chosen digits yellow. Class map: P is outlined blue, NP violet, NP-complete (the dashed overlap) yellow and NP-hard orange; chips are blue until placed, then green when right and red when misplaced, and the feedback panel is green or red. In Spot it at work, a card turns green when tagged with the right problem and red when not.',
  },
  tryThis: [
    'In Check vs solve, click numbers to build a subset and press Verify my subset: the check takes n steps, whatever the numbers.',
    'Set n to 24 and press Solve: the counter climbs through 16,777,216 subsets, and the caption extrapolates n = 60 from your browser\'s measured speed.',
    'Switch Solver to DP table with n = 24 and Solve: a few thousand cells instead of 16 million subsets, because the target is small.',
    'In Pseudo-polynomial trap, drag Digits per number to 9: the table grows about 10× per digit while brute force stays at 256 subsets.',
    'In Class map, put Halting problem in NP-complete and read why it does not fit, then place it correctly.',
  ],
  keyIdeas: [
    'NP means "a yes answer can be checked in polynomial time", not "not polynomial"; P ⊆ NP.',
    'NP-complete = in NP and NP-hard: every NP problem reduces to it, so a fast algorithm for one would give one for all.',
    'A DP whose cost grows with a number\'s value (not its length) is pseudo-polynomial, not polynomial.',
    'P ≠ NP is believed, not proven; in practice NP-hard problems get heuristics, approximations and solvers.',
  ],
  quiz: [
    {
      q: 'What is the definition of NP?',
      options: [
        'Problems whose yes answers can be checked in polynomial time',
        'Problems that cannot be solved in polynomial time by any method',
        'Problems that need exponential time on every possible input',
        'Problems outside P, which makes them strictly harder than it',
      ],
      answer: 0,
      why: 'NP stands for nondeterministic polynomial time, and it is defined by fast checking: a certificate for a yes answer can be verified in polynomial time. "Not polynomial" is the classic misreading: sorting is in NP too, because P ⊆ NP, and nobody has proven any NP problem needs exponential time.',
    },
    {
      q: 'Is every problem in P also in NP?',
      options: [
        'Yes: if you can solve it fast, you can check an answer fast',
        'No: P and NP are separate classes with nothing in common',
        'Only if P = NP, which is still an open question today',
        'Only for problems about numbers, such as subset sum',
      ],
      answer: 0,
      why: 'A verifier can ignore the certificate and just solve the problem in polynomial time, so P ⊆ NP is proven. What is open is whether NP ⊆ P as well, i.e. whether P = NP.',
    },
    {
      q: 'The subset-sum DP fills (n + 1) × (target + 1) cells. Why is that not a polynomial-time algorithm?',
      options: [
        "Its cost follows the target's value, exponential in its digits",
        'It is polynomial, which proves that subset sum is in P after all',
        'Tables always take exponential time, whatever their dimensions',
        'The table only gives correct answers when every number is prime',
      ],
      answer: 0,
      why: 'Running time is measured against the length of the input. A target with d digits can be about 10ᵈ, so the table grows exponentially in d: pseudo-polynomial. That is why it does not put subset sum in P, even though it is fast when the target is small.',
    },
    {
      q: 'What does it mean for a problem to be NP-complete?',
      options: [
        'It is in NP, and every NP problem reduces to it in polynomial time',
        'No computer program can solve it, however long the program runs',
        'It becomes solvable in polynomial time once the input is sorted',
        'It is among the hardest problems in P: quick, but slower than most',
      ],
      answer: 0,
      why: 'NP-complete = NP-hard (everything in NP reduces to it) plus being in NP itself. "No program can solve it" describes undecidable problems like halting, which is NP-hard but not in NP, so not NP-complete. NP-complete problems can all be solved, just with no known polynomial algorithm.',
    },
  ],
};

export default lesson;
