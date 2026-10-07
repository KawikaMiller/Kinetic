import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Union-find keeps track of which items are in the same group, and with two small tricks it merges groups and answers "are these connected?" in nearly constant time.',
    what: "Every element stores one number: its parent. Following parents leads to the root, and the root names the set, so two elements are connected exactly when they reach the same root. union(a, b) finds both roots and points one at the other. Done naively the trees can grow into long chains; union by rank always hangs the shorter tree under the taller, and path compression re-points every node a find walks past straight at the root.",
    analogy: 'Clubs where every member knows one person closer to the president. To check if two people are in the same club, each asks up the chain until they reach a president. Path compression is everyone remembering the president\'s number after asking once.',
    useCases: [
      "Kruskal's minimum spanning tree: skip an edge whose ends are already connected",
      'Grouping pixels into connected regions in image processing',
      'Detecting when a new network link or pipe closes a loop',
      'Merging accounts or records that turn out to belong together',
    ],
    why: 'Whenever things get merged into groups over time and you keep asking whether two belong together, union-find answers in a few pointer steps without searching the whole graph. It shows up in graph algorithms, in clustering, and often in interviews.',
    watch: "Each circle is an element and each line points from a child up to its parent; roots sit at the top of their tree. During a find, the path walked is yellow and the root it reaches is green. Nodes that path compression just re-pointed are blue, and the two roots a union just linked are violet. In Your own mode a node picked for a union gets a dashed yellow ring. The parent[] row shows the same structure as numbers: yellow cells are on the path, the green cell is the root, blue numbers were just re-pointed and violet ones just linked. With union by rank on, a rank[] row appears, dimmed for non-roots. The blue height meter's tick marks the log₂ limit. In the comparison table the current setting is highlighted yellow, and in the set chips the root is bold.",
  },
  tryThis: [
    'Pick Chain with both toggles off and play: one tall chain, and find(0) walks all of it.',
    'Turn on Path compression and replay Chain: the first find(0) still pays, the second costs 1 hop.',
    'Turn on Union by rank instead: the chain never forms, and the height meter stays under the tick.',
    'Pick 30-op script and flip the toggles: the table shows the hop totals for all four settings.',
    'In Your own, union a few pairs, then union two elements that are already connected.',
  ],
  keyIdeas: [
    'Each element stores only its parent; the root at the top names the set.',
    'Connected means same root: no searching through the graph.',
    'Union by rank keeps every tree at most about log₂ n tall.',
    'Path compression flattens what find walks past, so repeated finds become 1 hop.',
  ],
  quiz: [
    {
      q: 'How does union-find decide whether a and b are connected?',
      options: [
        'Follow parent pointers from each to its root and compare the roots',
        'Run a breadth-first search from a until it reaches b or runs out',
        'Look the pair up in a table of every connected pair it stored',
        'Check whether an edge between a and b was ever added directly',
      ],
      answer: 0,
      why: "The root names the set, so two finds and one comparison answer it. No search through the graph is needed, which is the whole point: a BFS would visit every element in the group, while finds only walk up a short tree.",
    },
    {
      q: 'With neither union by rank nor path compression, how long can a single find take on n elements?',
      options: ['O(1)', 'O(log n)', 'O(n)', 'O(n log n)'],
      answer: 2,
      why: 'Unlucky unions build one long chain, like the Chain preset, and a find from the bottom walks every element. O(log n) is what union by rank guarantees, not the naive version.',
    },
    {
      q: 'What does union by rank, on its own, guarantee?',
      options: [
        'No tree is ever taller than about log₂ n',
        'Every find takes exactly one pointer hop',
        'The sets always end up the same size',
        'Unions never need to call find at all',
      ],
      answer: 0,
      why: "A tree's height only grows when two trees of equal rank merge, and that at least doubles its size, so height stays within log₂ n. One-hop finds are what path compression gives you after a find, not a promise from rank.",
    },
    {
      q: 'What does path compression change during find(x)?',
      options: [
        'Every node on the path is pointed straight at the root',
        'The two roots swap places so the shorter tree is on top',
        'The path’s nodes are removed and stored in a separate list',
        'x is moved into a new set of its own to keep trees short',
      ],
      answer: 0,
      why: "The set doesn't change at all, only its shape: each node the find walked past now points directly at the root, so the next find from any of them takes 1 hop. Choosing which root goes on top is union by rank's job, not compression's.",
    },
  ],
};

export default lesson;
