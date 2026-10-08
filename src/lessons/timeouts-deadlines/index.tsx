import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A timeout only frees the caller: the work downstream carries on, so set one absolute deadline at the edge and pass the remaining budget down every hop.',
    what: 'Every call needs a limit on how long its caller will wait. A timeout is a duration each hop applies on its own, so a user who gave up after 2 s can leave B, C and the database working for many seconds more, and every unwanted second holds a thread. A deadline is a point in time fixed once at the edge and handed on as the remaining budget (gRPC sends it as a `grpc-timeout` header; plain HTTP services use a header of their own). Each hop can then refuse work it cannot finish and, where the stack supports cancellation, stop work in flight. Retries must spend from the same budget.',
    analogy: 'A relay race with a closing time: if only the first runner knows the clock, everyone after them keeps running long after the finish line has gone. Tell every runner the time that is left.',
    useCases: [
      'gRPC and service-mesh calls, where the deadline travels with the request through every hop',
      'HTTP clients, proxies and load balancers, each with its own timeout that has to nest correctly',
      'Database statement timeouts and query cancellation when the client has already gone',
      'Retry policies that need to know whether another attempt can still fit',
    ],
    why: 'Missing or misordered timeouts are behind hung thread pools, work nobody waits for and duplicate side effects when a user retries, and they turn a slow dependency into an outage (see `circuit-breakers`). It builds on `client-server` and `grpc-protobuf`; a retry is only safe with `idempotency-keys`.',
    watch: 'Each lane is a service and the horizontal axis is time. Blue bars are work someone is still waiting for; solid red is work after nobody was waiting, and violet hatching is a wait in a queue. A bar\'s outline says how it ended: red for a timeout or error, orange for "deadline exceeded" (the fail-fast kind). The red marker is where the user gives up; with propagation on it becomes the yellow deadline. In the table the budget bar is green and turns orange under 20% of the deadline. In the retry scene the thin orange sliver is a retry the budget refused. In the histogram the violet line is p99 and the yellow line is your timeout.',
  },
  tryThis: [
    'Press play on the call chain with propagation Off. At the red marker the user leaves: which hops keep working, and for how long?',
    'Switch Deadline propagation to On and play again: where do all the bars stop now? Then raise Queue at B to 1.7 s and see which hop refuses to start.',
    'With propagation Off, load the Misordered preset: A times out, yet B still succeeds later. What would a user retry do to B\'s side effect?',
    'In Retries in budget, slide the attempt timeout from 0.9 s down to 0.5 s: the two strategies become identical. Why?',
    'In Picking a timeout, drag the timeout onto the violet p99 line, then out to 8 s: what does each end cost you?',
  ],
  keyIdeas: [
    'A timeout frees the caller but does not cancel the callee: without cancellation the work runs on with nobody waiting.',
    'A deadline is an absolute time set at the edge. Each hop is handed the remaining budget (deadline minus time spent), and network and queue time come out of it.',
    'Inner timeouts should be shorter than outer ones. In a misordered chain B can succeed after A gave up, so a client retry may do the work twice.',
    'Retry only when the attempt fits in what is left, and set a timeout just above the p99 of healthy latency, never beyond the caller\'s own budget.',
  ],
  quiz: [
    {
      q: 'A user gives up at 2 s, but A, B and C have timeouts of 5, 10 and 30 s and nothing is cancelled. What happens downstream?',
      options: [
        'The work carries on until each hop finishes or hits its own timeout',
        'It stops at once because the user\'s connection has closed',
        'It is rolled back automatically when the original caller leaves',
        'Only A keeps going, and B and C stop when A\'s call returns',
      ],
      answer: 0,
      why: 'A timeout is local to the hop that set it. Closing the user\'s connection tells nobody downstream, and nothing rolls work back, so every hop runs until it finishes or reaches its own limit, with a thread held all that time.',
    },
    {
      q: 'What does deadline propagation hand to the next hop?',
      options: [
        'The time remaining: the absolute deadline minus the time already spent',
        'The original timeout, unchanged, so every hop gets a fresh full allowance',
        'The number of retries so far, so that the hops can agree on a limit',
        'A list of the hops that already answered, so they are not called twice',
      ],
      answer: 0,
      why: 'The budget shrinks as the call goes down, because network time, queueing and each hop\'s own work are spent from it. Handing on the original timeout would give each hop a fresh allowance and the whole chain could far exceed what the user will wait.',
    },
    {
      q: 'Timeouts are A 1.5 s, B 6 s, C 6 s and the database takes 4 s. What goes wrong?',
      options: [
        'A reports a failure while B and C go on to succeed, so a retry repeats their work',
        'C times out first, so the failure reaches B and then A in the right order',
        'Nothing: each hop stayed within its own timeout, so the request counts as fine',
        'B times out before A does, because its own timeout is the longer of the two',
      ],
      answer: 0,
      why: 'The inner timeouts are longer than the outer one, so A gives up while B and C are still working and later succeed. Their side effects happen with nobody told, and a retry from the user would run them a second time.',
    },
    {
      q: 'Why should a hop with only 50 ms of budget left refuse to start its query?',
      options: [
        'It cannot finish in time, so starting would only add load nobody waits for',
        'Databases reject any query that is given less than 100 ms to run',
        'The caller has certainly retried already, which makes the work a duplicate',
        'Refusing is cheaper than timing out because it skips authentication checks',
      ],
      answer: 0,
      why: 'Failing fast returns an error while the caller is still there and spends nothing on work whose answer would arrive too late. The other options invent rules: databases accept short budgets, and refusing has nothing to do with duplicates.',
    },
    {
      q: 'Where should a call\'s timeout sit relative to its healthy latency?',
      options: [
        'Just above the p99 of healthy latency, within the caller\'s own budget',
        'At the median, so that slow requests are cut off as quickly as possible',
        'As long as possible, so that no request is ever cut short by mistake',
        'At the average latency, because that is what a typical request takes',
      ],
      answer: 0,
      why: 'Below p99 you cut off healthy requests that were nearly done; far above it, stuck requests hold threads for ages. The median or the average would cut off roughly half of all healthy calls.',
    },
  ],
};

export default lesson;
