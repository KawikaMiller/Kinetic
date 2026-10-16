import type { LessonModule } from '../../core/types';
import { DEFAULT_LIST, DEFAULT_P, mapOpening } from './openings';
import {
  FLOAT_PRESET, OPS, blellochCost, compact, foldCost, hillisCost, isEven, lift, mapSteps, reduceVerdict, type OpId,
} from './patterns';
import { Stage } from './Stage';

const verdict = (values: readonly number[], op: OpId, arrival = false) => reduceVerdict(lift(values, op), OPS[op], arrival);

const MAP = mapOpening();
const N = MAP.values.length;
const SUM = verdict(DEFAULT_LIST, 'plus');
const SUBTRACT = verdict(DEFAULT_LIST, 'subtract');
const SUB4 = verdict([8, 4, 2, 1], 'subtract');
const CONCAT_ORDER = verdict([1, 2, 3, 4], 'concat', true);
const FLOATS = verdict(FLOAT_PRESET, 'plus');
const HILLIS = hillisCost(8);
const BLELLOCH = blellochCost(8);
const LOOP = foldCost(8);
const COMPACTED = compact([5, 2, 8, 3, 6, 7, 4, 1], isEven);

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Map, reduce and scan are the building blocks of data parallelism: map is free parallelism, reduce works when the operator can be regrouped, and scan computes every prefix in few steps by doing extra work.',
    what: 'Map applies a function to every element independently, so with enough processors it takes one step. Reduce combines a list into one value: a tree of pairs takes about log2 n levels instead of n - 1 steps, but only gives the loop\'s answer if the operator may be regrouped (associative), and for some uses reordered (commutative). Scan computes every running prefix: Hillis-Steele finishes in log2 n steps but does about n log n additions, while Blelloch does about 2 (n - 1) additions in about 2 log2 n steps. Counts are work (operations) and span (steps), and the time on p processors lies between work / p and work / p + span.',
    analogy: 'A tournament bracket: eight players are reduced to one winner in three rounds by pairing neighbours, but that only works for a contest where who plays whom does not change the champion; adding up scores works, subtracting them does not.',
    useCases: [
      'Choosing a combining function for a map-reduce or parallel stream pipeline',
      'Seeing why floating-point sums differ between a loop and a parallel reduction',
      'Using prefix sums for stream compaction, histogram offsets and radix-sort passes',
      'Reasoning about GPU kernels where work and span, not just step count, decide the speed',
    ],
    why: 'Parallel code is only correct if the operation allows it. An associative operator can be regrouped into a tree; a non-commutative one must keep its order; a floating-point sum is not exactly associative. Knowing work against span also stops you from picking an algorithm that is fast in steps but wasteful in operations.',
    watch: 'Map: a cyan cell is being read this step, a gold cell written this step and a dark cell not touched yet. Reduce: each row is one level of the tree; cyan cells are the operands being combined, gold is the partial result written, grey is earlier; at the end the tree\'s value is green when it agrees with the sequential fold and red when it does not, and the fold row below is the loop\'s running result. Scan: each row of the grid is one step; cyan cells are operands read, gold cells written this step, dark outlined cells untouched this step, violet cells padding with the identity, and the result row is green where it matches the loop and red where it differs.',
  },
  tryThis: [
    `In Map at the defaults (${N} values, ${DEFAULT_P} processors) the doubling takes ${mapSteps(N, DEFAULT_P)} steps against ${N} for one processor. Drag Processors to 8: ${mapSteps(N, 8)} step.`,
    `In Reduce at the defaults (sum of 8) the tree takes ${SUM.tree.steps} levels and ${SUM.tree.ops} operations against ${SUM.fold.steps} steps for the fold, and both give ${SUM.tree.result}. Pick Subtract: the fold gives ${SUBTRACT.fold.result} and the tree ${SUBTRACT.tree.result}, a regrouping.`,
    `In Reduce press concatenate 1 to 4 and set Combine to in arrival order: the fold gives ${CONCAT_ORDER.fold.result} and the tree ${CONCAT_ORDER.tree.result}, because reordering changes the answer.`,
    `In Reduce press floats 0.1 to 0.8: the fold sums to ${FLOATS.fold.result} and the tree to ${FLOATS.tree.result}, real JavaScript numbers that differ in the last digits.`,
    `In Scan at the defaults (Hillis-Steele, inclusive, 8 values) the scan takes ${HILLIS.span} steps and ${HILLIS.work} additions against ${LOOP.work} for the loop. Pick Blelloch: ${BLELLOCH.work} additions in ${BLELLOCH.span} steps.`,
  ],
  keyIdeas: [
    `Map is as parallel as it gets: ${N} independent elements take ${mapSteps(N, DEFAULT_P)} steps on ${DEFAULT_P} processors and 1 step with enough of them.`,
    `A tree reduces n values in about log2 n levels, but it can only be relied on to agree with the loop if the operator allows regrouping (agreeing on one input proves nothing): in this model subtract gives ${SUB4.fold.result} by fold and ${SUB4.tree.result} by tree on 8, 4, 2, 1, and concatenation in arrival order gives ${CONCAT_ORDER.tree.result} for ${CONCAT_ORDER.fold.result}.`,
    `Parallel prefix sums do more work than the loop: for 8 values Hillis-Steele does ${HILLIS.work} additions and Blelloch ${BLELLOCH.work} against ${LOOP.work}, in exchange for ${HILLIS.span} to ${BLELLOCH.span} steps instead of ${LOOP.span}.`,
    `A scan is a general tool: an exclusive scan of 0/1 flags gives each kept element its output slot, so compaction keeps ${COMPACTED.out.join(', ')} from 5, 2, 8, 3, 6, 7, 4, 1 with the writes independent.`,
  ],
  quiz: [
    {
      q: 'Reduce [8, 4, 2, 1] with subtract, once as a left-to-right fold and once as a tree of neighbour pairs. Which is the right answer?',
      options: [
        `The fold's ${SUB4.fold.result}: subtract is not associative, so the tree's ${SUB4.tree.result} is another computation`,
        `The tree's ${SUB4.tree.result}: pairing neighbours first is the better method, so its result is the true one`,
        'Both, since both of them subtract every one of the four values from the running total',
        'Neither, since subtract cannot be applied to a list of four values in any order',
      ],
      answer: 0,
      why: `The loop defines the answer: (8 - 4) - 2 - 1 = ${SUB4.fold.result}. The tree computes (8 - 4) - (2 - 1) = ${SUB4.tree.result}, and since regrouping changed the result, subtract is not associative: a plain tree of subtracts cannot reproduce the loop (the loop's a0 - (a1 + a2 + ...) form can be reduced in parallel). Both are computations, one of them is the one asked for, and subtract does work on a list.`,
    },
    {
      q: 'For 8 values, how many additions does the Hillis-Steele scan do compared with the plain loop?',
      options: [
        `${HILLIS.work} against ${LOOP.work}: more additions, in fewer steps`,
        `${LOOP.work}, the same as the loop, only in a different order`,
        `${HILLIS.span}, one addition for each step it takes`,
        `${BLELLOCH.work}, the same as the work-efficient version`,
      ],
      answer: 0,
      why: `Each stride d adds one value to each cell from d on, so 7 + 6 + 4 = ${HILLIS.work} additions against ${LOOP.work} for the loop: it is work-inefficient. It finishes in ${HILLIS.span} steps because each step is parallel. The work-efficient Blelloch scan does ${BLELLOCH.work}, and a step holds many additions, not one.`,
    },
    {
      q: 'Concatenation is associative. Why can reducing in arrival order still give a different string?',
      options: [
        'Associative lets the grouping change, but it does not let the order of the two operands change',
        'Arrival order regroups the pairs, and concatenation cannot be regrouped by any method at all',
        'Strings are not numbers, so a reduction cannot combine them with a tree in the first place, whatever the operator',
        'The tree adds extra characters, since each level joins its two operands twice for safety',
      ],
      answer: 0,
      why: `Concatenation can be regrouped (the in-order tree gives the fold's ${CONCAT_ORDER.fold.result} in this model) but is not commutative: arrival order swaps the operands in each pair and gives ${CONCAT_ORDER.tree.result}. Reduction needs commutativity too when partial results can arrive in any order.`,
    },
    {
      q: 'An exclusive scan of 0/1 flags (1 = keep) is the first step of stream compaction. What does the scan give?',
      options: [
        'Each kept element its output slot, so all of them can be written at the same time',
        'The number of kept elements only, since a scan reports one total for the whole array of flags',
        'The kept elements themselves, sorted, since a scan puts the larger values toward the end',
        'The flags again, since scanning a list of zeros and ones leaves it exactly as it was',
      ],
      answer: 0,
      why: `The running count of kept elements before position i is where element i goes: for 5, 2, 8, 3, 6, 7, 4, 1 the slots are ${COMPACTED.slots.join(', ')}, and the evens land in ${COMPACTED.out.join(', ')}. A scan gives a running total at each position, not one total, and it does not sort or leave the flags unchanged.`,
    },
  ],
};

export default lesson;
