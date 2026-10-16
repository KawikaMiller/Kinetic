import type { LessonModule } from '../../core/types';
import { FACTS as F } from './facts';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: `Minimax gives every position the value it has if both players play perfectly, working up from the leaves; alpha-beta pruning returns exactly the same value while skipping branches that cannot change it.`,
    what: `The backtracking lesson walked a decision tree looking for any solution; here two players alternate, so the value of a position is defined from the leaves up. At a max node the maximiser takes the largest child, at a min node the minimiser takes the smallest. Alpha-beta carries a window down the tree: alpha is the best the maximiser can already guarantee on this path and beta the best the minimiser can. When alpha reaches beta the rest of that node's children cannot change the answer and are skipped. The result is identical to minimax, and how much work is saved depends on move order: with the best move first a tree of branching 3 and depth 3 needs ${F.minimum} leaves instead of ${F.leaves}. Tic-tac-toe shows the saving on a real game, and a depth limit with a heuristic shows what to do when the tree is too big, including the horizon effect.`,
    analogy: 'Choosing a chess move by reading out replies: once you find that one reply already refutes a candidate, you stop reading the other replies to that candidate and move on, because they cannot rescue it.',
    useCases: [
      'Board-game engines: chess, checkers, tic-tac-toe style games and their search cores',
      'Adversarial planning where an opponent reacts to each move, such as simple game AIs',
      'Teaching pruning in general: skip work that provably cannot change the result',
      'A baseline to compare with Monte Carlo tree search and learned evaluation, which are named only here',
    ],
    why: 'Alpha-beta is the standard first example of making an exponential search affordable without losing correctness, and the horizon effect is the standard first example of what a depth limit costs. Both come up whenever a search has to stop before it reaches the end.',
    watch: 'Max nodes are blue (--info) and min nodes violet (--violet), structural roles; the node being worked on is yellow (--hi) and the child chosen at each node is a green edge (--ok). In alpha-beta each node shows its window (alpha, beta) in yellow text, and a skipped subtree is faded, dashed and struck through. Node counts are red (--bad) for plain minimax, the costly side, and green for alpha-beta. On the tic-tac-toe boards X is blue and O violet, the chosen move yellow, and in the depth scene a chosen move that loses ground is red.',
  },
  tryThis: [
    `A tree you can edit, on the defaults: set the predictions to ${F.rootValue} and move ${F.bestMove}, then press play. The root is worth ${F.rootValue} and the best first move is ${F.bestMove}: your prediction reads right once the run ends. Select a leaf and change it to see the root change.`,
    `Alpha-beta, on the defaults: press play. It looks at ${F.givenLeaves} of ${F.leaves} leaves and still returns ${F.rootValue}. Choose Best first: ${F.bestLeaves} leaves, the Knuth and Moore minimum ${F.minimum} for this shape. Choose Worst first: ${F.worstLeaves} of ${F.leaves}. The root value never changes.`,
    `Tic-tac-toe, on the defaults: click the centre. The machine replies at cell ${F.centreMove}; to find it plain minimax visited ${F.centrePlain} positions and alpha-beta ${F.centreFast}, both searching ${F.centrePlies} plies to the end. From the empty board plain minimax visits ${F.fullTree}.`,
    `When the tree is too big, on the defaults (two corners and the centre, O to move, depth 1): the machine picks cell ${F.shallowMove}, which is really ${F.shallowOutcome}. Move the depth to 3: it picks cell ${F.deepMove}, ${F.deepOutcome}. The danger sat just past the horizon.`,
    `The growth table, on the defaults (b = ${F.branching}, d = ${F.plies}): ${F.branching}^${F.plies} = ${F.growth} positions. The 35 is a rough figure from memory.`,
  ],
  keyIdeas: [
    `Alpha-beta returns the same value as minimax: on the default tree both give ${F.rootValue}, and whichever order the children are tried in, ${F.sameValue ? 'the value stays put' : 'the value moves (a bug)'}.`,
    `Move order sets the saving: ${F.givenLeaves}, ${F.bestLeaves} and ${F.worstLeaves} leaves of ${F.leaves} for the drawn, best-first and worst-first orders, against a minimum of ${F.minimum} for a perfectly ordered tree with distinct values.`,
    `Pruning pays on a real game: after your first move to the centre the machine's search takes ${F.centrePlain} positions with plain minimax and ${F.centreFast} with alpha-beta.`,
    `A depth limit trades correctness for time: depth 1 picks a move that is really ${F.shallowOutcome} where depth 3 finds ${F.deepOutcome}, because the decisive move lies past the horizon.`,
  ],
  quiz: [
    {
      q: 'You reorder the children of a node so that more of the tree is pruned. What happens to the root value?',
      options: [
        'It stays the same, because pruning only skips work that cannot change it',
        'It changes slightly, since pruning discards some of the positions it was built from',
        'It improves, since a better order lets the search find stronger moves',
        'It changes only when two children have equal values, because ties are skipped',
      ],
      answer: 0,
      why: `Alpha-beta skips a branch just when its value provably cannot reach the root. On the default tree the root is ${F.rootValue} whether the search looks at ${F.givenLeaves}, ${F.bestLeaves} or ${F.worstLeaves} leaves.`,
    },
    {
      q: 'Why does the search stop when alpha reaches beta at a node?',
      options: [
        'The other side already has a better option elsewhere, so the rest of this node cannot matter',
        'The node has used up the depth it was given and has to hand back a value to its parent',
        'The remaining children are all equal in value to the ones already looked at',
        'The maximiser and the minimiser have agreed on a move to play at this node',
      ],
      answer: 0,
      why: 'Alpha is what the maximiser can already guarantee on this path and beta what the minimiser can. When alpha is at least beta, whoever chose to enter this node would prefer an earlier alternative, so the remaining children cannot change the root.',
    },
    {
      q: 'With the best move tried first at every node, how many leaves does alpha-beta need in a tree of branching 3 and depth 3 with distinct values?',
      options: [
        `${F.minimum}, which is b^ceil(d/2) + b^floor(d/2) - 1`,
        `${F.leaves}, since each leaf still has to be evaluated once`,
        `${Math.round(F.leaves / 2)}, since half of the tree can be skipped`,
        `${F.leaves - F.minimum}, which is the number of leaves that get skipped`,
      ],
      answer: 0,
      why: `A perfectly ordered tree needs 3^2 + 3^1 - 1 = ${F.minimum} leaves of ${F.leaves}. On the default values the best order here gives ${F.bestLeaves}; a worst order gives ${F.worstLeaves}.`,
    },
    {
      q: `With the depth limited to 1, the machine picks cell ${F.shallowMove} in the two-corners position, which is really ${F.shallowOutcome}. What went wrong?`,
      options: [
        'The decisive reply lies just past the depth limit, so the heuristic judged the move wrongly',
        'The machine was searching for a draw rather than a win, so it chose a poor move',
        'Alpha-beta pruned the good move away, since depth 1 prunes more than depth 3',
        'The board was mislabelled, so the machine thought it was playing X',
      ],
      answer: 0,
      why: `At depth 1 the move is scored by counting open lines right after it, which cannot see the opponent's fork one reply later. At depth 3 the same search picks cell ${F.deepMove}, ${F.deepOutcome}. That is the horizon effect.`,
    },
  ],
};

export default lesson;
