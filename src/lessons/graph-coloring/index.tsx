import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';
import { byName, chromatic, greedyColour, identityOrder, maxDegree, peel, presetById, smallestLast, twoColour } from './model';

const CROWN = presetById('crown').graph;
const CROWN_BAD = greedyColour(CROWN, identityOrder(CROWN.names.length)).used;
const CROWN_GOOD = greedyColour(CROWN, byName(CROWN)).used;
const CROWN_OPT = chromatic(CROWN).number;
const CROWN_DEGREE_BOUND = maxDegree(CROWN) + 1;
const CROWN_SMALLEST_LAST = greedyColour(CROWN, smallestLast(CROWN)).used;
const CROWN_DEGENERACY_BOUND = peel(CROWN).degeneracy + 1;
const TIMETABLE = presetById('timetable').graph;
const TIMETABLE_GREEDY = greedyColour(TIMETABLE, identityOrder(TIMETABLE.names.length)).used;
const TIMETABLE_OPT = chromatic(TIMETABLE).number;
const ODD = presetById('odd').graph;
const ODD_CYCLE = twoColour(ODD).oddCycle!.length;
const ODD_OPT = chromatic(ODD).number;
const K5_OPT = chromatic(presetById('k5').graph).number;

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Greedy colouring gives each node the smallest colour its neighbours do not use, and the order you colour in decides how many colours it needs.',
    what: `Colouring a graph means giving each node a colour so that no two neighbours share one; scheduling problems are colouring in disguise, with a colour as a time slot. Greedy colouring takes the nodes in some order and gives each the smallest colour that none of its already-coloured neighbours has. It always gives a proper colouring using no more than max degree + 1 colours, but the order matters: on the crown graph one order needs ${CROWN_BAD} colours and another needs ${CROWN_OPT}. Colouring in the reverse of a smallest-degree peeling (smallest-last) needs no more than the degeneracy + 1. Telling whether 2 colours suffice is easy; for 3 or more it is NP-complete, so exact answers come from search on small graphs.`,
    analogy: 'Assigning exam slots: you place courses one at a time in the first slot where nobody taking them already sits an exam, and if you place the awkward ones early you need fewer slots than if you leave them for last.',
    useCases: [
      'Scheduling exams, meetings or shifts so that conflicting items never share a slot',
      'Register allocation in a compiler, where variables live at the same time cannot share a register',
      'Assigning frequencies or channels so that neighbouring transmitters differ',
      'Splitting work into batches that can run in parallel without touching the same resource',
    ],
    why: 'A greedy pass is the first thing people write and it is often good enough, but the order can cost you extra slots or registers. Knowing the degree and degeneracy bounds, and that the exact minimum is hard in general, tells you when to accept greedy and when to look harder.',
    watch: 'Each colour is a hue and a number, so the number repeats what the hue says. In Greedy the node being coloured is yellow, a colour forbidden by a neighbour is struck through and dim in the palette, and the chosen one is ringed; colours used beyond the exact minimum are orange and the minimum itself is green. In The bound the bars are orange for greedy in your order, violet for smallest-last, blue for the two bounds and green for the exact minimum. In the Timetable a blue dot is a course placed in a slot and a red dot is a clash with a linked course. In Why it is hard the sweep colours with colour 1 (orange) and colour 2 (amber) and an odd cycle is red.',
  },
  tryThis: [
    `In Greedy, in your order, press play on the Crown graph: the order as given (a1, b1, a2, b2, ...) ends with ${CROWN_BAD} colours, while the true minimum is ${CROWN_OPT}.`,
    `In Greedy, press by name (a1 to a4, then b1 to b4) and play: the same graph now needs only ${CROWN_GOOD} colours.`,
    `Open The bound on the Crown graph: the maximum degree + 1 is ${CROWN_DEGREE_BOUND}, greedy in the order as given uses ${CROWN_BAD}, smallest-last uses ${CROWN_SMALLEST_LAST}, and the degeneracy + 1 is ${CROWN_DEGENERACY_BOUND}.`,
    `Open Timetable and press Fill with greedy: courses in the order listed use ${TIMETABLE_GREEDY} slots with no clashes, and Fill with the exact minimum uses ${TIMETABLE_OPT}.`,
    `Open Why it is hard and load Odd cycle: the sweep fails on an odd cycle of ${ODD_CYCLE} and the exact minimum is ${ODD_OPT}; load Crown graph and the sweep passes.`,
  ],
  keyIdeas: [
    `Greedy colouring gives each node the smallest colour its coloured neighbours do not use, and the order decides the count: the crown graph takes ${CROWN_BAD} colours in one order and ${CROWN_GOOD} in another.`,
    'Greedy uses no more than max degree + 1 colours, and smallest-last (colouring in the reverse of a minimum-degree peeling) uses no more than the degeneracy + 1.',
    `Complete graphs and odd cycles need exactly the bound: ${K5_OPT} colours for K5 and ${ODD_OPT} for the 5-cycle.`,
    'Two colours is an easy test, since a breadth-first sweep finds the colouring or an odd cycle; three or more is NP-complete in general, so exact answers come from search on small graphs.',
  ],
  quiz: [
    {
      q: 'The crown graph has nodes a1 to a4 and b1 to b4, with ai joined to bj for every j other than i. Greedy colours them in the order a1, b1, a2, b2, a3, b3, a4, b4. How many colours does it use?',
      options: [
        `${CROWN_BAD}: each new pair meets neighbours using smaller colours`,
        `${CROWN_OPT}: the graph is two-colourable, so greedy finds that`,
        '3: one colour for the a nodes, one for the b nodes and a spare',
        '8: each node ends up with a colour of its own',
      ],
      answer: 0,
      why: `a1 and b1 both get colour 1, a2 sees b1 and takes 2, b2 sees a1 and takes 2, and a3 and b3 then see both colours and take 3, and the last pair needs a fourth. The graph itself needs ${CROWN_OPT}, which greedy reaches in the order a1 to a4 then b1 to b4: a two-colourable graph does not make greedy find two.`,
    },
    {
      q: 'Greedy colouring uses 5 colours on a graph. What does that tell you about the minimum number of colours?',
      options: [
        'The minimum is 5 or fewer, and could be smaller',
        'The minimum is exactly 5, since greedy found a colouring',
        'The minimum is at least 5, since greedy never wastes colours',
        'The minimum is 5 minus the number of nodes left unused',
      ],
      answer: 0,
      why: 'A proper colouring with 5 colours shows 5 suffice, so the minimum is no bigger. Greedy can waste colours when the order is poor, so the minimum can be smaller, as on the crown graph, where greedy used more than the true minimum.',
    },
    {
      q: 'A graph\'s largest degree is 6. How many colours can greedy colouring need, in the worst order?',
      options: [
        '7, since a node has at most 6 neighbours blocking colours',
        '6, one colour for each neighbour of the busiest node',
        '12, twice the largest degree',
        'There is no limit that depends on the degree',
      ],
      answer: 0,
      why: 'A node with 6 neighbours can have 6 colours blocked, so among the colours 1 to 7 one is free for it. The bound is the largest degree plus one, and it is reached by a complete graph on 7 nodes. Twice the degree is far above it, and the degree does bound the count.',
    },
    {
      q: 'A breadth-first sweep colours nodes 1 and 2 alternately and then meets an edge between two nodes of the same colour. What does that show?',
      options: [
        'The graph has an odd cycle, so two colours cannot be enough',
        'The graph has a bug in its edge list and needs fixing',
        'The graph needs exactly three colours, and no more',
        'The sweep started at the wrong node and should be rerun',
      ],
      answer: 0,
      why: 'The clash closes a cycle of odd length through the sweep\'s tree, and an odd cycle cannot be coloured with two colours. A different start node gives the same verdict, and the graph may need three colours or many more: the sweep just rules out two.',
    },
  ],
};

export default lesson;
