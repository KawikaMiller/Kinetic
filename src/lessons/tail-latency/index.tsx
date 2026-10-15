import type { LessonModule } from '../../core/types';
import { pctText } from '../distributions/fmt';
import { msText, touchText } from './frames';
import {
  BACKEND_DEFAULT, FANOUT_DEFAULT, HEDGE_BACKEND, HEDGE_DEFAULT, MM1, MM1_DEFAULT_RHO, P99, callQuantile, crossoverRho, extraLoad, hedgedQuantile, medianSlowWidth, touchesSlow,
} from './model';
import { Stage } from './Stage';

const DEFAULT_TOUCH = touchText(touchesSlow(BACKEND_DEFAULT.slowProb, FANOUT_DEFAULT));
const HALF_WIDTH = medianSlowWidth(BACKEND_DEFAULT.slowProb);
const PLAIN_P99 = msText(callQuantile(HEDGE_BACKEND, P99));
const HEDGED_P99 = msText(hedgedQuantile(HEDGE_BACKEND, HEDGE_DEFAULT, P99));
const HEDGE_EXTRA = pctText(extraLoad(HEDGE_BACKEND, HEDGE_DEFAULT), 1);
const CROSSOVER = pctText(crossoverRho() ?? NaN, 0);

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A request that waits on many backends is as slow as its slowest one, so a rare slow call becomes a common slow request; hedging buys the tail back with extra load, until the load is the problem.',
    what: `When one request fans out to N backends in parallel and waits for all of them, it is slow whenever any call is slow. If each call is slow 1% of the time, 1 − 0.99^N of requests touch a slow call: ${DEFAULT_TOUCH} at N = ${FANOUT_DEFAULT}, and past ${HALF_WIDTH} backends it is the usual case. A hedged request sends a second copy to another replica when the first has not replied after a delay, and takes whichever reply comes first. That cuts the p99 for a little extra load, unless the copies share a fate or the backend is already queueing.`,
    analogy: 'A relay team where the baton must pass through every runner: each runner is slow one leg in a hundred, but with a hundred runners most races have a slow leg in them, so the team time is set by the slowest runner, not the average one.',
    useCases: [
      'Search, feed and checkout pages that call dozens of services for every page',
      'Choosing a hedge delay and deciding whether a second copy is worth the extra load',
      'Explaining why a dashboard of per-backend p99s understates what users see',
      'Spotting when retries or hedges are feeding a saturation spiral',
    ],
    why: 'Latency targets are set on what the user waits for, which is the slowest of many calls. Knowing that tail probabilities compound with fan-out, that a hedge trades load for tail, and that the trade reverses near saturation lets you reason about a tail incident instead of tuning timeouts at random.',
    watch: 'Fan-out: the blue line is one call and the violet line the slowest of N calls; orange rules mark each p99; in the one-request chart blue bars are calls and a red stretch is time spent waiting on the slowest call after every other call replied. The meter is green within the target and red over it. Hedged requests: the blue bar is the first copy, violet a hedge copy, green the winner, a grey dashed bar a cancelled copy, orange the extra load. When hedging hurts: blue is the p99 without hedging, violet with it, yellow your ρ and orange the crossover.',
  },
  tryThis: [
    `In Fan-out at the defaults, each of N = ${FANOUT_DEFAULT} backends is slow 1% of the time and ${DEFAULT_TOUCH} of requests touch a slow one. Drag N down to 1, then up to 1,000.`,
    `In Fan-out, drag N to ${HALF_WIDTH}: the caption says more than half of requests now wait on a slow call. One step lower, it does not.`,
    `In Hedged requests, press play. At the default delay (the p95 of one call) the p99 goes from ${PLAIN_P99} to ${HEDGED_P99} for ${HEDGE_EXTRA} extra requests.`,
    'In Hedged requests, drag Shared fate to 100%: the hedged p99 equals the plain p99, and the extra load is still being paid.',
    `In When hedging hurts, ρ = ${pctText(MM1_DEFAULT_RHO, 0)} is a win for a ${MM1.hedgeAfterMs} ms hedge. Drag ρ to ${CROSSOVER}, where it stops paying, then to 70%, where the hedges overload the backend.`,
  ],
  keyIdeas: [
    `A request that waits for N backends is slow when any one is: with each call slow 1% of the time, ${DEFAULT_TOUCH} of requests touch a slow call at N = ${FANOUT_DEFAULT}.`,
    'Percentiles do not carry through fan-out: in this model the p99 of the slowest of N calls sits far above one call\'s p99, and it is the one users feel.',
    `A hedge after the single-request p95 costs about ${HEDGE_EXTRA} extra requests in this model and cuts the p99, and the benefit shrinks as copies share a fate.`,
    `Hedging adds load, so near saturation it can lose: in this model a ${MM1.hedgeAfterMs} ms hedge stops paying at ρ = ${CROSSOVER} and overloads the backend soon after.`,
  ],
  quiz: [
    {
      q: 'A page calls 100 backends in parallel and waits for them all. Each backend is slow 1% of the time. About what share of page loads touch at least one slow backend?',
      options: [
        'About 63%, since the chance none is slow is 0.99^100',
        'About 1%, since each single backend is rarely slow',
        'About 100%, since 100 backends at 1% each add up to 1',
        'About 37%, which is the share with no slow call at all',
      ],
      answer: 0,
      why: 'No slow call has probability 0.99^100 = 0.366, so 63.4% touch one. 1% is the single-backend figure, 100% comes from adding probabilities that overlap, and 37% is the complement, the share that touches none.',
    },
    {
      q: 'Hedging sends a second copy of a request when the first has not replied by the hedge delay. When can it make the tail worse?',
      options: [
        'When the backend is near saturation, since each hedge adds load',
        'When the delay is set low, since fewer requests then hedge',
        'When the second copy goes to a replica on another rack',
        'When the extra copy is cancelled once a reply arrives',
      ],
      answer: 0,
      why: 'Extra copies are extra load, and near saturation a little load is a lot of queueing, which can cost more than the hedge saves. A low delay hedges more requests, not fewer, a separate rack is what makes the copies independent, and cancelling a loser reduces the load.',
    },
    {
      q: 'Each call is slow 1 time in 100. What is the smallest fan-out at which more than half of requests wait on a slow call?',
      options: [
        'About 69, where 0.99^N first falls under half',
        'About 50, half way to a full hundred backends',
        'About 7, since seven calls reach seven percent',
        'About 100, one backend for each percent of tail',
      ],
      answer: 0,
      why: 'The share touching a slow call is 1 − 0.99^N, which reaches one half when 0.99^N = 0.5, at N = ln 0.5 / ln 0.99 = 68.97, so 69. At 100 the share is already 63%, so 100 is not the smallest.',
    },
    {
      q: 'Both replicas of a service depend on the same slow database. What does hedging do to the tail of its requests?',
      options: [
        'Little or nothing, since both copies are slow together, and it adds load',
        'It halves the p99, since two copies are twice as likely to be fast',
        'It removes the tail, since the second copy starts later than the first',
        'It makes the tail heavier, since two slow copies add their delays',
      ],
      answer: 0,
      why: 'Hedging helps because the copies are independent: the second is probably fast when the first is slow. With a shared dependency both are slow together, so the first reply is no faster, while the load still rises. The copies run in parallel, so their delays do not add.',
    },
  ],
};

export default lesson;
