import type { LessonModule } from '../../core/types';
import { pctText, sig } from '../../core/format';
import {
  BRANCH_PRESETS, DEFAULT_PRED, DEP_LENGTH, ELEMENT_BITS, PATH_A_COST, PATH_B_COST, branchReport, cycleReport, depInput, depVerdict, runVector, steadyUtilisation,
  warpsToHide,
} from './model';
import { dependenceOpening, hidingOpening, lanesOpening } from './openings';
import { Stage } from './Stage';

const L = lanesOpening();
const DEFAULT = cycleReport(L.n, L.bits, L.tail, L.bandwidth);
const SCALAR = cycleReport(L.n, ELEMENT_BITS, L.tail, L.bandwidth);
const MASKED = cycleReport(L.n, L.bits, 'masked', L.bandwidth);
const THIN = cycleReport(L.n, L.bits, L.tail, 16);
const THIN_WIDER = cycleReport(L.n, 512, L.tail, 16);
const SMALL_N_NARROW = cycleReport(7, 128, 'scalar', 64);
const SMALL_N_WIDE = cycleReport(7, 256, 'scalar', 64);

const D = dependenceOpening();
const DEP_WIDE = depVerdict(depInput(), D.d, 8);
const DEP_WIDE_FIRST_CHUNK = runVector(depInput(), D.d, 8).chunks[0];

const WARP_DEFAULT = branchReport(DEFAULT_PRED);
const WARP_AGREE = branchReport(BRANCH_PRESETS[0].pred);

const H = hidingOpening();
const HIDE_NEED = warpsToHide(H.compute, H.stall);
const HIDE_DEFAULT = steadyUtilisation(H);
const HIDE_ENOUGH = steadyUtilisation({ ...H, warps: HIDE_NEED });

const speedup = (a: number, b: number) => `${sig(a / b, 3)}×`;

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'SIMD and GPUs do the same instruction on many elements at once: the win depends on how the loop divides into lanes, whether memory keeps up, whether iterations depend on each other, and whether the lanes agree on a branch.',
    what: 'A SIMD register holds several numbers, so one instruction adds several pairs of them at once: a 256-bit register holds 256 / 32 = 8 floats. A loop of N elements becomes floor(N / lanes) vector instructions plus a tail of leftovers, and the time is the larger of the instruction count and what memory can move. A loop that reads a value written a few iterations earlier can use only as many lanes as that distance. A GPU runs warps of 32 threads on one instruction stream, so a branch the lanes disagree on runs both sides, and a stalled warp is covered by running another.',
    analogy: 'A row of identical cash registers fed by one cashier calling out one instruction: all of them scan an item at once, but the line is only as fast as the conveyor belt feeding them, and a customer who needs a different step makes everyone wait.',
    useCases: [
      'Image filters, audio mixing and numeric loops that apply one operation to every element',
      'Reading a compiler report that says a loop was not vectorised because of a dependence',
      'Writing GPU kernels where a divergent branch or an uneven loop wastes lanes',
      'Choosing how many threads or warps to launch to keep a GPU busy while memory loads are in flight',
    ],
    why: 'Parallel hardware pays off when the work fits it. Knowing where the cycles go (tail, memory, dependence, divergence, stalls) lets you tell a loop that speeds up eight times from one that speeds up three, and one that cannot be vectorised at all.',
    watch: 'Lanes and tails: a gold cell is an element the instruction just touched, a violet cell belongs to the scalar tail, a grey cell is done and a dark outlined cell is not reached yet; the lane row under the grid shows the instruction\'s lanes, gold when on and dashed when masked off, and the stat that limits (compute or memory) is cyan. Dependence: a cyan ring is what the chunk reads, a gold ring what it writes, a green cell matches the scalar loop and a red one differs. Warp divergence: a gold lane is active, a dark outlined lane is masked off and a grey lane is neutral; the predicate row is gold for lanes taking path A. Latency hiding: a gold bar is a warp issuing, a hatched dark bar is a warp ready but waiting for the slot, a dashed cyan bar is a warp waiting on memory; the three curves are stall lengths in sky blue, amber and pink.',
  },
  tryThis: [
    `In Lanes and tails at the defaults (${L.n} floats, 256-bit, scalar epilogue, ${L.bandwidth} bytes a cycle) the loop is ${DEFAULT.vectorOps} vector ops plus a ${DEFAULT.tailElements}-element tail: ${DEFAULT.cycles} cycles, ${speedup(SCALAR.cycles, DEFAULT.cycles)} one lane at a time, not 8×. Switch Tail to masked: ${MASKED.compute} instructions and ${MASKED.cycles} cycles.`,
    `In Lanes and tails, drag Memory bandwidth down to 16 B/cycle. Memory now needs ${THIN.memory} cycles, the loop is memory-bound at ${THIN.cycles}, and the next wider register would cost ${THIN_WIDER.cycles}, not fewer.`,
    `In Dependence at the defaults (d = ${D.d}, ${D.lanes} lanes) the vector run matches the scalar loop. Pick 256-bit (8 lanes): ${DEP_WIDE.wrong.length} elements differ, the first at index ${DEP_WIDE.firstWrong}, because the chunk reads a[${DEP_WIDE_FIRST_CHUNK.staleReads[0]} to ${DEP_WIDE_FIRST_CHUNK.staleReads.at(-1)}] before it writes them.`,
    `In Warp divergence at the defaults (the first half of the lanes take path A) the warp issues ${WARP_DEFAULT.issued} instructions at ${pctText(WARP_DEFAULT.utilisation, 0)} utilisation. Press all true: ${WARP_AGREE.issued} instructions at ${pctText(WARP_AGREE.utilisation, 0)}.`,
    `In Latency hiding at the defaults (${H.warps} warps, ${H.stall}-tick stalls, ${H.compute}-tick bursts) the slot is busy ${pctText(HIDE_DEFAULT, 0)} of the time in steady state. Press enough warps to hide the stall (${HIDE_NEED}): ${pctText(HIDE_ENOUGH, 0)}.`,
  ],
  keyIdeas: [
    `N elements on W lanes take floor(N / W) vector ops plus a tail; in this model a scalar tail costs an instruction per leftover element, so 7 elements need ${SMALL_N_WIDE.compute} instructions at 8 lanes against ${SMALL_N_NARROW.compute} at 4 lanes: a wider register can be slower.`,
    'Cycles are the larger of compute and memory in this model, so once memory binds, a wider register costs the same or more.',
    `A chunk of W elements reads before it writes, so in this model a loop that reads a[i - d] gives the scalar answer exactly when W is at most d, and the ${DEP_LENGTH}-element loop here shows the wrong elements when it is not.`,
    'A warp issues one instruction stream to 32 lanes: a branch the lanes disagree on runs both paths with lanes masked, a long lane keeps the warp stepping, and other resident warps cover a stalled one.',
  ],
  quiz: [
    {
      q: 'A loop does `a[i] = a[i - 2] + 1`. Which vector width gives the same answer as the scalar loop?',
      options: [
        'One or two lanes, since each chunk then reads values written earlier',
        'Four lanes, since a wider register does more work in each instruction and the added constant is small',
        'Eight lanes, since adding a constant has no effect on what the next read sees',
        'Any width, because the loop body is a single addition for each element',
      ],
      answer: 0,
      why: 'A chunk reads W elements before it writes any, so a read of a[i - 2] is safe when an earlier chunk wrote it, which holds while W is 2 or fewer. At 4 lanes the second pair reads values the first pair has not written yet. The added constant does not change the dependence on the earlier result, and a wider register cannot hurry a chain.',
    },
    {
      q: 'Half the lanes of a 32-lane warp take the `if` path and half take `else`. What does the warp pay?',
      options: [
        'Both paths in turn, with the other half of the lanes masked off each time',
        'The longer path alone, since the two halves run side by side in the warp',
        'The average of the two paths, since half the lanes use each of them and share the work',
        'The path lane 0 takes, since the other lanes follow the first lane',
      ],
      answer: 0,
      why: `A warp has one instruction stream, so it issues path A with the A lanes on, then path B with the B lanes on: the costs add (${PATH_A_COST} + ${PATH_B_COST} = ${PATH_A_COST + PATH_B_COST} here). The halves cannot run side by side, an average understates it, and lane 0 does not decide for the others.`,
    },
    {
      q: 'Seven elements, a scalar tail and 64 bytes a cycle: how do 4-lane and 8-lane registers compare in this model?',
      options: [
        'More at 8 lanes: no full 8-wide op fits, so all 7 elements are tail instructions',
        'About half as many at 8 lanes, since each operation has twice the lanes to work with',
        'The same count, since seven elements are the same work whatever the register is',
        'One instruction at 8 lanes, since a single wide register absorbs the 7 leftover elements',
      ],
      answer: 0,
      why: `With 4 lanes one vector op covers 4 elements and 3 go through the tail: ${SMALL_N_NARROW.compute} instructions. With 8 lanes no full vector op fits, so the 7 elements become tail instructions: ${SMALL_N_WIDE.compute}. Twice the lanes helps when the loop fills them, and a masked tail would change the count.`,
    },
    {
      q: 'A GPU warp waits 40 ticks for a memory load. What keeps the issue slot busy meanwhile?',
      options: [
        'Other resident warps, which issue their own instructions while the first one waits',
        'A faster clock, which makes the memory answer arrive in fewer ticks',
        'More lanes in the waiting warp, which finish the load by themselves',
        'Branch prediction, which guesses the loaded value and carries on',
      ],
      answer: 0,
      why: `A warp that is waiting cannot issue, so the scheduler picks another ready warp: with enough resident warps (${HIDE_NEED} for ${H.compute}-tick bursts and ${H.stall}-tick stalls here) the slot stays busy. Clocks and lane counts do not shorten a memory wait in this model, and nothing here guesses the loaded value.`,
    },
  ],
};

export default lesson;
