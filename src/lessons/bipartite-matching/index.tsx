import type { LessonModule } from '../../core/types';
import { DEFAULT_COSTS, assignmentCost, findAugmenting, flip, greedy, greedyAssignment, hallViolator, hungarian, jobName, maximumMatching, matchingSize, minimumVertexCover, presetById, workerName } from './model';
import { Stage } from './Stage';
import { pathNodes } from './text';

const GREEDY_GRAPH = presetById('greedy').graph;
const GREEDY_MATCHING = greedy(GREEDY_GRAPH);
const GREEDY_PAIRS = GREEDY_MATCHING.flatMap((j, w) => (j >= 0 ? [`${workerName(w)}-${jobName(j)}`] : [])).join(', ');
const STRANDED = workerName(GREEDY_MATCHING.indexOf(-1));
const SEARCH = findAugmenting(GREEDY_GRAPH, GREEDY_MATCHING, GREEDY_MATCHING.indexOf(-1));
const PATH = pathNodes(SEARCH.path!);
const FINAL = matchingSize(flip(GREEDY_MATCHING, SEARCH.path!));
const NONE_GRAPH = presetById('none').graph;
const VIOLATOR = hallViolator(NONE_GRAPH)!;
const VIOLATOR_WORKERS = VIOLATOR.workers.map(workerName).join(', ');
const VIOLATOR_JOBS = VIOLATOR.neighbourhood.map(jobName).join(', ');
const NONE_BEST = maximumMatching(NONE_GRAPH);
const NONE_COVER = minimumVertexCover(NONE_GRAPH, NONE_BEST);
const GREEDY_COST = assignmentCost(DEFAULT_COSTS, greedyAssignment(DEFAULT_COSTS));
const BEST = hungarian(DEFAULT_COSTS);
const BEST_COST = assignmentCost(DEFAULT_COSTS, BEST);
const BEST_PAIRS = BEST.map((j, w) => `${workerName(w)}-${jobName(j)}`).join(', ');

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Pairing workers with jobs one by one can get stuck short of the best answer; an augmenting path repairs it, and the same search is a max-flow search on a unit network.',
    what: `A matching pairs each worker with at most one job they like. Greedy gives each worker the first free job and can strand someone even when everyone could be placed. An augmenting path starts at a worker with no job, alternates between edges that are not in the matching and edges that are, and ends at a job nobody holds; flipping it grows the matching by one, and a matching with no such path is a largest one. When a worker cannot be placed, the search that failed has reached a set of workers who like fewer jobs than there are workers: Hall's condition broken. The same problem is a flow of 1 unit per edge from a source through workers and jobs to a sink.`,
    analogy: 'Seating guests at a wedding where each guest has a short list of acceptable seats: if a late guest has no seat, you ask who could shift to another acceptable seat, and who that would displace in turn, until someone lands on an empty chair.',
    useCases: [
      'Assigning tasks to people or jobs to machines when each can do only some of them',
      'Pairing students with projects, or reviewers with papers, under compatibility lists',
      'Choosing one network port or time slot per flow when each flow accepts a few',
      'Finding the cheapest one-to-one assignment when every pairing has a cost (the Hungarian method)',
    ],
    why: 'Matching shows up inside scheduling, allocation and routing code, and the greedy version is the one people write first. Knowing why it can stall, how an augmenting path fixes that, and what a failed search proves lets you tell "no solution exists" from "my first choices clashed".',
    watch: 'Workers are the left column and jobs the right. A matched edge is green; the alternating path being shown is yellow; edges the last flip changed are blue; a candidate edge that is not matched is grey, and a worker with no job is a dim outline. In When it cannot be done the workers of a Hall violator get a red tint and the jobs they all like an orange one, and the vertex cover is violet. In As a flow the same matching gets a source s and a sink t, and every edge reads its flow out of 1. In Costs the cell green and filled is the optimal job for that worker, and an orange ring is the job greedy picked.',
  },
  tryThis: [
    `In Greedy vs augmenting press Greedy: it matches ${matchingSize(GREEDY_MATCHING)} of ${GREEDY_GRAPH.workers} (${GREEDY_PAIRS}) and strands ${STRANDED}. Press Find path to see ${PATH}, then Flip the path: the matching reaches ${FINAL}.`,
    `In Greedy vs augmenting load No perfect matching, press Augment from every free worker, then Find path: the search reaches ${VIOLATOR_WORKERS} and ${VIOLATOR_JOBS} and finds no augmenting path.`,
    `Open When it cannot be done and load No perfect matching: ${VIOLATOR_WORKERS} likes only ${VIOLATOR_JOBS}. Switch on the vertex cover: ${NONE_COVER.workers.length + NONE_COVER.jobs.length} nodes, the size of the largest matching, ${matchingSize(NONE_BEST)}.`,
    `Open As a flow, press Greedy, Find path and Push along it: the path s → W2 → J1 ⇠ W1 → J2 ⇠ W4 → J4 → t raises the flow from ${matchingSize(GREEDY_MATCHING)} to ${FINAL}.`,
    `Open Costs: greedy per row costs ${GREEDY_COST} and the optimal assignment costs ${BEST_COST} (${BEST_PAIRS}).`,
  ],
  keyIdeas: [
    `A matching that cannot be extended may still fall short of a largest one: greedy stops at ${matchingSize(GREEDY_MATCHING)} where ${FINAL} are possible.`,
    'An augmenting path alternates unmatched and matched edges between a free worker and a free job; flipping it grows the matching by one, and a matching with no such path is a largest one.',
    'When a worker cannot be placed, the failed search has reached a set of workers who like fewer jobs than there are workers: Hall\'s condition is broken for that set.',
    'Matching is a flow of 1 per edge from a source through workers and jobs to a sink, so the matching size is the flow value; in a bipartite graph the smallest vertex cover is as big as the largest matching.',
  ],
  quiz: [
    {
      q: `Greedy matches ${GREEDY_PAIRS} and strands ${STRANDED}, whose only job is J1. Is there a matching of ${FINAL}?`,
      options: [
        'Yes: W1 can move to J2 and W4 to J4, freeing J1 for W2',
        'No: W2 likes just J1 and W1 already holds it, so W2 has to stay out',
        'No: greedy always finds the largest matching it can',
        'Yes, but only by giving W2 a job it does not like',
      ],
      answer: 0,
      why: 'The path W2-J1-W1-J2-W4-J4 alternates unmatched and matched edges and ends at the free job J4; flipping it places the four workers. Greedy stopped because it does not reconsider a choice, not because no solution exists. W2 does not need a job it dislikes: J1 is on its list.',
    },
    {
      q: 'What is an augmenting path for a matching?',
      options: [
        'A path that alternates unmatched and matched edges between a free worker and a free job',
        'A path made only of matched edges, from the first worker to the last job',
        'Any path from a worker to a job that starts with an unmatched edge',
        'A path that goes round a cycle of matched edges and returns to its start',
      ],
      answer: 0,
      why: 'Both ends need to be free, and the edges need to alternate, so flipping them leaves the inner nodes still matched and adds one pair. A path of matched edges alone, or one that starts with an unmatched edge but ends at a held job, changes nothing useful.',
    },
    {
      q: `${VIOLATOR_WORKERS} all like only ${VIOLATOR_JOBS}. What does that show?`,
      options: [
        'No matching can cover all three workers: they have two jobs between them',
        'Greedy picked the wrong order, and a better order places all three of them',
        'Each of the three can be placed, but only by changing their lists',
        'The graph is not bipartite, so matching does not apply to it',
      ],
      answer: 0,
      why: 'Three workers drawing on two jobs cannot each get a distinct job: this is Hall\'s condition failing for that set. No order of picking helps, since the shortage is in the set, and the graph is bipartite because each edge joins a worker to a job.',
    },
    {
      q: `On the default cost matrix greedy per row costs ${GREEDY_COST} and the optimum is ${BEST_COST}. Why does greedy miss it?`,
      options: [
        'An early cheap pick can take a job a later worker needs more',
        'Greedy picks the dearest job for each worker, so it cannot be cheap',
        'The optimum uses a job twice, which greedy does not allow',
        'Greedy only looks at the last row of the matrix',
      ],
      answer: 0,
      why: `Each worker takes the cheapest job still free, so a cheap early pick can leave a later worker just a dear one; the optimal assignment (${BEST_PAIRS}) trades a little early for more later. Greedy picks the cheapest, not the dearest, and no job is used twice in either answer.`,
    },
  ],
};

export default lesson;
