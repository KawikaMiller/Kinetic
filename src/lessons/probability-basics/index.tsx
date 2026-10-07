import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A probability is favourable outcomes over equally likely outcomes. Three rules (complement, union, independence) turn that into the odds of a whole system failing, as long as you check the independence you assume.',
    what: 'A sample space lists everything that can happen; an event is a set of those outcomes. When outcomes are equally likely, P(event) = favourable ÷ total: two dice have 36 outcomes and 6 sum to 7, so P = 6/36. The complement rule (P(not A) = 1 − P(A)), the union rule (add, then subtract the overlap) and the product rule for independent events let you combine them. Rolling many times makes the frequency settle near the exact value: the law of large numbers.',
    analogy: 'Counting probability is like a raffle: 36 equally likely tickets and 6 winners. Independence is two raffles in two different towns, where the result of one tells you nothing about the other; a shared rack is one building where everyone leaves when the fire alarm goes off.',
    useCases: [
      'Redundancy maths: three replicas at 1% each are all down 10⁻⁶ of the time, only if they fail independently',
      'Flaky tests: 200 tests at 1% flakiness turn a suite red on about 87% of runs',
      'Alert and SLO budgets: the chance at least one of n checks fires is 1 − (1 − p)ⁿ',
      'Sanity-checking a simulation: its frequencies should settle near the exact value as runs grow',
    ],
    why: 'Engineers quote reliability numbers all the time ("three nines per box, so nine nines for three boxes"), and the independence assumption hiding in them is where outages come from. Being able to count the sample space, apply the three rules and ask "do these really fail independently?" keeps those numbers honest.',
    watch: 'Dice lab: in the sample-space grid, cells in event A are solid blue, cells only in B are a light sky-blue tint, cells in both A and B are violet, cells in neither have a grey outline, and the latest roll gets a yellow ring. In the bar chart, blue bars are the share of rolls for each sum and green ticks mark the exact chances; in the convergence chart the blue line is the running frequency of A, the yellow dot is the latest point and the green dashed line is the exact value. The overlap count in the rules panel is violet. Replicas: grey boxes are the replicas, and a dashed orange box is the shared rack. On the chart the blue line is independent replicas and the orange line is the shared rack (the one in use is solid), the dot is green when P(all down) meets the target and red when it misses, and the grey dashed line is the target; the P(all down) readout follows the same green or red. Flaky suite: each cell is a test from the last run, green when it passed and red when it flaked (grey outlines before any run); the blue curve is P(suite red) by suite size and the yellow dot is this suite. The exact P(red) readout is red.',
  },
  tryThis: [
    'In Dice lab, keep Event A on "sum = 7" and press ×10,000 a few times: the blue frequency line closes in on the green 16.7% line.',
    'Set Event B to "first die even": the rules panel says independent. Switch B to "a double" and it says not.',
    'Click cells in the grid to build your own event, and watch P(A) count them.',
    'In Replicas, 3 replicas at 1% each give 10⁻⁶. Flip Failures to "Shared rack" and watch P(all down) jump to the rack\'s 0.1%.',
    'In Flaky suite, 200 tests at 1% go red 86.6% of the time. Press ×100 to see the simulated rate land near it.',
  ],
  keyIdeas: [
    'With equally likely outcomes, P(A) = favourable ÷ total. Count the sample space before you trust a guess.',
    'P(not A) = 1 − P(A), and P(A ∪ B) = P(A) + P(B) − P(A ∩ B): subtract the overlap you counted twice.',
    'Multiply probabilities only for independent events. Shared racks, deploys and bugs make failures move together.',
    'Small chances add up across many tries: 1 − (1 − p)ⁿ is why big suites and fleets always have something failing.',
  ],
  quiz: [
    {
      q: 'Three replicas are each down 1% of the time, so a design doc claims they are all down only 10⁻⁶ of the time. When does that claim fail?',
      options: [
        'When they share a rack, a power feed or a deploy',
        'When each replica is down exactly 1% of the time',
        'When the replicas sit on separate machines',
        'When there are three replicas instead of two',
      ],
      answer: 0,
      why: '10⁻⁶ = 0.01³ is the product rule, which needs independence. A shared rack, power feed or deploy takes them down together, so P(all down) is at least that shared failure\'s rate. Separate machines help independence; they don\'t break the claim.',
    },
    {
      q: 'A fair coin has landed heads five times in a row. What is the chance the next flip is tails?',
      options: ['Exactly 50%, like every flip', 'More than 50%: tails is due', 'Less than 50%: heads is hot', 'About 97%: six heads is rare'],
      answer: 0,
      why: 'Flips are independent, so the coin has no memory: P(tails) is 1/2 every time. Six heads in a row is rare (1/64) before you start, but after five heads have happened, only the last flip is left to chance. "Tails is due" is the gambler\'s fallacy.',
    },
    {
      q: 'What is the chance that two fair dice sum to 7?',
      options: ['6/36 = 1/6', '1/11', '7/36', '1/12'],
      answer: 0,
      why: 'There are 36 equally likely ordered outcomes and 6 of them sum to 7 (1+6, 2+5 … 6+1). The 11 possible sums aren\'t equally likely, so 1/11 counts the wrong thing.',
    },
    {
      q: 'A suite has 200 tests, each failing at random 1% of the time, independently. About how often does the suite go red?',
      options: ['On about 87% of runs', 'On about 1% of runs', 'On about 2% of runs', 'On about 50% of runs'],
      answer: 0,
      why: 'P(all pass) = 0.99²⁰⁰ ≈ 13.4%, so P(red) ≈ 86.6%. 1% is one test\'s rate; with 200 chances to fail, at least one failure is the usual outcome.',
    },
    {
      q: 'A and B are independent, with P(A) = 1/6 and P(B) = 1/2. What is P(A or B)?',
      options: ['7/12', '2/3', '1/12', '1/2'],
      answer: 0,
      why: 'P(A ∩ B) = 1/6 × 1/2 = 1/12 because they\'re independent, and the union rule subtracts it once: 1/6 + 1/2 − 1/12 = 7/12. 2/3 forgets the overlap; 1/12 is the overlap itself.',
    },
  ],
};

export default lesson;
