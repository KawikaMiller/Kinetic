import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';
import { bellmanFord, costs, dijkstraVisited, floydWarshall, presetById } from './model';
import { cycleText } from './text';

const TEXTBOOK = presetById('textbook');
const NEG_CYCLE = presetById('negative-cycle');
const BREAKS = presetById('dijkstra-breaks');

const TEXTBOOK_RUN = bellmanFord(TEXTBOOK.graph, TEXTBOOK.source);
const NEG_CYCLE_RUN = bellmanFord(NEG_CYCLE.graph, NEG_CYCLE.source);
const BREAKS_TRUTH = bellmanFord(BREAKS.graph, BREAKS.source);
const BREAKS_DIJKSTRA = dijkstraVisited(BREAKS.graph, BREAKS.source);
const NEG_CYCLE_FW = floydWarshall(NEG_CYCLE.graph);
const TEXTBOOK_COSTS = costs(TEXTBOOK.graph, TEXTBOOK_RUN, floydWarshall(TEXTBOOK.graph));

const ROUNDS = TEXTBOOK_RUN.roundChanges;
const WORST_ROUNDS = TEXTBOOK.graph.names.length - 1;
const CYCLE = cycleText(NEG_CYCLE.graph, NEG_CYCLE_RUN.cycle!);
const CYCLE_SUM = NEG_CYCLE_RUN.cycle!.sum;
const FW_STOP = NEG_CYCLE_FW.steps[NEG_CYCLE_FW.steps.length - 1];
const FW_STOP_NODE = NEG_CYCLE.graph.names[FW_STOP.k];
const FW_DIAG_NODE = NEG_CYCLE.graph.names[FW_STOP.negativeDiagonal[0]];
const FW_DIAG_VALUE = FW_STOP.d[FW_STOP.negativeDiagonal[0]][FW_STOP.negativeDiagonal[0]];
const A = BREAKS.graph.names.indexOf('a');

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Bellman-Ford finds shortest paths even when some edges are negative, and a negative cycle is what finally breaks them; Floyd-Warshall finds every pair at once.',
    what: `A negative edge is not a problem for shortest paths, but a negative cycle is: going round it again always lowers the total, so the nodes it can reach have no shortest path. Bellman-Ford tests every edge once per round and needs at most n - 1 rounds, since a shortest path has at most n - 1 edges; an edge that still lowers something in round n flags a negative cycle. Dijkstra finalises each node once, so a negative edge into a finalised node breaks it. Floyd-Warshall fills a matrix of all pairs by allowing one more node as a stop per step, and a negative number on its diagonal marks a negative cycle.`,
    analogy: 'A toll-road map where some roads pay you to drive them: you can still find the cheapest trip, unless a loop of roads pays you more than it costs, in which case you would circle it and the cheapest trip does not exist.',
    useCases: [
      'Routing protocols that learn distances from neighbours round by round (distance-vector routing is Bellman-Ford spread across routers)',
      'Spotting currency arbitrage: weight each rate as -ln(rate) and look for a negative cycle',
      'Precomputing every pair of travel times on a small map with Floyd-Warshall',
      'Checking a set of difference constraints for a contradiction, which shows up as a negative cycle',
    ],
    why: 'Shortest-path questions turn up well beyond maps, and the weights are not always positive. Knowing which algorithm survives a negative edge, how to tell a negative cycle from a merely negative edge, and what each costs lets you pick one instead of guessing.',
    watch: 'Numbers on edges are weights; a negative edge is blue with its minus sign. In Bellman-Ford the edge being tested is yellow, an edge that just lowered a distance turns green, and an edge in a negative cycle is red; a node with no shortest path gets a red tint and the words "no shortest path", and a node not reached yet is grey. The strip under the graph holds the distances, with a settled one in green and a grey one still at infinity. In Why not Dijkstra the node being finalised is yellow, finalised nodes are blue, a skipped edge is red dashed, and a distance that disagrees with the truth is red. In Floyd-Warshall violet rings mark the row and column of the current stop k, cells that improved turn green, a negative diagonal is solid red, and the yellow ring marks the cell whose path is printed. Cost bars are blue for Bellman-Ford and violet for Floyd-Warshall.',
  },
  tryThis: [
    `In Bellman-Ford in rounds, press play on the Textbook graph: rounds 1 to ${ROUNDS.length} change ${ROUNDS.join(', ')} distances, and the run stops after round ${ROUNDS.length} instead of the ${WORST_ROUNDS} rounds the worst case allows.`,
    `Load Negative cycle and play to the end: after ${WORST_ROUNDS} rounds the check round still finds ${NEG_CYCLE_RUN.checkEdges.length} edges that lower a distance, the cycle ${CYCLE} (sum ${CYCLE_SUM}) lights up red, and all ${NEG_CYCLE_RUN.noPath.length} nodes read "no shortest path".`,
    `Open Why not Dijkstra, load Dijkstra breaks and press play: Dijkstra finalises a at ${BREAKS_DIJKSTRA.dist[A]} and skips b→a, but the true distance is ${BREAKS_TRUTH.dist[A]}.`,
    `Open Floyd-Warshall, load Negative cycle and press play: at k = ${FW_STOP_NODE} the diagonal entry ${FW_DIAG_NODE}→${FW_DIAG_NODE} reads ${FW_DIAG_VALUE}, and the run stops there.`,
    `Open Cost on the Textbook graph: Bellman-Ford from s makes ${TEXTBOOK_COSTS.bellmanFordOne} edge tests, from every node ${TEXTBOOK_COSTS.bellmanFordAll}, and Floyd-Warshall ${TEXTBOOK_COSTS.floydWarshall}.`,
  ],
  keyIdeas: [
    'A negative edge is fine for Bellman-Ford; a negative cycle is what removes the shortest path, and the nodes reachable from one have none.',
    `Bellman-Ford tests each edge once per round and needs up to n - 1 rounds without a negative cycle; an edge that still lowers a distance in round n flags one.`,
    `Dijkstra finalises a node when it is closest and does not revisit it, so a negative edge into a finalised node breaks it: on the Dijkstra breaks graph it says ${BREAKS_DIJKSTRA.dist[A]} and the truth is ${BREAKS_TRUTH.dist[A]}.`,
    'Floyd-Warshall allows one more node as a stop per step and takes n³ steps in total; a negative number on the diagonal marks a negative cycle.',
  ],
  quiz: [
    {
      q: 'A graph has edges s→a of weight 2, s→b of weight 3 and b→a of weight -2. What is the shortest distance from s to a?',
      options: [
        '1, through b: 3 + (-2)',
        '2, the direct edge s→a',
        '5, both edges out of s added',
        '-2, the weight of b→a alone',
      ],
      answer: 0,
      why: 'The path s→b→a costs 3 + (-2) = 1, below the direct 2. Dijkstra finalises a at 2 before it looks at b, so it reports 2. The value -2 is one edge, not a path from s, and 5 adds two edges that do not lie on one path.',
    },
    {
      q: 'A graph has some negative edges but no negative cycle. What does Bellman-Ford give?',
      options: [
        'Correct shortest distances, in at most n - 1 rounds',
        'A failure flag, because a negative edge breaks shortest paths',
        'Distances that are wrong for nodes the negative edge touches',
        'Correct distances if the edges are listed in order of weight',
      ],
      answer: 0,
      why: 'A cycle that sums below zero removes the shortest path; a negative edge alone does not, so n - 1 rounds are enough. The order the edges are listed in changes how many rounds a run needs, not the answer.',
    },
    {
      q: 'Floyd-Warshall has just finished a step. Which entry of the matrix shows that a negative cycle exists?',
      options: [
        'A negative number on the diagonal, d[i][i] below 0',
        'Any negative number anywhere in the matrix, off the diagonal too',
        'An infinity in a row that had no infinity before',
        'A cell that changed in two steps in a row',
      ],
      answer: 0,
      why: 'The diagonal starts at 0, the empty path. A value below 0 means a trip from i back to i costs less than nothing, which is a negative cycle. Negative numbers off the diagonal are ordinary shortest paths through negative edges.',
    },
    {
      q: 'Why can Bellman-Ford stop after n - 1 rounds when the graph has no negative cycle?',
      options: [
        'A shortest path has at most n - 1 edges and each round settles one more',
        'Each round finalises the closest open node, as Dijkstra does',
        'After n - 1 rounds there are no edges left to relax',
        'More rounds than that would add negative cycles to the graph',
      ],
      answer: 0,
      why: 'A path that repeats no node has no more than n - 1 edges, and after round k the first k edges of any shortest path have been relaxed in order. Nodes are not finalised one per round the way Dijkstra does it: several can settle in one round, or none.',
    },
  ],
};

export default lesson;
