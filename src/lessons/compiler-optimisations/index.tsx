import type { LessonModule } from '../../core/types';
import { FACTS as F } from './facts';
import { Stage } from './Stage';

const n = (v: number) => v.toLocaleString('en-US');

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'An optimiser rewrites a program into one that gives the same answer with less work, and each rewrite needs a proof: which ones are legal depends on the order the passes run in, on what the compiler may assume, and on whether a value is an integer or a float.',
    what: 'Compilers first put code in SSA form, where each name is assigned once and a phi picks a value where two paths merge, so "which assignment reaches this use" is just the name. Small passes then rewrite it: propagating constants and copies, folding constant arithmetic, reusing a repeated computation, simplifying x * 1, and deleting code nothing reads. Run in a different order they find different amounts to do. Around loops, inlining a call and hoisting work that does not change out of the loop cut the executed instructions, and a benchmark that ignores its result can lose the whole loop. A correct compiler also refuses: x * 0 is not 0 for a float, a load cannot skip a store through another pointer when the compiler cannot tell the two pointers apart, and floating-point sums cannot be regrouped by default.',
    analogy: 'An optimiser is an editor with a strict rule: any cut or rewrite must leave the answer unchanged for every input the program is allowed to receive, so it declines the edits it cannot prove.',
    useCases: [
      'Reading compiler output on Compiler Explorer and knowing why a line vanished or a loop was unrolled',
      'Writing benchmarks that consume their result, so the work being measured is not deleted',
      'Choosing between integer and floating-point code where a rewrite is legal for one and not the other',
      'Understanding what a promise such as restrict buys, and what breaks if it is false',
    ],
    why: 'Optimisation explains why a fast build behaves differently from a debug build, why microbenchmarks lie, and why floating-point results can depend on flags. The rules are small enough to run by hand, and knowing them turns a surprising compiler into a predictable one.',
    watch: 'In the listings a removed instruction is red (--bad) and one that was created or rewritten is green (--ok); the instruction running at the interpreter step you pick is yellow (--hi). A name you click in the SSA listing gets a blue ring (--info) on its definition and its uses, and the executed-instruction counts are blue (--info) stats. An instruction hoisted out of the loop is violet (--violet). A rewrite the compiler refuses is orange (--orange) with its reason, a rewrite that changes the answer is red and one that agrees is green, and in the aliasing table the current setting has a yellow wash. In the control-flow graph, the block that received hoisted instructions is tinted violet.',
  },
  tryThis: [
    `SSA, on the defaults (branch taken): both versions return ${F.ssaResult}. Click the name x3 in the SSA listing: it is assigned once, on line ${F.x3DefLine}, and read on line ${F.x3UseLine}. Flip the branch to "Not taken": the phi now picks x1 and the answers still agree.`,
    `Passes, on the defaults (order: fold, propagate, CSE, DCE, algebra, one round): fold changes ${F.foldFirstFolds} instructions in round 1. Press "Propagate first": fold now changes ${F.propagateFirstFolds}. Press "DCE first": DCE removes ${F.dceFirstRemoved} instruction and the listing goes from ${F.p1Static} to ${F.dceFirstStatic}. Press "A good order", then set Rounds to "To a fixed point": the program collapses to ${F.goodFixedStatic} instructions, three plus the ret.`,
    `Loop, on the defaults (all four steps off, n = ${n(F.loopN)}): the interpreter counts ${n(F.loopBase)} instructions, ${F.loopBasePer} per iteration. Switch on step 1, inlining: ${F.loopInlinedPer} per iteration. Also switch on step 2, hoisting: ${F.loopHoistedPer} per iteration, ${n(F.loopHoisted)} in all, but a loop that runs zero times now costs ${F.loopHoistedZeroTrip} instructions instead of ${F.loopBaseZeroTrip}. Then switch on steps 3 and 4 and set the benchmark to "ignores its result": the loop is deleted and ${F.lieGoneExecuted} instructions execute.`,
    `Aliasing, on the defaults (open "When a compiler refuses", Aliasing): with the promise not made, the compiler refuses to skip the load, and the original and optimised code both return the same value. Turn the promise on: the load is replaced and the loads executed fall from ${F.aliasBaseLoads} to ${F.aliasFastLoads}. Then set p and q to "the same address": the original returns ${F.aliasWrongOriginal}, the optimised code ${F.aliasWrongOptimised}, because the promise was false.`,
    `Floats, from the refusals scene: pick "Integer or float". On float64 the compiler refuses to fold x * 0, and the table shows Infinity * 0 is ${F.infinityTimesZero} and -3 * 0 is ${F.minusThreeTimesZero}. Switch the type to 32-bit int and it folds. Then pick "Reassociation": (a + b) + c is ${F.reassocLeft} while a + (b + c) is ${F.reassocRight}.`,
  ],
  keyIdeas: [
    `In SSA each name is assigned once, so the name answers "which assignment reaches this use": on the default snippet x3 is defined on line ${F.x3DefLine} and a phi chooses between x1 and x2 where the branches meet.`,
    `Pass order changes the work found: in this model fold changes ${F.foldFirstFolds} instructions when it runs before propagate and ${F.propagateFirstFolds} after it, and a good order needs ${F.goodFixedRounds} rounds to shrink ${F.p1Static} instructions to ${F.goodFixedStatic}.`,
    `Inlining and hoisting cut a loop from ${F.loopBasePer} to ${F.loopHoistedPer} executed instructions per iteration in this model, and a benchmark that ignores its result can lose the loop altogether (${F.lieGoneExecuted} instructions left), and for a loop it cannot prove finite, C and C++ let a compiler assume it terminates (from memory): consume the result.`,
    `A correct compiler declines rewrites it cannot prove: x * 0 is not 0 for floats (Infinity * 0 is ${F.infinityTimesZero}), and if a promise like restrict is false the optimised code returns ${F.aliasWrongOptimised} where the original returns ${F.aliasWrongOriginal}, which is the program's bug.`,
  ],
  quiz: [
    {
      q: 'A benchmark loop adds up numbers but nothing ever reads the sum. Why may an optimising compiler delete it?',
      options: [
        'Nothing observable depends on the sum, so deleting the loop leaves the behaviour unchanged',
        'Loops are slow, so a compiler removes any loop it finds, whatever it computes',
        'Deleted code cannot change a program, so any statement at all may be removed',
        'The compiler asks the programmer to confirm each deletion before it acts on it',
      ],
      answer: 0,
      why: `With its result unused the loop is dead code, and this loop is provably finite (and for one a compiler cannot prove finite, C and C++ let it assume termination, from memory), so the whole loop can go: ${F.lieGoneExecuted} instructions execute here against ${n(F.lieDceExecuted)} when loop removal is off. A benchmark has to use its result, for example by printing it.`,
    },
    {
      q: 'Why does a compiler refuse to rewrite `x * 0` as `0` when x is a float but accept it for an int?',
      options: [
        'A float x may be NaN, infinity or negative, and then x * 0 is not 0',
        'Float arithmetic is slower, so the saving would not be worth it',
        'The float product is exact only for small values of x like 5',
        'A float register cannot hold the constant 0, so the compiler cannot fold to it',
      ],
      answer: 0,
      why: `For a 32-bit integer the product is 0 whatever x is. For float64, Infinity * 0 is ${F.infinityTimesZero} and -3 * 0 is ${F.minusThreeTimesZero}, so folding to 0 would change the answer.`,
    },
    {
      q: 'Which statement about optimisation is accurate?',
      options: [
        'It keeps the answer for inputs the program may use, but a false promise such as restrict can change it',
        'It keeps the answer for any input, including programs that break their own promises to the compiler',
        'It keeps the answer only when every pass runs, so skipping a pass can change the result',
        'It changes the answer for floats and keeps it for integers, whatever the flags are',
      ],
      answer: 0,
      why: `Each rewrite is proved against the program's contract. With the promise made and p and q the same address, the original returns ${F.aliasWrongOriginal} and the optimised code ${F.aliasWrongOptimised}: the program lied, and the compiler was entitled to rely on it.`,
    },
    {
      q: 'What does `x3 = phi [entry: x1], [then: x2]` do in SSA?',
      options: [
        'It picks x1 or x2 by which block control arrived from',
        'It adds x1 and x2 and stores the sum in the name x3',
        'It assigns x3 twice, once on each path, in two places',
        'It picks the larger of x1 and x2 when the paths merge',
      ],
      answer: 0,
      why: `A phi is selected by the edge taken, not by a comparison: on the default run control comes from then, so x3 is x2 and the program returns ${F.ssaResult}. That is how each name stays assigned once.`,
    },
  ],
};

export default lesson;
