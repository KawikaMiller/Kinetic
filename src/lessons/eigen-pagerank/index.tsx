import type { LessonModule } from '../../core/types';
import { DEFAULT_MATRIX, PRESETS as MATRICES, behaviourOf, eigenCoordinates, iterates, stretchAt } from './eigen';
import { presetById, rankSolve, rankSteps, ringPositions, type Web } from './pagerank';
import { Stage } from './Stage';
import { n3, n4 } from './text';

const D = 0.85;
const E1 = [Math.SQRT1_2, Math.SQRT1_2];
const E2 = [Math.SQRT1_2, -Math.SQRT1_2];
const AT_THREE = iterates(DEFAULT_MATRIX, [1, 0], 3)[3];
const COMPONENTS = eigenCoordinates(E1, E2, AT_THREE)!;
const RATIO_THREE = COMPONENTS[1] / COMPONENTS[0];
const STRETCH_THREE = stretchAt(DEFAULT_MATRIX, [1, 0], 3)!;
const ROTATION = behaviourOf(MATRICES.find((m) => m.id === 'rotation')!.A);
if (ROTATION.kind !== 'complex') throw new Error('rotation has complex eigenvalues');
const EXAMPLE = rankSolve(presetById('example').web, D, 'spread')!;
const CHAIN_STEPS = rankSteps(presetById('chain').web, 1, 'drop', 3);

/** One link from a high-rank page against three links from low-rank ones (the quiz's web). */
const QUIZ_WEB: Web = { names: ['H', 'X', 'Y', 'L1', 'L2', 'L3'], at: ringPositions(6), edges: [[0, 1], [1, 0], [3, 2], [4, 2], [5, 2], [2, 0]] };
const QUIZ_RANKS = rankSolve(QUIZ_WEB, D, 'spread')!;

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'An eigenvector is a direction a matrix only stretches; applying a matrix again and again turns every arrow toward its strongest one, and PageRank is that idea run on the links of a web.',
    what: `Most arrows turn when a matrix acts on them, but an eigenvector keeps its direction and is only stretched by its eigenvalue. Apply the matrix over and over, rescaling each time (power iteration), and every arrow swings toward the eigenvector with the largest eigenvalue. Some matrices have no such direction in the reals (a rotation), or only one (a shear). PageRank applies the same iteration to a web: a surfer follows a link with probability d and jumps to a random page otherwise, and a page's rank is the share of time the surfer spends there. The damping value d = 0.85 is the value usually quoted from the original paper (from memory, check the source).`,
    analogy: 'Stirring a pot over and over: whatever you start with, the pattern ends up shaped by the strongest swirl. Rank flows through a web the same way, so a page is ranked by who links to it, not by how many.',
    useCases: [
      'PageRank and other link-based ranking, where the rank is the dominant eigenvector of a damped link matrix',
      'Principal component analysis, whose axes are eigenvectors of a covariance matrix',
      'Vibration and stability analysis, where eigenvalues give modes and growth rates',
      'Markov chains and Google-style random surfers, whose long-run behaviour is an eigenvector problem',
    ],
    why: 'Eigenvectors explain what repeated application of a linear map does in the long run, which is the heart of ranking, dimensionality reduction and many iterative algorithms. Seeing where the idea fails (rotations, shears, leaks) tells you what an algorithm needs before it converges.',
    watch: 'Twelve blue arrows start at 30 degree spacing and leave dashed blue trails; the green line is the eigen-line of the larger eigenvalue and the violet line is the other. The yellow arrow is the one you drag, and its residual reads green when it is an eigenvector and red otherwise. In the web, each page is a blue disc whose area is its rank, a red tint marks a dead end that drops its rank, and a red total means rank has leaked. The red curve is the change per step on a log axis and the dashed violet line is the d^t bound.',
  },
  tryThis: [
    `In Apply it again and again press Apply A three times: the second ÷ first component of the arrow at 0° reads ${n3(RATIO_THREE)} (one third each time, ${n3(1 / 27)} after three) and the stretch factor is ${n3(STRETCH_THREE)}, heading to the eigenvalue 3.`,
    `In When nothing lines up the rotation has the complex eigenvalues ${n3(ROTATION.re)} ± ${n3(Math.abs(ROTATION.im))}i with modulus ${n3(ROTATION.modulus)}: press Apply A and the arrows keep turning. Press shear to see one eigen-line approached slowly.`,
    `In PageRank as a random surfer press A, B, C → D, D → A: the ranks are ${EXAMPLE.map((r, i) => `${'ABCD'[i]} ${n4(r)}`).join(', ')}, and B and C get only the teleport share (1 − 0.85) ÷ 4 = ${n4(0.15 / 4)}.`,
    `In Where it leaks pick Drop their rank, slide the damping d to 1 and step through the chain A → B → C: the total rank falls ${CHAIN_STEPS.map((s) => n3(s.total)).join(', ')} and is gone after 3 steps.`,
  ],
  keyIdeas: [
    'An eigenvector keeps its direction under the matrix and is stretched by its eigenvalue; repeated application turns arrows toward the one with the largest eigenvalue.',
    'A rotation has no real eigenvector and a shear has one, so the iteration keeps turning or creeps like 1/k instead of settling at a fixed rate.',
    'PageRank is power iteration on a damped link matrix: rank flows along links, so one link from a high-rank page can outweigh several from low-rank pages.',
    'Dead ends and spider traps leak or swallow rank; damping with a uniform teleport restores a total of 1 and a sensible ranking.',
  ],
  quiz: [
    {
      q: 'A matrix rotates every arrow by 40 degrees. Which arrow does it only stretch?',
      options: [
        'None in the real plane: its eigenvalues are a complex pair, not real numbers',
        'The arrow along the x axis, because a rotation keeps the coordinate axes fixed in place',
        'Every arrow, since a rotation changes no length and so stretches each one by exactly 1',
        'Two arrows, one for each of the two eigenvalues that a rotation matrix has',
      ],
      answer: 0,
      why: 'A matrix has eigenvalues, but they need not be real. A rotation by 40 degrees turns each real arrow, so the iteration keeps turning the arrows and does not settle; its eigenvalues are complex with modulus 1.',
    },
    {
      q: `Page X has one link, from a page H that itself has high rank. Page Y has three links, from three pages with no links to them. At d = ${D}, which ranks higher?`,
      options: [
        `X, at ${n4(QUIZ_RANKS[1])} against ${n4(QUIZ_RANKS[2])}: rank flows from a high-rank page, so one link outweighs three`,
        `Y, at ${n4(QUIZ_RANKS[2])} against ${n4(QUIZ_RANKS[1])}, because PageRank counts the links a page receives`,
        'They tie, since each page is reached by links and the damping treats all of those links alike',
        'X, because it was added to the web first and PageRank is said to favour the older pages',
      ],
      answer: 0,
      why: `The rank a link passes on is the linking page's rank divided by its out-links, so it is not a count. In this web the single link from H is worth more than three links from pages that hold just the teleport share, ${n4(QUIZ_RANKS[1])} against ${n4(QUIZ_RANKS[2])}.`,
    },
    {
      q: 'In the example A, B, C → D, D → A nothing links to B. What rank does B get at d = 0.85?',
      options: [
        `${n4(0.15 / 4)}: just the teleport share (1 − d) ÷ n, since no link brings it any rank`,
        '0: with no in-links a page receives nothing and its rank stays at zero',
        '0.25: every page keeps its starting share of 1 ÷ 4 when it has no in-links',
        `${n4(EXAMPLE[3])}: it receives the rank D passes on, like A does`,
      ],
      answer: 0,
      why: 'The teleport gives each page (1 − d) ÷ n each step, so a page nothing links to still has that much. B and C sit exactly at 0.0375 in the example; A and D carry the rest, with D linking just to A.',
    },
    {
      q: 'In the chain A → B → C, C has no out-links. At d = 1 with dead ends dropped, what happens to the total rank?',
      options: [
        'It falls to 0 after 3 steps: rank reaching C is dropped',
        'It stays at 1, because rank is conserved when the links are followed exactly as drawn',
        'It settles at 1 ÷ 3, the share of the one page that cannot leak',
        'It grows, because each step adds the teleport share to every page',
      ],
      answer: 0,
      why: `At d = 1 there is no teleport, and a dead end drops the rank it receives. The totals run ${CHAIN_STEPS.map((s) => n3(s.total)).join(', ')} and then stay at 0. Damping above 0 with the rank spread uniformly restores a total of 1.`,
    },
  ],
};

export default lesson;
