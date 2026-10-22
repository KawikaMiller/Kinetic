import type { LessonModule } from '../../core/types';
import { FACTS as F } from './facts';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'An online algorithm has to decide now without seeing the future, and its competitive ratio is the worst-case factor by which it can cost more than the best choice made in hindsight.',
    what: `Ski rental is the plainest example: each day you can rent for 1 or buy for B, and you do not know how long the season will last. Hindsight pays min(N, B) for a season of N days. A threshold strategy rents for t days and then buys, and its competitive ratio is the largest cost / optimum over the possible season lengths: the adversary picks the season that costs the online player the largest factor. Renting until you have paid about the price of buying, t = B - 1, pays at most ${F.bound} times the optimum for B = ${F.B}, and the lesson checks that for every buy price up to 50, with the general claim labelled as a theorem. Paging has the same shape: LRU decides which page to evict without knowing the next request, the offline optimum knows the whole sequence, and the ratio of their misses is measured against the cache size k. A competitive ratio is a worst-case guarantee, not an average.`,
    analogy: 'Deciding whether to buy skis while a friend who already knows the length of your holiday quietly keeps the receipts: you cannot match them, but you can promise to stay within a fixed multiple of what they paid.',
    useCases: [
      'Cache and page replacement policies, where the next request is not known when a page must be evicted',
      'Rent-or-buy style decisions about reserved capacity, licences or equipment when future demand is uncertain',
      'Reasoning about adversarial inputs: asking what the worst sequence for a rule looks like, not the average one',
      'Comparing a practical rule against an offline optimum to see how much knowing the future would be worth',
    ],
    why: 'Engineers make online decisions constantly, and the competitive ratio is the honest way to say how bad a rule can get. It builds on `lru-cache` (the eviction rule), `amortized-analysis` (cost over a sequence) and `randomized-algorithms` (the randomised ski-rental ratio is just named here).',
    watch: 'In the cost plot the red line is what the online player pays and the green line is the optimum in hindsight; in the ratio plots the red line is the ratio and the grey dashed line is 2 - 1/B, with a hollow red point on the worst season. The yellow rule marks the season length you chose and can be dragged in the adversary scene. In the paging scene a green cell is a hit, a red cell is a miss and the yellow cell is the newest request.',
  },
  tryThis: [
    `On the defaults (B = ${F.B}, rent ${F.t} days then buy, a season of ${F.N} days) read the stats: online ${F.cost}, optimum ${F.optimum}, ratio ${F.ratio}.`,
    `Drag N to 9: the ratio is ${F.shortSeasonRatio}, the strategy never bought. Then set t = 0 and N = 1: the ratio is ${F.buyAtOnceRatio}, buying at once against a one-day season.`,
    `Press the chip A day late (t = B): the witness reads N = ${F.N}, ratio ${F.lateRatio} against ${F.bound}, and the bound is broken on ${F.lateViolations} of the ${F.horizon} season lengths.`,
    `Open Be the adversary (strategy t = ${F.t}) and challenge a target of 2.00: it is refused, the best season being N = ${F.refusedN} at ${F.refusedRatio}.`,
    `In Paging, press Autopilot x 12: LRU misses ${F.cyclicLru} times and the optimum ${F.cyclicOpt}.`,
  ],
  keyIdeas: [
    `A competitive ratio is a worst case over all futures, not an average: break-even pays ${F.cost} against ${F.optimum} on a season of ${F.N} days, ratio ${F.ratio} = 2 - 1/${F.B}, and by the theorem no deterministic strategy guarantees better (checked here for B up to 50).`,
    `Buying one day late breaks the bound: a season of ${F.N} days costs ${F.lateCost} against ${F.optimum}, ratio ${F.lateRatio}, and the bound fails on ${F.lateViolations} of ${F.horizon} season lengths, so a witness is shown rather than a rate.`,
    `Never buying is not competitive in this model: its ratio is N / B, ${F.neverRatio.toFixed(1)} at a season of ${F.seasonMax} days, and it grows with N.`,
    `Paging has the same shape: on 1 2 3 4 repeated with a cache of 3, LRU misses ${F.cyclicLru} times and the offline optimum ${F.cyclicOpt}; over 30 autopilot requests the ratio is ${F.thirtyRatio}, climbing towards k = 3 as the theorem says.`,
  ],
  quiz: [
    {
      q: `What does a competitive ratio of ${F.bound} mean for break-even ski rental with a purchase price of ${F.B} days of rent?`,
      options: [
        'The cost is 1.9 times the optimum on an average season, but not always',
        'On every possible season length it pays at most 1.9 times the hindsight optimum',
        'The strategy is 90 percent likely to match the optimum on a random season',
        'The strategy beats the hindsight optimum by 1.9 days on a typical season',
      ],
      answer: 1,
      why: `The ratio is a worst case over season lengths, not an average and not a probability: break-even's worst season costs ${F.cost} against ${F.optimum}, and the optimum cannot be beaten, so the ratio is never below 1 (checked here for seasons up to ${F.seasonMax} days, with the general bound labelled a theorem).`,
    },
    {
      q: 'Rent for 9 days, then buy (price 10), and the season ends on day 11. What do you pay, and what was optimal?',
      options: [
        'You pay 19, while buying at once would have cost 10, so the ratio is 1.9',
        'You pay 11, since renting all 11 days is optimal and the ratio is exactly 1',
        'You pay 10, while the optimum was only 5, which makes the ratio exactly 2',
        'You pay 20, while the optimum was 11, which makes the ratio about 1.8',
      ],
      answer: 0,
      why: `Nine rented days plus the purchase make ${F.cost}; hindsight buys on day 1 for ${F.optimum}, the ratio ${F.ratio}. Buying a day late would have cost ${F.lateCost} against ${F.optimum}.`,
    },
    {
      q: 'Why can no season length push the ratio of break-even to 2 or more?',
      options: [
        'The adversary does not know the strategy in advance, so it cannot aim at it',
        'The season cannot exceed 100 days in the lesson, which caps the ratio below 2',
        'Randomisation hides the purchase day, so the adversary cannot time its attack',
        'Its cost tops out at 2B - 1 against an optimum of B, so 2 - 1/B',
      ],
      answer: 3,
      why: `After the purchase the cost stays at ${F.t} + ${F.B} = ${F.t + F.B}, while the optimum is ${F.B} once the season passes B days: ${F.t + F.B} / ${F.B} = ${F.bound}. The adversary knows the strategy, and break-even is deterministic.`,
    },
    {
      q: 'What happens to a strategy that buys on day 1 every time?',
      options: [
        'Nothing bad: buying at once is optimal for every season length',
        'It pays twice the optimum on every season length, short or long',
        'On a one-day season it pays 10 times what hindsight would pay',
        'It is optimal for short seasons and ten times worse for long ones',
      ],
      answer: 2,
      why: `With t = 0 a one-day season costs ${F.B} against 1, ratio ${F.buyAtOnceRatio}; for a season of ${F.B} days or more it matches the optimum. The mistake is paid on short seasons, not long ones.`,
    },
    {
      q: 'LRU with 3 cache slots serves 1, 2, 3, 4 repeated. How does it compare with the optimum?',
      options: [
        'LRU misses once per cycle of four, while the optimum never misses at all',
        'LRU misses every request, while the optimum misses only about half of them',
        'Both miss on every request, so the ratio between them is exactly 1',
        'LRU is optimal here, since it evicts the page used least recently of all',
      ],
      answer: 1,
      why: `Each request is for the page LRU just evicted, so over 12 requests it misses ${F.cyclicLru} times; the optimum misses ${F.cyclicOpt} of the 12, half of them, for a ratio of ${F.cyclicRatio}, and the optimum's share shrinks towards a third on longer runs (${F.thirtyLru} against ${F.thirtyOpt} over 30 requests).`,
    },
  ],
};

export default lesson;
