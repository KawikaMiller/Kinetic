import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A minimum spanning tree connects every node of a weighted graph using the least total edge weight, and two greedy algorithms, Kruskal and Prim, both find one.',
    what: "A spanning tree uses exactly V − 1 edges to connect all V nodes with no loops. Kruskal sorts every edge by weight and takes them lightest first, skipping any that would close a loop (union-find tells it which). Prim grows one tree from a start node, always adding the lightest edge that leaves the tree. Both work because of the cut property: split the nodes into two groups, and the lightest edge between the groups is always safe to take.",
    analogy: 'Laying cable between offices: you want every office connected for the least cable, and you don\'t care that a message from one office to another takes a roundabout route.',
    useCases: [
      'Laying network cable, pipes or power lines for the least material',
      'Approximating harder routing problems, like a travelling salesperson tour',
      'Clustering: drop the heaviest MST edges and the remaining trees are the clusters',
      'Designing road or rail links that connect every town for the least cost',
    ],
    why: "MSTs are the classic proof that greedy can be exactly right, and the cut property is the reason. They also come with a trap people fall into: an MST is not a shortest-path map, and confusing the two is a common design and interview mistake.",
    watch: "Numbers on edges are weights. The edge being considered is yellow; edges in the tree turn green. In Kruskal a rejected edge (it would close a loop) flashes red, then stays dim and dashed, and nodes that have been merged share a colour (amber, pink, sky or orange), one per group. In Prim the tree's nodes are washed green, an arrow marks the start, and the blue edges are the frontier: every edge leaving the tree. Turn on Show the cut and, on each step that takes an edge, the nodes split into a violet side and a sky side, crossing edges are dashed violet, and the lightest crossing edge is yellow. The edge being edited is dotted with a yellow weight. The side panels list the sorted edges or the frontier in the same colours.",
  },
  tryThis: [
    'Play Kruskal on Cabling 6 offices, then switch to Prim: different order, same total.',
    'Turn on Show the cut and step through: the edge taken is always the lightest crossing edge.',
    'Load Trap: shortest path? and read the bottom panel: the tree route from Hub to D is twice the direct road.',
    'Click an edge and type a new weight, like 1 or 999, and replay. Try a weight of 1000: it\'s refused.',
    'Load Equal weights: the Minimum trees counter shows how many different trees tie for the lowest total.',
  ],
  keyIdeas: [
    'A spanning tree connects all V nodes with exactly V − 1 edges and no loops.',
    'Kruskal: lightest edges first, skipping any that close a loop. Prim: grow one tree by its lightest outgoing edge.',
    'Cut property: the lightest edge across any cut belongs to a minimum spanning tree.',
    'An MST minimises total weight, not the distance between any two nodes.',
  ],
  quiz: [
    {
      q: "A city builds the minimum spanning tree of its road network. Does it give the fastest route between any two places?",
      options: [
        'No: it minimises the total, so one trip can be a long detour',
        'Yes: every route inside a minimum tree is a shortest route',
        'Yes, but only when all of the road weights are different',
        'No, because a spanning tree can never contain a direct road',
      ],
      answer: 0,
      why: "The MST only cares about the sum of all edges. In the Trap preset the tree reaches D from Hub through A, B and C for 10, while the direct road is 5. Distinct weights make the MST unique, but they don't make it a shortest-path tree.",
    },
    {
      q: 'Kruskal is considering an edge whose two ends are already in the same set. What does it do?',
      options: [
        'Skips it, because it would close a loop',
        'Takes it, because it is the lightest left',
        'Swaps it for the heaviest edge in the set',
        'Starts a new tree from one of its two ends',
      ],
      answer: 0,
      why: 'The ends are already connected, so adding the edge would make a cycle, and a tree has none. Being the lightest remaining edge only matters when it joins two different sets.',
    },
    {
      q: 'Why is the lightest edge crossing a cut always safe to add to the tree?',
      options: [
        'Any tree must cross the cut, and swapping in the lightest crossing edge never costs more',
        'Because the lightest edge in the whole graph always happens to be the one crossing every cut',
        'Because crossing edges can never form a loop, whatever else is already in the tree',
        'Because the cut is always chosen so that exactly one edge happens to cross it',
      ],
      answer: 0,
      why: "Some edge of every spanning tree crosses the cut. If a tree used a heavier one, swapping it for the lightest crossing edge keeps everything connected and doesn't increase the total. Crossing edges can still close loops once the tree has crossed the cut elsewhere, so that isn't the reason.",
    },
    {
      q: 'All the edge weights in a connected graph are different. What follows?',
      options: [
        'There is exactly one minimum spanning tree',
        'Kruskal and Prim give different totals',
        'The shortest edge is never in the tree',
        'The tree ends up using every single one of the edges',
      ],
      answer: 0,
      why: "With no ties, every greedy choice is forced, so there's one minimum tree and both algorithms return exactly its edges. Their totals always match anyway, ties or not.",
    },
  ],
};

export default lesson;
