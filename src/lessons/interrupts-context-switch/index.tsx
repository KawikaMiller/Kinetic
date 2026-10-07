import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'An interrupt makes the CPU drop what it\'s doing and run the kernel; the timer interrupt is how the OS takes the CPU back, and a context switch saves one thread\'s registers and loads another\'s.',
    what: 'Devices (the timer, a disk, the network card, the keyboard) raise interrupts. The CPU finishes its current instruction, saves where it was, switches to kernel mode and runs a handler. A timer fires many times a second (HZ = 250 is every 4 ms), and when a thread\'s slice is used up the scheduler switches: it saves the running thread\'s registers into its PCB, picks another thread, and loads that thread\'s saved registers. If the new thread lives in another process, the CPU also switches page tables. A thread can also give up the CPU itself by blocking, for example in `read()`.',
    analogy: 'A chef with a kitchen timer. When it rings they write down exactly where they were in this recipe (the PCB), put it aside, pick up another recipe card and carry on from its note. Switching kitchens (processes) means swapping all the ingredients too.',
    useCases: [
      'Why one runaway thread in an infinite loop doesn\'t freeze the whole machine',
      'The "context switches" counters in vmstat and top, and why very high numbers hurt',
      'Choosing threads vs processes: a thread switch keeps the address space',
      'Latency spikes from interrupt storms (a flood of network packets)',
    ],
    why: 'Concurrency only feels simultaneous because of interrupts and context switches. Knowing what a switch saves and costs explains why a thread can be paused between any two instructions (the root of `race-conditions`), why thousands of threads can thrash, and what `cpu-scheduling` policies are deciding. It builds on `processes-threads` and `syscalls-kernel-mode`.',
    watch: 'Top: a timeline with a lane per thread plus one for the kernel. Yellow bars are a thread running, violet is kernel time (handlers and switches), grey hatched is ready (waiting for the CPU), grey dashed is blocked on I/O, and the yellow line is now. Below: A\'s PCB, the CPU core and B\'s PCB. A register block flies between them on each save and load and glows blue while it moves; green text marks registers restored exactly. The CPU shows its mode (grey for user, ring 3; violet for kernel, ring 0) and whose page tables it uses, which turn yellow while they change. State chips: yellow running, dark grey ready, grey blocked. In Interrupt sources the blue chips fire interrupts; blue log rows only woke or skipped a thread, violet rows switched threads. In Cost, yellow is a thread running, violet is the switch, and the overhead readout turns red above 5%.',
  },
  tryThis: [
    'Play "Context switch" and watch A\'s registers fly into its PCB; compare A\'s PC when it comes back.',
    'Flip "B is" to "Another process": a page-table step appears and the address space number changes.',
    'Flip "Why A or B stops" to "Blocks on I/O": B gives the CPU away itself, and the disk interrupt wakes it without a switch.',
    'In "Interrupt sources", press Disk, then Timer twice: B wakes at once, but only the second tick gives it the CPU.',
    'In "Cost", drag Time slice down to 20 µs: the overhead turns red.',
  ],
  keyIdeas: [
    'An interrupt stops the CPU after its current instruction and runs a kernel handler.',
    'The timer interrupt is how the OS takes the CPU back from a thread that never yields.',
    'A context switch saves one thread\'s registers in its PCB and loads another\'s; a process switch also changes page tables.',
    'Switches cost time: overhead = cost / (slice + cost), so tiny slices waste the CPU.',
  ],
  quiz: [
    {
      q: 'What does a context switch cost?',
      options: [
        'Saving and loading registers, plus cache refill',
        'Nothing at all: the CPU swaps threads in hardware',
        'One full timer tick of 4 ms every single time',
        'A complete reload of the program from the disk',
      ],
      answer: 0,
      why: 'The kernel runs code to save one register set and load another, and the next thread starts with cold caches (and, across processes, new page tables). It\'s microseconds, not free and not a whole tick.',
    },
    {
      q: 'A thread is stuck in an infinite loop that never calls the OS. Can other threads on that core still run?',
      options: ['Yes: the timer interrupt takes the CPU', 'No: it keeps the CPU until the loop ends', 'Only if the thread calls sleep() itself', 'Only on a computer with more than one core'],
      answer: 0,
      why: 'The timer fires whether or not the thread cooperates. When its slice is up the handler asks for a reschedule and another thread gets the core. A thread doesn\'t keep the CPU until it finishes.',
    },
    {
      q: 'Why is switching between two processes usually dearer than between two threads of one process?',
      options: [
        'The page tables switch to a new address space',
        'Processes have more registers than threads have',
        'Only processes need their registers saved',
        'Threads never need the kernel to switch them',
      ],
      answer: 0,
      why: 'Both switches save and load registers through the kernel. Only a process switch also loads new page tables, which makes cached address translations useless.',
    },
    {
      q: 'A disk interrupt arrives while A runs, and B was blocked waiting for that read. In this lesson\'s model, what happens straight away?',
      options: [
        'B becomes ready; A keeps running until a tick',
        'B takes the CPU immediately and A gets blocked',
        'A is terminated so that B can use the data',
        'Nothing happens until B calls read() again',
      ],
      answer: 0,
      why: 'The handler marks B ready and returns to A; the next timer tick that ends A\'s slice switches to B. Real kernels may preempt sooner for a higher-priority thread, but A is never blocked by someone else\'s I/O.',
    },
    {
      q: 'Time slice 50 µs, switch cost 50 µs. What share of the CPU goes on switching?',
      options: ['50%', '1%', '100%', '5%'],
      answer: 0,
      why: 'Overhead = cost / (slice + cost) = 50 / 100 = 50%. Half the CPU does no useful work, which is why slices are milliseconds, not microseconds.',
    },
  ],
};

export default lesson;
