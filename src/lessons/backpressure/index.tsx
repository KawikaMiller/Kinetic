import type { LessonModule } from '../../core/types';
import { CAP, DEFAULT_SEED, MU, SHED_AT } from './sim';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'When work arrives faster than a system can do it, something has to give. Backpressure and load shedding decide what gives on purpose, instead of letting queues grow until the process falls over.',
    what: `If arrivals exceed capacity, a queue grows without limit: latency climbs with it and memory eventually runs out. Backpressure bounds the queue and pushes the slowdown upstream, so the producer waits and the slowest stage sets the pace. Load shedding rejects work early and cheaply, lowest priority first, so the work that is accepted still finishes quickly. Here the worker is a single M/M/1 queue (random arrivals and service times), so latency rises sharply as utilisation approaches 100%, and Little's Law (L = λW) ties queue length, throughput and latency together. The formulas themselves are the subject of the \`queueing-theory\` lesson.`,
    analogy: 'A motorway on-ramp with traffic lights. Metering cars in keeps the motorway moving; letting a crowd in at once turns it into a car park for everybody.',
    useCases: [
      "Streaming pipelines and reactive streams (Kafka consumers, Akka/Reactor, Node streams' highWaterMark)",
      'TCP flow control and HTTP/2 flow-control windows',
      'API servers returning 503 or 429 under overload instead of timing out the callers',
      'Capacity planning: keeping utilisation well below 100% so tail latency stays sane',
    ],
    why: 'Systems get overloaded sooner or later, and "just add a queue" just hides the problem until it becomes an outage. Engineers are expected to design explicit overload behaviour: bounded queues, priorities, shedding and admission control, backed by queueing intuition about why 90% busy is already dangerous.',
    watch:
      "Blue squares are work items moving from the producer through the queue to the worker; green ones are done, red ones were dropped, shed or lost in a crash. In load-shedding mode, yellow squares are high-priority work, and a dashed violet line marks where low-priority work starts to be refused. The bar on the right is the process's memory, with the red OOM line at the top. Bottom left is the M/M/1 latency curve with a dot showing your current utilisation (the red zone is above 80%); bottom right shows Little's Law measured over the last 10 seconds, with a green tick when the three numbers agree, plus the p99 latency over time. The chips say what is simulated and invented.",
  },
  tryThis: [
    `On Unbounded queue, drag Arrival rate to 15/s (the worker does ${MU}/s). Watch the queue, the memory bar and p99: the process runs out of memory within about half a minute.`,
    `Switch to Bounded + backpressure at the same rate: the producer is told to wait (the In queue stat counts how many wait upstream), the queue stops at ${CAP}, and p99 stays under 5 s instead of climbing (p99 is measured from the moment an item is admitted, so it leaves out the wait upstream that the counter shows).`,
    `Try Load shedding and press Spike ×3. Low-priority work gets a 503 from the moment the queue passes ${SHED_AT}; high-priority work is refused once the queue is full at ${CAP}, and on seed ${DEFAULT_SEED} that does not happen: the Shed stat's high-priority count stays at 0.`,
    'Set the rate to 5, 8 and then 9/s and watch the dot climb the curve to 0.2, 0.5 and 1.0 s. The Little\'s Law line reads λ × W ≈ L with a green tick most of the time; a short 10 s window is noisy, so an occasional miss is noise, not a broken law.',
  ],
  keyIdeas: [
    'If the arrival rate stays above the service rate, an unbounded queue grows until latency or memory kills the process.',
    'Backpressure bounds the queue and slows the producer, pushing the problem upstream where it can be handled.',
    'Load shedding rejects excess work early and cheaply, lowest priority first.',
    "In an M/M/1 queue latency climbs sharply as utilisation nears 100% (W = 1/(μ−λ)); Little's Law L = λ × W holds for the whole system whatever the arrival pattern.",
  ],
  quiz: [
    {
      q: 'A worker handles 10 items/s. Arrivals average 11/s. What happens with an unbounded queue?',
      options: [
        'Latency settles at about 1 s once the queue has formed',
        'The queue grows by about 1 item/s until something gives out',
        'The worker speeds up to match the arrivals as the queue grows',
        'Nothing changes, as long as the machine has plenty of memory',
      ],
      answer: 1,
      why: 'Any sustained excess becomes backlog. More memory just delays the crash, and each queued item waits longer.',
    },
    {
      q: 'In an M/M/1 queue, what happens to average latency going from 50% to 90% utilisation?',
      options: ['It roughly doubles', 'It rises about 5×', 'It stays the same', 'It falls by half'],
      answer: 1,
      why: "W = 1/(μ−λ): at 50% it's 2/μ, at 90% it's 10/μ. The curve is nearly flat, then shoots up.",
    },
    {
      q: 'A service completes 200 requests/s and each spends 50 ms inside it on average. How many requests are in the system at once?',
      options: ['4', '10', '250', '4,000'],
      answer: 1,
      why: "Little's Law: L = λ × W = 200/s × 0.05 s = 10.",
    },
    {
      q: 'A bounded queue with backpressure is full and the producer keeps sending. What gives?',
      options: [
        'The producer waits, so the slowdown moves upstream',
        'The oldest queued item is dropped to make room for the new one',
        'The queue quietly grows past its limit until memory runs out',
        'The worker skips ahead to the newest items and ignores the rest',
      ],
      answer: 0,
      why: 'Backpressure makes the producer wait: nothing is dropped inside the service and memory stays bounded. Dropping is what load shedding does, and it does it on purpose, to the lowest priority first.',
    },
    {
      q: 'Under load shedding the queue passes the shedding line. Which work is refused first?',
      options: [
        'Low-priority work, refused at once with a 503 error',
        'The oldest items in the queue, so the newest work is served first',
        'Work chosen at random, so that no kind of work is favoured',
        'High-priority work, because it is the most expensive to process',
      ],
      answer: 0,
      why: 'Shedding is a priority decision: cheap, early refusals for the lowest priority keep the accepted work fast. High-priority work is refused when the queue is completely full.',
    },
  ],
};

export default lesson;
