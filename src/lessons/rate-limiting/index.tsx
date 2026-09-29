import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A rate limiter caps how many requests a client may make per unit of time, and answers the excess with "429 Too Many Requests" instead of letting it swamp the service.',
    what: 'Every request is checked against a budget before it does any real work. Fixed windows count per clock second; sliding windows count the last second measured from now; a token bucket refills tokens at a steady rate and lets you spend saved-up tokens in a burst; a leaky bucket queues requests and releases them at a constant rate. Each one trades off simplicity, memory and how it treats bursts.',
    analogy: 'A token bucket is an arcade card that tops up by one credit a second, holding at most ten. Play slowly and you never run out; mash buttons and you get ten fast games, then one a second.',
    useCases: [
      'Public APIs enforcing plans: 100 requests per minute per API key',
      'Login and password-reset endpoints slowing down brute-force attacks',
      'Protecting a fragile downstream service from a retry storm or a noisy tenant',
      'API gateways and proxies (Nginx limit_req, Envoy, cloud API gateways)',
    ],
    why: 'Any service exposed to users or other teams will eventually be hammered by a bug, a script or an attacker. Mid-level engineers are expected to pick an algorithm, choose what to key it on, and know that a fixed window can let through twice the limit at a boundary.',
    watch: 'Blue dots are incoming requests. At the limiter they either continue to the API in green or fall into the red 429 bin. The limiter in the middle changes with the algorithm: a yellow counter for fixed window, a strip of blue ticks for the sliding window, yellow tokens in a bucket, or queued blue dots in the leaky bucket. The chart shows allowed (green) and rejected (red) requests per 0.2 s against the dashed yellow limit.',
  },
  tryThis: [
    'Pick Fixed window and fire the Boundary attack. Check "Peak in any 1 s" against the limit.',
    'Run the same attack on Sliding window: it never exceeds the limit.',
    'Token bucket: let the bucket fill up, then hit Burst ×20 and count how many get through at once.',
    'Leaky bucket: set Traffic above the Limit and watch the queue fill, then overflow into 429s.',
  ],
  keyIdeas: [
    'Fixed window is cheap but bursty: up to 2× the limit can slip through around a reset.',
    'Sliding window enforces "at most N in any 1 s", at the cost of remembering recent timestamps (or approximating with two counters).',
    'Token bucket allows bursts up to the bucket size while holding the long-run average to the refill rate.',
    'Limits are kept per key (user, API key, IP), and in a shared store like Redis when many servers enforce them.',
  ],
  quiz: [
    {
      q: 'A fixed-window limit is 100 requests per minute. What is the most a client can get through in a few seconds?',
      options: ['100', 'About 200', '101', 'Unlimited'],
      answer: 1,
      why: 'They can spend 100 just before the minute rolls over and another 100 just after, because the counter resets in between.',
    },
    {
      q: 'Which algorithm deliberately allows short bursts above the average rate?',
      options: ['Leaky bucket', 'Sliding window log', 'Token bucket', 'None of them'],
      answer: 2,
      why: 'Saved-up tokens can all be spent at once, so a full bucket permits a burst of up to its capacity.',
    },
    {
      q: 'You run 10 API servers behind a load balancer, each with its own in-memory limiter of 100/min. What limit does a client actually get?',
      options: ['100/min', 'Up to about 1,000/min', '10/min', 'It depends on the algorithm only'],
      answer: 1,
      why: 'Each server counts separately, so requests spread across servers get up to 10× the limit. A shared counter (e.g. Redis) fixes that.',
    },
  ],
};

export default lesson;
