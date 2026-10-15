import type { LessonModule } from '../../core/types';
import { msText, us } from './frames';
import {
  GENERATOR_DEFAULT, LOOP_OVERHEAD_US, NOISE_DEFAULT, STEADY_WINDOW, WARMUP_DEFAULT, exactWindowMean, readGenerator, readNoise, readWindow, warmupSeries,
} from './model';
import { Stage } from './Stage';
import { sig } from '../../core/format';

const SERIES = warmupSeries(WARMUP_DEFAULT.seed, true);
const FIRST = readWindow(SERIES, 'first100', 0, true);
const STEADY_A = exactWindowMean('A', STEADY_WINDOW);
const STEADY_B = exactWindowMean('B', STEADY_WINDOW);
const FEW = readNoise(NOISE_DEFAULT, NOISE_DEFAULT.seed);
const MANY_RUNS = 200;
const CLOSED = readGenerator('closed', GENERATOR_DEFAULT);
const CORRECTED = readGenerator('corrected', GENERATOR_DEFAULT);

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A number that a benchmark prints is not yet a measurement: the window, the noise and the load generator can each decide the answer, and a closed-loop generator can hide a stall completely.',
    what: `Profiling finds where time goes; benchmarking asks whether a measured number is true. Three traps are shown. Warm-up: averaged over the first 100 iterations, one implementation looks ${sig(FIRST.ratio, 2)} times faster, while in steady state the other is faster, so the window flips the verdict. Noise: runs vary, and a bootstrap interval for the median says whether a small difference is distinguishable or just cannot be told, while another process on the machine makes the histogram two-humped. Coordinated omission: a load generator that waits for each reply never sends the requests that were due during a stall, so its p99 hides the stall.`,
    analogy: 'Timing a runner by the first ten metres, or timing a bus by recording only the buses that arrived: the stopwatch works, but what it was pointed at is not the question you were asking.',
    useCases: [
      'Comparing two implementations without being fooled by warm-up or an optimised-away loop',
      'Deciding whether a small speed-up is real, from the runs and an interval',
      'Choosing and correcting a load generator so that its p99 matches what users saw',
      'Reading a published benchmark critically: window, repeats, noise and load model',
    ],
    why: 'Performance decisions rest on benchmark numbers, and each trap here produces a confident wrong one. Knowing how the window, noise and the generator can flip or hide a result lets you design a benchmark that can fail, and spot one that could not.',
    watch: 'Warm-up: the blue line is implementation A and the amber line B; a yellow dashed rule frames the window measured, and grey shading is the warm-up discarded. Noise: blue bars are runs of A on a quiet machine, pink bars runs with another process running, the blue and amber dashed rules the medians of A and B, and the yellow rule the mean of A. Coordinated omission: a blue diamond is when a request was due, a violet bar the time it was in flight, a hollow grey bar the time it waited to be sent, which the closed-loop tool does not record. The meters are green within the 100 ms objective, orange over it, and red when the tool reports a p99 that hides the stall.',
  },
  tryThis: [
    `In Warm-up at the defaults, the first 100 iterations say A is ${sig(FIRST.ratio, 3)}× faster than B (A ${us(FIRST.meanA)}, B ${us(FIRST.meanB)}).`,
    `Switch Measure to a steady-state window: now B is faster, ${us(STEADY_B)} against ${us(STEADY_A)}. The conclusion flipped with the window.`,
    `Turn Use the result to unused: both collapse to about ${us(LOOP_OVERHEAD_US)}, the empty loop, and the verdict disappears.`,
    `In Noise and intervals at the defaults (${NOISE_DEFAULT.runs} runs) the verdict is "${FEW.verdict}". Raise Runs to ${MANY_RUNS}: it becomes distinguishable, and stopping when it first does is peeking.`,
    `In Coordinated omission at the defaults, the closed-loop tool reports a p99 of ${msText(CLOSED.reportedP99)} while users saw ${msText(CLOSED.trueP99)}. Switch to corrected for ${msText(CORRECTED.reportedP99)}.`,
  ],
  keyIdeas: [
    `A benchmark's answer depends on its window: in this model the first 100 iterations say A is ${sig(FIRST.ratio, 2)}× faster, while steady state says B is faster.`,
    'A result that nothing reads can be optimised away, and noise needs repeated runs with an interval and a histogram, since a mean can sit between two humps.',
    `A closed-loop generator omits the requests due during a stall: in this model a ${GENERATOR_DEFAULT.stallMs} ms stall shows as a p99 of ${msText(CLOSED.reportedP99)} against the ${msText(CLOSED.trueP99)} users saw.`,
    `In this model backfilling the missed samples recovers ${msText(CORRECTED.reportedP99)} against the true ${msText(CORRECTED.trueP99)}, and an open-loop generator measures it directly.`,
  ],
  quiz: [
    {
      q: 'A benchmark averages the first 100 iterations of two implementations and finds that A is 7 times faster. What is the likely problem?',
      options: [
        'B warms up slowly, so the window measures warm-up, not steady state',
        'The mean hides the median, which would show B faster by the same ratio',
        'A is faster, because 100 iterations is a large enough sample to trust',
        'The clock is too coarse, so no single iteration can be timed at all',
      ],
      answer: 0,
      why: 'Early iterations include warm-up, and the two can warm up at different speeds, so a short window can name the wrong winner. A printed number from a short window is not a steady-state measurement, whatever the sample size.',
    },
    {
      q: 'A closed-loop generator aims for 100 requests a second and the server stalls once for one second. What p99 does the tool report?',
      options: [
        'About 1 ms, since the stall is one slow sample among a thousand',
        'About 910 ms, since every request due in the stall is recorded late',
        'About 1,000 ms, since the slowest request always sets the p99',
        'About 500 ms, since the stall covers half of the ten-second run',
      ],
      answer: 0,
      why: 'The tool waits for the stalled reply, then sends the delayed requests back to back and times each from its actual send, so it records 999 samples of 1 ms and one of 1,000 ms. Measured from when each was due, users saw 910 ms.',
    },
    {
      q: 'Another process runs during 40% of benchmark runs. Which summary is the honest one?',
      options: [
        'The histogram, which shows the two humps a mean and an interval hide',
        'The mean with its interval, which averages the interference away entirely',
        'The mean of the fastest and the slowest run, which spans the range',
        'The median alone, which cancels the interference completely',
      ],
      answer: 0,
      why: 'Runs fall in two groups, so a mean lands between them where few runs lie, and an interval around it describes no real run. The median sits inside one group and says nothing about the other. The histogram shows both.',
    },
    {
      q: 'A team adds runs until a comparison says "distinguishable", then stops. What kind of mistake is that?',
      options: [
        'Peeking: stopping on a favourable result inflates false positives',
        'A sound method, since extra runs narrow the interval a little',
        'Warm-up, since the early runs are slower than the later ones',
        'Coordinated omission, since the slow runs are left unrecorded',
      ],
      answer: 0,
      why: 'Checking after each batch of runs and stopping at the first win gives chance many tries to look like a difference. The number of runs has to be chosen first, as for an A/B test. Warm-up and omission are different traps.',
    },
  ],
};

export default lesson;
