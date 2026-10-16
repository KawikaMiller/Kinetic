import type { LessonModule } from '../../core/types';
import { n } from './captions';
import { brokenFacts, mesiFacts, sharingFacts } from './facts';
import { Stage } from './Stage';

const mesi = mesiFacts();
const broken = brokenFacts();
const sharing = sharingFacts();

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'When several cores cache the same line, a protocol keeps their copies coherent by invalidating the others on a write, and that traffic is why two threads can slow each other down without touching the same variable.',
    what: 'Each core has a private cache, so one memory line can sit in several of them. In a MESI snooping protocol every copy is Modified (the only up-to-date copy), Exclusive (the only copy, clean), Shared (clean, others may have it) or Invalid. A read miss fetches the line over the bus; a write needs ownership, so the other copies are invalidated first. A line is the unit that moves, so two unrelated counters that sit in one line make the line bounce between the cores: false sharing. Padding the counters onto separate lines removes the traffic, but two threads that really write one variable still pay for it.',
    analogy: 'A whiteboard that only one person may write on at a time. Every time someone else wants to write, the board has to be carried over to them, even if the two people write on different corners of it.',
    useCases: [
      'Why two threads incrementing different counters can be slower than one thread incrementing both',
      'Padding hot per-thread counters or queue indices onto their own cache lines',
      'Reading "cache-to-cache transfer" or "HITM" style counters in a profiler',
      'Choosing per-thread counters with a merge over one shared atomic counter',
    ],
    why: 'Coherence traffic is a hidden cost of sharing memory between threads, and false sharing is one of the commonest reasons threaded code scales worse than the arithmetic suggests. It builds on `race-conditions` (what sharing without care does) and `cpu-caches` (one core, 64-byte lines).',
    watch:
      'MESI scene: each core is a row with a coloured rail and a state cell: M Modified in red (the only up-to-date copy, and the costly one to share), E Exclusive in green, S Shared in blue, I Invalid in dim grey. The core that acted last is ringed in yellow, the bus transaction in flight is a violet chip, and a copy that returns an old value is solid red and labelled stale. False sharing: sky is thread A\'s counter, amber thread B\'s, violet one variable both threads write; in the write strip a red cell is a write that moved the line and a green cell a write that hit. On the plot, red is the chosen layout and green dashed the padded layout. Chips say what is a toy, illustrative or from memory.',
  },
  tryThis: [
    `In "Four cores, one line", press Read on core 0, Write on core 0, then Read on core 1 (after Reset if you have been playing). The states go ${mesi.map((m) => m.states).join(', ')}: the write on an Exclusive line makes no bus traffic (still ${n(mesi[1].bus)} transaction), and core 1's read makes core 0 write back, so memory catches up to ${n(mesi[2].memory)}.`,
    `Turn Invalidation off, then press Read on core 0, Write on core 1, Read on core 0: core 0 reads ${n(broken.broken.read ?? 0)} while the latest write is ${n(broken.broken.latest)}, marked stale. Turn it back on and repeat: core 0's copy was invalidated, so the read goes to the bus and returns ${n(broken.correct.read ?? 0)}.`,
    `In "False sharing" as it opens (two counters in one 64-byte line, strict alternation, ${n(sharing.writes)} writes) there are ${n(sharing.adjacent.transfers)} ownership transfers and a cost of ${n(sharing.adjacent.cost)}. Choose "Padded to separate lines": ${n(sharing.padded.transfers)} transfers and ${n(sharing.padded.cost)}. Choose "One shared atomic counter": back to ${n(sharing.atomic.transfers)} transfers.`,
    `In "False sharing", slide Counter B's byte to 64: the counters land on different lines and transfers fall to ${n(sharing.apart.transfers)}. Then set the cache line size to 128 bytes: they share a line again and transfers return to ${n(sharing.apartWide.transfers)}.`,
    `In "False sharing", set Burst to 8 writes in a row: transfers fall from ${n(sharing.adjacent.transfers)} to ${n(sharing.burst8.transfers)} and the cost from ${n(sharing.adjacent.cost)} to ${n(sharing.burst8.cost)}, because a core keeps the line while it writes.`,
  ],
  keyIdeas: [
    'In a MESI protocol a write needs ownership, so in this model it invalidates every other copy first and a copy that is not invalidated can serve an old value.',
    'The cache line, not the variable, is the unit that moves between cores, so two threads writing different variables in one line still make it bounce.',
    'Padding separates variables onto different lines, which cures false sharing; two threads that write one variable still move the line, padded or not.',
    'Writing in bursts lets a core keep the line, so the traffic falls with the burst length; per-thread counters merged at the end avoid the sharing altogether.',
  ],
  quiz: [
    {
      q: 'Two threads each increment their own counter, but the counters sit side by side in one cache line. Why is this slow?',
      options: [
        'Each write by one core invalidates the other core\'s copy of the line, so the line moves on every turn',
        'The counters are read and written with the same instruction, so the two threads wait for one lock',
        'Both counters share a variable name, so the compiler has to serialise every update to them',
        'A line holds only one value at a time, so the second counter is dropped from the cache',
      ],
      answer: 0,
      why: `The counters never touch the same variable, but the line is what moves: in this model ${n(sharing.writes)} alternating writes cause ${n(sharing.adjacent.transfers)} ownership transfers, against ${n(sharing.padded.transfers)} when each counter has its own line.`,
    },
    {
      q: 'Cores 0 and 1 both hold a line Shared. Core 1 writes it. What state is core 0\'s copy in afterwards?',
      options: ['Invalid', 'Shared', 'Modified', 'Exclusive'],
      answer: 0,
      why: 'The write needs ownership, so the bus upgrade invalidates the other copies; core 1 becomes Modified and core 0 becomes Invalid. Its next read goes back to the bus.',
    },
    {
      q: 'Two threads increment one shared atomic counter and it is slow. Will padding the counter onto its own line fix that?',
      options: [
        'No: both threads really write the same variable, so the line still moves on every turn',
        'Yes: a line of its own means the other core never needs to see the write',
        'Yes, if the line size is raised, since a larger line holds both threads\' writes at once',
        'No, because padding only helps counters that are stored in different memory banks',
      ],
      answer: 0,
      why: `Padding separates variables; it cannot separate a variable from itself. In this model the atomic counter makes ${n(sharing.atomic.transfers)} transfers however it is padded, the same as the one-line layout, while per-thread counters make ${n(sharing.merged.transfers)} (plus ${n(sharing.merged.reads)} read to merge).`,
    },
    {
      q: 'With invalidation switched off, core 0 reads 0 after core 1 wrote 1. What went wrong?',
      options: [
        'Core 0\'s copy was never invalidated, so it kept serving the old value',
        'The write was lost on the bus, so memory never received the value 1',
        'Core 1 wrote to the wrong line, so core 0 read a line it did not share',
        'Core 0 read too early, and the value would have updated a moment later',
      ],
      answer: 0,
      why: `The cache did not hold the latest value: the write left the other copy valid. The model finds a ${n(broken.shortest)}-operation sequence that does this, and with invalidation on the same sequence returns the latest write.`,
    },
    {
      q: 'Each thread writes 8 times in a row before the other takes a turn, instead of strictly alternating. How does the line movement change?',
      options: [
        `It falls to ${n(sharing.burst8.transfers)} transfers instead of ${n(sharing.adjacent.transfers)}, since a core keeps the line while it writes`,
        'It stays the same, because the line moves whenever either core writes at all',
        'It doubles, because each burst has to move the line to the core and back again',
        'It drops to zero, because the cores then stop sharing the line between bursts',
      ],
      answer: 0,
      why: `A core that owns the line hits on its next writes, so in this model just the first write of a burst moves it: ${n(sharing.burst8.transfers)} transfers for ${n(sharing.writes)} writes, instead of ${n(sharing.adjacent.transfers)}.`,
    },
  ],
};

export default lesson;
