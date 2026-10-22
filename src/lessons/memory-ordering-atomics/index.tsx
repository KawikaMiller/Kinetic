import type { LessonModule } from '../../core/types';
import { FACTS } from './model';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Coherence keeps each memory location sensible, but plain accesses to different locations carry no order: with store buffers or weak ordering two threads can end in a state no interleaving of your lines explains, unless you add a fence or release/acquire.',
    what: `Take tiny two-thread programs (litmus tests) and ask which final register values are possible. Under sequential consistency (SC) the answer is whatever the interleavings of the instructions give. Add a store buffer per core (an x86-style model) and a new outcome appears; add per-thread views of memory (a weak model) and stale reads appear too. The lesson runs the full set of schedules of each model, lists each outcome with its shortest schedule, and lets you add fences and release/acquire tags to see which ones remove it. It is a simulated memory model, not your CPU, and it names what it leaves out.`,
    analogy: 'Two colleagues who each pin a note on their own private board and copy it to the shared office board later: each can read the shared board before the other\'s note has arrived, although both boards are individually consistent.',
    useCases: [
      'Reasoning about why a flag-and-data handoff between threads needs release/acquire (or a lock) on weaker processors',
      'Understanding why a hand-written spin lock or Dekker-style check that works on one machine can fail on another',
      'Reading language memory-model documentation (atomics, volatile, fences) without guessing what an ordering tag promises',
      'Explaining a rare production bug that no interleaving of the source lines can reproduce',
    ],
    why: 'Concurrency bugs that vanish under a debugger often come from reordering, not from a missing lock. It starts where `cache-coherence` stops (it states that real cores reorder), builds on `race-conditions` and `cpu-pipelining`, and leads to `lock-free-cas`, where every step is assumed ordered.',
    watch: 'A thread card lists its instructions, with the next one ringed in yellow (the colour for what happens now). A store sitting in a buffer is drawn in blue (secondary, not yet visible to the other core); a value in memory is grey. Fences and order tags are violet (structure). In the outcome list an outcome that SC cannot produce has a red border, one SC also produces is grey, and one the model does not reach is dashed and dim.',
  },
  tryThis: [
    `In Store buffering (SC is the default) ${FACTS.sbScOutcomes} outcomes are listed and r0 = 0, r1 = 0 is not reachable (all ${FACTS.sbScStates} states explored). Switch to x86-style: a fourth outcome appears, and "show it" replays both stores sitting in their buffers while both loads read 0 from memory.`,
    'In Store buffering, pick x86-style and add a fence after the store in T0 only: r0 = 0, r1 = 0 is still reachable. Add the fence in T1 as well: it disappears.',
    'Open Message passing, pick Weak and leave every tag as it is: r1 = 1, r2 = 0 is reachable. Make the flag store (y = 1) release: still reachable. Make the flag load (r1 = y) acquire too: it disappears.',
    'Open Where it bites, press Coherence (CoRR) and cycle SC, x86-style and Weak: r1 = 2, r2 = 1 is not reachable in any of the three.',
  ],
  keyIdeas: [
    `Coherence is per location and ordering is across locations: in the model, reading one variable backwards is not reachable in any model, yet store buffering reaches 0 and 0 as soon as each core has a store buffer (${FACTS.sbScOutcomes} outcomes under SC, ${FACTS.sbTsoOutcomes} under x86-style).`,
    'One fence is not enough where two threads race: with a fence in just one thread, the other thread\'s store can still sit in its buffer, and 0 and 0 stays reachable until both threads fence.',
    'In this weak model release and acquire work as a pair: a release flag store with a plain flag load, or a plain store with an acquire load, still leaves the stale-data outcome reachable; both together remove it. A fence is not a stand-in for either here, and the model differs from C++ and ARM on that (the page says where).',
    'A table here says what the model allows, not what your CPU does. Nothing is measured, and compiler reordering, load buffering, IRIW, 2+2W, out-of-thin-air values and consume are not modelled.',
  ],
  quiz: [
    {
      q: 'Two cores each store to one variable, then load the other core\'s variable, and both loads read 0. Which explanation fits the lesson\'s model?',
      options: [
        'The caches disagreed, so each core kept a stale copy of the other variable',
        'One of the two stores was dropped by its core before it ever reached memory',
        'Each store still sat in its own core\'s buffer when the other load ran',
        'Both loads ran before the program had started executing any instructions',
      ],
      answer: 2,
      why: `In the x86-style model a store enters the core's buffer and drains later, so a load can read memory before the other core's store has drained. Coherence did not fail: it is per location, and the order across two locations is a separate matter. Under SC the same program has ${FACTS.sbScOutcomes} outcomes, none with 0 and 0.`,
    },
    {
      q: 'A writer stores data, then sets a flag with a release store. The reader loads the flag with a plain load and sees 1, then reads the data. In the weak model can it read the old data?',
      options: [
        'Yes: the reader\'s load must be acquire to take over what the writer had done',
        'No: a release store orders everything the writer did before it set the flag',
        'No: a processor that reorders stores could not run this handoff program at all',
        'Yes, but only if the data store before the flag is also made a release store',
      ],
      answer: 0,
      why: 'Release records the writer\'s view with the flag, but an acquire load that reads the flag is what merges it into the reader\'s view. A plain load reads the flag and keeps its own stale view, so the old data stays reachable in the model.',
    },
    {
      q: 'Which of these is not reachable even in the weak model?',
      options: [
        'A thread sees a flag already set while the data it guards is still unset',
        'Two threads each write 1 to one variable, then both read 0 from the other',
        'A store becomes visible to one thread before it becomes visible to another',
        'A thread reads a variable\'s new value, then later reads its older value',
      ],
      answer: 3,
      why: 'The three models keep a location\'s reads moving forward: a thread\'s view of x advances and does not go back, so reading 2 and then 1 is not reachable (the coherence scene shows it in the three models). The other three outcomes are reachable in the weak model, which is why ordering across locations needs fences or release/acquire.',
    },
    {
      q: 'Only one of the two threads in store buffering has a fence between its store and its load. Is 0 and 0 still possible in the x86-style model?',
      options: [
        'No: a fence in either thread flushes the store buffers of both of the threads',
        'Yes: the other thread\'s store can still sit in its buffer while its load reads memory',
        'No: the thread without a fence is always the one that runs its load second',
        'Yes, but only in the weak model, and never in the x86-style model at all',
      ],
      answer: 1,
      why: 'A fence drains the buffer of the thread that executes it, not the other thread\'s. The unfenced thread can load from memory while its own store is still buffered, so the model still reaches 0 and 0; the outcome disappears when both threads fence.',
    },
    {
      q: 'The page says 0 and 0 is reachable in its x86-style model. What can you conclude about your laptop?',
      options: [
        'Your laptop will print 0 and 0 about half the time you run it',
        'Your laptop reorders each pair of stores to different variables',
        'Your compiler will turn this program into that reordering for you',
        'Nothing measured: it is what a model with store buffers allows',
      ],
      answer: 3,
      why: 'The table lists what the model allows. It was not run on any chip and says nothing about how often a real machine shows an outcome; real models of x86 resemble it, which is a claim from the literature to check, not something this page measured.',
    },
  ],
};

export default lesson;
