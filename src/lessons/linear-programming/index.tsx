import type { LessonModule } from '../../core/types';
import { DEFAULT_CONSTRAINTS, DEFAULT_OBJECTIVE, integerSolution, round, solve, vertexText } from './lp2d';
import { Stage } from './Stage';

const D = DEFAULT_CONSTRAINTS;
const BEST = solve(D, DEFAULT_OBJECTIVE.cx, DEFAULT_OBJECTIVE.cy);
const SLANTED = solve(D, 1, 2);
const TIED = solve(D, 1, 1);
const INTS = integerSolution(D, 1, 2);
const BEST_POINT = vertexText(BEST.best[0]);
const SLANTED_POINT = vertexText(SLANTED.best[0]);

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A linear program asks for the best value of a straight-line objective inside a region cut out by straight-line constraints: the optimum sits at a corner of the region, and the region can be empty or open, which you see by dragging the lines.',
    what: `Linear programming maximises an objective such as 3x + 2y while constraints of the form a x + b y <= c (and x, y >= 0) cut out a feasible region, a convex polygon. The objective is a straight line sweeping across the polygon, so its best value is reached at a corner (a vertex), or along a whole edge when the line lies parallel to it; on the default region the best value is ${round(BEST.value!)} at ${BEST_POINT}. Two other verdicts have names: infeasible, when no point satisfies the constraints, and unbounded, when the objective can grow without limit. Simplex walks from corner to corner along edges that improve the objective; requiring whole numbers is a different, harder problem.`,
    analogy: 'Pushing a ruler across a cut-out of paper until it just touches the shape: the last place it touches is a corner, or a whole edge if the ruler lies along that edge.',
    useCases: [
      'Allocating machine time, budget or ingredients to maximise profit or minimise cost',
      'Blending, diet and supply-chain planning models, where the objective and the limits are straight lines',
      'Network flow and scheduling problems written as LPs and handed to a solver',
      'Relaxing a hard whole-number problem to an LP, to get a bound on the best answer it can have',
    ],
    why: 'Optimisation models in operations, infrastructure and machine learning are often LPs or are built from them, and solvers answer infeasible and unbounded as readily as optimal. Knowing why those two answers happen, and why the optimum is a vertex, lets you read a solver\'s verdict and fix a model that is wrong rather than hard.',
    watch: 'The blue-tinted area is the feasible region. Each constraint is a coloured line with a numbered hollow handle you can drag, the bright line is the objective at its best level, and green dots are the optimal vertices. A red verdict means infeasible or unbounded; the vertex table lists the corners with their objective, with the best row tinted green. In the simplex scene the bright path is the walk and the table gives each edge\'s objective change and ratio test. In the whole-number scene the red hollow dot is the rounded LP optimum, outside the region, and the green dots are the best whole points.',
  },
  tryThis: [
    `In The region read the vertex table for the default objective: the best value is ${round(BEST.value!)} at ${BEST_POINT}.`,
    `Set the objective to cx = 1, cy = 2: the optimum jumps to ${SLANTED_POINT}, value ${round(SLANTED.value!)}.`,
    `Set cx = 1, cy = 1: two corners tie at ${round(TIED.value!)} and the page says the whole edge between them is optimal.`,
    'Press Add a constraint and set a = -1, b = -1, c = -5: the page reports Infeasible and names x + y <= 4 against -x - y <= -5.',
    `Open Whole numbers: the LP optimum ${round(SLANTED.value!)} against the whole-number optimum ${round(INTS.value!)}, and the rounded point (3, 2) is marked as outside the region.`,
  ],
  keyIdeas: [
    `A linear objective over a bounded convex polygon reaches its best value at a vertex, or along a whole edge when the objective line is parallel to it (a theorem, argued in the lesson and checked on 200 seeded LPs when it was built); the best of 3x + 2y on the default region is ${round(BEST.value!)} at ${BEST_POINT}.`,
    'Two verdicts besides optimal have names: infeasible, when no point satisfies the constraints (in the plane a clash of at most 3 constraints explains it, by Helly\'s theorem), and unbounded, when the objective grows without limit.',
    'Simplex walks from vertex to vertex along edges that improve the objective and stops where none does, which is optimal because a linear objective has no other kind of peak; it can take exponentially many steps on contrived inputs yet is fast in practice (named from memory, with a verify note on the page).',
    `Rounding an LP optimum can leave the region: ${SLANTED_POINT} rounds to (3, 2), which breaks x + y <= 4, and the best whole points are worth ${round(INTS.value!)} against ${round(SLANTED.value!)}.`,
  ],
  quiz: [
    {
      q: 'Where does a linear objective reach its best value on a bounded feasible polygon?',
      options: [
        'At a corner, or along a whole edge parallel to the objective line',
        'At an interior point, where each constraint still has some slack left',
        'At the point nearest the origin, whatever the objective happens to be',
        'At the midpoint of the longest edge, because of a symmetry argument',
      ],
      answer: 0,
      why: 'From any point with slack on each side, a step in the direction the objective improves stays inside the region, so the best value cannot sit strictly inside. It is reached at a vertex, or along a whole edge when the objective line is parallel to that edge, which is a theorem the lesson also checks on seeded examples.',
    },
    {
      q: 'Maximise 3x + 2y under x + y <= 4, x + 3y <= 7, x <= 3 and x, y >= 0. What is the optimum value?',
      options: [
        '9, reached at the corner (3, 0) on the bottom edge of the region',
        `10.5, reached at the corner (2.5, 1.5) where two constraints meet`,
        `${round(BEST.value!)}, reached at the corner ${BEST_POINT} where two constraints are tight`,
        '12, reached at the point (3, 1.5), which lies on the line x = 3',
      ],
      answer: 2,
      why: `The corners are worth 0, 9, ${round(BEST.value!)}, 10.5 and 4.667, so the best is ${round(BEST.value!)} at ${BEST_POINT}. The point (3, 1.5) would be worth 12 but breaks x + y <= 4, since 4.5 is more than 4.`,
    },
    {
      q: 'For the objective x + y the lesson\'s region has two corners worth 4. What does that mean?',
      options: [
        'One of the two corners is only a rounding error in the way the region is drawn',
        'The whole edge between them is optimal, so the best point is not unique',
        'The optimum lies only at the midpoint of the edge between the corners',
        'The solver has failed, and the problem is infeasible as it stands now',
      ],
      answer: 1,
      why: `The objective line x + y = ${round(TIED.value!)} lies along the edge between ${TIED.best.map(vertexText).join(' and ')}, so each point of that edge is worth ${round(TIED.value!)}. Both values are exact, the region is feasible, and the optimum is not a single point.`,
    },
    {
      q: 'You add x + y >= 5 to a model that already requires x + y <= 4. What does the lesson report?',
      options: [
        'Unbounded: the objective grows without limit inside the region the new row cuts out',
        'Feasible, with a smaller region shaded where the two constraints overlap each other',
        'Optimal at the origin, since both constraints are relaxed together',
        'Infeasible: no point satisfies both, and a clashing set of constraints is named',
      ],
      answer: 3,
      why: 'Together the two constraints need x + y to be no more than 4 and no less than 5, which no point satisfies, so the region is empty. The lesson finds the clash by dropping constraints one at a time and names x + y <= 4 against -x - y <= -5.',
    },
    {
      q: `For x + 2y the LP optimum is ${SLANTED_POINT} worth ${round(SLANTED.value!)}. What does rounding to a whole point give?`,
      options: [
        'The point (3, 2), worth 7, which turns out to be the whole-number optimum',
        `Rounding leaves the region; the best whole point is worth ${round(INTS.value!)}`,
        'The point (2, 1), worth 4, which turns out to be the whole-number optimum',
        `The point ${SLANTED_POINT} itself, since integer programs allow fractional values`,
      ],
      answer: 1,
      why: `Rounding ${SLANTED_POINT} gives (3, 2), which breaks x + y <= 4 (5 is more than 4). The best whole points are (1, 2) and (3, 1), worth ${round(INTS.value!)}, and (2, 1) is allowed but worth just 4. A whole-number requirement changes the problem, so fractions are not allowed.`,
    },
  ],
};

export default lesson;
