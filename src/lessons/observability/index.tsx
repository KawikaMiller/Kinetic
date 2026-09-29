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
    why: "In a distributed system you can't attach a debugger to production. Seniors are expected to design telemetry into services, run incident investigations, and avoid expensive traps like high-cardinality metric labels.",
    watch: "Pick an incident, then investigate. The service map and metrics table turn yellow when a service's p99 is slow and red when its error rate is high; sparklines show p99 over time. The trace panel draws each service's span as a coloured bar on one timeline, with slow spans outlined in yellow and errors in red. Logs stream on the right, each tagged with its trace ID. The checklist ticks off metrics → trace → logs as you go.",
  },
  tryThis: [
    'Pick "Checkout is slow", click the metrics row that looks wrong, then open the slowest trace.',
    'Filter the logs to that trace and read the WARN line: that\'s the root cause.',
    'Repeat with "Checkout is failing" and follow the red error through the trace.',
    'Add a user_id label to the metrics and watch the series count explode.',
  ],
  keyIdeas: [
    'Metrics tell you that something is wrong; traces tell you where; logs tell you why.',
    'A trace ID propagated through every service links all three pillars together.',
    'Watch percentiles (p99), not averages: a small share of very slow requests hides in the mean.',
    'Every unique label combination is a separate metric series, so never use IDs as labels.',
  ],
  quiz: [
    {
      q: 'Your checkout p99 doubled. Which signal is best for finding WHICH service in the request path got slow?',
      options: ['A CPU usage graph', 'A distributed trace of a slow request', 'The total request counter', 'The deploy log'],
      answer: 1,
      why: 'A trace breaks one request into timed spans per service, so the slow hop is visible directly.',
    },
    {
      q: 'Why is adding a user_id label to a request-count metric a bad idea?',
      options: [
        'Metrics cannot store strings',
        'It creates one time series per user: huge cardinality, memory and cost',
        'It leaks passwords',
        'It makes the metric less accurate',
      ],
      answer: 1,
      why: 'Each distinct label value creates a new series; millions of users means millions of series.',
    },
    {
      q: 'What lets you jump from a slow trace to the exact log lines for that request?',
      options: ['Timestamps alone', 'A shared trace/correlation ID in every log line', 'Log levels', 'Metric names'],
      answer: 1,
      why: 'Propagating the trace ID into logs lets you filter to exactly one request across every service.',
    },
  ],
};

export default lesson;
