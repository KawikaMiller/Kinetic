import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'When work arrives faster than a system can do it, something has to give. Backpressure and load shedding decide what gives on purpose, instead of letting queues grow until the process falls over.',
    what: 'If arrivals exceed capacity, a queue grows without limit: latency climbs with it and memory eventually runs out. Backpressure bounds the queue and pushes the slowdown upstream, so the producer waits and the slowest stage sets the pace. Load shedding rejects work early and cheaply, lowest priority first, so the work that is accepted still finishes quickly. Queueing theory says latency rises sharply as utilisation approaches 100%, and Little\'s Law (L = λW) ties queue length, throughput and latency together.',
    analogy: 'A motorway on-ramp with traffic lights. Metering cars in keeps the motorway moving; letting everyone in at once turns it into a car park for everybody.',
    useCases: [
      'Streaming pipelines and reactive streams (Kafka consumers, Akka/Reactor, Node streams\' highWaterMark)',
      'TCP flow control and HTTP/2 flow-control windows',
      'API servers returning 503 or 429 under overload instead of timing out everyone',
      'Capacity planning: keeping utilisation well below 100% so tail latency stays sane',
    ],
    why: 'Every system is eventually overloaded, and "just add a queue" only hides the problem until it becomes an outage. Staff-level engineers are expected to design explicit overload behaviour: bounded queues, priorities, shedding and admission control, backed by queueing intuition about why 90% busy is already dangerous.',
    watch: 'Blue squares are work items moving from the producer through the queue to the worker; green ones are done, red ones were dropped, shed or lost in a crash. In load-shedding mode, yellow squares are high-priority work. The bar on the right is the process\'s memory, with the OOM line at the top. Bottom left is the M/M/1 latency curve with a dot showing your current utilisation (the red zone is above 80%); bottom right shows Little\'s Law measured live, plus the p99 latency over time.',
  },
  tryThis: [
    'On Unbounded queue, drag Arrival rate to 15/s. Watch the queue, the memory bar and p99 until it crashes.',
    'Switch to Bounded + backpressure at the same rate: the producer is told to wait, and latency stays flat.',
    'Try Load shedding and hit Spike ×3. Low-priority work gets a 503, while yellow high-priority work still gets through.',
    'Set the rate to 5, 8 and then 9/s and watch the dot climb the curve. Check that λ × W ≈ L each time.',
  ],
  keyIdeas: [
    'If arrival rate > service rate for long enough, an unbounded queue grows until latency or memory kills you.',
    'Backpressure bounds the queue and slows the producer, pushing the problem upstream where it can be handled.',
    'Load shedding rejects excess work early and cheaply, ideally lowest priority first.',
    'Latency explodes as utilisation nears 100% (W = 1/(μ−λ)); Little\'s Law: L = λ × W.',
  ],
  quiz: [
    {
      q: 'A worker handles 10 items/s. Arrivals average 11/s. What happens with an unbounded queue?',
      options: [
        'Latency stabilises at about 1 s',
        'The queue grows by ~1 item/s forever until latency or memory becomes unbearable',
        'The worker speeds up',
        'Nothing, as long as memory is large',
      ],
      answer: 1,
      why: 'Any sustained excess becomes backlog. More memory only delays the crash, and every queued item waits longer.',
    },
    {
      q: 'In an M/M/1 queue, what happens to average latency going from 50% to 90% utilisation?',
      options: ['It roughly doubles', 'It goes up about 5×', 'It stays the same', 'It halves'],
      answer: 1,
      why: 'W = 1/(μ−λ): at 50% it\'s 2/μ, at 90% it\'s 10/μ. The curve is nearly flat, then shoots up.',
    },
    {
      q: 'A service completes 200 requests/s and each spends 50 ms inside it on average. How many requests are in the system at once?',
      options: ['4', '10', '250', '4,000'],
      answer: 1,
      why: 'Little\'s Law: L = λ × W = 200/s × 0.05 s = 10.',
    },
  ],
};

export default lesson;
