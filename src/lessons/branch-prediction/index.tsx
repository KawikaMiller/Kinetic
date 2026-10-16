import type { LessonModule } from '../../core/types';
import { n } from './captions';
import { labFacts, sortedFacts, speculationFacts } from './facts';
import { Stage } from './Stage';

const lab = labFacts();
const sorted = sortedFacts();
const spec = speculationFacts();

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'To keep the pipeline full the CPU guesses which way a branch will go before it knows, runs ahead on the guess, and throws the work away when it was wrong.',
    what: 'A branch predictor remembers how branches behaved and guesses the next outcome. A 1-bit predictor repeats the last outcome. A 2-bit saturating counter has four states and needs two wrong outcomes in a row to change its guess, which suits a loop. A two-level predictor adds a short history of recent outcomes, so it can learn a repeating pattern. A wrong guess costs a pipeline flush: the instructions fetched down the wrong path are discarded, and each lost cycle is added to the total. The same loop can be fast or slow just because its data is sorted or not.',
    analogy: 'A waiter who sets the next table before you have said what you want. If he guessed right, dinner arrives sooner; if he guessed wrong, he clears the table and starts again.',
    useCases: [
      'Why a loop over sorted data can run several times faster than over the same values shuffled',
      'Why branch-free code (conditional moves, arithmetic selects) can win on unpredictable data and lose on predictable data',
      'Reading "branch-misses" in perf, VTune or Instruments',
      'Understanding why speculative execution became a security topic: discarded work can leave traces',
    ],
    why: 'Pipelines are deep enough that a wrong guess wastes many cycles, so predictability of your branches is a performance property of your code, and speculation is the root of a family of security bugs. It builds on `cpu-pipelining`, which stops at "a taken branch throws away 2 instructions".',
    watch:
      'Predictor lab: the stream grid shows each branch outcome in yellow (taken) or grey (not taken), and under each processed branch the predictor\'s guess in green if it was right and red if it was wrong; the current branch has a yellow ring on its outcome and a violet ring on its guess. The counter diagram ringed in blue is the counter\'s state now, and the yellow edge is the move just made. The plot draws each predictor as its own categorical line (orange, amber, pink, sky and grey), the selected one solid. Sorted versus unsorted: yellow is a taken branch, grey not taken, red a miss, dim a loop with no branch. Speculation: the branch is yellow, speculative instructions are dim outlines, then green when kept after a right guess or red when flushed after a wrong one. Chips say what is a toy, illustrative, simulated or from memory.',
  },
  tryThis: [
    `In the predictor lab as it opens (2-bit counter on "Loop of four"), read the "Which predictor wins here" table: over the same ${n(lab.branches)} branches the 2-bit counter misses ${n(lab.loopTwoBit)} and the 1-bit predictor ${n(lab.loopOneBit)}, because the 1-bit predictor also misses the taken branch that follows each exit.`,
    `Pick "Alternating TN", then set the initial counter state to 1: the 2-bit counter misses all ${n(lab.branches)} branches because the two weak states keep swapping. Set it to 2 and it misses ${n(lab.altTwoBitDefault)}.`,
    `Pick "Pairs (TTNN)" and read the table: the 1-bit predictor misses ${n(lab.pairsOneBit)} of ${n(lab.branches)} and the 2-bit counter ${n(lab.pairsTwoBit)}. The 2-bit counter is not always better.`,
    `In "Sorted versus unsorted" (unsorted data, 2-bit counter, penalty ${sorted.penalty}) the loop misses ${n(sorted.unsortedMisses)} of ${n(sorted.iterations)} branches and takes ${n(sorted.unsortedCycles)} cycles. Switch to Sorted: ${n(sorted.sortedMisses)} misses and ${n(sorted.sortedCycles)} cycles. Then choose Unsorted and Branchless: ${n(sorted.branchlessCycles)} cycles with no misses, which is more than the sorted branchy loop.`,
    `In "Speculation and the flush" (the branch resolves at stage ${spec.depth}, the predictor wrong) ${n(spec.flushed)} instructions are flushed. Drag the slider to stage ${spec.deep}: ${n(spec.deepFlushed)} are flushed and ${n(spec.deepLost)} fetch cycles are lost. Set the guess to Right and nothing is flushed.`,
  ],
  keyIdeas: [
    'A branch predictor guesses before the branch resolves; in this model a wrong guess discards the work fetched on it and total cycles are instructions plus misses times the penalty.',
    'A 2-bit counter needs two wrong outcomes in a row to change its guess, which helps at a loop exit, but a pattern like TTNN can make a 1-bit predictor miss fewer branches.',
    'Sorted data gives the same branch a stream with one change instead of a coin flip, so the same predictor misses a handful of branches instead of about half.',
    'Real CPUs use far larger predictors than these textbook ones, and discarded speculative work can still leave traces in caches.',
  ],
  quiz: [
    {
      q: 'A branch alternates taken, not taken, taken, not taken. On a 1-bit predictor that starts by guessing not taken, how often does it miss?',
      options: [
        'On every branch: it repeats the last outcome, and this one is the opposite',
        'On about half of them, since the pattern is regular and half the guesses land',
        'Only on the first branch, then it has learned the alternation',
        'On none once warmed up, since a regular pattern is easy to predict',
      ],
      answer: 0,
      why: `A 1-bit predictor guesses what the branch did last time, and an alternating branch does the opposite each time, so in this model it misses the whole run (${n(lab.altOneBit)} of ${n(lab.branches)} in the lab).`,
    },
    {
      q: 'Why does sorting the array make the same `if (x >= 128)` loop faster?',
      options: [
        'The outcomes come in two long runs, so the predictor misses a handful of branches',
        'Sorted data lets the compiler remove the comparison, so the branch is gone',
        'The cache keeps sorted values longer, which shortens each load in the loop',
        'The compare instruction itself finishes sooner on values that are in order',
      ],
      answer: 0,
      why: `The loop does the same work either way. With sorted data the outcome changes ${n(sorted.sortedTransitions)} time, so the 2-bit counter misses ${n(sorted.sortedMisses)} of ${n(sorted.iterations)}; with unsorted data it misses ${n(sorted.unsortedMisses)}, and each miss costs ${n(sorted.penalty)} cycles in this model.`,
    },
    {
      q: 'A 2-bit counter sits in state 3 (strongly taken) and the branch runs TTTN over and over. How many misses per 4 branches?',
      options: [
        'One: the exit only moves it to state 2, which still guesses taken',
        'Two: the exit, and the taken branch that follows it',
        'None: a strongly taken counter ignores a single not-taken outcome',
        'Four: the state changes on every branch, so the guess keeps flipping',
      ],
      answer: 0,
      why: `The not-taken exit is a miss and drops the counter to state 2, which still guesses taken, so the next T hits. Over the lab's ${n(lab.branches)} branches that is ${n(lab.loopTwoBit)} misses; the 1-bit predictor misses ${n(lab.loopOneBit)}.`,
    },
    {
      q: 'On the TTNN pattern, which statement about the predictors in the lab is true?',
      options: [
        `The 1-bit predictor misses fewer (${n(lab.pairsOneBit)} against ${n(lab.pairsTwoBit)}): the counter is dragged back and forth across its middle`,
        `The 2-bit counter misses fewer, because it needs two wrong outcomes to change its mind`,
        `They miss the same number of branches, since the pattern repeats every four`,
        `Neither misses, since a repeating pattern of four is within any predictor's reach`,
      ],
      answer: 0,
      why: `Two outcomes in a row is exactly the run length the counter needs to change its guess, so it keeps arriving one step late. The 2-bit counter is the better choice on many streams, but not on this one.`,
    },
    {
      q: 'A branch resolves at stage 5 of a scalar pipeline that fetches one instruction a cycle, and the predictor guessed wrong. How many younger instructions are flushed?',
      options: ['4', '5', '1', '0'],
      answer: 0,
      why: 'The branch was fetched in cycle 1 and resolves at stage 5, so 4 younger instructions were fetched behind it on the guess, and the flush discards them: depth - 1.',
    },
  ],
};

export default lesson;
