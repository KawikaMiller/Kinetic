import type { LessonModule } from '../../core/types';
import { DEFAULT_PARAMS, FAULT_REQUEST, HOG_MS, IO_MS, simulate, withoutFault, type Params } from './model';
import { openingFor } from './openings';
import { Stage } from './Stage';

const run = (over: Partial<Params>) => simulate({ ...openingFor('normal'), ...over });
const THREADS = run({});
const LOOP = run({ runtime: 'events' });
const ACTORS = run({ runtime: 'actors' });
const POOL = run({ runtime: 'csp' });
const POOL_WIDE = run({ runtime: 'csp', workers: 16 });

const SLOW_THREADS = simulate({ ...openingFor('slow') });
const SLOW_LOOP = simulate({ ...openingFor('slow'), runtime: 'events' });
const FAST_LOOP = simulate(withoutFault({ ...openingFor('slow'), runtime: 'events' }));

const CRASH_THREADS = simulate({ ...openingFor('crash') });
const CRASH_LOOP = simulate({ ...openingFor('crash'), runtime: 'events' });
const CRASH_LOOP_NET = simulate({ ...openingFor('crash'), runtime: 'events', net: true });

const R = DEFAULT_PARAMS.requests;

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Threads, an event loop, actors and channels are four ways to run many requests at once: they differ in what they cost, in how a slow handler spreads, and in what a crash takes down.',
    what: `One workload goes through four runtimes: ${R} requests that each need a short CPU step, an I/O wait and another short CPU step. A thread per request blocks while it waits and spreads the CPU over the cores. An event loop turns every wait into a callback on one thread. Actors keep a mailbox each and handle one message at a time. Workers on a channel pull requests one by one and can block on their own I/O. Same work, different wall time, memory and failure behaviour, all read off a schedule the lesson computes.`,
    analogy: 'A restaurant: a waiter per table is easy to follow but costs wages while he stands waiting for the kitchen; one waiter serving every table is cheap until he spends ten minutes explaining the wine list; stations with their own queues keep a slow order from blocking the others.',
    useCases: [
      'Choosing between a thread pool, an async runtime and an actor framework for a service that calls other services',
      'Explaining why one slow handler stalls every request in a single-threaded server',
      'Sizing worker pools and channel buffers so a producer is not left waiting for nobody',
      'Deciding what happens to the rest of the work when one request crashes',
    ],
    why: 'Concurrency bugs and outages come from the runtime default nobody looked at: a blocking call in a loop, a pool smaller than the work, a crash that ends a process. Knowing what each model costs and what it does when a handler misbehaves turns those into design choices.',
    watch: 'The timeline draws the first ten requests: a blue bar is CPU work, a dim dashed bar is a request waiting on I/O (blocked), an orange hatched bar is a request delayed behind another, and a red bar is the slow handler. A red diamond is a crash, a green diamond is a restart or a request that finished exactly when it would with no fault, and an orange diamond is one that finished late. The table under it runs all four runtimes on the same settings and the highlighted row is the one on the timeline.',
  },
  tryThis: [
    `In A normal run at the defaults (${R} requests, 4 cores, a thread each) the wall time is ${THREADS.makespan} ms with ${THREADS.peakConcurrent} threads and ${THREADS.memoryMb} MB reserved. Pick Event loop: ${LOOP.makespan} ms on ${LOOP.osThreads} thread and ${LOOP.memoryMb} MB, with ${LOOP.peakCores} core busy.`,
    `In A normal run pick CSP channels. Four workers that each wait out their own I/O take ${POOL.makespan} ms. Drag Workers to 16 and the wall time falls to ${POOL_WIDE.makespan} ms. Pick Actors for comparison: ${ACTORS.makespan} ms with ${ACTORS.peakConcurrent} actors.`,
    `In One slow handler at the defaults (OS threads) the earliest other request still finishes at ${SLOW_THREADS.bystanderFinish} ms. Press blocking call inside the event loop: it finishes at ${SLOW_LOOP.bystanderFinish} ms instead of ${FAST_LOOP.bystanderFinish} ms.`,
    `In One crash at the defaults (OS threads, safety net off) ${CRASH_THREADS.finished} of ${R} requests finish. Pick Event loop: ${CRASH_LOOP.finished} finish and the process ends at ${CRASH_LOOP.makespan} ms. Turn the Safety net on: ${CRASH_LOOP_NET.finished} finish.`,
    'In One slow handler pick CSP channels and drag Workers down to 0: the lesson refuses the setup instead of running it, and says nobody would receive.',
  ],
  keyIdeas: [
    `A blocked thread keeps its stack: in this model a thread each costs ${THREADS.memoryMb} MB and ${THREADS.switches} toy context switches for ${R} requests, the event loop ${LOOP.memoryMb} MB and none, yet the loop is slower (${LOOP.makespan} ms against ${THREADS.makespan} ms) because it keeps one core busy.`,
    `A callback runs to completion: in this model a ${HOG_MS} ms handler moves the earliest other request on the event loop from ${FAST_LOOP.bystanderFinish} ms to ${SLOW_LOOP.bystanderFinish} ms, while on threads it stays at ${SLOW_THREADS.bystanderFinish} ms.`,
    `Waiting while holding a worker wastes it: in this model ${POOL.params.workers} workers that block on I/O take ${POOL.makespan} ms where ${ACTORS.peakConcurrent} actors that handle the reply as another message take ${ACTORS.makespan} ms.`,
    `What a crash costs depends on the runtime's default and on a safety net: by default in the table here it ends one thread, a whole process, one actor's mailbox or a whole program, and with a net it costs one request.`,
  ],
  quiz: [
    {
      q: `A single-threaded event loop runs a handler that spins the CPU for ${HOG_MS} ms. What happens to an unrelated request that needs 5 ms?`,
      options: [
        'It waits until the handler returns, since the loop runs one callback at a time',
        'It runs on another core at once, since the loop spreads callbacks over every core',
        'It is unaffected, since awaiting I/O frees the loop for other callbacks in the meantime',
        'It jumps the queue, since short callbacks are scheduled ahead of long ones by the loop',
      ],
      answer: 0,
      why: `The loop is one thread and a callback runs to completion, so nothing else runs until the handler returns: in this model the earliest other request goes from ${FAST_LOOP.bystanderFinish} ms to ${SLOW_LOOP.bystanderFinish} ms. Awaiting I/O frees the loop for the time the handler is waiting, not while it spins, and a loop does not reorder callbacks by length or use more cores.`,
    },
    {
      q: `In this model ${R} requests each wait ${IO_MS} ms for I/O on 4 cores. How does one event-loop thread compare with a thread per request?`,
      options: [
        'Slower: the loop runs every CPU step on one core, while the threads share four',
        'Faster: the loop never waits for I/O, so it finishes the moment the work is queued',
        'The same: both overlap the waits, so the cores make no difference to either',
        'Faster: a loop has no stack to reserve, so it saves time as well as memory',
      ],
      answer: 0,
      why: `Both overlap the ${IO_MS} ms waits, but the loop's ${LOOP.callbacks} callbacks run one after another on one core (${LOOP.makespan} ms), while ${THREADS.peakConcurrent} threads spread their CPU steps over 4 cores (${THREADS.makespan} ms). The loop saves memory (${LOOP.memoryMb} MB against ${THREADS.memoryMb} MB), not time, in this model.`,
    },
    {
      q: 'A Node-style callback throws an exception that nothing catches. What does the runtime do by default?',
      options: [
        'Ends the process, so every unfinished request fails with it',
        'Fails that one request and carries on with the next callback in the queue',
        'Restarts only the callback and replays the request from its first step',
        'Pauses the loop until a handler is attached, then resumes the other requests',
      ],
      answer: 0,
      why: `By default in Node an unhandled exception in a callback ends the process (from memory: check the Node documentation), so in this model all ${R} requests fail at ${CRASH_LOOP.makespan} ms. With a handler, request ${FAULT_REQUEST} alone fails. The loop does not pause, replay or skip on its own.`,
    },
    {
      q: `One actor's handler for request ${FAULT_REQUEST} spins for ${HOG_MS} ms. Which other requests wait?`,
      options: [
        'The ones queued behind it in the same actor\'s mailbox, while other actors carry on',
        'Every request, because actors share one thread and run one message at a time in total',
        'None, because a message handler is preempted as soon as another message arrives',
        'The ones that arrive later, because a mailbox holds new messages until its handler ends',
      ],
      answer: 0,
      why: 'An actor handles one message at a time, so its own mailbox waits behind a long handler, but other actors have their own mailboxes and run on other cores while there are free cores (with more actors than cores they queue for a core). They do not share one thread, and in this model a handler is not preempted by a new message.',
    },
  ],
};

export default lesson;
