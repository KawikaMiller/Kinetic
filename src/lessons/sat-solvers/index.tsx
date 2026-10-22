import { dpll } from '../../core/sat';
import type { LessonModule } from '../../core/types';
import { DEFAULT_WINDOW_START, F2, H, runWindow, summariseWindow } from './model';
import { Stage } from './Stage';

const F2_RUN = dpll(F2).stats;
const H_FIRST = dpll(H, { heuristic: 'first' }).stats;
const H_MOST = dpll(H, { heuristic: 'most-occurring' }).stats;
const WINDOW = summariseWindow(runWindow(DEFAULT_WINDOW_START));

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'DPLL looks for a satisfying assignment by propagating the values a clause forces and branching just when nothing is forced, and you drive it: the branching rule changes the size of the search tree, not the verdict.',
    what: `A SAT solver decides whether a formula written as clauses can be made true. DPLL repeats two moves: unit propagation (a clause with one open literal forces that literal) and a decision (try a variable true, then false when that branch falls into a falsified clause). On the six-clause formula F2 it needs ${F2_RUN.branches} branches and ${F2_RUN.conflicts} conflict. On the unsatisfiable formula H, branching in index order takes ${H_FIRST.branches} branches while a better rule takes ${H_MOST.branches}. A package-resolution problem is a set of clauses too, so a solver can answer which versions fit, or name a few requirements that clash.`,
    analogy: 'Filling in a Sudoku: you write in the squares that are forced, and when none is forced you pencil in a guess, which you rub out and replace if it leads to a contradiction.',
    useCases: [
      'Resolving which package versions can be installed together, and listing the clashing requirements when none can',
      'Checking that a set of configuration rules can hold at once, and naming the rules that cannot',
      'Planning and timetabling puzzles written as clauses and handed to a solver',
      'Checking a design: a formula that is satisfiable only if a bad state can be reached',
    ],
    why: 'Many scheduling, configuration and verification problems can be rewritten as SAT in an afternoon, and a solver is a cheap first attempt before writing a custom search. Knowing propagation, branching and what an unsatisfiable core is lets you read a solver\'s answer and encode a problem so it stays small.',
    watch: 'Each clause is a chip: green when satisfied, the accent colour when unit (it forces a value), red when falsified and grey while still open. In the search tree a red-tinted node is a branch that ended in a conflict, a solid green node found a model and a dim "+n" node stands for n more branches below depth 4. In the package scene a red-marked clause belongs to the unsatisfiable core. In the 200-formula plot blue bars are first-unassigned tree sizes, violet bars are most-occurring (drawn in front) and red bars mark the broken solver\'s wrong verdicts.',
  },
  tryThis: [
    'In Propagate, decide a = true and press Step four times: b, c and d are forced and clause 4 turns red (a conflict).',
    'Press Backtrack, then Step twice: a is now false, e is forced true and b forced false.',
    'Try to decide b: the move is refused because b is already forced.',
    `Decide c = true and press Step: d is forced and the page reports the model a = F, b = F, c = T, d = T, e = T.`,
    `Open You are the heuristic and branch on y1 first: the search ends with ${H_MOST.branches} branches, against ${H_FIRST.branches} for first-unassigned.`,
  ],
  keyIdeas: [
    `Unit propagation sets the last open literal of a clause whose other literals are false: it is forced, not guessed, and a formula can be solved with 0 branches (a chain of unit clauses, and package preset A, both are).`,
    `In this lesson a branching rule changes the size of the search tree, not the verdict: on H first-unassigned takes ${H_FIRST.branches} branches and most-occurring ${H_MOST.branches}, and on ${WINDOW.size} seeded formulas both gave the brute-force verdict on ${WINDOW.verdictsAgree}.`,
    `After a conflict the solver undoes its latest decision and tries the other value, and may say UNSAT once no untried branch is left. A solver that skips the flip calls satisfiable formulas UNSAT: wrong on ${WINDOW.brokenWrong} of ${WINDOW.size} seeded formulas in this window.`,
    'A dependency problem becomes clauses with one variable per package version, and an unsatisfiable answer comes with a core: a few requirements that cannot hold together. Real solvers add clause learning (CDCL) and restarts, which this lesson names and does not build.',
  ],
  quiz: [
    {
      q: 'What does unit propagation do in a DPLL search?',
      options: [
        'It picks the variable that occurs in the most clauses and tries true first',
        'When all literals of a clause but one are false, it sets the last one true',
        'It deletes each satisfied clause and leaves the assignment unchanged',
        'It tries both values of a variable and keeps the one with fewer conflicts',
      ],
      answer: 1,
      why: 'A clause whose other literals are false can be satisfied through its last literal alone, so propagation sets it: a forced value, not a guess. Picking a variable is the branching heuristic, and trying both values to compare conflicts is look-ahead, which is a different technique.',
    },
    {
      q: 'The formula (x) and (not x or y) and (not y or z) is handed to DPLL. How many decisions does the search make?',
      options: [
        'None: propagation sets x, then y, then z, and the clauses all hold',
        'One: it must guess x first and then propagate the rest of the variables',
        'Three: one decision per variable, each tried true first, in order',
        'Eight: the solver walks through the 2 to the power 3 assignments',
      ],
      answer: 0,
      why: 'The clause (x) is already unit, so x is forced; then (not x or y) forces y and (not y or z) forces z. The search ends with 0 branches and 3 propagations. Eight assignments is what brute force would try, not DPLL.',
    },
    {
      q: 'You change the branching rule from first-unassigned to most-occurring variable. What can change?',
      options: [
        'Whether the formula is satisfiable, since a different order finds different models',
        'Nothing, because both rules end up visiting exactly the same nodes',
        'Only the printed model, since the tree size is fixed by the formula',
        'How large the search tree is, but not the verdict about satisfiability',
      ],
      answer: 3,
      why: `Both rules are complete searches, so they agree on satisfiable or not (the lesson checks ${WINDOW.verdictsAgree} of ${WINDOW.size} formulas against brute force), but the tree size depends on the order: ${H_FIRST.branches} against ${H_MOST.branches} branches on H. A different rule may also print a different model.`,
    },
    {
      q: 'In the package encoding, what does the clause (not lib2 or util2) say?',
      options: [
        'Lib 2.0 and util 2.0 can never be installed together in one project',
        'At least one of lib 2.0 and util 2.0 has to be installed',
        'Picking lib 2.0 forces util 2.0, because lib 2.0 requires it',
        'Util 2.0 requires lib 2.0, so installing util will pull in lib as well',
      ],
      answer: 2,
      why: 'The clause (not lib2 or util2) is the implication lib2 then util2: if lib 2.0 is installed, util 2.0 has to be too. A ban on the pair would be (not lib2 or not util2), at-least-one would be (lib2 or util2), and the reverse implication would read (not util2 or lib2).',
    },
    {
      q: 'A solver reports that your dependency set is unsatisfiable. Which output helps you most?',
      options: [
        'The last assignment it tried before giving up, which is rarely meaningful',
        'A few rules that cannot all hold, such as the four that clash',
        'The number of conflicts it hit, since a larger count means a harder problem',
        'A random-looking subset of packages with the conflicts left out of the report',
      ],
      answer: 1,
      why: 'An unsatisfiable core names requirements that cannot hold together, and dropping any one of them lets the rest resolve, so it points at what to change. A trail or a conflict count explains nothing about the clash, and a subset without the conflicts hides the cause.',
    },
  ],
};

export default lesson;
