import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: "A race condition is a bug where the result depends on the exact timing of threads touching shared data. Locks prevent it, but misused locks can deadlock.",
    what: "Even count = count + 1 is three separate steps: read, add, write. If two threads interleave those steps, one thread's write can overwrite the other's and an update is silently lost. A mutex makes the read-add-write a critical section that only one thread can be inside at a time. Take two locks in different orders, though, and each thread can end up waiting forever for the other: a deadlock.",
    analogy: "Two people editing the same shared spreadsheet cell from stale copies: whoever saves last wins, and the other's change disappears. A lock is a talking stick: only whoever holds it may edit.",
    useCases: [
      "Counters, balances and inventory updated by concurrent requests",
      "Check-then-act bugs: two users both booking the last seat",
      "Caches and in-memory maps shared across a server's worker threads",
      "Deadlocks in databases and services that take multiple locks",
    ],
    why: "Race conditions are some of the nastiest bugs in production: they pass every test, show up only under load, and are almost impossible to reproduce. Mid-level engineers are expected to spot shared mutable state, protect it correctly, and avoid deadlocks by design.",
    watch: "Blue is T1, violet is T2. The ▶ marks each thread's next line and the yellow row is the step that just ran. Each thread has its own register (tmp); count in the middle is the shared memory, and it flashes red when an update is lost. Padlocks show who holds each lock, and a red cycle message means deadlock. The chip strip at the bottom is the real order things ran in.",
  },
  tryThis: [
    'Play "Alternating": both threads read 0, so the final count is 1, not 2.',
    'Pick "You schedule" and try to find every ordering that loses an update.',
    'Switch to "With a mutex": T2 is forced to wait, and the answer is always 2.',
    'In "Deadlock", watch both threads freeze, then flip Lock order to "Same order".',
  ],
  keyIdeas: [
    'count++ is read → add → write. Interleaving those steps loses updates.',
    'A mutex turns a critical section into one-thread-at-a-time.',
    'Atomic operations (fetch_add, AtomicInteger) do read-modify-write as one step.',
    'Deadlock needs a cycle of waiting. Always acquire locks in one global order.',
  ],
  quiz: [
    {
      q: 'Two threads each run count = count + 1 once, starting from 0, with no lock. What can the final value be?',
      options: ['Always 2', '1 or 2', '0, 1 or 2', 'Always 1'],
      answer: 1,
      why: 'If they interleave read-add-write, both can read 0 and write 1. Otherwise you get 2. Each thread writes at least once, so 0 is impossible.',
    },
    {
      q: 'T1 locks A then B. T2 locks B then A. What is the simplest reliable fix?',
      options: ['Add a sleep between the two locks', 'Make both threads acquire A before B', 'Use more threads', 'Release locks in the same order they were taken'],
      answer: 1,
      why: 'A single global lock order makes a cycle of waiting impossible, so deadlock can’t occur. Sleeps only make it rarer.',
    },
    {
      q: 'Why do race conditions often pass tests but fail in production?',
      options: ['Tests use different hardware', 'The bad interleaving is rare and depends on timing and load', 'Compilers remove locks in tests', 'Production code runs single-threaded'],
      answer: 1,
      why: 'The buggy ordering needs threads to interleave at exactly the wrong moment, which gets far more likely under real concurrency.',
    },
  ],
};

export default lesson;
