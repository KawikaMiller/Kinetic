import type { LessonModule } from '../../core/types';
import { minVertexCover } from '../../core/vertexCover';
import { BROKEN_FAILURES, EXHAUSTIVE_COUNT, F1, SAMPLE_COUNT, U, buildGadget, coverCountBySize } from './model';
import { Stage } from './Stage';

const G1 = buildGadget(F1);
const GU = buildGadget(U);
const U_MINIMUM = minVertexCover(GU.vertexCount, GU.edges).size;
const U_AT_K = coverCountBySize(GU)[GU.K];
/** The quiz asks about a formula with 4 variables and 5 clauses: the largest the editor accepts. */
const QUIZ_N = 4;
const QUIZ_M = 5;
const QUIZ_K = QUIZ_N + 2 * QUIZ_M;

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A reduction rewrites an instance of one problem as an instance of another, so a fast solver for the second would solve the first: here a 3-SAT formula becomes a vertex-cover graph, and you build it yourself.',
    what: `Vertex cover asks for a set of vertices that touches each edge. A 3-SAT formula with n variables and m clauses becomes a graph: a pair of literal vertices per variable, joined by an edge, and a triangle of three clause vertices per clause, each joined to the literal it names. The formula is satisfiable exactly when the graph has a cover of size K = n + 2m (K = ${G1.K} for the default formula). The translation takes a few steps per clause, which is why it counts as a reduction.`,
    analogy: 'A translator who turns a hard crossword into a hard jigsaw: with a fast jigsaw solver you could solve the crossword, as long as the translation itself is quick.',
    useCases: [
      'Proving a new problem NP-hard by reducing a known hard problem to it, the standard move in complexity papers',
      'Rewriting a scheduling or configuration problem as a formula so that a SAT solver can attack it',
      'Spotting that two problems are one hard problem in different clothes, so a result for one transfers to the other',
      'Reading a claim such as "this scheduling variant is NP-hard" as a statement about a translation, not a measurement of your instances',
    ],
    why: 'Engineers meet NP-hardness as a claim that a problem is as hard as SAT. Knowing that a reduction is a quick translation, and which way it runs, tells you what that claim proves and what it leaves open: it says little about the instances you actually face.',
    watch: 'Literal vertices are plain circles and clause vertices are violet. Edges are plain categories, not verdicts: sky is a variable edge, amber a triangle edge and pink a connection edge, and a dashed grey edge is one you have not placed yet. A vertex filled with the highlight colour is in the cover; a red edge is touched by no chosen vertex, and a red filled vertex is in the cover only because its clause has no true literal. In the stats, green means the cover size equals K or a verdict agrees with brute force, and red means the size exceeds K or a verdict is wrong.',
  },
  tryThis: [
    `In Build the graph, click x1 then not x1: a variable edge appears and the counter reads 1 of ${G1.edges.length}.`,
    'Click x1 then x2: the construction refuses with its rule, and the counter does not change.',
    `Press Show the reference, open Assignment to cover (all variables false is a satisfying assignment, size ${G1.K}), then turn x2 on: clause 1 has no true literal and the size reads ${G1.K + 1} = K + 1.`,
    `In Cover to assignment pick any ${G1.K - 1} vertices and press Check: the refusal says no cover of ${G1.K - 1} exists, with the bound ${G1.n} + 2 x ${G1.m} = ${G1.K}.`,
    `Open No solution: the unsatisfiable preset has ${U_AT_K} covers of size ${GU.K}, and its minimum is ${U_MINIMUM}.`,
  ],
  keyIdeas: [
    'A reduction translates instances of one problem into instances of another in polynomial time, so a fast solver for the target would solve the source: it shows the target is at least as hard, and says little about easy cases.',
    `The 3-SAT to vertex-cover gadget has a pair of literal vertices per variable and a triangle per clause: ${G1.vertexCount} vertices, ${G1.edges.length} edges and K = n + 2m = ${G1.K} for the default formula.`,
    `The graph has a cover of size K exactly when the formula is satisfiable: a theorem whose outline is in the chip below the scene, and checked here on all ${EXHAUSTIVE_COUNT} two-variable formulas of up to 4 clauses (exhaustive over that bound) and ${SAMPLE_COUNT} seeded three-variable formulas (sampled).`,
    `Each part of the gadget carries weight: with the variable edges dropped the verdict is wrong on ${BROKEN_FAILURES} of ${EXHAUSTIVE_COUNT} formulas, because a cover can then take both x and not x.`,
  ],
  quiz: [
    {
      q: 'You turn a 3-SAT formula into a vertex-cover graph in polynomial time. What does that show?',
      options: [
        '3-SAT is at least as hard as vertex cover, because the formula is the bigger object',
        'A fast vertex-cover algorithm would give a fast 3-SAT algorithm',
        'Both problems are now solvable in polynomial time, since the graph is easy to build',
        'Only the formulas you tried are hard; other formulas may map to easy graphs',
      ],
      answer: 1,
      why: 'The translation maps 3-SAT instances to vertex-cover instances, so any fast algorithm for vertex cover gives one for 3-SAT with the translation added. That makes vertex cover at least as hard as 3-SAT, not easier. Building the graph solves nothing by itself, and one translated instance does not decide the rest.',
    },
    {
      q: `A formula has ${QUIZ_N} variables and ${QUIZ_M} clauses. What target size K does the gadget graph use?`,
      options: [
        `K = ${QUIZ_K}: ${QUIZ_N} for the variable edges plus 2 per clause triangle`,
        `K = ${QUIZ_N + QUIZ_M}: one vertex per variable and one per clause, ${QUIZ_N} + ${QUIZ_M}`,
        `K = ${QUIZ_N + 3 * QUIZ_M}: one per variable plus all three vertices of each clause, ${QUIZ_N} + ${3 * QUIZ_M}`,
        `K = ${2 * QUIZ_N + 3 * QUIZ_M}: both literal vertices per variable plus three per clause, ${2 * QUIZ_N} + ${3 * QUIZ_M}`,
      ],
      answer: 0,
      why: `Each of the ${QUIZ_N} variable edges needs one of its two vertices, and each of the ${QUIZ_M} triangles needs two vertices, because one vertex touches just two of a triangle's three edges: K = ${QUIZ_N} + 2 x ${QUIZ_M} = ${QUIZ_K}.`,
    },
    {
      q: 'The graph built from a formula has a vertex cover of size K + 1 but none of size K. What follows about the formula?',
      options: [
        'It is satisfiable, but the cover found is simply not a minimum one',
        'It is satisfiable with exactly one variable left without a value',
        'Nothing follows, because cover size is unrelated to satisfiability',
        'No assignment satisfies it, so each attempt falsifies some clause',
      ],
      answer: 3,
      why: 'K is the price of a cover when each clause has a true literal, and a falsified clause costs one extra vertex. With no cover of size K, no assignment gives each clause a true literal, by the two directions of the translation (argued in the lesson, checked on its formula sets).',
    },
    {
      q: 'Why must the reduction itself run in polynomial time?',
      options: [
        'So that the graph still fits on the screen for small formulas',
        'Because vertex cover is already known to be solvable in polynomial time',
        'Otherwise it could solve the problem while building the graph and prove nothing',
        'Because SAT solvers refuse inputs that were produced by a slow program',
      ],
      answer: 2,
      why: 'A slow translation could solve the formula while building the graph and then output a trivial graph, so a fast vertex-cover solver would say nothing about 3-SAT. A polynomial translation is what turns a fast target solver into a fast source solver.',
    },
    {
      q: 'In the gadget graph, why does each variable get an edge between x and its negation?',
      options: [
        'It makes the graph connected so that a cover search can reach each vertex',
        'A cover must take one of the two, and that choice is the truth value',
        'It forces both x and its negation into the cover, so each variable counts twice',
        'It marks the variable as unused when neither literal appears in a clause',
      ],
      answer: 1,
      why: `A cover has to touch the edge between x and not x, so it takes at least one of the two, and the lesson reads the one it takes as the truth value. The budget K leaves room for one per variable. Drop these edges and the verdict is wrong on ${BROKEN_FAILURES} of ${EXHAUSTIVE_COUNT} formulas, because a cover can take both.`,
    },
  ],
};

export default lesson;
