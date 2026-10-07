import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A topological sort lists the nodes of a directed graph so every arrow points forward: a build order for anything with dependencies, and it exists exactly when there is no cycle.',
    what: "Draw an arrow A → B for \"A must come before B\". Kahn's algorithm counts each node's incoming arrows, starts with the nodes that have none, and every time it places a node it crosses off that node's arrows; anything that drops to zero joins the queue. The other classic method is depth-first: a node is finished once everything after it is, and finished nodes are written at the front. Most graphs allow many valid orders, and a graph with a cycle allows none.",
    analogy: 'Getting dressed: socks before shoes, shirt before jacket. Socks-then-shirt and shirt-then-socks both work, but a rule like "shoes before socks" on top of "socks before shoes" means you never leave the house.',
    useCases: [
      'Package managers working out what to install first (npm, pip, apt)',
      'Build tools and CI running tasks only after the tasks they depend on',
      'Running database migrations, or spreadsheet cells, in dependency order',
      'Planning a course sequence from prerequisites',
    ],
    why: 'Any time you write "run X after Y", you are building a dependency graph. Knowing how the order is found, why there are many valid answers, and why a cycle jams everything explains real errors like "circular dependency detected", and topological sort is a staple interview question.',
    watch: "Arrows read as \"must come before\". In Kahn's mode each waiting node wears a violet badge with the number of arrows still pointing into it. The node being placed is yellow, placed nodes are green, and queued nodes are washed blue; crossed-off arrows turn dim and dashed. In DFS mode blue means \"on the current search path\" instead. If there's a cycle, its nodes and arrows are outlined red. The Queue or DFS path tray, the numbered Output tray and the Both algorithms panel on the right follow the same colours.",
  },
  tryThis: [
    'Play Kahn on Courses, then switch to DFS post-order: a different order, and both are checked valid.',
    'Press Close a cycle and play again: the queue runs dry and the cycle lights up red.',
    'Click the red arrow to remove it and watch the valid-orders count come back.',
    'Add your own arrows by dragging between nodes, or with C and Enter on the keyboard, and watch the count shrink.',
    'Load DB migrations and compare the count with Build pipeline: more arrows usually means fewer valid orders.',
  ],
  keyIdeas: [
    'A topological order exists exactly when the graph has no directed cycle.',
    'Most graphs have many valid orders; the arrows only fix some pairs.',
    "Kahn: repeatedly place a node with no remaining incoming arrows; if none is left early, there's a cycle.",
    'DFS: write a node at the front once everything reachable from it is finished.',
  ],
  quiz: [
    {
      q: "Your tool prints a build order that differs from the one your teammate's tool prints for the same graph. What does that mean?",
      options: [
        'Both can be right: a DAG often allows many orders',
        'One of the two tools has a bug in it somewhere',
        'The graph must contain a cycle somewhere in it',
        "Only the order Kahn's algorithm gives is valid",
      ],
      answer: 0,
      why: 'Arrows only fix the order of the pairs they connect. Unconnected tasks can go either way round, so two different outputs can both respect every arrow. A cycle would make both tools fail, not disagree.',
    },
    {
      q: "Kahn's algorithm runs out of queue after placing 5 of 8 nodes. What does that tell you?",
      options: [
        'The remaining three nodes contain a cycle',
        'It should restart from the remaining nodes',
        'The three are isolated and can go anywhere',
        'Its queue overflowed and it lost three items',
      ],
      answer: 0,
      why: 'Every leftover node still has an incoming arrow from another leftover node, and following those arrows backwards must eventually repeat a node. Isolated nodes have no incoming arrows at all, so they would have been queued at the very start.',
    },
    {
      q: 'In the depth-first method, when is a node written to the output?',
      options: [
        'As soon as the search first reaches it',
        'Once everything after it is finished',
        'When its in-degree count drops to zero',
        'After all of its predecessors are visited',
      ],
      answer: 1,
      why: "A node is written (at the front) when its call finishes, after every node it points to. That puts it before all of them. Counting in-degrees to zero is Kahn's rule, not the DFS one.",
    },
    {
      q: "Why does Kahn's algorithm start with the nodes that have no incoming arrows?",
      options: [
        "Nothing has to come before them, so they're safe to place first",
        'They have the most edges, so placing them saves the most work',
        'They are the nodes the depth-first search would have visited last',
        "Placing them first is what guarantees there's only one valid order",
      ],
      answer: 0,
      why: "No arrow points into them, so no rule can be broken by putting them first. Starting there doesn't make the order unique: when several nodes have no incoming arrows, any of them can go first.",
    },
  ],
};

export default lesson;
