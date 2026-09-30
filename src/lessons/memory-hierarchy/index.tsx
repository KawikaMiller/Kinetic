import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Fast memory is small and slow memory is big. From a CPU register to a network round trip across the world, access times grow by about a billion times, which is why caches exist.',
    what: "A computer keeps data in layers. Registers and the CPU caches (L1, L2, L3) are tiny but take nanoseconds. Main memory (RAM) is gigabytes but roughly 100 times slower than L1. SSDs and disks hold terabytes but take microseconds to milliseconds, and going over the network is slower still. Each layer caches the one below it: if what you need is already in a fast layer (a hit), you skip the slow trip. The average cost is hit rate × fast time + (1 − hit rate) × slow time, so a high hit rate makes slow storage feel fast.",
    analogy: "If an L1 access took one second, reading RAM would be a coffee break (about 1.7 minutes), an SSD read would take most of a day, and a round trip to Europe would take nearly five years.",
    useCases: [
      'Why looping over an array beats chasing pointers through a linked list',
      'Why a database query that hits disk is so much slower than one served from memory',
      'Deciding what to cache, and where: in process, in Redis, or at a CDN',
      'Back-of-the-envelope estimates in system design interviews',
    ],
    why: 'Almost every performance problem is about waiting for data, not doing arithmetic. Knowing these orders of magnitude lets you guess where time goes before you profile, and it explains why caching, batching and keeping data close pay off so dramatically.',
    watch: "Each row is one level of the hierarchy. Its coloured bar (a different colour per level) runs along a log-scale track, and each tick on the axis is 1,000 times the one before. A yellow dot travels each row; in Real time the dot's speed is on a log scale so every row moves, and in Human time (1 ns = 1 s) the slow rows barely move at all. The violet bars on the right show typical capacity, also on a log scale. In the cache panel, the red bar is always going to RAM, the green bar is the average with your hit rate, and the blue bar is always hitting L1.",
  },
  tryThis: [
    'Switch Time to "Human (1 ns = 1 s)" and read the RAM, SSD and cross-continent rows.',
    'Press "Race again" and watch the fast rows lap the slow ones.',
    'Drag the cache hit rate from 50% to 99% and watch the average access time fall.',
    'Compare the round trip in a datacenter with an HDD seek.',
  ],
  keyIdeas: [
    'Each level is roughly 10× to 1000× slower than the one above, and much bigger.',
    'RAM is about 100× slower than L1: "in memory" is not the same as "fast".',
    'Average access = hit × fast + (1 − hit) × slow, so hit rate matters most.',
    'A network round trip costs as much as millions of cache reads.',
  ],
  quiz: [
    {
      q: 'Roughly how much slower is a main-memory (RAM) access than an L1 cache hit?',
      options: ['About the same', 'About 2×', 'About 100×', 'About a million×'],
      answer: 2,
      why: 'L1 is around 1 ns and DRAM around 100 ns. "It\'s in RAM" still means waiting about a hundred L1 hits.',
    },
    {
      q: 'A cache hits 95% of the time at 1 ns and misses to RAM at 100 ns. What is the average access time?',
      options: ['1 ns', 'About 6 ns', 'About 50 ns', '100 ns'],
      answer: 1,
      why: '0.95 × 1 + 0.05 × 100 = 5.95 ns. The rare misses dominate, which is why raising the hit rate matters so much.',
    },
    {
      q: 'Which is usually slower?',
      options: ['A round trip to another server in the same datacenter', 'One seek on a spinning hard disk', 'They take the same time', 'Reading L3 cache'],
      answer: 1,
      why: 'A datacenter round trip is around 0.5 ms, while an HDD seek is a few milliseconds. The network inside a datacenter can beat a local spinning disk.',
    },
  ],
};

export default lesson;
