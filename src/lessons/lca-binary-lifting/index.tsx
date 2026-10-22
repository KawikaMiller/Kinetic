import type { LessonModule } from '../../core/types';
import { FACTS as F } from './facts';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Binary lifting stores, for each node, its 1st, 2nd, 4th, 8th ancestor and so on, so any climb up a tree is a few jumps and the lowest common ancestor of two nodes takes about log n of them.',
    what: `Walking from a node to its ancestor costs one step per level. Binary lifting trades memory for speed: a table up[k][v] holds the 2^k-th ancestor of v (the root stands in when the tree is not that tall), and each row is built from the one below, up[k][v] = up[k-1][up[k-1][v]]. A climb of d levels is the binary digits of d, one jump for each 1. For the lowest common ancestor, first lift the deeper node to the other's depth. Then, from the top level down, jump both nodes when their landing nodes differ, because that keeps both below the LCA, and skip the jump when they are equal, because it reached or passed the LCA. The answer is the parent of the nodes that remain, or the node itself when the lift already made them one. The table needs about n log n entries, built once, and each query then costs about log n jumps instead of up to n steps.`,
    analogy: 'Finding where two family lines meet by hopping up the generations in sizes of 1, 2, 4, 8, ... instead of one parent at a time: overshoot, and you simply do not take that hop.',
    useCases: [
      'Path queries on a fixed tree, such as the distance between two nodes in a file-system or an organisation chart',
      'Finding the nearest shared ancestor of two items in a taxonomy or a phylogenetic tree',
      'Many queries on one tree, where the table is built once and then amortised over the queries',
      'Contest and interview problems that ask for the k-th ancestor or the LCA in logarithmic time',
    ],
    why: 'It shows the trade of space for time in its plainest form, and the jump-or-skip rule is a small proof that a greedy order of power-of-two moves lands exactly where it should. It builds on `tree-traversals` (depth and parent), `trees-bst` (a rooted tree) and, for the jump table, `binary-search` style thinking about halving a range.',
    watch: 'In the tree, node A is tinted blue and node B violet; the two nodes as lifted so far are yellow, and the answer is solid green. In the table, a yellow outline is the cell asked for next, green cells are ones you filled in, blue cells are computed from the level below and grey cells are the parent row. In the counting scene the green bar is jumps and the red bar is parent steps of the naive walk.',
  },
  tryThis: [
    `In Build the table, on the default tree T0, press Fill the rest: level 1 is ${F.level1} and level 2 is ${F.level2}, with ${F.levels} levels in all.`,
    `Open LCA, where nodes 10 and 8 are chosen. Press Lift 2^1: node 10 lands on node ${F.liftTo}, level with node 8.`,
    'Press Skip at k = 3 and at k = 2 (the landings are 0 and 0), then at k = 1 press Jump: it is refused, because the landing nodes are equal (1 and 1).',
    `Press Skip at k = 1, then Jump at k = 0: allowed (the landings are 3 and 4). The answer is node ${F.answer108} after ${F.jumps108} jumps, against ${F.steps108} parent steps for the naive walk.`,
    `Click node 10 and then node 11: the automatic run gives node ${F.answer1011} with ${F.jumps1011} jumps.`,
  ],
  keyIdeas: [
    `Row k of the table holds the 2^k-th ancestor: for T0's ${F.nodes} nodes there are ${F.levels} levels, ${F.entries} entries, and ${F.levels} levels are enough because 2^${F.levels} is more than any depth here.`,
    `Lift the deeper node first so that equal jumps land at equal depths: lca(10, 8) = ${F.answer108} takes ${F.jumps108} jumps where the naive walk takes ${F.steps108} parent steps.`,
    `Jump when the landing nodes differ and skip when they are equal: an equal landing has reached or passed the LCA, while a differing one still sits below it.`,
    `A path of 1,024 nodes needs ${F.path1024Jumps} jumps against ${F.path1024Steps.toLocaleString('en-US')} steps, paid for by a table of ${F.path1024Entries.toLocaleString('en-US')} entries.`,
  ],
  quiz: [
    {
      q: 'What does up[k][v] hold in the jump table?',
      options: [
        'The k-th child of v, counted in left-to-right order among its children',
        'The 2^k-th ancestor of v, or the root if the tree is not that tall',
        'The ancestor of v that sits exactly k levels above it in the tree',
        'The number of nodes in the subtree hanging k levels below the node v',
      ],
      answer: 1,
      why: `Row k jumps 2^k levels: in T0, up[1][6] = 1 is the grandparent of node 6, and up[2][10] = 1 is its 4th ancestor. A jump past the top lands on the root, which is why the zeros appear.`,
    },
    {
      q: 'Why must the deeper node first be lifted to the depth of the other?',
      options: [
        'So that equal jumps land at equal depths and can be compared',
        'Because jumps are only allowed to start from nodes deeper than level 2',
        'To make the two nodes meet at the root of the tree before comparing',
        'So that the table needs only one level instead of about log n levels',
      ],
      answer: 0,
      why: `The skip-or-jump test compares two landing nodes, which means something just when both start at one depth. Without the lift the test gives a wrong LCA for at least one pair of nodes on ${F.noEqualiseFails} of the ${F.trees} seven-node trees.`,
    },
    {
      q: 'Both nodes are at the same depth and the jump of size 2^2 lands them on the same node. What do you do with that jump?',
      options: [
        'Take it, because equal landing nodes mean that you have found the LCA already',
        'Take it, and then jump again by 2^2 to confirm the meeting node found',
        'Restart the query with the other node treated as the deeper of the two',
        'Skip it: it reaches the LCA or higher, so only differing landings are taken',
      ],
      answer: 3,
      why: `An equal landing is at or above the LCA, and the LCA itself may be lower, so the jump is skipped; in lca(10, 8) the jumps of 2^3, 2^2 and 2^1 are skipped for that reason, and the sole climb jump is at k = 0.`,
    },
    {
      q: 'A tree has 1,000,000 nodes. How many levels does the jump table need?',
      options: [
        '10, because 2^10 is already about a thousand, which is plenty for any query',
        '1,000, one for each possible number of steps up that a jump may take',
        '20 levels, since 2^20 is 1,048,576, enough to reach the root from any node',
        '6, one for each digit of the node count when written out in decimal form',
      ],
      answer: 2,
      why: `Levels = ceil(log2 n): ${F.millionLevels} for a million nodes, because a depth below 2^${F.millionLevels} is a sum of that many jumps or fewer. Ten levels reach a depth of 1,023 and no further.`,
    },
    {
      q: 'What do you pay for answering each LCA query in O(log n)?',
      options: [
        'Nothing, because the table is built while the queries run, using no extra memory',
        'About n log n table entries, built once, instead of O(n) parent walks',
        'A table of n squared entries, one for each pair of nodes in the tree',
        'A sorted copy of the tree, searched by binary search over the node labels',
      ],
      answer: 1,
      why: `The table has n x levels entries (${F.path1024Entries.toLocaleString('en-US')} for a path of 1,024 nodes), built once; each query then makes about ${F.path1024Jumps} jumps rather than up to ${F.path1024Steps.toLocaleString('en-US')} parent steps.`,
    },
  ],
};

export default lesson;
