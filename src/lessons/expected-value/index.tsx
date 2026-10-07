import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'The expected value E[X] = Σ x·P(x) is the long-run average of a random quantity, not its most likely value; the variance says how far single outcomes stray from it.',
    what: 'A random variable attaches a number to each outcome: a die\'s face, the attempts a request needs. Its expected value weights every value by its probability and adds them up; a die gives 3.5, which it never actually shows. Variance, Σ (x − E)²·P(x), measures the spread, and its square root is the standard deviation. Expectations add even for dependent variables (linearity); variances add only when the variables are uncorrelated (independence is enough). Averages of many draws settle on E, and the average of n draws has variance σ²/n.',
    analogy: 'A café sells a £3 coffee to 90 of every 100 customers and a £30 catering order to the other 10. The average sale is £5.70, though no one ever pays exactly that. The number still tells you the takings, and the variance tells you how bumpy a day can get.',
    useCases: [
      'Retry budgets: up to 3 retries at a 50% failure rate means 1.875× the load on average',
      'Capacity planning: expected requests, bytes or jobs per hour, plus the variance for headroom',
      'Comparing options by expected cost, such as an on-call page against a missed incident',
      'Benchmarks: averaging n independent runs shrinks the noise by √n (real runs are often not independent: warm-up, caches, heat)',
    ],
    why: 'Average latency, expected retries and expected cost drive most back-of-the-envelope engineering decisions. Knowing that the mean isn\'t the typical case, that it adds across components, and that variance tells you about the tail, keeps you from sizing systems for a number that never actually happens.',
    watch: 'Histogram: blue bars are the share of draws at each value (or bin, for averages), the yellow dot marks the newest draw, and the green dashed line is the exact E[X]. Running chart: the violet line is the running mean and the light violet band is the running mean ± 1 SD of the draws so far; the green dashed line is the exact E[X] and the grey dashed lines are exact E ± SD. The stat readouts use the same green (exact), violet (running) and yellow (latest). In the retry panel the load multiplier turns orange above 1× and red above 2×. In the linearity panel a green result means the sum rule holds and a red one means it doesn\'t. In your table, refused rows are listed in red.',
  },
  tryThis: [
    'With One die, press ×10,000: the violet running mean settles on the green 3.5, a value the die never shows.',
    'Pick Attempts until success at p = 25%: the most likely value is 1, yet E[X] = 4.',
    'Pick Retries, capped at 50% and r = 3: 1.875× the load. Push the failure rate to 80% and watch it turn red.',
    'Pick Top + bottom: the linearity table shows E adding up to 7 while the variances don\'t add.',
    'Set "Each draw is the mean of" to 16 and draw ×10,000: the histogram is four times narrower.',
  ],
  keyIdeas: [
    'E[X] = Σ x·P(x): the long-run average. It need not be a possible value, let alone the most likely one.',
    'Var(X) = Σ (x − E)²·P(x) measures spread; SD = √Var is in the same units as X.',
    'E[X + Y] = E[X] + E[Y] always. Var(X + Y) = Var X + Var Y only when X and Y are uncorrelated.',
    'The mean of n independent draws has variance σ²/n, so averages settle on E.',
  ],
  quiz: [
    {
      q: 'A fair die has expected value 3.5. What does that number tell you?',
      options: [
        'The average of many rolls settles near 3.5',
        'A roll near 3.5 is the most likely result',
        'Every roll lands within one of 3.5',
        'Half of all rolls come out exactly 3.5',
      ],
      answer: 0,
      why: 'Expected value is the long-run average. Every face is equally likely, a die never shows 3.5, and 1 and 6 are 2.5 away from it. The tempting answer, "most likely", confuses the mean with the mode.',
    },
    {
      q: 'X is the top face of a die and Y is the bottom face, always 7 − X. What is E[X + Y]?',
      options: ['7: expectations add', 'Undefined: X and Y depend', '3.5: Y cancels X', 'Unknown until Var is known'],
      answer: 0,
      why: 'Linearity of expectation needs no independence: E[X + Y] = 3.5 + 3.5 = 7, and indeed X + Y is always 7. What can fail for dependent variables is adding variances (it needs zero correlation): Var X + Var Y = 35/6, but Var(X + Y) = 0.',
    },
    {
      q: 'Each attempt succeeds with probability 0.25, independently. How many attempts do you expect to need?',
      options: ['4', '1', '2', '0.25'],
      answer: 0,
      why: 'Attempts until success is geometric with E = 1/p = 4. The single most likely count is 1 (a 25% chance), which is why the mean isn\'t the typical case.',
    },
    {
      q: 'Each attempt fails 50% of the time and a client retries up to 3 times. What load does that put on the server, on average?',
      options: ['1.875× the requests', '1.5× the requests', '4× the requests', '2× the requests'],
      answer: 0,
      why: 'Expected attempts = 1 + 0.5 + 0.25 + 0.125 = 1.875. 4× is the worst case, when the first three attempts all fail; that happens only 1/8 of the time.',
    },
    {
      q: 'You report the average of 16 independent runs instead of a single run. What happens to its standard deviation?',
      options: ['It is divided by 4', 'It is divided by 16', 'It stays the same', 'It is multiplied by 4'],
      answer: 0,
      why: 'The variance of a mean of n draws is σ²/n, so the SD is σ/√n: √16 = 4. Dividing by 16 is what happens to the variance, not the SD.',
    },
  ],
};

export default lesson;
