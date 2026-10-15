import type { LessonModule } from '../../core/types';
import { FACTS as F } from './facts';
import { Stage } from './Stage';

const n = (v: number) => v.toLocaleString('en-US');

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Prefix sums answer a range query in one step but rewrite the whole array on each update; a segment tree or a Fenwick tree makes both a path of about log n cells.',
    what: `Prefix sums turn a range sum into two reads, but changing one cell rewrites every prefix after it. A segment tree stores the answer for a range in each node of a binary tree over the cells: a query takes whole nodes that fit inside the range and goes down only where a node overlaps it, and an update recomputes the one path from the leaf to the root. It works for sum, min, max and gcd. With lazy tags, a whole range can be added to by tagging a few big nodes and pushing the tag down only when something needs to look inside. A Fenwick tree keeps one number per cell, each responsible for a range set by the lowest set bit of its index; it is smaller, but its range query subtracts two prefixes, so it needs an operation with an inverse (sum and xor, not min or max).`,
    analogy: 'A tournament bracket: to find the best player in a stretch of seats you take the winners of whole sub-brackets that fit inside it, and when one player changes you replay only the matches on the way up to the final.',
    useCases: [
      'Range sums, minimums or maximums over data that changes, such as counters per time slot or prices per day',
      'Leaderboard and analytics queries over a window of ranks or a window of time',
      'Competitive-programming staples, and the idea behind interval trees and some database indexes',
      'Rank and count queries with a Fenwick tree when only sums are needed and memory is tight',
    ],
    why: 'It is the standard answer to "queries mixed with updates": knowing why prefix sums break, how a path of nodes replaces a rewrite, and when a smaller Fenwick tree is enough lets you pick the right tool.',
    watch: 'In the segment tree each box shows its cell range above and its aggregate inside. Green boxes lie inside the query range and are taken whole, blue boxes overlap it in part so the search goes down, a yellow box is the one being looked at, and grey dashed boxes lie outside it. A violet badge is a lazy tag and a violet outline marks the node a tag is being pushed from. In the first scene the prefix cells rewritten by a change are red tinted, and the bars and totals are coloured by rank: red for the costliest design, green for the cheapest, grey for the one between. In the Fenwick scene a green cell is read by the prefix query, a yellow cell is written by the update, and the coloured bars under the cells show each cell\'s range by lowbit: amber 1, pink 2, blue 4, orange 8, grey 16.',
  },
  tryThis: [
    `In Why prefix sums stop, on the defaults (8 cells, 50% updates): over the seeded ${F.workload} operations prefix sums touch ${F.smallPrefix} cells, the segment tree ${F.smallSegment} nodes (partial nodes count, so it is the red bar here) and the Fenwick tree ${F.smallFenwick}, so on 8 cells prefix sums are not the worst. Choose 1,024 cells, where prefix sums turn red: ${n(F.bigPrefix)} against ${n(F.bigSegment)} and ${n(F.bigFenwick)}.`,
    `In The segment tree, press play on the default (sum of cells ${F.queryL} to ${F.queryR}): the covering nodes are ${F.queryCovering}, ${F.queryCoveringCount} of them, the search touches ${F.queryTouched} nodes and the answer is ${F.queryValue}.`,
    `In Lazy range updates, press play on the default (add ${F.addV} to cells ${F.addL} to ${F.addR}): lazy tags touch ${F.lazyTouched} nodes where visiting every leaf (switch Laziness off, press Add) touches ${F.eagerTouched}. Then set l and r to 3 and press Query: the tag is pushed down.`,
    `In The Fenwick tree, on the defaults: a prefix query up to ${F.fenQuery} reads cells ${F.fenReads} and an update at ${F.fenUpdate} writes cells ${F.fenWrites}; cells ${F.rangeL} to ${F.rangeR} sum to ${F.rangeValue} in ${F.rangeCells} reads, and the segment tree agrees. Choose min: the range becomes cells ${F.minL} to ${F.minR}, the Fenwick tree is refused, and its prefix recipe says ${F.minWrong} where a plain loop says ${F.minTrue}.`,
    `In Pick the structure, on the defaults (min, no updates): a sparse table at ${n(F.sparseNumbers)} numbers; switch Memory is tight to Yes and it becomes a segment tree at ${n(F.leanNumbers)}.`,
  ],
  keyIdeas: [
    'A range query on a segment tree takes whole nodes that fit inside the range and goes down into the nodes that overlap it, so it uses no more than two covering nodes per level.',
    `A point update rewrites one root-to-leaf path, and a lazy tag lets a range add stop at big nodes (${F.lazyTouched} touched against ${F.eagerTouched} here) until a later query has to look inside and pushes the tag down.`,
    `Prefix sums are cheapest when nothing changes: at 1,024 cells a mixed workload costs ${n(F.bigPrefix)} cells touched on prefix sums against ${n(F.bigSegment)} on a segment tree.`,
    'A Fenwick tree stores one number per cell and answers a range by subtracting two prefixes, so it needs an operation with an inverse: sum and xor qualify, min and max do not.',
  ],
  quiz: [
    {
      q: 'An array gets one point update for every few range sums, and it has 1,024 cells. What happens to a prefix-sum array on each update?',
      options: [
        'Every prefix cell after the changed one is rewritten, up to 1,024 of them',
        'Only the changed cell and its parent are rewritten, as in a tree',
        'Nothing is rewritten, since a range sum is two reads of old values',
        'The whole array is rebuilt from scratch, which costs 2,048 cell writes',
      ],
      answer: 0,
      why: `A prefix cell holds the sum of everything before it, so changing one value changes each prefix after it. In the lesson at 1,024 cells that is why prefix sums touch ${n(F.bigPrefix)} cells on the seeded mix against ${n(F.bigSegment)} for the segment tree.`,
    },
    {
      q: `On 8 cells the sum of cells ${F.queryL} to ${F.queryR} is asked of a segment tree. How many nodes does the answer combine?`,
      options: [
        `${F.queryCoveringCount}: ${F.queryCovering}, whole nodes that fit inside`,
        '8: one leaf per cell, added one by one',
        '2: the nodes holding the two ends of the range',
        '1: the root, since it already holds the total',
      ],
      answer: 0,
      why: `The search takes a node whole as soon as its range fits inside the query and descends where it overlaps: here ${F.queryCoveringCount} covering nodes, ${F.queryCovering}, after touching ${F.queryTouched} nodes in total. The root holds the total of the 8 cells, which is not the range asked for.`,
    },
    {
      q: 'A Fenwick tree answers a range sum as prefix(r) minus prefix(l - 1). Why can it not answer a range minimum the same way?',
      options: [
        'Minimum has no inverse, so prefix(l - 1) cannot be taken away from prefix(r)',
        'Minimum needs the cells in sorted order, which a Fenwick tree does not keep',
        'A Fenwick tree stores only one number per cell, which is too little to hold a minimum',
        'The hops add the lowest set bit, which is wrong for comparisons such as min',
      ],
      answer: 0,
      why: `Subtracting works because sum has an inverse: knowing the total up to r and the total up to l - 1 gives the part between. Knowing the minimum up to r says nothing about the minimum from l on: for cells ${F.minL} to ${F.minR} the prefix recipe gives ${F.minWrong} where a plain loop gives ${F.minTrue}.`,
    },
    {
      q: 'A segment tree takes a lazy tag "+5" on a node. When is the tag pushed onto the children?',
      options: [
        'When a later query or update has to look inside that node',
        'Right away, one level at a time, as soon as the add finishes',
        'At the end of the day, in a batch that visits every tagged node',
        'Never: a node keeps its tag and its children are updated by recomputing from the leaves',
      ],
      answer: 0,
      why: `Pushing is postponed on purpose: the tagged node already holds the right aggregate for its own range, and the children are brought up to date when something has to descend through it. In the lesson a query on cell 3 after the add pushes ${F.pushedAt} tags on its way down. Pushing at once would cost the same work as visiting each leaf.`,
    },
  ],
};

export default lesson;
