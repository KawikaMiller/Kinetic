import type { LessonModule } from '../../core/types';
import { FACTS as F } from './facts';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Randomised algorithms come in two families: Las Vegas ones are always right and take a random amount of time, Monte Carlo ones take a fixed time and are right with a probability you can bound.',
    what: 'The quickselect lesson showed a random pivot making the expected running time linear; this one names the two guarantees. Quicksort with a random pivot is Las Vegas: it always sorts correctly, and only the count of comparisons varies, centred on 2(n+1)H_n - 4n with a thin bad tail, so no input is bad, only a run can be unlucky. Estimating pi with random darts is Monte Carlo: fixed work, an answer that is off by about 1/sqrt(n). Miller-Rabin primality testing has one-sided error: a "composite" verdict comes with a witness and is certain, while a "prime" verdict is wrong for a composite with probability at most 1/4 per round with a random base. Retrying until a witness appears turns a Monte Carlo test into a Las Vegas search; a time budget turns Las Vegas back. Karger\'s contraction algorithm shows a Monte Carlo result on graphs: one run finds a minimum cut with a small but guaranteed probability.',
    analogy: 'A Las Vegas algorithm is a locksmith who always opens the door but cannot say how long it will take; a Monte Carlo one is a gambler with a fixed hour who might walk away with the wrong answer.',
    useCases: [
      'Pivot choice in sorting and selection, where randomness removes the bad input',
      'Primality testing in key generation: Miller-Rabin with random bases is the usual practical test',
      'Estimating quantities by sampling: Monte Carlo integration, simulation and A/B-test power checks',
      'Min-cut and other graph problems where repeating a cheap random algorithm beats one careful run',
    ],
    why: 'Knowing which guarantee an algorithm gives tells you what a failure looks like: a slow run, or a wrong answer in one known direction. It also tells you what to do about it: wait, retry with a certificate, or repeat to shrink the error.',
    watch: 'Random-pivot counts are green (--ok) bars, the expected value is a yellow line (--hi) and a fixed rule\'s count is a red line (--bad), the costly side. In the pi scene the darts inside the quarter circle are sky and outside amber; this run\'s error is a yellow dot (--hi), the standard error line is blue (--info) and the averaged error green (--ok). In the primality scene a witness base is green (--ok) and a liar base orange (--orange); the exact error is blue, the measured error red dots and the bound a dim dashed line. In the Karger graph a contracted edge is dim (--dim), the cut of a minimum cut green (--ok) and a larger cut red (--bad), and vertices are tinted by their super-node.',
  },
  tryThis: [
    `Las Vegas quicksort, on the defaults (sorted input, n = ${F.sortN}): a first-element pivot makes ${F.firstOnSorted.toLocaleString('en-US')} comparisons, exactly n(n-1)/2. The random pivot averages ${F.randomMean} over 1,000 runs, the formula says ${F.expected}. Pick "Adversary vs median of three": median of three jumps from ${F.medianOnSorted} to ${F.medianOnKiller}, while the random pivot stays near ${F.randomOnKiller}.`,
    `Monte Carlo pi, on the defaults (${F.piDarts.toLocaleString('en-US')} darts): this run is off by ${F.piError} where one standard error is ${F.piSigma}. The tile comparing ${F.piMoreDarts.toLocaleString('en-US')} darts with ${F.piDarts.toLocaleString('en-US')} reads ${F.piRatio}: four times the darts, about half the error.`,
    `Primality, on the defaults (n = ${F.mrN}): ${F.mrLiars} of ${F.mrBases} bases are liars, yet the plain Fermat test is fooled by ${F.mrFermat} bases, every one coprime to ${F.mrN}. With ${F.mrRounds} round drawn, a witness appears, and that "composite" verdict is certain.`,
    `Converting, on the defaults (n = ${F.mrN}, budget 1.5x): retrying until a witness appears takes ${F.huntMean} draws on average over 1,000 hunts, well inside the 4/3 limit. Stopping random-pivot quicksort at the budget means guessing in ${F.overBudget}% of runs, while a fixed pivot on sorted input (${F.firstOnSorted.toLocaleString('en-US')} comparisons) overruns it every time.`,
    `Karger, on the defaults (two triangles, two bridges): the minimum cut is ${F.kargerMin}, found by ${F.kargerMinCuts} different partitions. Press "Run 1,000 times": the minimum comes up in ${F.kargerPercent}% of runs, against a bound of ${F.kargerBound}% per minimum cut.`,
  ],
  keyIdeas: [
    `Las Vegas means correct and randomly slow: on sorted input of ${F.sortN} keys a first-element pivot costs ${F.firstOnSorted.toLocaleString('en-US')} comparisons, a random pivot about ${F.randomMean}, and both sort correctly.`,
    `A random pivot has no bad input, just unlucky runs, and it still has a worst case: its expected count is ${F.expected} here whatever the input order, but the quadratic count remains possible.`,
    `Monte Carlo trades certainty for time: the pi estimate costs a fixed number of darts and its error shrinks as 1/sqrt(n), so four times the darts halve it (${F.piRatio} measured).`,
    `Miller-Rabin errs in one direction: a witness proves a number composite, while a wrong "prime" verdict on a composite has a probability of (1/4)^k or less after k rounds; on ${F.mrN} just ${F.mrLiars} of ${F.mrBases} bases lie.`,
  ],
  quiz: [
    {
      q: 'Quicksort with a random pivot and Miller-Rabin primality testing are both randomised. Which can return a wrong answer, and in which direction?',
      options: [
        'Only Miller-Rabin, and only by calling a composite number prime',
        'Only quicksort, by returning a list that is slightly out of order',
        'Both, since randomness always leaves some chance of a wrong output',
        'Neither, since a random choice cannot change a deterministic answer',
      ],
      answer: 0,
      why: `Quicksort is Las Vegas: each run sorts correctly and just the comparison count varies (${F.randomMean} on average here, against ${F.firstOnSorted.toLocaleString('en-US')} for a fixed pivot on sorted input). Miller-Rabin is Monte Carlo with one-sided error: a witness is a proof of "composite", but passing the rounds is just evidence of "prime".`,
    },
    {
      q: 'A learner says a random pivot means quicksort has no worst case. What is the accurate version?',
      options: [
        'No input is bad for it, but an unlucky sequence of pivots is still possible, just very unlikely',
        'Its worst case is gone, since a random choice rules out the worst partition',
        'The worst case moves to sorted input, since it is the hardest one to randomise',
        'It only has a worst case when two keys are equal, since ties cannot be split',
      ],
      answer: 0,
      why: `The distribution of the comparison count is the same for any input: the expected value is ${F.expected} at n = ${F.sortN}. An adversary who sees the code but not the coin flips cannot pick a bad input, yet the quadratic count of ${F.firstWorst.toLocaleString('en-US')} stays possible with a tiny probability.`,
    },
    {
      q: 'Why do four times as many darts only halve the error of the Monte Carlo estimate of pi?',
      options: [
        'The standard error shrinks as 1 over the square root of n, and the root of 4 is 2',
        'Each extra dart is less likely to land near the edge of the circle than the last',
        'The generator repeats its values after a while, so extra darts add little',
        'Half of the darts are wasted because they land outside the quarter circle',
      ],
      answer: 0,
      why: `The estimate is a sample mean, so its standard error is 4 times the root of p(1-p)/n. The averaged errors measured here fall by a factor of ${F.piRatio} from ${F.piDarts.toLocaleString('en-US')} to ${F.piMoreDarts.toLocaleString('en-US')} darts, close to the 0.5 the formula gives.`,
    },
    {
      q: 'Retrying Miller-Rabin until a base proves a number composite is a Las Vegas algorithm. What makes that conversion possible?',
      options: [
        'A witness is a certificate that can be checked quickly, so the answer is never wrong',
        'Each retry halves the chance of an error, so the answer becomes certain after a while',
        'The retries average out the randomness, so the running time becomes fixed',
        'A prime always fails some base, so the loop is sure to end for every input',
      ],
      answer: 0,
      why: `The answer is a verified witness, so it is correct whenever it is returned, and just the number of tries is random: ${F.huntMean} on average for ${F.mrN}. For a prime the hunt would not end, because no base proves a prime composite.`,
    },
  ],
};

export default lesson;
