import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A percentile is read off the sorted data and tools pick it slightly differently; a fleet p99 comes from merging requests, not from averaging each host\'s p99; and any number from a sample needs an interval.',
    what: 'The p-th percentile is the value that p% of the data sits at or below, read off the empirical CDF. Nearest-rank, a floor(n·p) index and linear interpolation are three common definitions, and they disagree on small samples. Per-host percentiles cannot be averaged into a fleet percentile: that needs the merged requests, or merged histogram buckets. A statistic from a sample is itself random, so it comes with an interval whose promised coverage holds only when its assumptions do.',
    analogy: 'Finding the 99th-percentile height in a school means lining up everyone and walking to the 99th person in a hundred. Averaging the tallest kid in each class gives a number that is nobody\'s height; to answer for the whole school you need the whole line, or a tally of heights in fixed ranges.',
    useCases: [
      'Dashboards and SLOs: reading p50, p95 and p99 latency off a stream of requests',
      'Aggregating across hosts or time windows: merging histogram buckets instead of averaging percentiles',
      'Judging noise: how many requests really sit above a p99 computed from a few hundred samples',
      'Reporting a measurement with an interval instead of a single number',
    ],
    why: 'Capacity decisions, alerts and SLO reports hang on tail percentiles. Averaging per-host p99s, trusting a p99 from a couple of hundred samples, or reading a single run as a fact all produce confident numbers that are wrong in a predictable direction. Knowing how a percentile is computed, and how uncertain it is, lets you spot those before they reach a dashboard.',
    watch: 'Read it off the CDF: the blue step line is the share of samples at or below each value; the yellow horizontal rule is the chosen percentile and the yellow vertical rule (draggable) is its value; the table shows the three rules side by side with the chosen one highlighted. Never average your p99s: each host card has its own coloured edge (a plain category); the red bar is the average of the host p99s, the green bar the true p99 of all requests and the violet bar the p99 read from merged buckets. Sampling and intervals: the violet band is the 95% interval across sample sizes, the yellow line the true value and the blue dot this sample; in the coverage picture a green segment is an interval that contained the true value and a red one missed it.',
  },
  tryThis: [
    'In Read it off the CDF, set Data to "The values 1…20": at p99 two rules say 20, the maximum, and linear interpolation says 19.81.',
    'In Read it off the CDF, set Data to "The values 1…100" and jump to p50: nearest-rank says 50, the floor rule 51 and linear interpolation 50.5.',
    'Open Never average your p99s (it loads the "Understates" fleet): the average of the host p99s is 55 ms, the true p99 of all 200 requests is 100 ms. Then pick "Overstates": 505 ms against 20 ms.',
    'Open Sampling and intervals and press "Run 1,000 experiments" (normal source, mean, n = 100): about 95% of the intervals contain the true mean.',
    'In Sampling and intervals, switch the source to Heavy-tailed, drag n to its left end (10) and run the experiments: well under 95% of the intervals contain the true mean.',
  ],
  keyIdeas: [
    'A percentile is read off the sorted data, and nearest-rank, a floor(n·p) index and linear interpolation can disagree on a small sample, so say which one your tool uses.',
    'A fleet p99 comes from the merged requests or merged histogram buckets; the average of per-host p99s can understate it or overstate it.',
    'An interval describes the sampling process: a 95% interval misses the true value about 1 time in 20 when its assumptions hold, and more often with a heavy tail.',
    'A p99 from n samples rests on about n × 0.01 observations above it, so a couple of hundred samples leave a couple of points and a shaky estimate.',
  ],
  quiz: [
    {
      q: 'Host A served 100 requests (90 at 10 ms, 10 at 100 ms) and host B served 100 requests, all at 10 ms. What is the p99 of all 200 requests?',
      options: [
        '100 ms, set by the ten slow requests',
        '55 ms, the average of the two host p99s',
        '14.5 ms, the mean of the 200 latencies',
        '10 ms, what 95% of requests took',
      ],
      answer: 0,
      why: 'Merged, the 198th smallest of 200 is a 100 ms request (190 took 10 ms, 10 took 100 ms), so p99 is 100 ms. Averaging the host p99s (100 and 10) gives 55 ms, a number no request experienced, and it understates the fleet p99.',
    },
    {
      q: 'A latency sample holds 200 requests. About how many of them lie above its p99?',
      options: [
        'About 2, so p99 rests on few points',
        'About 20, a tenth of the data',
        'About 100, half of the data',
        'None, because p99 is the maximum',
      ],
      answer: 0,
      why: 'n × (1 − 0.99) = 200 × 0.01 = 2. A p99 estimated from two points moves a lot from one sample to the next, which is why it needs an interval.',
    },
    {
      q: 'A 95% interval for a mean is built from only n = 10 samples of a heavy-tailed source. Repeated many times, how often does it contain the true mean?',
      options: [
        'Less often than 95% of the time',
        'More often than 95% of the time',
        'Exactly 95% of the time, by construction',
        'It depends on the seed, not on the source',
      ],
      answer: 0,
      why: 'The t interval leans on roughly normal data. With a heavy tail, many samples miss the rare huge values, so their mean and spread come out low and the intervals miss the true mean more than 1 time in 20.',
    },
    {
      q: 'For the values 1 to 20, which number is the nearest-rank p99?',
      options: ['20', '19.81', '19', '19.8'],
      answer: 0,
      why: 'Nearest-rank takes the ⌈0.99 × 20⌉ = 20th smallest value, which is 20. Linear interpolation gives 19.81, 81% of the way from 19 to 20, and 19, the second largest value, is picked by no rule here.',
    },
  ],
};

export default lesson;
