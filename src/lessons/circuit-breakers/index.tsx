import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'When a dependency starts failing, naive retries pile more load onto it and drag the caller down too. Backoff, jitter and circuit breakers stop one failure from becoming an outage.',
    what: 'A timeout frees the caller but not the callee: the slow service keeps working on requests nobody is waiting for. Immediate retries multiply its load exactly when it can least cope, and the caller\'s threads fill up waiting, so the caller fails too. Exponential backoff with jitter spreads retries out. A circuit breaker watches recent failures and, past a threshold, "opens": calls fail fast with a fallback for a cool-down period, then a few probe calls test whether it is safe to close again.',
    analogy: 'The breaker in your fuse box. When a circuit is overloaded it trips and cuts the power, instead of letting the wires overheat and burn the house down. You flip it back once the fault is fixed.',
    useCases: [
      'Every service-to-service call in a microservice architecture',
      'Calling third-party APIs (payments, maps, email) that can slow down without warning',
      'Libraries and meshes: Resilience4j, Polly, Envoy/Istio outlier detection',
      'Serving a cached or degraded response instead of an error page',
    ],
    why: 'Most large outages are cascades: one slow dependency, retries and exhausted thread pools spreading failure upstream. Senior engineers are expected to design timeouts, retry budgets and breakers deliberately, and to know that a system can stay down after the original fault is fixed (a metastable failure).',
    watch: 'Service A\'s grid is its 40 threads: blue ones are waiting on a call, violet ones are waiting to retry. Blue dots travel to Service B; green (success), red (failure) or grey (a response nobody is waiting for any more) come back. Inside B, each dot is a call it is working on; grey ones are orphaned work. The switch on the wire is the breaker: green and flat when closed, red and raised when open, yellow when half-open. Bottom left shows when retries fire; bottom right tracks load on B (blue) and A\'s error rate (red).',
  },
  tryThis: [
    'On Naive retries, click "B has a bad day". Watch the load on B climb above the user traffic and A\'s threads fill up.',
    'Now Heal B. Does the error rate drop straight away, or does the backlog keep it down?',
    'Switch to Backoff + jitter and compare the retry-timing strip with the naive tower at 0 s.',
    'Switch to Circuit breaker and repeat the bad day. Follow the switch: CLOSED → OPEN → HALF-OPEN → CLOSED.',
  ],
  keyIdeas: [
    'A timeout protects the caller, not the callee: B keeps doing work nobody is waiting for.',
    'Immediate retries multiply load on a struggling service. That\'s a retry storm.',
    'Exponential backoff with jitter spreads retries out, but alone it doesn\'t stop a sustained overload.',
    'A circuit breaker fails fast with a fallback, gives the dependency room to recover, and probes before closing.',
  ],
  quiz: [
    {
      q: 'Service B is overloaded. What do immediate retries (up to 3 each) do?',
      options: [
        'Nothing: each request only succeeds once',
        'Up to 4× the load on B, making the overload worse',
        'They reduce load by spreading requests out',
        'They make B faster',
      ],
      answer: 1,
      why: 'Every failed attempt is resent straight away, so a struggling service gets several copies of each request.',
    },
    {
      q: 'Why add random jitter to exponential backoff?',
      options: [
        'To make retries faster',
        'So clients that failed together don\'t all retry at the same instant',
        'To encrypt the retry',
        'Because timers are inaccurate',
      ],
      answer: 1,
      why: 'Without jitter, every client backs off by the same amount and they retry in synchronised waves.',
    },
    {
      q: 'What does a circuit breaker do in the HALF-OPEN state?',
      options: [
        'Sends all traffic normally',
        'Rejects all traffic forever',
        'Lets a few probe requests through to test whether the dependency has recovered',
        'Retries every failed request',
      ],
      answer: 2,
      why: 'If the probes succeed it closes and normal traffic resumes; if they fail it opens again for another cool-down.',
    },
  ],
};

export default lesson;
