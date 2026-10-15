import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A distribution is a shape for how often each value turns up, and the shape decides whether the average, the median and the worst case mean anything like the same thing.',
    what: 'The normal bell, the exponential, the log-normal and the Pareto are four common models. A log-normal or Pareto has a long right tail, so its mean sits above its median and a few huge values dominate the total. Poisson counts and exponential gaps are one process seen two ways. Averages of many draws settle down like σ/√n only when the variance is finite; a heavy enough tail takes that away.',
    analogy: 'Heights in a school form a tidy bell: nobody is a hundred times taller than the average. Incomes or file sizes are different: most are modest and a few are enormous, so the average describes almost nobody.',
    useCases: [
      'Reading latency dashboards: why the mean sits above the median and why p99 can be many times the median',
      'Modelling arrivals: Poisson counts and exponential gaps for independent requests, and a dispersion check when traffic clumps',
      'Choosing summaries and axes: log bins and a log-log survival plot for heavy tails',
      'Knowing when a "typical" average is not a safe basis for capacity or alerting thresholds',
    ],
    why: 'Almost every later number in operations, from percentiles to queue lengths to experiment results, assumes a shape. Using bell-curve habits on a long-tailed quantity under-sizes systems and hides the rare, expensive cases. Learning to see the shape first keeps the later maths honest.',
    watch: 'Pick a shape: grey bars count the seeded draws per bin and the bars past p99 are red; the violet curve is the exact density; the yellow line is the mean, the blue line the median, the orange line p99 and the red line p99.9, and the table puts sample numbers beside the exact ones. Counts and gaps: blue bars are the counted share of windows, hollow violet dots the exact Poisson probabilities, grey ticks on the clock are single arrivals, and the dispersion index is green near 1 and plain away from it (away from 1 is a different process, not a failure). What the mean hides: blue bars are means of n draws, the violet band is the mean ± σ/√n and the yellow line the exact mean. Which one is mine: grey bars count the dataset in linear and then log-spaced bins and the blue line is its survival curve; your guess is yellow until Reveal, then green for the right family and red for a wrong guess.',
  },
  tryThis: [
    'In Pick a shape, as loaded (a log-normal), read "Below the mean": about two requests in three are faster than the average.',
    'In Pick a shape, press the "File sizes (Pareto, illustrative)" preset, then drag the shape α below 1: the table\'s mean turns into "no finite mean".',
    'Open Counts and gaps and switch Arrivals to Bursty: the dispersion index jumps from about 1 to around 7.',
    'Open What the mean hides (exponential, n = 10) and press n = 1,000: the means spread about ten times less, and the ratio stays near 1.',
    'In What the mean hides, pick Pareto (α = 1.5) and n = 1,000: the stat says σ is infinite instead of showing a ratio.',
  ],
  keyIdeas: [
    'For a right-skewed shape such as the log-normal, the mean sits above the median: at σ = 1, about 69% of draws fall below the mean.',
    'Poisson counts and exponential gaps are the same process, and a Poisson count has variance equal to its mean, so variance ÷ mean far from 1 means the arrivals are not Poisson.',
    'The average of n draws spreads like σ/√n when σ is finite; a Pareto with α ≤ 2 has no finite σ, and with α ≤ 1 not even a mean.',
    'Plot the tail as well as the histogram: a straight line on log-log axes points to a power law, and on a log-survival axis to an exponential.',
  ],
  quiz: [
    {
      q: 'A log-normal latency has mean 120 ms and median 80 ms. Roughly what share of requests are faster than the mean?',
      options: [
        'Roughly two thirds of requests',
        'Exactly half, as the median says',
        'About one in ten of the requests',
        'Nearly all of them, past 99 percent',
      ],
      answer: 0,
      why: 'Mean ÷ median = e^(σ²/2) = 1.5 gives σ ≈ 0.90, and the share below the mean is Φ(σ/2) = Φ(0.45) ≈ 67%. Half is the share below the median, which is the tempting mix-up.',
    },
    {
      q: 'Arrivals per window average 6, with a variance of 21. What does that say about the arrivals?',
      options: [
        'They clump: a Poisson count would have variance near 6',
        'They are more regular than a Poisson stream would be',
        'They are Poisson, since extra variance is normal there',
        'They are Poisson once the window is made longer',
      ],
      answer: 0,
      why: 'A Poisson count has variance equal to its mean, so 21 ÷ 6 = 3.5 points to clumped arrivals. A ratio below 1 would mean more regular than random, and lengthening the window does not turn clumps into a Poisson process.',
    },
    {
      q: 'You average n = 1,000 draws from a Pareto with α = 1.5 and expect their spread to follow σ/√n. What goes wrong?',
      options: [
        'The variance is infinite, so the formula has no σ',
        'The mean is infinite, so no average exists at all',
        'The draws are too large to fit in a histogram',
        'Nothing: a large n makes any shape behave',
      ],
      answer: 0,
      why: 'A Pareto with α ≤ 2 has infinite variance, so σ/√n has no σ to use. At α = 1.5 the mean still exists (3 × xm); it is an α ≤ 1 Pareto that has no mean.',
    },
    {
      q: 'A survival curve (the share of draws above x) is a straight line of slope −1.6 on log-log axes. Which family fits?',
      options: [
        'A Pareto with α near 1.6',
        'An exponential with mean near 1.6',
        'A log-normal with σ near 1.6',
        'A normal with spread near 1.6',
      ],
      answer: 0,
      why: 'A Pareto survives as (xm/x)^α, so ln S = α·ln xm − α·ln x: a line of slope −α. An exponential is straight when the survival axis alone is logged.',
    },
  ],
};

export default lesson;
