import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';
import { ERROR_RED_PCT, STORM_RATIO, STORM_RETRY_SHARE, THREADS, TIMEOUT } from './sim';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'When a dependency starts failing, naive retries pile more load onto it and drag the caller down too. Backoff, jitter and circuit breakers keep one failure from becoming an outage.',
    what: 'A timeout frees the caller but not the callee: the slow service keeps working on requests nobody is waiting for. Immediate retries multiply its load exactly when it can least cope, and the caller\'s threads fill up waiting, so the caller fails too. Exponential backoff with jitter spreads retries out. A circuit breaker watches recent failures and, past a threshold, "opens": calls fail fast with a fallback for a cool-down period, then a few probe calls test whether it is safe to close again.',
    analogy: 'The breaker in your fuse box. When a circuit is overloaded it trips and cuts the power, instead of letting the wires overheat and burn the house down. You flip it back once the fault is fixed.',
    useCases: [
      'Service-to-service calls in a microservice architecture',
      'Calling third-party APIs (payments, maps, email) that can slow down without warning',
      'Libraries and meshes such as Resilience4j, Polly and Envoy or Istio outlier detection (from memory, check their docs)',
      'Serving a cached or degraded response instead of an error page',
    ],
    why: 'Many large outages are cascades: one slow dependency, retries and exhausted thread pools spreading failure upstream. Teams are expected to design timeouts, retry budgets and breakers deliberately, and to know that a system can stay down after the original fault is fixed (a metastable failure).',
    watch: `Service A\'s grid is its ${THREADS} threads: blue ones are waiting on a call, violet ones are waiting to retry. Calls travel to Service B as blue dots (amber for a probe sent while half-open) and come back green (success), red (failure) or grey (a response nobody is waiting for any more). Inside B, each dot is a call it is working on, grey ones are orphaned work, and the bar under them is its load: green well under its capacity line, grey close to it, red over it. The switch on the wire is the breaker: green and flat when closed, red and raised when open, amber and half-raised when half-open. Results flying back to the users are red for errors and teal for fallbacks. Bottom left shows when retries fire (yellow just now, violet earlier); bottom right tracks load on B (blue) and A's error rate (red), with a thin band under the chart for the breaker's state (green closed, red open, amber half-open; drawn only with Circuit breaker on). Service B's box ends with its slowdown and the chance that a call to it fails right now: its base failure rate plus what overload adds, so it can read far above the slider while B is backed up. The load stat turns red when B's load passes ${STORM_RATIO}× the user traffic, or when more than ${Math.round(STORM_RETRY_SHARE * 100)}% of it is retries while B carries more than the users send (the thread pool caps B's load, so at the highest traffic only the second test can fire). The p99 stat is red above the ${TIMEOUT} s timeout and green otherwise; the error stat is red from ${ERROR_RED_PCT}%, and the threads stat when all ${THREADS} are busy. The chips say the failures and traffic are simulated and B\'s capacity is made up.`,
  },
  tryThis: [
    'On Naive retries, click "B has a bad day". Watch the load on B climb above the user traffic (the "are retries" line under it) and A\'s threads fill up.',
    'Click "B has a bad day", wait about twelve seconds, then Heal B. Does the error rate drop straight away, or does the backlog keep it up?',
    'Click "B has a bad day", then compare the retry-timing strip on Naive retries (a tower at 0 s) with Backoff + jitter (spread out).',
    'Switch to Circuit breaker, click "B has a bad day", then after a while Heal B. Follow the switch: CLOSED, OPEN, HALF-OPEN, back to OPEN while B is still bad, then CLOSED once the probes succeed.',
  ],
  keyIdeas: [
    'A timeout protects the caller, not the callee: B keeps doing work nobody is waiting for.',
    'Immediate retries multiply load on a struggling service: up to 4 calls per request in this model. That\'s a retry storm.',
    'Exponential backoff with jitter spreads retries out, but on its own it doesn\'t stop a sustained overload.',
    'A circuit breaker fails fast with a fallback, gives the dependency room to recover, and probes before closing.',
  ],
  quiz: [
    {
      q: 'Service B is overloaded. What do immediate retries (up to 3 each) do to the load on B?',
      options: [
        'Nothing: a request that has already failed once cannot add any more load',
        'Up to 4 calls per request instead of 1, so the overload grows',
        'They cut the load, because the retries are spread over time',
        'They make B faster, since the repeated calls warm its cache',
      ],
      answer: 1,
      why: 'Each failed attempt is resent straight away, so a struggling service gets several copies of each request.',
    },
    {
      q: 'Why add random jitter to exponential backoff?',
      options: [
        'So retries arrive sooner, which shortens the wait that users see for a response',
        'So the backoff can be skipped when the failure rate is low',
        'So each client picks a different server to retry against',
        'So clients that failed together don\'t all retry at the same instant',
      ],
      answer: 3,
      why: 'Without jitter, clients that failed together back off by the same amount and retry in synchronised waves.',
    },
    {
      q: 'What does a circuit breaker do in the HALF-OPEN state?',
      options: [
        'Sends all traffic through normally for a short moment, to see how much B can take',
        'Lets a few probe requests through to test whether the dependency has recovered',
        'Rejects all traffic and serves the fallback until an operator resets it',
        'Retries every request that failed while it was open, in the original order',
      ],
      answer: 1,
      why: 'If the probes succeed it closes and normal traffic resumes; if they fail it opens again for another cool-down.',
    },
    {
      q: 'A team adds backoff with jitter to every client and calls the retry storm fixed. During a long outage, what will they still see?',
      options: [
        'Retries stop, since each one waits longer than B needs to recover',
        'B keeps getting retry traffic for the outage, spread out but not stopped',
        "A's threads free up at once, since waiting to retry doesn't hold one",
        'The breaker opens by itself, since backoff counts failures too',
      ],
      answer: 1,
      why: 'Backoff changes when retries arrive, not whether they do. Each request still makes up to 4 attempts and holds its thread while it waits, so a long outage keeps loading B and filling A\'s threads. A breaker is what stops the calls.',
    },
  ],
};

export default lesson;
