import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: "Observability is being able to answer \"what is my system doing, and why?\" from the outside, using three kinds of telemetry: metrics, traces and logs.",
    what: "Metrics are cheap numeric aggregates (request rate, error rate, latency percentiles) that tell you something is wrong. Distributed traces follow one request across services as a tree of timed spans, showing where time or errors happen. Logs are detailed event records that explain why. A shared trace ID ties all three together, so you can jump from a bad metric to an example trace to its logs.",
    analogy: "A hospital: the vital-signs monitor (metrics) tells you something's wrong, the scan (trace) shows where, and the patient's chart (logs) explains why.",
    useCases: [
      "Getting paged and finding the failing dependency in minutes, not hours",
      "Explaining a p99 latency regression after a deploy",
      "Dashboards and alerts built on Prometheus, Grafana, Datadog or OpenTelemetry",
      "Capacity planning and spotting slow creep before users notice",
    ],
    why: "In a distributed system you usually can't attach a debugger to production. Seniors are expected to design telemetry into services, run incident investigations, and avoid expensive traps like high-cardinality metric labels.",
    watch: "Pick an incident, then investigate. In the service map and metrics table a service turns yellow when its p99 is slow and red when its error rate is high; sparklines show p99 over time. The trace panel draws each service's span as a bar in that service's colour on one timeline, with spans that did a lot of work of their own outlined in yellow and errors glowing red. Logs stream below, each tagged with its trace ID, WARN lines in yellow and ERROR lines in red. The checklist turns green as you complete metrics, then trace, then logs. The chips say the traffic is seeded and the services and numbers are invented.",
  },
  tryThis: [
    'Pick "Checkout is slow", wait a few seconds for the metrics to catch up, click a row that looks wrong, then open the slowest trace.',
    'Filter the logs to that trace and read the WARN line: that\'s the root cause.',
    'Repeat with "Checkout is failing" and follow the red error through the trace.',
    'Add a user_id label to the metrics and watch the series count explode.',
  ],
  keyIdeas: [
    'Metrics tell you that something is wrong; traces tell you where; logs tell you why.',
    'A trace ID passed along with each call and written into the logs links metrics, traces and logs together.',
    'Watch percentiles (p99), not just averages: a minority of very slow requests barely moves the mean but sets the p99.',
    'Each unique label combination is a separate metric series, so IDs make poor metric labels.',
  ],
  quiz: [
    {
      q: 'Your checkout p99 doubled. Which signal is best for finding WHICH service in the request path got slow?',
      options: [
        'A CPU usage graph for the checkout service',
        'A distributed trace of one slow request',
        'The total request counter over the last day',
        'The deploy log from the last release',
      ],
      answer: 1,
      why: 'A trace breaks one request into timed spans per service, so the slow hop is visible directly.',
    },
    {
      q: 'Why is adding a user_id label to a request-count metric a bad idea?',
      options: [
        'Metrics cannot store strings, so the label would be dropped',
        'It creates one series per user, which blows up memory and cost',
        "It leaks the users' passwords into every dashboard panel",
        'It makes the counter less accurate as the user count grows',
      ],
      answer: 1,
      why: 'Each distinct label value creates a new series; a million users means up to a million times as many series.',
    },
    {
      q: 'What lets you jump from a slow trace to the exact log lines for that request?',
      options: [
        'Timestamps alone, if the clocks agree closely enough',
        'A trace ID carried in every log line of the request',
        'Log levels, since errors are logged at ERROR',
        'Metric names, which are unique per request',
      ],
      answer: 1,
      why: 'Propagating the trace ID into the logs lets you filter to exactly one request across the services it touched.',
    },
    {
      q: "Checkout's p99 is high, and so is the p99 of payments and fraud. Why can't the metrics alone say which one is the cause?",
      options: [
        "A service's time includes the time of the services it calls",
        'Metrics only record the gateway and never the other services',
        'A p99 cannot be computed for one service, only for the whole system',
        "The other services' metrics are sampled too rarely to compare",
      ],
      answer: 0,
      why: "A caller waits for its callees, so each service on the slow path shows a slow p99. The trace shows where the time is actually spent.",
    },
  ],
};

export default lesson;
