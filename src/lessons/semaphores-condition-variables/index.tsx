import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: "Semaphores and condition variables let a thread sleep until it can make progress, instead of spinning, but a wake-up is only a hint: always re-check the condition.",
    what: "A semaphore is a counter with a queue: wait (P) takes a token or sleeps, signal (V) hands one to a sleeper or puts it back. A monitor pairs one lock with condition variables: wait releases the lock and sleeps in one atomic step, and a signal makes a sleeper ready, but it must take the lock back before it carries on, and by then things may have changed. The classic use is a bounded buffer (a ring buffer, see `ring-buffers`) between producers and consumers.",
    analogy: "A restaurant pager: the buzz means a table might be free, so you walk up and check with the host. Someone may have been seated there while you walked over.",
    useCases: [
      'Work queues between request handlers and a pool of worker threads',
      'Database and HTTP connection pools capped with a counting semaphore',
      'Logging and audio pipelines where a fast producer feeds a slower consumer',
      "Java's BlockingQueue, Go's buffered channels and Python's queue.Queue",
    ],
    why: "Every service that hands work between threads sits on these primitives, and their bugs (an `if` where a `while` belongs, the wrong waiter woken, a check outside the lock) pass tests and hang in production. Knowing exactly what wait and signal promise is how you write, and review, concurrent code that holds up.",
    watch:
      'The buffer strip shows its N slots: filled slots are blue with the item id, empty ones are plain, and the violet head and tail markers show where the next take and put happen; a garbage read or overflow turns the slot red. Beside it are the semaphores as violet token dots with their sleepers, or the lock m (its holder in yellow) and each condition variable\'s sleepers, with woken threads that must re-take m listed in blue. In the code panels the line that just ran is highlighted yellow, and each thread\'s chip sits on its line: solid yellow when running, tinted blue when ready or woken, grey dashed when asleep or blocked, grey when doing I/O. The timeline has one lane per thread over the last 40 ticks in the same colours (ready is hatched blue, I/O a dashed grey outline) with a yellow cursor. The CPU meter is blue, and red when over half the recent ticks went on spinning. Captions name producers in blue and consumers in violet.',
  },
  tryThis: [
    'In Monitor, set Producers to 3, Consumers to 1, produce() to 0 ticks and consume() to 12: the buffer fills, producers sleep on notFull, and the CPU sits idle.',
    'Pick Busy-wait, set Producers back to 1, produce() to 12 ticks and consume() to 0: the consumers spin on an empty buffer and the CPU meter turns red.',
    'Set "Condition check" to "if (bug)" with 2 consumers and press "Find a seed where it breaks": a woken consumer reads an empty buffer.',
    'In "Wake-up bugs", compare "One CV + signal" with "One CV + broadcast": the hang count drops to zero.',
    'Pick "Check without the lock": the wakeup() lands before the consumer is asleep, so it sleeps forever.',
  ],
  keyIdeas: [
    'A semaphore is a counter with a queue: wait takes a token or sleeps, signal gives one back or wakes a sleeper.',
    'A condition wait releases the lock and sleeps in one atomic step, so no wake-up can slip in between.',
    'A wake-up is a hint (Mesa semantics): re-check the condition in a `while` loop, never an `if`.',
    'A sleeping thread costs no CPU; a spinning one burns it doing nothing useful.',
  ],
  quiz: [
    {
      q: 'A consumer returns from wait(notEmpty, m). What can it safely assume about the buffer?',
      options: [
        'Nothing: re-check count, it may be empty again',
        'It holds at least one item, since it was signalled',
        'It holds exactly one item, the one just produced',
        'It is full, because the producer was woken first',
      ],
      answer: 0,
      why: 'A signal only means the condition was true at some moment. Between the signal and the moment the woken thread gets the lock back, another consumer can barge in and take the item, and POSIX also allows spurious wake-ups. "At least one item" is the tempting answer, and exactly the `if` bug.',
    },
    {
      q: 'In the semaphore version, what do the empty and full semaphores count?',
      options: ['Free slots and filled slots', 'Producers and consumers asleep', 'Items made and items consumed', 'Lock holders and lock waiters'],
      answer: 0,
      why: 'empty starts at N and counts free slots a producer may claim; full starts at 0 and counts items a consumer may take. Sleepers live in each semaphore\'s queue, not in its count, and mutex is the separate binary semaphore guarding the buffer itself.',
    },
    {
      q: 'Why must wait(cv, m) release the lock and go to sleep in one atomic step?',
      options: [
        "So a wake-up can't land between check and sleep",
        'So the waiting thread keeps its place in the CPU queue',
        'So the lock is never held by two threads at once',
        "So other threads can't read count while it sleeps",
      ],
      answer: 0,
      why: 'If the thread dropped the lock and then slept as a separate step, a producer could put an item and signal in the gap, and that wake-up would be lost: the consumer then sleeps with an item waiting. The "Check without the lock" scene shows that hang.',
    },
    {
      q: 'One condition variable is shared by producers and consumers. Why can signal hang the program when broadcast does not?',
      options: [
        'It can wake a thread of the wrong kind',
        'Signal is slower, so the threads time out',
        'Broadcast also releases the lock for them',
        'Signal only works with a single consumer',
      ],
      answer: 0,
      why: 'signal wakes one sleeper, whichever is first in line. If a consumer\'s signal wakes the other consumer instead of the sleeping producer, it finds nothing and sleeps again, and nobody is left awake. broadcast wakes everyone so the right thread re-checks; separate notFull and notEmpty variables fix it more cheaply.',
    },
    {
      q: 'Why does the busy-wait version pin the CPU even though it is correct?',
      options: [
        'Waiting threads loop on the check instead of sleeping',
        'Its lock takes far longer to grab than a semaphore',
        'It runs the producer and consumer on the CPU at once',
        'It copies the whole buffer each time it checks count',
      ],
      answer: 0,
      why: 'A thread that cannot go yet keeps dropping the lock, retaking it and re-checking count, using every tick it is given while doing no useful work. Semaphores and condition variables put it to sleep in a queue instead, so the CPU idles until a signal arrives. The lock itself costs the same in every mode.',
    },
  ],
};

export default lesson;
