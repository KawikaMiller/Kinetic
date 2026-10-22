import type { LessonModule } from '../../core/types';
import { FACTS as F } from './facts';
import { Stage } from './Stage';

const growth = F.growth.join(', ');

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A model checker looks at the reachable states of a small model of a design and, when a property fails, prints the shortest path to the failure; a pass is a statement about the model at its size, not a proof about the real program.',
    what: `Induction proves a property by hand and random testing samples runs; the third way is to look at the reachable states of a small model. The lesson gives you a tiny guarded-command language of its own (not TLA+): processes run one program of up to six steps, guards are typed text run by a hand-written evaluator, and you state an invariant. Pressing Check explores the full set of states breadth first and either reports that the property holds in the whole model, or prints the shortest schedule to a bad state, or finds a deadlock. A state count that doubles with each process shows where the approach runs out.`,
    analogy: 'Checking a board game by listing each position the rules allow rather than playing a few games: if a bad position exists the list contains it, along with the shortest sequence of moves that gets there, but just for the board you wrote down.',
    useCases: [
      'Finding a flaw in a lock, a protocol or a handshake at design time, before any code exists',
      'Turning a vague race into a concrete schedule that can be replayed as a test against the real code',
      'Deciding how many processes or steps a model can have before the state space is too large to list',
      'Reading about TLA+ and its model checker in published engineering accounts with a sense of what a pass covers',
    ],
    why: 'Concurrency bugs that appear once in a million runs are hard to find by testing, and a model checker finds them in a small model on demand. It builds on `induction-invariants` (a proof by hand), `proof-techniques` and `property-based-testing` (sampling inputs), and says what each of those leaves open.',
    watch: 'The step a process is about to run is ringed blue-green. A guard is violet (structure). A state on the counterexample path is blue; the violating state, and the processes sitting in the critical section together, are red. A green count means the search finished and the numbers cover the whole model; a dim count means it was cut off. In the growth scene the green line is the explorer\'s count and the blue one is the closed form.',
  },
  tryThis: [
    `Open Check a lock (the default is Peterson's algorithm with mutual exclusion) and press Check: "holds in all ${F.petersonStates} reachable states of this model".`,
    `Change the guard of step 2 (the wait) to true and press Check: violated, with a shortest path of ${F.trueGuardSteps} steps. Press play to watch both processes arrive in the critical section.`,
    `Restore the guard to flagOther == 0 || turn == me, then edit it to flagOther == 0 and press Check: no mutual-exclusion violation, but a deadlock after ${F.noTurnSteps} steps (the deadlock check is on by default). Unsafe and stuck are different failures.`,
    `Press the naive flag lock preset and Check: violated in ${F.naiveSteps} steps, because both processes checked the lock before either took it.`,
    `Open How big does it get and step N from 2 to 6: ${growth} states, matching ${F.closed(2)} at N = 2.`,
  ],
  keyIdeas: [
    `A model checker visits each reachable state of the model, so a failure comes with the shortest path to it: Peterson's lock holds in ${F.petersonStates} states, while the naive lock fails in ${F.naiveSteps} steps.`,
    `A pass is a statement about the model at its size: it holds in the ${F.petersonStates} states of this model and does not cover the real code or a larger number of processes, and the lesson says so beside each pass.`,
    `Unsafe and stuck are different failures: removing the turn clause from Peterson's guard leaves mutual exclusion intact but deadlocks after ${F.noTurnSteps} steps, while a guard of true violates it in ${F.trueGuardSteps}.`,
    `State counts grow fast: the atomic lock has ${growth} states for 2 to 6 processes, which is why real checkers abstract and sample, and why random testing of ${F.naiveRandomFailing} of 200 seeds finding the naive bug (lowest failing seed ${F.naiveRandomLowest}) says nothing about the other schedules.`,
  ],
  quiz: [
    {
      q: 'The checker says "holds in all 20 reachable states". What has been shown?',
      options: [
        'The real implementation is free of races, since the model was checked',
        'The property holds in each state of this small model, nothing more',
        'No schedule of the real program can deadlock, because none appeared here',
        'The property holds for any number of processes, since 2 were enough',
      ],
      answer: 1,
      why: 'A model checker explores the model you wrote. A pass covers that model at that number of processes; whether the real code matches the model, or holds with more processes, is a separate question.',
    },
    {
      q: 'How does a model checker differ from random testing of the same lock?',
      options: [
        'It runs the real binary many more times than any random tester would ever manage',
        'It proves the property for any number of processes, not just for a few of the ones tested',
        'It covers each reachable state of the model, so a violation has a shortest path',
        'It shrinks a random input until the bug is as small as it can possibly be made to be',
      ],
      answer: 2,
      why: `Random testing samples schedules: in the model, 200 seeded schedules reach the naive lock's bug on ${F.naiveRandomFailing} seeds and say nothing about the rest. The checker lists the reachable states of the model, so it also gives the shortest path (${F.naiveSteps} steps). Shrinking is property-based testing's idea.`,
    },
    {
      q: 'Removing "turn == me" from the wait guard of Peterson\'s algorithm produces what?',
      options: [
        'A violation of mutual exclusion in 6 steps, as with a guard of true',
        'A state space that keeps growing and never finishes',
        'A deadlock: both processes raise flags and wait on each other',
        'Nothing: the other process\'s flag already says enough to wait',
      ],
      answer: 2,
      why: `Both processes announce and then wait for the other's flag to drop, which does not happen, so after ${F.noTurnSteps} steps nothing can run. Mutual exclusion still holds: no state has both in the critical section.`,
    },
    {
      q: 'Why is the atomic lock\'s state count 2^N + N x 2^(N-1)?',
      options: [
        'Each process doubles the number of locks, so the count doubles each time',
        'Each process has 3 states independently, so the count is 3 to the power N',
        'The count is measured by the explorer, not derived from any argument',
        'With the lock free each process is idle or waiting; held, one is critical',
      ],
      answer: 3,
      why: `With the lock free, each process is idle or waiting: 2 choices each, 2^N states. With it held, one process is critical and the other N - 1 are idle or waiting: N x 2^(N-1). The explorer's ${growth} for N = 2 to 6 match the formula; 3^N is contradicted by the lock.`,
    },
    {
      q: 'A counterexample is the shortest path to a bad state. Why is it useful beyond saying "unsafe"?',
      options: [
        'It is a concrete schedule you can replay as a test against the real code',
        'It shows which line of the program should be deleted to fix the bug that it found',
        'It proves that the fix you try next will work for all inputs the program gets',
        'It lists the other bad states that the model contains besides this one path',
      ],
      answer: 0,
      why: 'The path is a list of who ran when. Replayed against code (the lesson does this for the naive lock) it reproduces the failure. It does not say what to delete, does not validate a fix, and names one bad state, not the full list of them.',
    },
  ],
};

export default lesson;
