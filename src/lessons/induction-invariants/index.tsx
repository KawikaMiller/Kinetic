import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Induction proves a claim for every n with two pieces, a base case and a step from each case to the next; a loop invariant is the same idea for code: true before the loop, kept by every iteration, and enough at the end to give the answer.',
    what: 'Ordinary induction: prove P(1), then prove that P(k) implies P(k + 1); together they knock over every domino. Strong induction lets the step use every smaller case, not just the previous one. A loop invariant is a statement about the loop variables that holds before the loop (initialisation), stays true after each iteration (maintenance), and, combined with the loop having stopped, gives the result (termination). A variant, a number that shrinks every iteration, proves the loop stops. It builds on `proof-techniques`, `recursion` and `binary-search`.',
    analogy: 'A row of dominoes: you have to push the first one (the base case), and each one has to be close enough to hit the next (the step). Miss either and the row stays standing.',
    useCases: [
      'Convincing yourself a loop is correct: binary search, two pointers, partitioning in quicksort',
      'Proving a recursive function correct, case by case from the base case up',
      'Writing assertions and property tests that check an invariant at each step',
      'Reasoning about data-structure invariants: a heap property, a balanced tree, a sorted prefix',
    ],
    why: 'Off-by-one errors and loops that never end are some of the most common bugs, and an invariant is how you find them before they ship: you check the three conditions instead of testing a few inputs. The same reasoning is what code reviewers and interviewers mean by "argue this loop is correct".',
    watch: 'Dominoes: the domino being checked is yellow, fallen dominoes are green, the step that breaks turns its domino red with a red ✗ marker above the gap, and standing dominoes are grey. The square under them grows one L-shaped layer per domino: the newest layer is solid yellow, earlier ones blue. In the horses claim, a step whose two groups share a horse has a green border and green shared horses; the step with no shared horse has a red border. Loop invariant: the invariant banner is green with ✓ while it holds and red with ✗ when it breaks; the search range [lo, hi] is a blue bracket over the array, mid is yellow with its pointer, a found value is green, ruled-out cells are grey, and the "?" cell past the end turns red when it is read. The injected bug line is tinted red, the line running now has a yellow bar, and the range-size variant is a violet bar. Strong induction: the node being proven is solid yellow, proven nodes and their edges are green, and nodes not yet proven are grey.',
  },
  tryThis: [
    'Set Base case to not proven and press Push the first domino: nothing falls, even with the step still proven.',
    'Pick All horses are the same colour with both toggles on: domino 1 falls, then the step from 1 to 2 breaks in red.',
    'In Loop invariant, inject lo = mid and click 91 in the array: the invariant stays ✓ but the range size stops shrinking, and the loop is stopped at 50 iterations.',
    'Inject while (lo < hi) and search for 91: the loop exits with one cell unchecked and returns -1, a wrong answer.',
    'In Strong induction, type 1001 and press Enter, then play: 1001 = 13 × 77 uses P(13) and P(77), not P(1000).',
  ],
  keyIdeas: [
    'Induction needs both a base case and a step; either alone proves nothing.',
    'Strong induction lets the step use every smaller case, not just n − 1.',
    'A loop invariant must hold before the loop, survive every iteration, and give the answer once the loop stops.',
    'A variant that shrinks every iteration is what proves the loop terminates.',
  ],
  quiz: [
    {
      q: 'The step "if P(k) then P(k + 1)" is proven, but P(1) has not been checked. What does that prove?',
      options: [
        'Nothing yet: without a first true case, no P(n) follows',
        'Every P(n), since the base case is only a formality',
        'Every P(n) from n = 2 on, just not P(1) itself',
        'Every other P(n), because the step covers alternate cases',
      ],
      answer: 0,
      why: 'The step only says each domino would knock over the next; something has to push the first. P(n): "n = n + 1" has a perfectly valid step (k = k + 1 gives k + 1 = k + 2) and is false for every n. Calling the base case a formality is exactly the mistake.',
    },
    {
      q: 'Where does the "all horses are the same colour" induction break?',
      options: [
        'The step from 1 horse to 2: the two groups share no horse',
        "The base case: one horse can't be compared with itself",
        'The step from 2 horses to 3, where the groups first overlap',
        'Nowhere: the argument is valid, and all horses really match',
      ],
      answer: 0,
      why: 'The step removes one horse, then another, and uses a horse in both groups to tie the colours. With 2 horses the groups are {1} and {2}: nothing is shared. Every later step works, but one broken link is enough. The base case is fine: one horse matches itself.',
    },
    {
      q: 'In binary search, `lo = mid` replaces `lo = mid + 1`. Which part of the correctness argument fails?',
      options: [
        'Termination: the range can stop shrinking, so the loop may not end',
        'Initialisation: the invariant is false before the first iteration',
        'Maintenance: the target can fall outside [lo, hi] after an update',
        'None of it: the search is only slower, and always finds the target',
      ],
      answer: 0,
      why: 'The target stays inside [lo, hi], so the invariant is kept. But when hi = lo + 1, mid = lo, and if a[lo] is below the target, lo = mid changes nothing: the variant stops shrinking and the loop can run forever (search for 91 with that bug).',
    },
    {
      q: 'Why does the factor-tree proof use strong induction rather than ordinary induction?',
      options: [
        '360 = 18 × 20 relies on P(18) and P(20), not on P(359)',
        '360 has more than two prime factors, counted with repeats',
        'The base case 2 is prime, so the step needs extra strength',
        'Ordinary induction cannot be used on claims about primes',
      ],
      answer: 0,
      why: 'Ordinary induction only lets step n use P(n − 1). Factoring n splits it into two smaller numbers, which can be anywhere below n, so the step needs every smaller case. The number of prime factors has nothing to do with it.',
    },
  ],
};

export default lesson;
