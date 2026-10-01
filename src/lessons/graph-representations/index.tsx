import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A graph is nodes plus the edges between them, and you store it either as a V × V grid (adjacency matrix) or as a list of neighbours per node (adjacency list).',
    what: "An adjacency matrix has a cell for every pair of nodes: checking \"is there an edge u→v?\" is one lookup, but it always costs V² memory and listing a node's neighbours means reading a whole row. An adjacency list stores only the edges that exist: memory grows with V + E, and listing neighbours touches just those neighbours, but checking one specific edge means scanning a list. Edges can be directed (one-way) or undirected, and weighted or not. From the structure you can read properties like connected components, cycles, whether it's a DAG, a tree, or bipartite.",
    analogy: 'A matrix is a seating chart with a box for every possible pair of guests. A list is each guest\'s own short list of friends. For a big party where everyone knows a handful of people, the chart is almost all empty boxes.',
    useCases: [
      'Social networks, maps and road networks (sparse: adjacency lists)',
      'Package managers and build tools resolving dependency DAGs',
      'Dense problems like all-pairs distances, where a matrix fits naturally',
      'Detecting cycles: deadlocks, circular imports, impossible course plans',
    ],
    why: "Graphs quietly model half of software: networks, dependencies, workflows, permissions. Choosing the representation decides your memory use and which questions are fast, and it's the first thing every graph algorithm (BFS, Dijkstra, topological sort) depends on.",
    watch: "Nodes are circles coloured by connected component (or, with Colour nodes by set to Two-colouring, by side when the graph is bipartite). The selected node or edge is yellow; its row in the matrix (and its column too when undirected) and its entries in the list light up blue. Edges that form a cycle are red, and directed edges have arrowheads. A dashed yellow line follows your drag while you draw a new edge. Weighted graphs show each edge's weight at its middle. Badges under the drawing report components, cycles, DAG, tree and bipartite live; the counters compare matrix memory (V²) with list memory and the cost of listing one node's neighbours.",
  },
  tryThis: [
    'Pick Complete graph: the matrix is full and the list is just as big. The matrix\'s only good case.',
    'Pick Social network: count the empty · cells, all wasted matrix memory.',
    'Pick Course prerequisites, then drag an edge from F back to A: it stops being a DAG and the cycle turns red.',
    'Click matrix cells to add and remove edges, and watch the list change with them.',
    'Set Colour nodes by to Two-colouring on Road grid, then add a diagonal edge and watch bipartite disappear.',
  ],
  keyIdeas: [
    'Matrix: V² memory always, O(1) "is u→v an edge?", O(V) to list neighbours.',
    'List: V + E memory, O(degree) to list neighbours or to check one edge.',
    'Most real graphs are sparse, so lists usually win; dense graphs can favour the matrix.',
    'Directed cycles are found with three-colour DFS; undirected ones by DFS that ignores the edge it came in on.',
  ],
  quiz: [
    {
      q: 'A social network has 1,000,000 users with about 200 friends each. Which representation fits?',
      options: [
        'Adjacency list: it stores only edges that exist',
        'Adjacency matrix: every edge lookup is O(1)',
        'Either one: both use the same memory here',
        "Neither: a graph this big can't be stored",
      ],
      answer: 0,
      why: "A matrix needs 10¹² cells, almost all empty. A list needs about 1,000,000 + 200,000,000 entries. O(1) lookup doesn't help if you can't afford the memory.",
    },
    {
      q: 'When does an adjacency matrix beat an adjacency list?',
      options: [
        'When it\'s dense and you often ask "is u linked to v?"',
        'Always, since every edge lookup is O(1)',
        'When the graph is sparse and memory is tight',
        "Whenever the graph's edges are directed",
      ],
      answer: 0,
      why: 'Dense graphs fill most of the V² cells anyway, so the matrix wastes little memory and gives constant-time edge checks. On a sparse graph those V² cells are mostly wasted.',
    },
    {
      q: 'In an undirected graph, the degrees of all nodes add up to…',
      options: ['V', 'E', '2E', 'V + E'],
      answer: 2,
      why: 'Each edge has two ends and adds one to the degree of each.',
    },
    {
      q: 'A directed graph of course prerequisites has a cycle. What does that mean?',
      options: [
        "No order of the courses works: it isn't a DAG",
        'Nothing: cycles are harmless in a directed graph',
        'The courses split cleanly into two groups',
        'At least one course has no prerequisites',
      ],
      answer: 0,
      why: 'A cycle means A needs B, which needs … which needs A again. Only a DAG (directed acyclic graph) has a valid order.',
    },
  ],
};

export default lesson;
