import type { LessonModule } from '../../core/types';
import { pctText, sig } from '../distributions/fmt';
import { msText, rps } from './frames';
import {
  LEVEL_DEFAULT, PLAN_DEFAULT, SERVICE_DEFAULT, SLO_MS, capacity, firstCrossing, kneeLoad, latencyQuantileMs, orderByMonth, yearFactor,
} from './model';
import { Stage } from './Stage';

const CAP = capacity(SERVICE_DEFAULT);
const KNEE = kneeLoad(SERVICE_DEFAULT, SLO_MS)!;
const KNEE_SHARE = pctText(KNEE / CAP, 0);
const OFFERED_DEFAULT = LEVEL_DEFAULT * CAP;
const P99_DEFAULT = msText(latencyQuantileMs(SERVICE_DEFAULT, OFFERED_DEFAULT, 0.99)!);
const P99_EIGHTY = msText(latencyQuantileMs(SERVICE_DEFAULT, 0.8 * CAP, 0.99)!);
const CROSSING = firstCrossing(PLAN_DEFAULT);
const ORDER_BY = sig(orderByMonth(CROSSING, PLAN_DEFAULT.leadWeeks)!, 2);
const DB_TRY = 1500;
const YEAR_PCT = pctText(yearFactor(0.05, 'compound') - 1, 1);

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Capacity is the most load a service takes while still meeting its latency objective, which is reached well before the workers are 100% busy; planning is finding that knee, then ordering capacity before growth reaches it.',
    what: `A load test ramps offered load against a service of c workers and watches throughput, p50, p99 and errors. Throughput flattens at c / S, but the p99 has already left the objective earlier: here the knee, the highest load that still meets a ${SLO_MS} ms p99, is ${KNEE_SHARE} of that limit. The knee is defined by the objective and found by bisection on the exact p99 of an M/M/c queue, not eyeballed as a corner. A forecast then turns the knee, the instance count, headroom and redundancy into a month the plan runs out, and an order-by date that is earlier by the lead time.`,
    analogy: 'A motorway can carry a maximum number of cars per hour, but journey times blow up well before it reaches that number. The number you plan around is the traffic at which the journey is still acceptable.',
    useCases: [
      'Reading a load test: which number to call capacity, and where the knee sits',
      'Deciding how many instances to buy, with headroom and a lost zone in mind',
      'Working out the order date for hardware or a quota increase with a long lead time',
      'Judging whether a profiling win or more instances moves the knee further',
    ],
    why: 'Running out of capacity is a planned-for event: the date follows from growth, headroom and lead time. Knowing that the objective, not 100% CPU, sets the limit, that pools tolerate more load than split queues and that shared limits break linear scaling turns a load test into a number you can order against.',
    watch: 'A load test: the blue line is offered load, the green line what is achieved, and a red band is the load past capacity that is not served. The orange line is p99, blue p50, a grey dashed line the objective and a yellow rule the knee (or your offered load, when it is the one you can drag). Hollow marks are the ramp, solid marks the run at your load. Meters are green within the objective, orange past the knee and red over capacity. Forecast: violet is the forecast peak, green the capacity, a blue band the headroom kept free, red where the forecast is over capacity and yellow the order-by date. What moves the knee: the dashed grey line is capacity if it were linear in instances, green is with the shared limit and red the limit itself.',
  },
  tryThis: [
    `In A load test at the defaults, ${pctText(LEVEL_DEFAULT, 0)} of capacity (${rps(OFFERED_DEFAULT)}) is served in full, yet the p99 is ${P99_DEFAULT}, over the ${SLO_MS} ms objective: the knee is ${rps(KNEE)}, ${KNEE_SHARE} of capacity.`,
    `In A load test, drag Offered load to 80%: the p99 falls to ${P99_EIGHTY}, within the objective, with the workers still ${pctText(0.8, 0)} busy.`,
    'In A load test, drag Offered load past 100%: throughput stops at capacity while offered load keeps rising, and errors climb.',
    `In Headroom and forecast, the defaults cross capacity in month ${CROSSING.month}, set by the one-month spike; with ${PLAN_DEFAULT.leadWeeks} weeks of lead time, order by month ${ORDER_BY}.`,
    `In What moves the knee, set the shared database limit to ${DB_TRY.toLocaleString('en-US')}/s and raise Instances past 10: capacity stops growing at the limit.`,
  ],
  keyIdeas: [
    `Capacity is the highest load that still meets the latency objective, not the highest throughput: in this model the knee is ${KNEE_SHARE} of the c / S limit.`,
    `Latency and errors climb before 100% busy: in this model the p99 at ${pctText(LEVEL_DEFAULT, 0)} of capacity is ${P99_DEFAULT} against the ${SLO_MS} ms objective.`,
    `Growth compounds, so 5% a month is ${YEAR_PCT} a year, and the date to order is the crossing month less the lead time, not the crossing month.`,
    'In this model one pool of workers meets the objective at higher utilisation than the same workers as separate queues, and a shared limit stops capacity scaling with instances.',
  ],
  quiz: [
    {
      q: 'A service is at 90% of its maximum throughput and serves each request, but its p99 is over the objective. What does that show?',
      options: [
        'The limit that matters is the objective, which is reached at a lower load',
        'Nothing is wrong, because each request is still being served in the end',
        'The service has a defect, because it should meet the objective up to 100%',
        'The objective is too strict, because throughput still looks healthy',
      ],
      answer: 0,
      why: 'Waiting grows steeply as workers approach 100% busy, so the p99 leaves the objective at the knee, below maximum throughput. Serving requests slowly is still missing the objective, and the model has no defect: this is how an M/M/c queue behaves.',
    },
    {
      q: 'In capacity planning, what does "capacity" of a service mean?',
      options: [
        'The highest load that still meets the latency objective',
        'The highest throughput the workers finish when fully busy',
        'The load at which one worker first reaches 100% CPU',
        'The average load over the busiest week of the year',
      ],
      answer: 0,
      why: 'Planning needs the load at which users are still served within the objective, the knee. Maximum throughput is c / S, which is above it, and a one-worker CPU reading or a weekly average says nothing about the latency objective.',
    },
    {
      q: 'A pool of 32 workers behind one queue is rebuilt as 32 separate single-worker servers, each with its own queue. What happens to the load that meets the p99 objective?',
      options: [
        'It falls, since a worker can sit idle while another queue is long',
        'It stays the same, since the total number of workers is unchanged',
        'It rises, since each worker now has a queue of its own to serve',
        'It doubles, since smaller queues mean shorter waits for everyone',
      ],
      answer: 0,
      why: 'In a shared queue a free worker takes the next request. Separate queues strand capacity behind a long line, so each has to run cooler to meet the same p99, and the load that meets the objective falls.',
    },
    {
      q: 'Traffic grows 5% a month. By about how much is it up after a year?',
      options: [
        'About 80%, since 1.05 multiplied twelve times is 1.8',
        'About 60%, since 5% added twelve times is 60%',
        'About 5%, since the monthly rate carries over a year',
        'About 17%, since the 5% is spread over twelve months',
      ],
      answer: 0,
      why: 'Growth compounds: 1.05^12 = 1.796, so 79.6%. Adding 5% twelve times gives 60%, the common underestimate; 5% and 17% confuse the monthly rate with the yearly total.',
    },
  ],
};

export default lesson;
