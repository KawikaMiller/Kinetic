import { decimal, pctText } from '../../core/format';
import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';
import {
  BROKEN_SEED, REPLAYS, WINDOW, boundaryOf, defaultBooking, exploreBooking, expectedTries, failureProbability, hunt, replayAgreement, resetAmbient, runBooking,
} from './model';

const hunted = hunt(defaultBooking(), 1, 200);
const failing = runBooking({ ...defaultBooking(), seed: BROKEN_SEED });
resetAmbient();
const leaked = replayAgreement({ ...defaultBooking(BROKEN_SEED), leak: true });
resetAmbient();
const fixedHunt = hunt({ ...defaultBooking(), mode: 'single-writer' }, 1, 200);
const writerStates = exploreBooking('single-writer').states;
const exact = failureProbability(WINDOW.default, 0);
const wait = expectedTries(WINDOW.default, 0);
const boundary = boundaryOf(BROKEN_SEED, 1);

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'If a seed decides each delay, loss and arrival time, a distributed bug that appears once can be replayed exactly and kept as a regression test. A node that reads ambient randomness breaks that promise.',
    what: 'Deterministic simulation testing runs a system on a simulated network where one seed fixes the whole schedule: when each request arrives, how long each message takes and which are lost. A hunt tries many seeds; a failing seed is a permanent, replayable test of the bug. The technique holds just while nothing else leaks in: a node that reads the clock or a global random generator gives a different run each time, and the failing seed stops meaning anything.',
    analogy: 'A flight recorder with a replay button. Live chaos is like watching planes in the sky: you may see a near miss, but you cannot ask for it again. A seeded simulation records the whole sky from one number, so any near miss can be rewound and examined.',
    useCases: [
      'Finding rare ordering bugs in replication, consensus and booking logic before production does',
      'Turning "it failed once on CI" into a seed that fails every time and stays in the test suite',
      'Judging a testing tool by whether its runs replay, and what leaks nondeterminism into them',
      'Choosing between sampling many schedules with seeds and exploring every schedule of a small model',
    ],
    why: 'Distributed bugs hide in orderings that production rarely produces and logs rarely capture. Being able to replay one, move the fault, and shrink the schedule turns an unreproducible outage story into an ordinary debugging session, and knowing what breaks replay keeps you from trusting a simulator that has quietly stopped being deterministic.',
    watch:
      'In the message ladders a green booking is one a replica granted on its own, a red booking means both replicas granted (the rule broke), blue arrows are replicate messages and a grey booking was refused; an arrow stopped by a cross is a lost message. A trace hash is yellow when it matches the previous replay and red when it does not, and the violet figure is the boundary computed from the trace. The chips say what is simulated, a toy or from memory.',
  },
  tryThis: [
    `At the defaults (window ${WINDOW.default} ms, no loss, 200 seeds from seed 1) press Hunt: seed ${hunted.failures[0]} is the first to oversell after ${hunted.triesToFirst} seeds, and ${hunted.failures.length} of 200 fail, next to the exact ${pctText(exact, 1)}.`,
    `After the hunt the first failing seed is selected: press Replay seed, then Replay again. The three trace hashes (${failing.hash} each) are identical.`,
    `In "Move the fault" (seed ${BROKEN_SEED}, gap 0) both clients are granted the seat, and the traced boundary is hidden. Drag the gap to +4 ms and the failure disappears; drag it back toward 0 to find where it returns, then press "Show the boundary": the traced replicate delay is ${decimal(boundary, 2)} ms and any gap under it oversells.`,
    `In "A leak, and live chaos" switch ambient randomness on and press Replay seed three times: the trace hashes differ. Then press Replay 20 times: replay agreement reads ${leaked.agree} of ${REPLAYS}, against ${REPLAYS} of ${REPLAYS} with the leak off.`,
    `In "A leak, and live chaos" turn the leak off, pick "All through r1 (single writer)" and press Hunt 200 seeds: ${fixedHunt.failures.length} failed. In "Every schedule" the explorer agrees: the single writer holds in all ${writerStates} states of its model.`,
  ],
  keyIdeas: [
    `A seeded hunt finds a failing seed after about 1 / P tries, ${decimal(wait, 1)} on average here, and each failing seed replays to the identical trace, so the failure becomes a permanent regression test.`,
    'In this model a failing seed fails because the later request arrives before the earlier one\'s replicate does, and the gap that separates failing from passing is exactly that traced delay.',
    'A node that reads ambient randomness or the clock gives a different run on each replay, so the seed no longer names the failure: replay agreement falls well below 20 of 20.',
    'Sampling schedules with seeds shows that these schedules passed, not that none fails; exploring the schedules of a small model exhaustively can say the rule holds in each of its states, and says what it covered.',
  ],
  quiz: [
    {
      q: 'A seeded simulation fails on seed 17 and passes on seed 18. What does that tell you?',
      options: [
        'The test is flaky, since the result depends on which run you happen to see',
        'Seed 17 is a schedule that exposes a bug, and it replays identically',
        'The simulation has a random leak somewhere in the protocol it is running',
        'Seed 18 proves the bug is fixed for every schedule that could occur',
      ],
      answer: 1,
      why: 'Each seed names one complete schedule, so a seed that fails is a replayable bug, not flakiness. A pass on another seed says just that one schedule passed.',
    },
    {
      q: 'The same seed gives a different trace each time. What is the most likely cause?',
      options: [
        'Latencies are drawn from a fixed distribution by the seeded generator',
        'A node reads randomness or the clock from outside the simulation',
        'The invariant is checked after every single event instead of at the end',
        'The seed field accepts very large numbers, which wrap around in the run',
      ],
      answer: 1,
      why: 'Everything inside the simulation is a function of the seed, so a run that changes between replays has taken an input from outside it. Checking an invariant more often does not change the trace.',
    },
    {
      q: 'What does a seeded hunt give you that live fault injection at the same failure rate does not?',
      options: [
        'A much higher failure rate for the same number of runs you make',
        'A guarantee that no other failures exist anywhere in the system',
        'A schedule you can replay, debug and keep as a regression test',
        'A way to skip the invariant, since the seed already explains the failure',
      ],
      answer: 2,
      why: 'Both find a failure after about the same number of tries. Just the seeded run can be asked for again; the live schedule is gone, which is why its failure replays on a fraction of the replays.',
    },
    {
      q: '200 seeds all pass. What can you say?',
      options: [
        'These 200 schedules passed, and other schedules might still fail',
        'The protocol is correct under every possible schedule of messages',
        'The failure probability is below 1 in 200, exactly, for this protocol',
        'A hundred more seeds would be wasted effort, so the search can stop',
      ],
      answer: 0,
      why: 'A sample of schedules passing is a statement about those schedules. With a failure chance of 1 in 300 per seed, 200 clean seeds happen about half the time ((1 - 1/300)^200 is about 51%), so the result cannot rule such a bug out.',
    },
    {
      q: 'The closed form says 32.6% of seeds fail at W = 30. About how many seeds do you try before the first failure, on average?',
      options: [
        '32, because one seed in every 32 fails on average here',
        '65, which is the number of failures expected in 200 seeds',
        '6, which is the square root of the expected failure count',
        '3, since 1 divided by 0.326 comes to about 3.07',
      ],
      answer: 3,
      why: 'Seeds fail independently with probability 0.326, so the wait for the first failure is geometric with mean 1 / 0.326 = 3.07. The 65 is a count over 200 seeds, not a wait.',
    },
  ],
};

export default lesson;
