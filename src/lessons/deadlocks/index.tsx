import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A deadlock needs four conditions at once, so you prevent it by designing one of them away, not by hoping the timing works out.',
    what: "A deadlock is a set of threads each waiting for a lock that another one in the set holds, so none of them can ever continue. Coffman showed it takes four conditions together: locks are exclusive, a thread holds one while it waits for another, nobody can take a lock away, and the waits form a cycle. Break any one and deadlock can't happen; or let it happen, spot the cycle and abort a victim, which is what databases do.",
    analogy: 'Four cars at a four-way junction, each nosed in and waiting for the car on its right to move. Nobody has broken down, and nobody can go.',
    useCases: [
      'Two services locking accounts in opposite orders during a money transfer',
      'Database transactions updating the same rows in different orders (the database aborts one)',
      'Thread pools where a task waits on another task stuck in the queue behind it',
      "Lock-ordering rules in OS kernels, which Linux's lockdep checks at runtime",
    ],
    why: "Deadlocks freeze production without a crash or a log line: requests just hang until something times out. Knowing the four conditions lets you pick a fix on purpose, like a global lock order or tryLock with back-off, instead of sprinkling sleeps and timeouts. The dining philosophers are an interview favourite too.",
    watch:
      'Circles are threads (blue tint) and boxes are resources, the locks (violet tint). A dashed blue arrow from a thread to a resource is a request it is waiting on; a solid violet arrow from a resource to a thread means that thread holds it. The thread acting this tick is solid yellow, finished threads are solid green, and a thread that has not started or is backing off is faded grey (with a grey "backing off" tag). When the waits form a cycle, its arrows turn red, and in a permanent deadlock each thread in it gets a red "deadlocked" tag. In the database scenario the rolled-back victim is solid orange with an orange "rolled back" tag, and the database log prints the error in red, the rollback in orange and the details in grey. The table lists what each thread holds and wants, with the acting row in yellow and each state coloured to match: deadlocked red, rolled back orange, done green.',
  },
  tryThis: [
    'Play "Two threads, two locks": both threads end up asleep and the arrows close into a red cycle.',
    'Switch any one condition to its fix (say Circular wait to "One global order") and play again: everyone finishes.',
    'Set No preemption to "tryLock, give back", Schedule to "Take turns" and Retry delay to "Fixed": the threads livelock, busy but never finishing.',
    'Pick "Random order" and press "try another" a few times: some seeds slip through, which is why deadlocks look like rare flukes.',
    'Play "Database deadlock": the detector finds the cycle and rolls back T2, the transaction that began last, which then retries.',
  ],
  keyIdeas: [
    'Deadlock needs all four: mutual exclusion, hold and wait, no preemption, circular wait. Remove any one and it cannot happen.',
    'A global lock order is the usual fix: with everyone taking A before B, a cycle of waits cannot close.',
    'Livelock is busy but stuck (tryLock retrying in lockstep); starvation is one thread waiting while the others make progress.',
    'With one copy of each lock, a cycle in the wait-for graph is a deadlock. Databases detect it and abort a victim.',
  ],
  quiz: [
    {
      q: 'Two services lock accounts in opposite orders and sometimes hang. What prevents the hang outright?',
      options: [
        'Have every service lock accounts in one agreed order',
        'Add a short sleep between taking the two locks',
        'Retry the whole request whenever it seems to hang',
        'Run each service on a faster, less busy machine',
      ],
      answer: 0,
      why: 'One global order makes a cycle of waits impossible, so the deadlock cannot form. A sleep or a faster machine only changes the timing, so the hang gets rarer, not impossible; a retry recovers after the hang instead of preventing it.',
    },
    {
      q: 'A colleague says deadlocks are timing flukes and a lock timeout is all you need. What does a timeout really do?',
      options: [
        'Breaks no-preemption, but retries in step can livelock',
        'Makes it impossible for the waits to form a cycle',
        'Forces every thread to take its locks in one order',
        'Means a thread never holds two locks at the same time',
      ],
      answer: 0,
      why: 'A timeout (tryLock that gives back what it holds) breaks the no-preemption condition, so no deadlock lasts forever. The waits can still form a cycle for a moment, and threads that time out and retry in step can livelock, as the fixed retry delay shows. Lock ordering is the fix that stops the cycle forming at all.',
    },
    {
      q: 'Which of these cycles can exist without any deadlock?',
      options: [
        'Two source modules that import each other',
        "Two threads each waiting for the other's lock",
        'Five philosophers each waiting for the next fork',
        "Two transactions waiting on each other's rows",
      ],
      answer: 0,
      why: 'A deadlock is a cycle of waiting: each member is blocked on a lock another member holds. Modules importing each other form a dependency cycle, but nothing is waiting on a held lock, so nothing is stuck. The other three are wait cycles over single-copy locks, which is exactly a deadlock. (A cycle through a pool with a spare copy free is not one either.)',
    },
    {
      q: "In the database scenario, which transaction does this lesson's detector roll back?",
      options: ['The one that began last', 'The one that began first', 'The one holding row 1', 'Both of them, then retry'],
      answer: 0,
      why: 'It aborts the youngest transaction, the one with the latest start, since it has probably done the least work to throw away. Aborting both would waste work: one victim is enough to break the cycle. Real databases have their own rules; InnoDB, for example, rolls back the one with fewer changed rows.',
    },
    {
      q: 'Threads keep taking a lock, failing a tryLock and releasing, in step with each other, and none finishes. What is this?',
      options: ['Livelock', 'Deadlock', 'Starvation', 'A race condition'],
      answer: 0,
      why: 'Livelock: every thread is busy, but nothing progresses. In a deadlock the threads are asleep, not busy; starvation means the others progress while one waits; a race condition is a wrong result, not a hang.',
    },
  ],
};

export default lesson;
