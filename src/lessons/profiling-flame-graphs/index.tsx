import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Measure before you optimise: a sampling profiler shows where the CPU time really goes, and a flame graph makes the hot spot the widest box.',
    what: 'A sampling profiler interrupts a program at regular intervals and records its call stack. A flame graph stacks those samples: each box is a function, its width is the share of samples it appears in (callees included), and the functions it calls sit on top of it. Boxes are merged and sorted by name, so the x axis is not time; a flame chart is the time-ordered version.',
    analogy: "Looking into a busy kitchen every few seconds and noting who is doing what. You never time anyone, yet after enough glances you know the dishwasher is the bottleneck.",
    useCases: [
      'Finding why an API endpoint got slower after a release',
      'Spotting costly work inside a loop, like building a formatter or a regex every time',
      'Comparing CPU profiles from before and after a change',
      'Reading the output of Chrome DevTools, perf, pprof or async-profiler',
    ],
    why: 'Guessing at performance wastes days on code that barely runs. A profile points at the few lines that matter, and reading a flame graph correctly (width rather than position, self time rather than total) is a core debugging skill for backend and frontend engineers alike.',
    watch:
      'In the flame graph every box is a function, coloured by function in amber, sky, pink and orange (never red: width is not an error). Its width is its share of the samples, and the functions it calls sit on top (underneath, in the Icicle view); the grey bottom box is all the samples. The selected or zoomed frame is solid yellow, the stack the latest sample caught is outlined in blue, and an optimised function turns green. Time order draws the same samples left to right in the order they were taken. The timeline has one lane per function in the same colours, solid while the function is on the stack and dashed where db.query waits for the database off the CPU, with a yellow cursor at the latest sample.',
  },
  tryThis: [
    'Play it: the flame graph builds sample by sample. renderPage is wide, but most of that width is formatPrice → Intl.NumberFormat on top of it.',
    'Look at the renderPage readout (selected to start with): a big total share, a tiny self share.',
    'Press "parseJson: faster parser": the on-CPU time barely moves. Then press "formatPrice: hoist the formatter" and watch Intl.NumberFormat shrink.',
    'Switch View to "Time order": x is now time, and the steps appear in the order they ran instead of sorted by name.',
    'Drop Samples to 20 and press "sample again" a few times: the boxes jump about and the ± margin is wide.',
  ],
  keyIdeas: [
    'Width is the share of samples, not time order: siblings are merged and sorted by name.',
    "Total time includes everything a function calls; self time is its own code. Fix where the self time is.",
    'Sampling is cheap and statistical (more samples, smaller error); instrumentation times every call exactly, at a higher cost.',
    "A CPU profiler can't see time spent waiting on I/O or locks: that needs a wall-clock or off-CPU profile.",
  ],
  quiz: [
    {
      q: 'In this flame graph, logLine sits just left of parseJson, even though logLine runs last. Why?',
      options: [
        'Siblings are sorted by name, not by time',
        'logLine used more CPU time than parseJson',
        'The profiler sampled logLine before parseJson',
        'logLine is called from inside parseJson',
      ],
      answer: 0,
      why: 'flamegraph.pl merges identical frames and sorts siblings alphabetically, so left to right is alphabetical: width, not position, carries the information. Time order (a flame chart) is the view where x is time. A function called from parseJson would sit on top of it, not beside it.',
    },
    {
      q: 'renderPage is the widest box under handleRequest, but only about 5% of the samples are its own code. Where should you optimise?',
      options: [
        'Its widest child, where the self time is',
        "renderPage's own code, since it is widest",
        'parseJson, because it runs first',
        'Everything equally, a bit at a time',
      ],
      answer: 0,
      why: "renderPage's total includes everything it calls; its own code is only about 5%. The time is in formatPrice → Intl.NumberFormat on top of it, so speeding up renderPage's own lines would save almost nothing, like the decoy parseJson fix.",
    },
    {
      q: "Why doesn't db.query's 25 ms database wait show up in the CPU flame graph?",
      options: [
        "The thread is off the CPU, so it isn't sampled",
        'The profiler skips functions with short names',
        'Database calls are always too fast to sample',
        "The wait is merged into handleRequest's box",
      ],
      answer: 0,
      why: 'A CPU profiler samples the thread only while it runs. Waiting on the network, a disk or a lock is off-CPU time, which a wall-clock or off-CPU profiler shows. Here the wait is 25 ms, longer than most of the CPU work, and it is still invisible.',
    },
    {
      q: 'You take 20 samples instead of 1,000. What changes?',
      options: [
        'The shares get noisier: the margin grows',
        'The flame graph switches to time order',
        'The program runs 50 times faster',
        'Self time stops being measured',
      ],
      answer: 0,
      why: 'Each sample is a random draw, so a share measured from n samples is off by roughly 1/√n: about ±21 points at 20 samples for a 65% share, against ±3 at 1,000. More samples cost more overhead but give a steadier graph; the program itself is unchanged.',
    },
  ],
};

export default lesson;
