import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Backtracking builds an answer one choice at a time, and the moment a partial answer cannot work it undoes the last choice and tries the next one.',
    what: 'It is depth-first search over a tree of choices, written with `recursion`: make a choice, recurse to make the next one, then undo it and try the alternative. Its power is pruning: checking a partial answer as you build it lets the search abandon a branch, and everything below it, as soon as it breaks a rule. The worst case is still exponential, but a good check means most of the tree is never visited.',
    analogy: 'Walking a hedge maze with chalk: at every fork take the first path, and as soon as you hit a dead end walk back to the last fork and try the next path. You never walk down a path you already know is blocked.',
    useCases: [
      'Puzzle and constraint solvers: N-Queens, Sudoku, crosswords, timetables with rules',
      'Generating every subset, permutation or combination, for example as test inputs',
      'Backtracking regex engines, which try one alternative and back up when it fails',
      'Route and layout search that explores a choice and undoes it at a dead end',
    ],
    why: 'Whenever a problem says "find all" or "find any arrangement that satisfies these rules", backtracking is the first tool to reach for, and it is a staple of interviews. Knowing where to put the check (as early as possible) is the difference between a search that finishes instantly and one that never does. The tree it walks is the same depth-first walk as in `tree-traversals`.',
    watch: "On the board, the square being tried is yellow, placed queens are blue, squares the standing queens attack get a red tint, and when all n queens fit they turn green. A red ring marks queens that attack each other, and a yellow ring marks the square a backtrack just lifted a queen from. In the search tree (one dot per placement tried, a row label per level), the current node is yellow (a yellow outline when it is also dead or a solution), nodes on the current path are a blue tint, dead branches are red with a dashed red edge, solutions are green, siblings not tried yet are faint grey, and nodes the search has finished with turn plain. In Subsets mode, included items are blue, the item being decided is outlined yellow, skipped items are grey, and each output subset is a green chip and a green leaf label. In the call stack the running frame is yellow, waiting frames are dimmed, a dead placement is red and a solution green. The counters: placements tried in yellow, solutions in green, the unpruned total in red.",
  },
  tryThis: [
    'Play n = 4 with Check queens set to As you place, and watch each red dead branch stop the tree from growing below it.',
    'Flip Check queens to Only full boards and compare the Placements tried counter with the pruned run.',
    'Pick n = 8 and step through the solution frames: the counters run even though the tree is not drawn.',
    'Switch the Puzzle to Subsets of {a, b, c, d} and follow the undo steps in the call stack.',
  ],
  keyIdeas: [
    'Try a choice, recurse, then undo it: that is the whole template.',
    'Pruning cuts a branch the moment it breaks a rule, so the subtree below it is never visited.',
    'The worst case is still exponential: pruning changes how much of the tree you walk, not the answers.',
    'When every leaf is an answer, as with all subsets, there is nothing to prune.',
  ],
  quiz: [
    {
      q: 'On 8-queens, how does checking as you place compare with checking only full boards?',
      options: [
        'Both find all 92 solutions; pruning tries 15,720 placements, not 19 million',
        'Pruning finds fewer solutions, because it skips boards it never fully builds',
        'Both try every placement; pruning only changes the order they are tried in',
        'Pruning tries fewer placements but can miss solutions in the branches it cuts',
      ],
      answer: 0,
      why: 'A cut branch only ever contains boards with two queens already attacking, and no queen added later fixes that, so nothing is lost. The tempting wrong answer is that pruning can miss solutions: it can only skip boards that were doomed. That is why backtracking beats brute force by orders of magnitude while giving the same answers.',
    },
    {
      q: 'What does "backtrack" mean in this search?',
      options: [
        'Undo the last choice and try the next option at that level',
        'Restart the whole search from an empty board with new rules',
        'Jump back to the root and pick a random column for row 1',
        'Mark the board as unsolvable and stop the search right there',
      ],
      answer: 0,
      why: 'When a row has no safe column left, the search returns to the row above, lifts that queen and moves it to its next column. It never restarts from scratch, which is what makes it efficient, and a dead end in one branch says nothing about the others.',
    },
    {
      q: 'With checking as you place, when exactly is a branch cut?',
      options: [
        'As soon as the new queen is attacked by one already placed',
        'Once the board is full and the final check finds an attack',
        'When the row has been tried more than n times in total',
        'Whenever the queen sits in a column a solution used before',
      ],
      answer: 0,
      why: 'Each placement is checked against the queens above it, and an attacked one is a dead node that is never expanded. Waiting for the full board is the unpruned search: it reaches the same verdict, but only after building every board below the mistake.',
    },
    {
      q: 'Why is generating all subsets of {a, b, c, d} no faster than brute force?',
      options: [
        'Every leaf is an answer, so there is no branch to cut',
        'Its include/skip tree is deeper than a brute-force loop',
        'It has to sort the items first, which costs n log n',
        'Undoing each choice doubles the work done at each level',
      ],
      answer: 0,
      why: 'Pruning only pays when some partial answers are hopeless. Here all 2⁴ = 16 leaves are wanted, so the search has to visit every one. The tree is exactly as deep as the number of items, the same as a brute-force loop over bitmasks.',
    },
  ],
};

export default lesson;
