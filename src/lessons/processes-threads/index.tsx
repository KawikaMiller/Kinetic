import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: "A process is a running program with its own private memory. A thread is one line of execution inside a process, and threads in the same process share that memory.",
    what: "The OS gives every process its own address space (code, heap and stack) that no other process can touch. Inside a process, one or more threads run the code. Each thread has its own stack and registers but shares the heap with its siblings. The scheduler time-slices threads onto the CPU cores, switching between them many times a second.",
    analogy: "Processes are separate houses; threads are roommates sharing a kitchen. Roommates can grab ingredients straight off the counter, but if one of them sets the kitchen on fire, the whole house burns.",
    useCases: [
      "Browsers run tabs in separate processes so one crash doesn't take down the rest",
      "Web servers use pools of threads or processes to handle many requests at once",
      "Apps keep the UI responsive by moving slow work to a background thread",
      "Reading top or Task Manager: why one app shows many processes and threads",
    ],
    why: "Every program you write runs as a process with at least one thread. Knowing the difference explains crashes, memory usage, why some bugs only show up under concurrency, and how a server handles many users at once.",
    watch: "The two cores at the top show which thread is running right now; a striped ⇄ core is mid context switch. Blue is the Browser process, violet is Music. A green outline marks a thread that's running, and a dashed faint one a thread that's waiting (blocked on I/O, which is normal). Each thread has its own small stack; the heap is shared inside a process. Red means crashed, grey means dead, and a chip sliding through the kernel bar is a message between processes (IPC). The scenarios are scripted and slowed down.",
  },
  tryThis: [
    'Play "Time slicing" and count the context switches: two cores, five threads.',
    'Switch to "Crashes": one bad thread kills its whole process, but the other process keeps running.',
    'In "Talking", compare threads reading the shared heap with processes sending messages through the kernel.',
    'Step backwards (←) to replay the exact moment something changes.',
  ],
  keyIdeas: [
    'A process = a program plus its own private memory.',
    'Threads share their process’s heap; each has its own stack.',
    'One core runs one thread at a time. Context switches fake simultaneity.',
    'Crash isolation: processes are walls, threads are not.',
  ],
  quiz: [
    {
      q: 'Two threads in the same process can…',
      options: [
        "Read each other's heap data directly",
        'Never share any data without copying it',
        'Only talk to each other over the network',
        'Run in two separate address spaces',
      ],
      answer: 0,
      why: 'Threads share their process’s address space, including the heap. That’s fast, and it’s exactly why they need locks; separate address spaces are what processes get.',
    },
    {
      q: 'One thread dereferences a bad pointer and segfaults. What typically happens?',
      options: [
        'Only that thread stops',
        'The whole process is killed',
        'Every process on the machine crashes',
        'The OS restarts just that thread',
      ],
      answer: 1,
      why: 'The OS kills the whole process: all its threads share memory the bug may have corrupted. Other processes are unaffected.',
    },
    {
      q: 'A machine has 4 cores and 200 threads. How do they all make progress?',
      options: [
        'The OS time-slices them across the cores',
        'They don’t: only 4 of the 200 ever run',
        'The CPU adds a hardware core per thread',
        'They take turns, one thread per second',
      ],
      answer: 0,
      why: 'The scheduler rapidly swaps which thread runs on each core with context switches, many times a second, so all of them advance.',
    },
  ],
};

export default lesson;
